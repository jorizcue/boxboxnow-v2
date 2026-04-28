"""
Authentication with OTT-style concurrent device control.

On login:
  1. Check credentials
  2. Count active device sessions for user
  3. If >= max_devices -> reject with 409 + list of active sessions
  4. Otherwise -> create DeviceSession + JWT (with session_token embedded)

On every authenticated request:
  - Validate JWT
  - Check that the session_token in the JWT still exists in device_sessions
  - Update last_active timestamp
  - If session was killed -> return 401

User can list and kill their own sessions (like Netflix device management).
Admin can set max_devices per user.
"""

import re
import time
import secrets
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm.exc import StaleDataError

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import User, DeviceSession, UserTabAccess, UserCircuitAccess, Subscription, Circuit, AppSetting, ProductTabConfig, WaitlistEntry
from sqlalchemy.orm import selectinload
from app.models.pydantic_models import (
    LoginRequest, LoginResponse, UserOut, DeviceSessionOut,
    MfaSetupResponse, MfaVerifyRequest, RegisterRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


PLATFORM_DEFAULTS = {
    "trial_days": "14",
    "trial_banner_days": "7",
    "trial_email_days": "3",
}


# ---- Mobile app version gating ----------------------------------------------
#
# Admins set `min_ios_version` / `min_android_version` in the platform settings.
# iOS and Android clients send their app version as `X-App-Version` plus the
# platform as `X-App-Platform` (`"ios"` or `"android"`) on every login attempt.
# If the client's version is below the configured minimum we respond 426
# (Upgrade Required) with a payload describing the mismatch, which the apps
# catch to render a blocking "update required" screen.

def _parse_semver(v: str) -> tuple[int, ...]:
    """Parse a semver-ish string into a tuple of ints for comparison.

    Strips any pre-release / build suffix (e.g. `1.4.0-beta.2` -> (1,4,0)).
    Non-numeric components resolve to 0 so weird inputs don't 500 the login.
    """
    if not v:
        return (0,)
    core = v.split("-", 1)[0].split("+", 1)[0].strip()
    parts = []
    for chunk in core.split("."):
        digits = re.match(r"\d+", chunk)
        parts.append(int(digits.group(0)) if digits else 0)
    return tuple(parts) if parts else (0,)


def _version_lt(a: str, b: str) -> bool:
    """True iff semver(a) < semver(b). Pads shorter side with zeros."""
    ta, tb = _parse_semver(a), _parse_semver(b)
    width = max(len(ta), len(tb))
    ta = ta + (0,) * (width - len(ta))
    tb = tb + (0,) * (width - len(tb))
    return ta < tb


async def _enforce_min_app_version(request: Request, db: AsyncSession) -> None:
    """Block the request with HTTP 426 when the client app is below the
    admin-configured minimum for its platform.

    The check is LENIENT by design:
      - If the client sends no `X-App-Platform` header (e.g. the web
        frontend), the gate is skipped — web logins aren't subject to
        store-release versioning.
      - If the platform's `min_*_version` setting is unset / empty, we
        skip (admins haven't turned the gate on yet).
      - If the client sends no `X-App-Version` header, we treat it as
        outdated: a mobile build that can't advertise its version should
        force the user through the upgrade prompt.
    """
    platform = (request.headers.get("X-App-Platform") or "").strip().lower()
    if platform not in {"ios", "android"}:
        return

    key = "min_ios_version" if platform == "ios" else "min_android_version"
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    min_version = (row.value if row else "").strip()
    if not min_version:
        return

    client_version = (request.headers.get("X-App-Version") or "").strip()
    if client_version and not _version_lt(client_version, min_version):
        return

    latest_key = "latest_ios_version" if platform == "ios" else "latest_android_version"
    latest_row = await db.execute(select(AppSetting).where(AppSetting.key == latest_key))
    latest_row = latest_row.scalar_one_or_none()
    latest_version = (latest_row.value if latest_row else "").strip() or min_version

    raise HTTPException(
        status_code=status.HTTP_426_UPGRADE_REQUIRED,
        detail={
            "code": "app_update_required",
            "message": (
                f"La versión instalada ({client_version or 'desconocida'}) es "
                f"anterior a la mínima soportada ({min_version}). "
                "Actualiza la app para continuar."
            ),
            "platform": platform,
            "current_version": client_version,
            "min_version": min_version,
            "latest_version": latest_version,
        },
    )


async def _get_platform_setting(db: AsyncSession, key: str) -> str:
    """Get a platform setting value, returning default if not found."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else PLATFORM_DEFAULTS.get(key, "0")


async def _get_registration_config(db) -> dict:
    """Read default and trial tab/device configuration from AppSettings."""
    import json as _json

    trial_days = int(await _get_platform_setting(db, "trial_days"))

    if trial_days > 0:
        tabs_json = await _get_platform_setting(db, "trial_tabs")
        max_devices_str = await _get_platform_setting(db, "trial_max_devices")
        try:
            tabs = _json.loads(tabs_json) if tabs_json and tabs_json != "0" else []
        except (ValueError, TypeError):
            tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]
        try:
            max_devices = int(max_devices_str) if max_devices_str and max_devices_str != "0" else 2
        except (ValueError, TypeError):
            max_devices = 2
    else:
        tabs_json = await _get_platform_setting(db, "default_tabs")
        max_devices_str = await _get_platform_setting(db, "default_max_devices")
        try:
            tabs = _json.loads(tabs_json) if tabs_json and tabs_json != "0" else []
        except (ValueError, TypeError):
            tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]
        try:
            max_devices = int(max_devices_str) if max_devices_str and max_devices_str != "0" else 2
        except (ValueError, TypeError):
            max_devices = 2

    return {"trial_days": trial_days, "tabs": tabs, "max_devices": max_devices}


@router.get("/trial-config")
async def get_trial_config(db: AsyncSession = Depends(get_db)):
    """Public endpoint: returns trial configuration for the frontend."""
    trial_days = int(await _get_platform_setting(db, "trial_days"))
    trial_banner_days = int(await _get_platform_setting(db, "trial_banner_days"))
    return {
        "trial_enabled": trial_days > 0,
        "trial_days": trial_days,
        "trial_banner_days": trial_banner_days,
    }


class RateLimiter:
    """Failure-counting in-memory rate limiter.

    Tracks FAILED login attempts per IP over a rolling window and blocks
    further attempts once the threshold is reached. Successful logins
    reset the counter so users who simply typed their password wrong a
    few times don't stay locked out after finally getting it right.

    Two-step API:
        limiter.check(ip)   → raises 429 if over the limit
        limiter.record_failure(ip) → call ONLY when credentials failed
        limiter.reset(ip)   → call on successful login

    This behavior replaces the old "count every request" approach that
    made legitimate testing painful: a user who logged in successfully,
    logged out, and tried to log in again 4 times was being blocked on
    the 6th request even though only 1 had failed.
    """

    def __init__(self, max_attempts: int = 10, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # Maps ip → list of monotonic timestamps of failed attempts.
        self._failures: dict[str, list[float]] = {}

    def _prune(self, ip: str) -> list[float]:
        now = time.monotonic()
        timestamps = [
            t for t in self._failures.get(ip, [])
            if now - t < self.window_seconds
        ]
        self._failures[ip] = timestamps
        return timestamps

    def check(self, ip: str) -> None:
        timestamps = self._prune(ip)
        if len(timestamps) >= self.max_attempts:
            retry_after = int(self.window_seconds - (time.monotonic() - timestamps[0]))
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Demasiados intentos fallidos. Vuelve a intentarlo en "
                    f"{max(retry_after, 1)} segundos."
                ),
                headers={"Retry-After": str(max(retry_after, 1))},
            )

    def record_failure(self, ip: str) -> None:
        self._prune(ip)
        self._failures.setdefault(ip, []).append(time.monotonic())

    def reset(self, ip: str) -> None:
        self._failures.pop(ip, None)


# 10 failed attempts per 5 minutes per IP. More lenient than the previous
# 5/60s window now that we only count failures.
login_limiter = RateLimiter(max_attempts=10, window_seconds=300)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, username: str, is_admin: bool, session_token: str) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user_id),  # PyJWT 2.12+ requires sub to be string
        "username": username,
        "is_admin": is_admin,
        "sid": session_token,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        # Convert sub back to int for internal use
        if "sub" in payload:
            payload["sub"] = int(payload["sub"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def _extract_app_version_info(request: Request) -> tuple[str, str]:
    """Return `(platform, version)` from the mobile-app headers.

    iOS / Android clients attach `X-App-Platform` (`"ios"` / `"android"`)
    and `X-App-Version` (semver string). Web doesn't send either, in
    which case we return `("", "")` and the caller stores blanks.

    Values are trimmed to the column widths (16 / 32) so a malicious
    client can't overflow. Platform is lowercased for consistency.
    """
    platform = (request.headers.get("X-App-Platform") or "").strip().lower()[:16]
    version = (request.headers.get("X-App-Version") or "").strip()[:32]
    return platform, version


def _extract_device_info(request: Request) -> tuple[str, str]:
    """Extract device name from User-Agent and IP from request."""
    ua = request.headers.get("user-agent", "Unknown device")
    # Simplify UA to something readable
    if "iPhone" in ua:
        device = "iPhone"
    elif "iPad" in ua:
        device = "iPad"
    elif "Android" in ua:
        device = "Android"
    elif "Mac" in ua:
        device = "Mac"
    elif "Windows" in ua:
        device = "Windows"
    elif "Linux" in ua:
        device = "Linux"
    else:
        device = ua[:80]

    # Add browser
    if "Chrome" in ua and "Edg" not in ua:
        device += " / Chrome"
    elif "Firefox" in ua:
        device += " / Firefox"
    elif "Safari" in ua and "Chrome" not in ua:
        device += " / Safari"
    elif "Edg" in ua:
        device += " / Edge"

    ip = request.client.host if request.client else "unknown"
    # Check for proxy headers
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    return device, ip


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: validate JWT + check device session is still alive."""
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    session_token = payload.get("sid")

    if not user_id or not session_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    # Check device session exists (hasn't been killed)
    result = await db.execute(
        select(DeviceSession).where(DeviceSession.session_token == session_token)
    )
    device_session = result.scalar_one_or_none()

    if not device_session:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Session terminated. Your session was closed from another device."
        )

    # Update last_active — and refresh the recorded app version / platform
    # whenever the client volunteers fresher values. Mobile apps attach
    # `X-App-Platform` + `X-App-Version` on every request, so the session
    # row always reflects the build currently hitting the API. Web clients
    # don't send these, so we leave the fields untouched for them.
    device_session.last_active = datetime.now(timezone.utc)
    incoming_platform = (request.headers.get("X-App-Platform") or "").strip().lower()
    incoming_version = (request.headers.get("X-App-Version") or "").strip()
    if incoming_platform:
        device_session.app_platform = incoming_platform[:16]
    if incoming_version:
        device_session.app_version = incoming_version[:32]
    try:
        await db.commit()
    except StaleDataError:
        # The device_session row was deleted (concurrent logout, admin kill,
        # or reconnect that replaced the session) between our SELECT and the
        # UPDATE that runs at commit time. Treat it as a terminated session so
        # the client gets a clean 401 instead of a 500.
        await db.rollback()
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Session terminated. Please log in again.",
        )

    # Get user with tab_access
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Attach session_token to request state for use in session management
    request.state.session_token = session_token

    return user


ALL_TABS = [
    "race", "pit", "live", "config",
    "adjusted", "adjusted-beta",
    "driver", "driver-config",
    "replay", "analytics", "insights",
    "admin-users", "admin-circuits", "admin-hub",
    # iOS app config sections
    "app-config-carrera", "app-config-box", "app-config-visualizacion",
    "app-config-plantillas", "app-config-gps-racebox",
    # Support chatbot widget on /dashboard
    "chat",
]


def _user_out(user: User) -> UserOut:
    """Build UserOut with tab_access. Admins always get all tabs."""
    if user.is_admin:
        tabs = ALL_TABS
    else:
        tabs = [ta.tab for ta in (user.tab_access or [])]

    # Check active subscription (only if relationship is already loaded to avoid MissingGreenlet)
    has_sub = user.is_admin  # admins always have access
    sub_plan: str | None = None
    trial_ends_at: str | None = None

    if not has_sub:
        from sqlalchemy import inspect as sa_inspect
        try:
            state = sa_inspect(user)
            if 'subscriptions' in state.dict:
                now = datetime.now(timezone.utc)
                for s in (user.subscriptions or []):
                    # Normalize naive datetimes from SQLite to UTC-aware
                    period_end = s.current_period_end
                    if period_end and period_end.tzinfo is None:
                        period_end = period_end.replace(tzinfo=timezone.utc)
                    if s.status in ("active", "trialing") and (period_end is None or period_end > now):
                        has_sub = True
                        sub_plan = s.plan_type
                        if s.status == "trialing" and s.current_period_end:
                            trial_ends_at = s.current_period_end.isoformat()
                        break
        except Exception:
            pass

    return UserOut(
        id=user.id,
        username=user.username,
        email=getattr(user, 'email', None),
        is_admin=user.is_admin,
        max_devices=user.max_devices,
        concurrency_web=getattr(user, 'concurrency_web', None),
        concurrency_mobile=getattr(user, 'concurrency_mobile', None),
        mfa_enabled=user.mfa_enabled or False,
        mfa_required=user.mfa_required or False,
        has_password=getattr(user, 'has_custom_password', True),
        tab_access=tabs,
        has_active_subscription=has_sub,
        subscription_plan=sub_plan,
        trial_ends_at=trial_ends_at,
        created_at=user.created_at,
    )


async def require_admin(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


# --- Cleanup: remove stale sessions (inactive > 24h) ---

async def _cleanup_stale_sessions(db: AsyncSession, user_id: int):
    """Remove sessions inactive for more than 24 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    await db.execute(
        delete(DeviceSession).where(
            DeviceSession.user_id == user_id,
            DeviceSession.last_active < cutoff,
        )
    )
    await db.commit()


async def _resolve_kind_limit(db: AsyncSession, user: User, client_kind: str) -> int | None:
    """
    Resolve the per-kind concurrency limit for a user, in priority order:

      1. Per-user override on `User.concurrency_{web,mobile}` (when set) —
         lets admins pin a specific value that beats both plan and legacy
         max_devices. Used from the admin user detail panel.
      2. Highest `ProductTabConfig.concurrency_{web,mobile}` across the
         user's active subscriptions (web or mobile depending on kind).
      3. None → caller falls back to the legacy `user.max_devices`.

    Admins bypass all of these and return None (i.e. unlimited here; the
    WS endpoint also lets admins through without limit).
    """
    if user.is_admin:
        return None

    # 1. Per-user override
    if client_kind == "mobile":
        override = getattr(user, "concurrency_mobile", None)
    else:
        override = getattr(user, "concurrency_web", None)
    if override is not None and override > 0:
        return override
    sub_rows = await db.execute(
        select(Subscription.stripe_price_id, Subscription.plan_type).where(
            Subscription.user_id == user.id,
            Subscription.status.in_(("active", "trialing")),
        )
    )
    kind_limit: int | None = None
    for price_id, plan_type in sub_rows.all():
        cfg = None
        if price_id:
            row = await db.execute(
                select(
                    ProductTabConfig.concurrency_web,
                    ProductTabConfig.concurrency_mobile,
                ).where(ProductTabConfig.stripe_price_id == price_id)
            )
            cfg = row.first()
        if not cfg and plan_type:
            row = await db.execute(
                select(
                    ProductTabConfig.concurrency_web,
                    ProductTabConfig.concurrency_mobile,
                ).where(ProductTabConfig.plan_type == plan_type)
                .order_by(ProductTabConfig.id)
                .limit(1)
            )
            cfg = row.first()
        if not cfg:
            continue
        cw, cm = cfg
        val = cm if client_kind == "mobile" else cw
        if val is not None:
            kind_limit = val if kind_limit is None else max(kind_limit, val)
    return kind_limit


# --- Registration ---

@router.post("/register", response_model=LoginResponse)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Public registration. Creates account + auto-login."""
    login_limiter.check(request.client.host if request.client else "unknown")

    # Gate outdated mobile apps the same way `/login` does — otherwise a
    # stale client could create an account and then hit the upgrade wall
    # on its next action (confusing UX).
    await _enforce_min_app_version(request, db)

    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "El nombre de usuario ya existe")

    # Check email uniqueness
    existing_email = await db.execute(select(User).where(User.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(409, "El email ya está registrado")

    # Create user
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        is_admin=False,
        max_devices=2,
    )
    db.add(user)
    await db.flush()

    # Read registration config from AppSettings
    reg_config = await _get_registration_config(db)
    trial_days = reg_config["trial_days"]

    # Set max_devices from config
    user.max_devices = reg_config["max_devices"]

    # Assign tabs from config
    for tab in reg_config["tabs"]:
        db.add(UserTabAccess(user_id=user.id, tab=tab))

    if trial_days > 0:
        # Create trial subscription with configurable duration
        trial_end = datetime.now(timezone.utc) + timedelta(days=trial_days)
        trial_sub = Subscription(
            user_id=user.id,
            plan_type="trial",
            status="trialing",
            current_period_start=datetime.now(timezone.utc),
            current_period_end=trial_end,
        )
        db.add(trial_sub)

        # Grant circuit access to all circuits for trial period
        circuits_result = await db.execute(select(Circuit))
        for circuit in circuits_result.scalars().all():
            db.add(UserCircuitAccess(
                user_id=user.id,
                circuit_id=circuit.id,
                valid_from=datetime.now(timezone.utc),
                valid_until=trial_end,
            ))

    await db.commit()

    # Auto-login: create device session
    device_name, ip_address = _extract_device_info(request)
    app_platform, app_version = _extract_app_version_info(request)
    session_token = secrets.token_hex(32)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=device_name, ip_address=ip_address,
        app_platform=app_platform, app_version=app_version,
    )
    db.add(device_session)
    await db.commit()

    # Reload with tab_access
    result = await db.execute(
        select(User).where(User.id == user.id).options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one()

    # Send welcome email (fire and forget)
    from app.services.email_service import send_welcome_email
    import asyncio
    asyncio.create_task(send_welcome_email(data.email, data.username, trial_days))

    access_token = create_token(user.id, user.username, user.is_admin, session_token)
    return LoginResponse(
        access_token=access_token,
        session_token=session_token,
        user=_user_out(user),
    )


# --- Login ---

@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    device: str = "",
):
    """
    Login endpoint with per-kind concurrency control.

    The `device` query param (matching the `/ws/race` WebSocket endpoint)
    tags the created DeviceSession as 'web' or 'mobile' and — crucially —
    counts only sessions of the SAME kind against the user's limit. This
    fixes the historical bug where a Pro user with `concurrency_mobile=4`
    couldn't open a mobile session because a single web session had
    already filled the legacy `max_devices=1` bucket.

    Limit resolution (for non-admins, same as the WS endpoint):
      1. Try `ProductTabConfig.concurrency_{web|mobile}` for the user's
         active subscription plan.
      2. Fall back to the legacy `user.max_devices` if no subscription
         config is found (preserves existing behavior for trial/free users).
    """
    ip = request.client.host if request.client else "unknown"
    login_limiter.check(ip)
    client_kind = "mobile" if device == "mobile" else "web"

    # Mobile apps pinned below the admin-configured minimum get rejected
    # here with HTTP 426 before we even look at the credentials. Keeps
    # stale clients out (and lets the admin drop a compatibility-breaking
    # fix remotely without having to reach every device). See
    # `_enforce_min_app_version` — the gate is a no-op for web logins.
    await _enforce_min_app_version(request, db)

    # Validate credentials — accept username OR email
    identifier = data.username.strip()
    if "@" in identifier:
        result = await db.execute(
            select(User).where(User.email == identifier.lower()).options(selectinload(User.tab_access), selectinload(User.subscriptions))
        )
    else:
        result = await db.execute(
            select(User).where(User.username == identifier).options(selectinload(User.tab_access), selectinload(User.subscriptions))
        )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        # Record the failure against the IP so repeated typos throttle.
        login_limiter.record_failure(ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # MFA check
    if user.mfa_enabled:
        if not data.mfa_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA code required",
                headers={"X-MFA-Required": "true"},
            )
        import pyotp
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(data.mfa_code, valid_window=1):
            # A wrong MFA code is also a credential-class failure.
            login_limiter.record_failure(ip)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid MFA code")

    # Credentials (and MFA if applicable) valid → clear any previous
    # failure streak for this IP so a future typo doesn't start already
    # halfway into the throttle window.
    login_limiter.reset(ip)
    # Note: if mfa_required but not mfa_enabled, we let login succeed.
    # The frontend will show a mandatory MFA setup screen based on
    # user.mfa_required && !user.mfa_enabled in the response.

    # Cleanup stale sessions first
    await _cleanup_stale_sessions(db, user.id)

    # Admins bypass device session limits
    if user.is_admin:
        # Clean old admin sessions (keep last 50 max)
        admin_sessions = await db.execute(
            select(DeviceSession)
            .where(DeviceSession.user_id == user.id)
            .order_by(DeviceSession.last_active.desc())
        )
        all_admin = admin_sessions.scalars().all()
        if len(all_admin) > 50:
            for old in all_admin[50:]:
                await db.delete(old)
            await db.commit()
    else:
        # Count active sessions of the SAME kind (web vs mobile) so the
        # per-kind plan limits can be enforced independently.
        count_result = await db.execute(
            select(func.count(DeviceSession.id)).where(
                DeviceSession.user_id == user.id,
                DeviceSession.client_kind == client_kind,
            )
        )
        same_kind_count = count_result.scalar() or 0

        # Resolve the effective limit from the subscription plan, falling
        # back to the legacy single-field `user.max_devices` when no plan
        # config is available.
        kind_limit = await _resolve_kind_limit(db, user, client_kind)
        effective_max = kind_limit if kind_limit is not None else user.max_devices

        if same_kind_count >= effective_max:
            # Return only sessions of the same kind — the client can kill
            # one of those to free a slot and retry.
            sessions_result = await db.execute(
                select(DeviceSession)
                .where(
                    DeviceSession.user_id == user.id,
                    DeviceSession.client_kind == client_kind,
                )
                .order_by(DeviceSession.last_active.desc())
            )
            sessions = sessions_result.scalars().all()

            kind_label = "móvil" if client_kind == "mobile" else "web"
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        f"Has alcanzado el limite de {effective_max} dispositivo(s) "
                        f"{kind_label} conectado(s). Cierra una sesion existente "
                        "para continuar."
                    ),
                    "max_devices": effective_max,
                    "client_kind": client_kind,
                    "active_sessions": [
                        {
                            "id": s.id,
                            "device_name": s.device_name,
                            "ip_address": s.ip_address,
                            "client_kind": s.client_kind,
                            "app_platform": s.app_platform or "",
                            "app_version": s.app_version or "",
                            "created_at": s.created_at.isoformat() if s.created_at else None,
                            "last_active": s.last_active.isoformat() if s.last_active else None,
                        }
                        for s in sessions
                    ],
                }
            )

    # Create device session, tagged with its kind.
    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)

    app_platform, app_version = _extract_app_version_info(request)
    device_session = DeviceSession(
        session_token=session_token,
        user_id=user.id,
        device_name=device_name,
        ip_address=ip_address,
        client_kind=client_kind,
        app_platform=app_platform,
        app_version=app_version,
    )
    db.add(device_session)
    await db.commit()

    # Create JWT with session_token embedded
    access_token = create_token(user.id, user.username, user.is_admin, session_token)

    return LoginResponse(
        access_token=access_token,
        session_token=session_token,
        user=_user_out(user),
    )


# --- Google OAuth ---

@router.get("/google")
async def google_login(request: Request, plan: str | None = None):
    """Redirect to Google OAuth."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(501, "Google login not configured")

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback"

    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    # Pass plan selection through OAuth state parameter
    if plan:
        params["state"] = plan
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@router.get("/google/callback")
async def google_callback(code: str, request: Request, state: str | None = None, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback."""
    import httpx
    settings = get_settings()

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })

    if token_response.status_code != 200:
        raise HTTPException(400, "Failed to authenticate with Google")

    tokens = token_response.json()

    # Get user info
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(400, "Failed to get user info from Google")

    google_user = userinfo_response.json()
    google_id = google_user["id"]
    email = google_user.get("email", "")
    name = google_user.get("name", email.split("@")[0])

    # Find existing user by google_id or email
    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email)).options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()

    if user:
        # Update google_id if not set (email match)
        if not user.google_id:
            user.google_id = google_id
            await db.commit()
    else:
        # Create new user
        # Generate unique username from Google name — transliterate accents
        import re as re_mod
        import unicodedata
        # Normalize Unicode: NFD splits accented chars, then strip combining marks
        normalized_name = unicodedata.normalize("NFD", name)
        normalized_name = "".join(c for c in normalized_name if unicodedata.category(c) != "Mn")
        base_username = normalized_name.lower().replace(" ", ".").replace("@", ".")[:30]
        base_username = re_mod.sub(r'[^a-z0-9._-]', '', base_username) or "user"
        username = base_username
        counter = 1
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            username = f"{base_username}{counter}"
            counter += 1

        # Google users get a random password (they login via Google)
        import secrets as sec
        random_pass = sec.token_hex(32)

        user = User(
            username=username,
            email=email,
            google_id=google_id,
            password_hash=hash_password(random_pass),
            has_custom_password=False,
            is_admin=False,
            max_devices=2,
        )
        db.add(user)
        await db.flush()

        # Read registration config from AppSettings
        reg_config = await _get_registration_config(db)
        trial_days = reg_config["trial_days"]

        # Set max_devices from config
        user.max_devices = reg_config["max_devices"]

        # Assign tabs from config
        for tab in reg_config["tabs"]:
            db.add(UserTabAccess(user_id=user.id, tab=tab))

        if trial_days > 0:
            trial_end = datetime.now(timezone.utc) + timedelta(days=trial_days)
            trial_sub = Subscription(
                user_id=user.id,
                plan_type="trial",
                status="trialing",
                current_period_start=datetime.now(timezone.utc),
                current_period_end=trial_end,
            )
            db.add(trial_sub)

            circuits_result = await db.execute(select(Circuit))
            for circuit in circuits_result.scalars().all():
                db.add(UserCircuitAccess(
                    user_id=user.id,
                    circuit_id=circuit.id,
                    valid_from=datetime.now(timezone.utc),
                    valid_until=trial_end,
                ))

        await db.commit()

        # Reload with relationships
        result = await db.execute(
            select(User).where(User.id == user.id).options(selectinload(User.tab_access), selectinload(User.subscriptions))
        )
        user = result.scalar_one()

        # Send welcome email
        if email:
            from app.services.email_service import send_welcome_email
            import asyncio as _asyncio
            _asyncio.create_task(send_welcome_email(email, username, trial_days))

    # Cleanup stale sessions
    await _cleanup_stale_sessions(db, user.id)

    # Create device session
    device_name, ip_address = _extract_device_info(request)
    app_platform, app_version = _extract_app_version_info(request)
    session_token = secrets.token_hex(32)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=device_name, ip_address=ip_address,
        app_platform=app_platform, app_version=app_version,
    )
    db.add(device_session)
    await db.commit()

    access_token = create_token(user.id, user.username, user.is_admin, session_token)

    # Redirect to frontend with tokens as query params (frontend will extract and store)
    from fastapi.responses import RedirectResponse
    from urllib.parse import urlencode
    import json
    frontend_url = settings.frontend_url
    user_out = _user_out(user)
    redirect_params = {
        "token": access_token,
        "session_token": session_token,
        "user": json.dumps({
            "id": user_out.id, "username": user_out.username,
            "email": user_out.email,
            "is_admin": user_out.is_admin, "max_devices": user_out.max_devices,
            "mfa_enabled": user_out.mfa_enabled,
            "mfa_required": user_out.mfa_required,
            "tab_access": user_out.tab_access,
            "has_active_subscription": user_out.has_active_subscription,
            "subscription_plan": user_out.subscription_plan,
            "trial_ends_at": user_out.trial_ends_at,
        }),
    }
    # Pass plan selection back to frontend if provided via OAuth state
    if state:
        redirect_params["plan"] = state
    params = urlencode(redirect_params)
    return RedirectResponse(f"{frontend_url}/login?oauth=google&{params}")


@router.get("/google/ios")
async def google_login_ios(request: Request):
    """Start Google OAuth flow for iOS app — redirects back to boxboxnow:// scheme."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(501, "Google login not configured")

    # The callback is the same server endpoint, but with source=ios to know where to redirect
    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ios"

    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@router.get("/google/callback/ios")
async def google_callback_ios(code: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback for iOS — redirects to boxboxnow:// custom scheme."""
    import httpx
    settings = get_settings()

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ios"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })

    if token_response.status_code != 200:
        raise HTTPException(400, "Failed to authenticate with Google")

    tokens = token_response.json()

    # Get user info
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(400, "Failed to get user info from Google")

    google_user = userinfo_response.json()
    google_id = google_user["id"]
    email = google_user.get("email", "")
    name = google_user.get("name", email.split("@")[0])

    # Find existing user by google_id or email
    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email)).options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()

    if not user:
        from fastapi.responses import RedirectResponse
        from urllib.parse import urlencode
        return RedirectResponse(f"boxboxnow://auth?error=no_account")

    # Cleanup stale sessions
    await _cleanup_stale_sessions(db, user.id)

    # Create device session
    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)
    app_platform, app_version = _extract_app_version_info(request)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=f"iOS: {device_name}", ip_address=ip_address,
        app_platform=app_platform or "ios", app_version=app_version,
    )
    db.add(device_session)
    await db.commit()

    access_token = create_token(user.id, user.username, user.is_admin, session_token)

    from fastapi.responses import RedirectResponse
    from urllib.parse import urlencode
    params = urlencode({"token": access_token})
    return RedirectResponse(f"boxboxnow://auth?{params}")


@router.get("/google/ipad")
async def google_login_ipad(request: Request):
    """Start Google OAuth flow for iPad dashboard app — redirects back to boxboxnowdashboard:// scheme."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(501, "Google login not configured")

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ipad"

    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@router.get("/google/callback/ipad")
async def google_callback_ipad(code: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback for iPad dashboard — redirects to boxboxnowdashboard:// custom scheme."""
    import httpx
    settings = get_settings()

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ipad"

    async with httpx.AsyncClient() as client:
        token_response = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
    if token_response.status_code != 200:
        raise HTTPException(400, "Failed to authenticate with Google")
    tokens = token_response.json()

    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
    if userinfo_response.status_code != 200:
        raise HTTPException(400, "Failed to get user info from Google")

    google_user = userinfo_response.json()
    google_id = google_user["id"]
    email = google_user.get("email", "")
    name = google_user.get("name", email.split("@")[0])

    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
        .options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"boxboxnowdashboard://auth?error=no_account")

    await _cleanup_stale_sessions(db, user.id)

    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)
    app_platform, app_version = _extract_app_version_info(request)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=f"iPad Dashboard: {device_name}", ip_address=ip_address,
        app_platform=app_platform or "ipad", app_version=app_version,
    )
    db.add(device_session)
    await db.commit()

    access_token = create_token(user.id, user.username, user.is_admin, session_token)

    from fastapi.responses import RedirectResponse
    from urllib.parse import urlencode
    params = urlencode({"token": access_token})
    return RedirectResponse(f"boxboxnowdashboard://auth?{params}")


# --- Session Management (user) ---

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.get("/sessions", response_model=list[DeviceSessionOut])
async def list_my_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active device sessions for the current user."""
    current_sid = getattr(request.state, "session_token", None)

    result = await db.execute(
        select(DeviceSession)
        .where(DeviceSession.user_id == user.id)
        .order_by(DeviceSession.last_active.desc())
    )
    sessions = result.scalars().all()

    return [
        DeviceSessionOut(
            id=s.id,
            session_token=s.session_token[:8] + "...",  # partial for security
            device_name=s.device_name,
            ip_address=s.ip_address,
            client_kind=s.client_kind or "",
            app_platform=s.app_platform or "",
            app_version=s.app_version or "",
            created_at=s.created_at,
            last_active=s.last_active,
            is_current=(s.session_token == current_sid),
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
async def kill_session(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kill a specific device session. User can kill their own sessions."""
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.id == session_id,
            DeviceSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(404, "Session not found")

    session_token = session.session_token
    await db.delete(session)
    await db.commit()

    # Close active WebSocket connections for this session
    from app.ws.server import close_ws_for_session
    await close_ws_for_session(session_token)

    return {"killed": True, "device": session.device_name}


@router.delete("/sessions")
async def kill_all_other_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kill all sessions except the current one."""
    current_sid = getattr(request.state, "session_token", None)

    # Get session tokens to close their WS connections
    result = await db.execute(
        select(DeviceSession.session_token).where(
            DeviceSession.user_id == user.id,
            DeviceSession.session_token != current_sid,
        )
    )
    tokens_to_kill = [row[0] for row in result.all()]

    await db.execute(
        delete(DeviceSession).where(
            DeviceSession.user_id == user.id,
            DeviceSession.session_token != current_sid,
        )
    )
    await db.commit()

    # Close active WebSocket connections for killed sessions
    from app.ws.server import close_ws_for_session
    for tk in tokens_to_kill:
        await close_ws_for_session(tk)

    return {"killed_all_others": True}


# --- MFA ---

@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Generate a new TOTP secret and return QR code URI. Does NOT enable MFA yet."""
    import pyotp
    secret = pyotp.random_base32()
    user.mfa_secret = secret
    await db.commit()

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.username, issuer_name="BoxBoxNow")
    return MfaSetupResponse(secret=secret, qr_uri=uri)


@router.get("/mfa/qr")
async def mfa_qr(user: User = Depends(get_current_user)):
    """Return QR code as base64 PNG for the current MFA secret."""
    import pyotp
    import qrcode
    import io
    import base64

    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="No MFA secret")

    totp = pyotp.TOTP(user.mfa_secret)
    uri = totp.provisioning_uri(name=user.username, issuer_name="BoxBoxNow")

    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"qr_base64": f"data:image/png;base64,{b64}"}


@router.post("/mfa/verify")
async def mfa_verify(data: MfaVerifyRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Verify a TOTP code to confirm setup. Enables MFA on success."""
    import pyotp
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not set up. Call /mfa/setup first.")

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")

    user.mfa_enabled = True
    await db.commit()
    return {"ok": True, "message": "MFA enabled successfully"}


@router.post("/mfa/disable")
async def mfa_disable(data: MfaVerifyRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Disable MFA. Requires a valid TOTP code to confirm."""
    import pyotp
    if not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA is not enabled")

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")

    user.mfa_enabled = False
    user.mfa_secret = None
    await db.commit()
    return {"ok": True, "message": "MFA disabled"}


@router.post("/logout")
async def logout(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logout: removes the current device session."""
    current_sid = getattr(request.state, "session_token", None)
    if current_sid:
        await db.execute(
            delete(DeviceSession).where(DeviceSession.session_token == current_sid)
        )
        await db.commit()
        from app.ws.server import close_ws_for_session
        await close_ws_for_session(current_sid)
    return {"logged_out": True}


# --- Password Reset ---

@router.post("/forgot-password")
async def forgot_password(request: Request, db: AsyncSession = Depends(get_db)):
    """Request a password reset email."""
    body = await request.json()
    email = body.get("email", "").strip().lower()

    if not email:
        raise HTTPException(400, "Email requerido")

    # Always return success to prevent email enumeration
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(48)
        user.password_reset_token = reset_token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

        # Send email (fire and forget)
        from app.services.email_service import send_password_reset_email
        import asyncio
        asyncio.create_task(send_password_reset_email(email, user.username, reset_token))

    return {"ok": True, "message": "Si el email existe, recibiras un enlace para restablecer tu contrasena."}


@router.post("/reset-password")
async def reset_password(request: Request, db: AsyncSession = Depends(get_db)):
    """Reset password with token from email."""
    body = await request.json()
    token = body.get("token", "")
    new_password = body.get("password", "")

    if not token or not new_password:
        raise HTTPException(400, "Token y contrasena requeridos")

    if len(new_password) < 8:
        raise HTTPException(400, "La contrasena debe tener al menos 8 caracteres")

    result = await db.execute(
        select(User).where(User.password_reset_token == token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(400, "Token invalido o expirado")

    if user.password_reset_expires and user.password_reset_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Token invalido o expirado")

    user.password_hash = hash_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    await db.commit()

    return {"ok": True, "message": "Contrasena actualizada correctamente"}


@router.post("/set-password")
async def set_password(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Set or change password for logged-in user.

    Google-authenticated users cannot set a password: their account is tied
    to Google SSO and we don't want a parallel credential pathway. Users who
    registered by email already have a password from registration.
    """
    # Block Google SSO users from setting a password at all. Their account
    # is authenticated exclusively through Google.
    if getattr(user, "google_id", None):
        raise HTTPException(
            403,
            "Las cuentas con inicio de sesion de Google no pueden establecer contrasena.",
        )

    body = await request.json()
    new_password = body.get("password", "")

    if not new_password or len(new_password) < 8:
        raise HTTPException(400, "La contrasena debe tener al menos 8 caracteres")

    if not re.search(r"[A-Z]", new_password):
        raise HTTPException(400, "La contrasena debe tener al menos una mayuscula")

    if not re.search(r"[0-9]", new_password):
        raise HTTPException(400, "La contrasena debe tener al menos un numero")

    user.password_hash = hash_password(new_password)
    user.has_custom_password = True
    await db.commit()

    return {"ok": True, "message": "Contrasena establecida correctamente"}


# ---------------------------------------------------------------------------
# Waitlist (public — no auth required)
# ---------------------------------------------------------------------------

@router.post("/waitlist")
async def join_waitlist(request: Request, db: AsyncSession = Depends(get_db)):
    """Store an interested user's email/name in the pre-launch waitlist."""
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")

    existing = await db.execute(select(WaitlistEntry).where(WaitlistEntry.email == email))
    if existing.scalar_one_or_none():
        return {"ok": True, "already": True}

    entry = WaitlistEntry(email=email, name=name or None, source="landing")
    db.add(entry)
    await db.commit()
    return {"ok": True, "already": False}


# --- Kill session without being logged in (from the 409 screen) ---

@router.post("/kill-session")
async def kill_session_unauthenticated(
    data: LoginRequest,
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Kill a session by re-authenticating (for when user is locked out).
    Called from the 'device limit reached' screen.
    """
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Verify session belongs to this user
    result = await db.execute(
        select(DeviceSession).where(
            DeviceSession.id == session_id,
            DeviceSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    session_token = session.session_token
    await db.delete(session)
    await db.commit()

    # Close active WebSocket connections for this session
    from app.ws.server import close_ws_for_session
    await close_ws_for_session(session_token)

    return {"killed": True, "device": session.device_name}
