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
from app.models.schemas import User, DeviceSession
from app.models.pydantic_models import (
    LoginRequest, LoginResponse, UserOut, DeviceSessionOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, username: str, is_admin: bool, session_token: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "username": username,
        "is_admin": is_admin,
        "sid": session_token,  # ties JWT to a specific device session
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
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

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Attach session_token to request state for use in session management
    request.state.session_token = session_token

    return user


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


# --- Login ---

@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Validate credentials
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Cleanup stale sessions first
    await _cleanup_stale_sessions(db, user.id)

    # Count active sessions
    count_result = await db.execute(
        select(func.count(DeviceSession.id)).where(DeviceSession.user_id == user.id)
    )
    active_count = count_result.scalar() or 0

    if active_count >= user.max_devices:
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
        user=UserOut.model_validate(user),
    )


# --- Session Management (user) ---

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


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

    await db.delete(session)
    await db.commit()

    return {"killed": True, "device": session.device_name}


@router.delete("/sessions")
async def kill_all_other_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kill all sessions except the current one."""
    current_sid = getattr(request.state, "session_token", None)

    await db.execute(
        delete(DeviceSession).where(
            DeviceSession.user_id == user.id,
            DeviceSession.session_token != current_sid,
        )
    )
    await db.commit()

    return {"killed_all_others": True}


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
    return {"logged_out": True}


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

    await db.delete(session)
    await db.commit()

    return {"killed": True, "device": session.device_name}
