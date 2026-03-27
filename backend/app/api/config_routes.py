"""REST API routes for race configuration CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.database import get_db
from app.models.schemas import Circuit, RaceParameters, BoxConfiguration, TeamPosition
from app.models.pydantic_models import (
    CircuitOut, CircuitCreate,
    RaceParamsOut, RaceParamsCreate, RaceParamsUpdate,
    BoxConfigOut, BoxConfigCreate,
    TeamPositionOut, TeamPositionCreate,
)

router = APIRouter(prefix="/api/config", tags=["config"])


# --- Circuits ---

@router.get("/circuits", response_model=list[CircuitOut])
async def list_circuits(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).order_by(Circuit.name))
    return result.scalars().all()


@router.post("/circuits", response_model=CircuitOut)
async def create_circuit(data: CircuitCreate, db: AsyncSession = Depends(get_db)):
    circuit = Circuit(**data.model_dump())
    db.add(circuit)
    await db.commit()
    await db.refresh(circuit)
    return circuit


@router.get("/circuits/{circuit_id}", response_model=CircuitOut)
async def get_circuit(circuit_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
    circuit = result.scalar_one_or_none()
    if not circuit:
        raise HTTPException(404, "Circuit not found")
    return circuit


# --- Race Parameters ---

@router.get("/race-params", response_model=list[RaceParamsOut])
async def list_race_params(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RaceParameters))
    return result.scalars().all()


@router.post("/race-params", response_model=RaceParamsOut)
async def create_race_params(data: RaceParamsCreate, db: AsyncSession = Depends(get_db)):
    params = RaceParameters(**data.model_dump())
    db.add(params)
    await db.commit()
    await db.refresh(params)
    return params


@router.patch("/race-params/{params_id}", response_model=RaceParamsOut)
async def update_race_params(params_id: int, data: RaceParamsUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RaceParameters).where(RaceParameters.id == params_id))
    params = result.scalar_one_or_none()
    if not params:
        raise HTTPException(404, "Race parameters not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(params, key, value)
    await db.commit()
    await db.refresh(params)
    return params


# --- Box Configuration ---

@router.get("/box-config", response_model=list[BoxConfigOut])
async def list_box_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BoxConfiguration))
    return result.scalars().all()


@router.post("/box-config", response_model=BoxConfigOut)
async def create_box_config(data: BoxConfigCreate, db: AsyncSession = Depends(get_db)):
    config = BoxConfiguration(**data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


# --- Team Positions ---

@router.get("/teams/{race_params_id}", response_model=list[TeamPositionOut])
async def list_teams(race_params_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeamPosition)
        .where(TeamPosition.race_params_id == race_params_id)
        .order_by(TeamPosition.position)
    )
    return result.scalars().all()


@router.post("/teams", response_model=TeamPositionOut)
async def create_team(data: TeamPositionCreate, db: AsyncSession = Depends(get_db)):
    team = TeamPosition(**data.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.put("/teams/{race_params_id}", response_model=list[TeamPositionOut])
async def replace_teams(
    race_params_id: int,
    teams: list[TeamPositionCreate],
    db: AsyncSession = Depends(get_db),
):
    """Replace all team positions for a race configuration."""
    await db.execute(
        delete(TeamPosition).where(TeamPosition.race_params_id == race_params_id)
    )
    new_teams = []
    for t in teams:
        team = TeamPosition(**t.model_dump())
        db.add(team)
        new_teams.append(team)
    await db.commit()
    for t in new_teams:
        await db.refresh(t)
    return new_teams
