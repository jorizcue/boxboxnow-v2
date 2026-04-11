import re
from pydantic import BaseModel, field_validator
from datetime import datetime


# --- Auth ---

class LoginRequest(BaseModel):
    username: str
    password: str
    mfa_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    is_admin: bool
    max_devices: int = 1
    mfa_enabled: bool = False
    mfa_required: bool = False
    tab_access: list[str] = []
    has_password: bool = True
    has_active_subscription: bool = False
    subscription_plan: str | None = None
    trial_ends_at: str | None = None  # ISO string if on trial
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MfaSetupResponse(BaseModel):
    secret: str
    qr_uri: str


class MfaVerifyRequest(BaseModel):
    code: str


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Invalid email address")
        return v.lower()

    @field_validator("username")
    @classmethod
    def valid_username(cls, v: str) -> str:
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username too long")
        if not re.match(r"^[a-zA-Z0-9_.-]+$", v):
            raise ValueError("Username can only contain letters, numbers, dots, hyphens and underscores")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v


class CheckoutSessionRequest(BaseModel):
    price_id: str
    circuit_id: int | None = None


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class SubscriptionOut(BaseModel):
    id: int
    plan_type: str
    status: str
    circuit_id: int | None
    circuit_name: str | None = None
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    created_at: datetime | None

    model_config = {"from_attributes": True}


class CustomerPortalResponse(BaseModel):
    url: str


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    max_devices: int = 1

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v


class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    is_admin: bool | None = None
    max_devices: int | None = None
    mfa_required: bool | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v


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
    ws_port_data: int | None = None
    php_api_port: int
    laps_discard: int
    lap_differential: int
    php_api_url: str | None = None
    live_timing_url: str | None = None
    retention_days: int = 30
    finish_lat1: float | None = None
    finish_lon1: float | None = None
    finish_lat2: float | None = None
    finish_lon2: float | None = None

    model_config = {"from_attributes": True}


class CircuitCreate(BaseModel):
    name: str
    length_m: int | None = None
    pit_time_s: int | None = None
    ws_port: int
    ws_port_data: int | None = None
    php_api_port: int = 0
    laps_discard: int = 2
    lap_differential: int = 3000
    php_api_url: str | None = None
    live_timing_url: str | None = None
    retention_days: int = 30
    finish_lat1: float | None = None
    finish_lon1: float | None = None
    finish_lat2: float | None = None
    finish_lon2: float | None = None


class CircuitUpdate(BaseModel):
    name: str | None = None
    length_m: int | None = None
    pit_time_s: int | None = None
    ws_port: int | None = None
    ws_port_data: int | None = None
    php_api_port: int | None = None
    laps_discard: int | None = None
    lap_differential: int | None = None
    php_api_url: str | None = None
    live_timing_url: str | None = None
    retention_days: int | None = None
    finish_lat1: float | None = None
    finish_lon1: float | None = None
    finish_lat2: float | None = None
    finish_lon2: float | None = None


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
    pit_closed_start_min: int
    pit_closed_end_min: int
    box_lines: int
    box_karts: int
    our_kart_number: int
    refresh_interval_s: int
    auto_load_teams: bool = True
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
    pit_closed_start_min: int = 0
    pit_closed_end_min: int = 0
    box_lines: int = 2
    box_karts: int = 30
    our_kart_number: int = 0
    refresh_interval_s: int = 30
    auto_load_teams: bool = True


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
    pit_closed_start_min: int | None = None
    pit_closed_end_min: int | None = None
    box_lines: int | None = None
    box_karts: int | None = None
    our_kart_number: int | None = None
    refresh_interval_s: int | None = None
    auto_load_teams: bool | None = None


# --- Team Positions + Drivers ---

class TeamDriverOut(BaseModel):
    id: int
    team_position_id: int
    driver_name: str
    differential_ms: int

    model_config = {"from_attributes": True}


class TeamDriverCreate(BaseModel):
    driver_name: str
    differential_ms: int = 0


class TeamPositionOut(BaseModel):
    id: int
    race_session_id: int
    position: int
    kart: int
    team_name: str
    drivers: list[TeamDriverOut] = []

    model_config = {"from_attributes": True}


class TeamPositionCreate(BaseModel):
    position: int
    kart: int
    team_name: str = ""
    drivers: list[TeamDriverCreate] = []


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


# --- Kart Analytics ---

class KartStatsOut(BaseModel):
    kart_number: int
    races: int
    total_laps: int
    valid_laps: int
    avg_lap_ms: float
    best5_avg_ms: float
    best_lap_ms: int
    teams: list[str]


class RaceLogOut(BaseModel):
    id: int
    circuit_id: int
    race_date: datetime
    session_name: str
    duration_min: int
    total_karts: int
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- GPS Telemetry ---

class GpsLapCreate(BaseModel):
    circuit_id: int | None = None
    race_session_id: int | None = None
    lap_number: int
    duration_ms: float
    total_distance_m: float
    max_speed_kmh: float | None = None
    distances: list[float] | None = None
    timestamps: list[float] | None = None
    positions: list[dict] | None = None       # [{lat, lon}, ...]
    speeds: list[float] | None = None
    gforce_lat: list[float] | None = None
    gforce_lon: list[float] | None = None
    gps_source: str | None = None


class GpsLapOut(BaseModel):
    id: int
    user_id: int
    circuit_id: int | None
    race_session_id: int | None
    lap_number: int
    duration_ms: float
    total_distance_m: float
    max_speed_kmh: float | None
    gps_source: str | None
    recorded_at: datetime | None

    # Only included when requesting full detail
    distances: list[float] | None = None
    timestamps: list[float] | None = None
    positions: list[dict] | None = None
    speeds: list[float] | None = None
    gforce_lat: list[float] | None = None
    gforce_lon: list[float] | None = None

    model_config = {"from_attributes": True}


class GpsLapBatchCreate(BaseModel):
    laps: list[GpsLapCreate]


# --- Product Tab Config ---

class ProductTabConfigOut(BaseModel):
    """Response model for product tab config (admin)."""
    id: int
    stripe_product_id: str
    stripe_price_id: str
    plan_type: str
    tabs: list[str] = []
    max_devices: int = 1
    display_name: str = ""
    description: str | None = None
    features: list[str] = []
    price_amount: float | None = None
    billing_interval: str | None = None
    is_popular: bool = False
    is_visible: bool = True
    sort_order: int = 0

    model_config = {"from_attributes": True}


class ProductTabConfigCreate(BaseModel):
    """Request model for creating a product tab config."""
    stripe_product_id: str
    stripe_price_id: str
    plan_type: str
    tabs: list[str] = []
    max_devices: int = 1
    display_name: str = ""
    description: str | None = None
    features: list[str] = []
    price_amount: float | None = None
    billing_interval: str | None = None
    is_popular: bool = False
    is_visible: bool = True
    sort_order: int = 0


class ProductTabConfigUpdate(BaseModel):
    """Request model for updating a product tab config."""
    stripe_product_id: str | None = None
    stripe_price_id: str | None = None
    plan_type: str | None = None
    tabs: list[str] | None = None
    max_devices: int | None = None
    display_name: str | None = None
    description: str | None = None
    features: list[str] | None = None
    price_amount: float | None = None
    billing_interval: str | None = None
    is_popular: bool | None = None
    is_visible: bool | None = None
    sort_order: int | None = None


class PlanPublicOut(BaseModel):
    """Public response model for pricing page — no sensitive fields."""
    plan_type: str
    display_name: str
    description: str | None = None
    features: list[str] = []
    price_amount: float | None = None
    billing_interval: str | None = None
    is_popular: bool = False
    sort_order: int = 0
