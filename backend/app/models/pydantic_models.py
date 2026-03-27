from pydantic import BaseModel
from datetime import datetime


# --- Auth ---

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    max_devices: int = 1
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    max_devices: int = 1


class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    is_admin: bool | None = None
    max_devices: int | None = None


# --- Device Sessions ---

class DeviceSessionOut(BaseModel):
    id: int
    session_token: str
    device_name: str
    ip_address: str
    created_at: datetime | None = None
    last_active: datetime | None = None
    is_current: bool = False

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    session_token: str
    user: UserOut


# --- Circuits ---

class CircuitOut(BaseModel):
    id: int
    name: str
    length_m: int | None
    pit_time_s: int | None
    ws_port: int
    php_api_port: int
    laps_discard: int
    lap_differential: int

    model_config = {"from_attributes": True}


class CircuitCreate(BaseModel):
    name: str
    length_m: int | None = None
    pit_time_s: int | None = None
    ws_port: int
    php_api_port: int = 0
    laps_discard: int = 2
    lap_differential: int = 3000


class CircuitUpdate(BaseModel):
    name: str | None = None
    length_m: int | None = None
    pit_time_s: int | None = None
    ws_port: int | None = None
    php_api_port: int | None = None
    laps_discard: int | None = None
    lap_differential: int | None = None


# --- User Circuit Access ---

class CircuitAccessOut(BaseModel):
    id: int
    user_id: int
    circuit_id: int
    circuit_name: str | None = None
    valid_from: datetime
    valid_until: datetime

    model_config = {"from_attributes": True}


class CircuitAccessCreate(BaseModel):
    user_id: int
    circuit_id: int
    valid_from: datetime
    valid_until: datetime


class CircuitAccessUpdate(BaseModel):
    valid_from: datetime | None = None
    valid_until: datetime | None = None


# --- Race Sessions ---

class RaceSessionOut(BaseModel):
    id: int
    user_id: int
    circuit_id: int
    circuit_name: str | None = None
    name: str
    duration_min: int
    min_stint_min: int
    max_stint_min: int
    min_pits: int
    pit_time_s: int
    min_driver_time_min: int
    rain: bool
    box_lines: int
    box_karts: int
    our_kart_number: int
    refresh_interval_s: int
    is_active: bool
    team_positions: list["TeamPositionOut"] = []

    model_config = {"from_attributes": True}


class RaceSessionCreate(BaseModel):
    circuit_id: int
    name: str = ""
    duration_min: int = 180
    min_stint_min: int = 15
    max_stint_min: int = 40
    min_pits: int = 3
    pit_time_s: int = 120
    min_driver_time_min: int = 30
    rain: bool = False
    box_lines: int = 2
    box_karts: int = 30
    our_kart_number: int = 0
    refresh_interval_s: int = 30


class RaceSessionUpdate(BaseModel):
    circuit_id: int | None = None
    name: str | None = None
    duration_min: int | None = None
    min_stint_min: int | None = None
    max_stint_min: int | None = None
    min_pits: int | None = None
    pit_time_s: int | None = None
    min_driver_time_min: int | None = None
    rain: bool | None = None
    box_lines: int | None = None
    box_karts: int | None = None
    our_kart_number: int | None = None
    refresh_interval_s: int | None = None


# --- Team Positions ---

class TeamPositionOut(BaseModel):
    id: int
    race_session_id: int
    position: int
    kart: int
    team_name: str

    model_config = {"from_attributes": True}


class TeamPositionCreate(BaseModel):
    position: int
    kart: int
    team_name: str = ""


# --- Race State (read-only) ---

class KartStateOut(BaseModel):
    rowId: str
    kartNumber: int
    teamName: str
    driverName: str
    position: int
    totalLaps: int
    lastLapMs: int
    bestLapMs: int
    gap: str
    interval: str
    pitCount: int
    pitStatus: str
    pitTime: str
    stintLapsCount: int
    stintDurationS: float
    tierScore: int
    avgLapMs: float
    bestAvgMs: float


class FifoStateOut(BaseModel):
    queue: list[int]
    score: float
    history: list[dict]


class ReplayStatusOut(BaseModel):
    active: bool
    filename: str | None
    progress: float
    speed: float
    paused: bool
