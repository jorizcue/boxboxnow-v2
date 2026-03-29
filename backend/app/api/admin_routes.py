"""Admin routes: manage users, circuits, circuit access, and CircuitHub."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.models.database import get_db
from app.models.schemas import User, Circuit, UserCircuitAccess
from app.models.pydantic_models import (
    UserOut, UserCreate, UserUpdate,
    CircuitOut, CircuitCreate, CircuitUpdate,
    CircuitAccessOut, CircuitAccessCreate, CircuitAccessUpdate,
)
from app.api.auth_routes import require_admin, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

@router.get("/users", response_model=list[UserOut])
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.username))
    return result.scalars().all()


@router.post("/users", response_model=UserOut)
async def create_user(data: UserCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Username already exists")

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        is_admin=data.is_admin,
        max_devices=data.max_devices,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, data: UserUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    if data.username is not None:
        user.username = data.username
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.max_devices is not None:
        user.max_devices = data.max_devices
    if data.is_admin is not None:
        user.is_admin = data.is_admin

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")

    await db.delete(user)
    await db.commit()
    return {"deleted": True}


# --- Circuits ---

@router.get("/circuits", response_model=list[CircuitOut])
async def list_all_circuits(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).order_by(Circuit.name))
    return result.scalars().all()


@router.post("/circuits", response_model=CircuitOut)
async def create_circuit(data: CircuitCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    circuit = Circuit(**data.model_dump())
    db.add(circuit)
    await db.commit()
    await db.refresh(circuit)
    return circuit


@router.patch("/circuits/{circuit_id}", response_model=CircuitOut)
async def update_circuit(circuit_id: int, data: CircuitUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(circuit, key, value)

    await db.commit()
    await db.refresh(circuit)
    return circuit


@router.delete("/circuits/{circuit_id}")
async def delete_circuit(circuit_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")

    await db.delete(circuit)
    await db.commit()
    return {"deleted": True}


# --- Circuit Access ---

@router.get("/access", response_model=list[CircuitAccessOut])
async def list_all_access(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserCircuitAccess)
        .options(selectinload(UserCircuitAccess.circuit))
        .order_by(UserCircuitAccess.user_id)
    )
    rows = result.scalars().all()
    return [
        CircuitAccessOut(
            id=a.id,
            user_id=a.user_id,
            circuit_id=a.circuit_id,
            circuit_name=a.circuit.name if a.circuit else None,
            valid_from=a.valid_from,
            valid_until=a.valid_until,
        )
        for a in rows
    ]


@router.get("/access/user/{user_id}", response_model=list[CircuitAccessOut])
async def list_user_access(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserCircuitAccess)
        .options(selectinload(UserCircuitAccess.circuit))
        .where(UserCircuitAccess.user_id == user_id)
    )
    rows = result.scalars().all()
    return [
        CircuitAccessOut(
            id=a.id,
            user_id=a.user_id,
            circuit_id=a.circuit_id,
            circuit_name=a.circuit.name if a.circuit else None,
            valid_from=a.valid_from,
            valid_until=a.valid_until,
        )
        for a in rows
    ]


@router.post("/access", response_model=CircuitAccessOut)
async def grant_access(data: CircuitAccessCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    access = UserCircuitAccess(**data.model_dump())
    db.add(access)
    await db.commit()
    await db.refresh(access)
    # Load circuit name
    circuit = await db.execute(select(Circuit).where(Circuit.id == access.circuit_id))
    c = circuit.scalar_one_or_none()
    return CircuitAccessOut(
        id=access.id,
        user_id=access.user_id,
        circuit_id=access.circuit_id,
        circuit_name=c.name if c else None,
        valid_from=access.valid_from,
        valid_until=access.valid_until,
    )


@router.patch("/access/{access_id}", response_model=CircuitAccessOut)
async def update_access(access_id: int, data: CircuitAccessUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserCircuitAccess).where(UserCircuitAccess.id == access_id))
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(404, "Access record not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(access, key, value)

    await db.commit()
    await db.refresh(access)
    return access


@router.delete("/access/{access_id}")
async def revoke_access(access_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserCircuitAccess).where(UserCircuitAccess.id == access_id))
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(404, "Access record not found")

    await db.delete(access)
    await db.commit()
    return {"deleted": True}


# --- CircuitHub Management ---

@router.get("/hub/status")
async def hub_status(request: Request, admin: User = Depends(require_admin)):
    """Get real-time status of all CircuitHub connections."""
    circuit_hub = request.app.state.circuit_hub
    return {"circuits": circuit_hub.get_status()}


@router.post("/hub/{circuit_id}/start")
async def hub_start_circuit(circuit_id: int, request: Request, admin: User = Depends(require_admin)):
    """Start or restart a circuit connection."""
    circuit_hub = request.app.state.circuit_hub
    ok = await circuit_hub.start_connection(circuit_id)
    if not ok:
        raise HTTPException(404, "Circuit not found")
    return {"status": "started", "circuit_id": circuit_id}


@router.post("/hub/{circuit_id}/stop")
async def hub_stop_circuit(circuit_id: int, request: Request, admin: User = Depends(require_admin)):
    """Stop a circuit connection."""
    circuit_hub = request.app.state.circuit_hub
    ok = await circuit_hub.stop_connection(circuit_id)
    if not ok:
        raise HTTPException(404, "Circuit connection not found")
    return {"status": "stopped", "circuit_id": circuit_id}
