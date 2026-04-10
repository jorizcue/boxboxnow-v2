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

import time
import secrets
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import User, DeviceSession, UserTabAccess, UserCircuitAccess, Subscription, Circuit, AppSetting
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


async def _get_platform_setting(db: AsyncSession, key: str) -> str:
    """Get a platform setting value, returning default if not found."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else PLATFORM_DEFAULTS.get(key, "0")


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
    """Simple in-memory rate limiter: max_attempts per window_seconds per IP."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 60):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}

    def check(self, ip: str) -> None:
        now = time.monotonic()
        timestamps = self._attempts.get(ip, [])
        timestamps = [t for t in timestamps if now - t < self.window_seconds]
        if len(timestamps) >= self.max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please try again later.",
            )
        timestamps.append(now)
        self._attempts[ip] = timestamps


login_limiter = RateLimiter(max_attempts=5, window_seconds=60)


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

    # Update last_active
    device_session.last_active = datetime.now(timezone.utc)
    await db.commit()

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
                    if s.status in ("active", "trialing") and (s.current_period_end is None or s.current_period_end > now):
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
        mfa_enabled=user.mfa_enabled or False,
        mfa_required=user.mfa_required or False,
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


# --- Registration ---

@router.post("/register", response_model=LoginResponse)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Public registration. Creates account + auto-login."""
    login_limiter.check(request.client.host if request.client else "unknown")

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

    # Check trial configuration
    trial_days = int(await _get_platform_setting(db, "trial_days"))

    if trial_days > 0:
        # Assign all tabs for trial users (full access during trial)
        trial_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]
        for tab in trial_tabs:
            db.add(UserTabAccess(user_id=user.id, tab=tab))

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
    else:
        # No trial: assign basic tabs only
        basic_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]
        for tab in basic_tabs:
            db.add(UserTabAccess(user_id=user.id, tab=tab))

    await db.commit()

    # Auto-login: create device session
    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=device_name, ip_address=ip_address,
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
    asyncio.create_task(send_welcome_email(data.email, data.username))

    access_token = create_token(user.id, user.username, user.is_admin, session_token)
    return LoginResponse(
        access_token=access_token,
        session_token=session_token,
        user=_user_out(user),
    )


# --- Login ---

@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    login_limiter.check(request.client.host if request.client else "unknown")
    # Validate credentials
    result = await db.execute(
        select(User).where(User.username == data.username).options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
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
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid MFA code")
    # Note: if mfa_required but not mfa_enabled, we let login succeed.
    # The frontend will show a mandatory MFA setup screen based on
    # user.mfa_required && !user.mfa_enabled in the response.

    # Circuit access check removed: subscription gate is handled in the frontend.
    # All authenticated users can login regardless of circuit access.

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
        # Count active sessions for non-admin users
        count_result = await db.execute(
            select(func.count(DeviceSession.id)).where(DeviceSession.user_id == user.id)
        )
        active_count = count_result.scalar() or 0

    if not user.is_admin and active_count >= user.max_devices:
        # Return active sessions so the user can decide which to kill
        sessions_result = await db.execute(
            select(DeviceSession)
            .where(DeviceSession.user_id == user.id)
            .order_by(DeviceSession.last_active.desc())
        )
        sessions = sessions_result.scalars().all()

        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": f"Has alcanzado el limite de {user.max_devices} dispositivo(s) conectado(s). "
                           "Cierra una sesion existente para continuar.",
                "max_devices": user.max_devices,
                "active_sessions": [
                    {
                        "id": s.id,
                        "device_name": s.device_name,
                        "ip_address": s.ip_address,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "last_active": s.last_active.isoformat() if s.last_active else None,
                    }
                    for s in sessions
                ],
            }
        )

    # Create device session
    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)

    device_session = DeviceSession(
        session_token=session_token,
        user_id=user.id,
        device_name=device_name,
        ip_address=ip_address,
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
            is_admin=False,
            max_devices=2,
        )
        db.add(user)
        await db.flush()

        # Check trial configuration
        trial_days = int(await _get_platform_setting(db, "trial_days"))

        if trial_days > 0:
            # Assign all tabs for trial users
            trial_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]
            for tab in trial_tabs:
                db.add(UserTabAccess(user_id=user.id, tab=tab))

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
        else:
            # No trial: assign basic tabs only
            basic_tabs = ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]
            for tab in basic_tabs:
                db.add(UserTabAccess(user_id=user.id, tab=tab))

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
            _asyncio.create_task(send_welcome_email(email, username))

    # Cleanup stale sessions
    await _cleanup_stale_sessions(db, user.id)

    # Create device session
    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=device_name, ip_address=ip_address,
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
