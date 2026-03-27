from pydantic import BaseModel


class CircuitOut(BaseModel):
    id: int
    name: str
    length_m: int
    pit_time_s: int
    ws_port: int
    php_api_url: str
    laps_discard: int
    lap_differential: float

    model_config = {"from_attributes": True}


class CircuitCreate(BaseModel):
    name: str
    length_m: int
    pit_time_s: int = 120
    ws_port: int
    php_api_port: int = 0
    php_api_url: str = ""
    laps_discard: int = 2
    lap_differential: float = 1.15


class RaceParamsOut(BaseModel):
    id: int
    circuit_id: int
    duration_min: int
    min_stint_min: int
    max_stint_min: int
    min_pits: int
    pit_time_s: int
    min_driver_time_min: int
    rain: bool
    refresh_interval_s: int
    our_kart_number: int

    model_config = {"from_attributes": True}


class RaceParamsCreate(BaseModel):
    circuit_id: int
    duration_min: int = 180
    min_stint_min: int = 15
    max_stint_min: int = 40
    min_pits: int = 3
    pit_time_s: int = 120
    min_driver_time_min: int = 30
    rain: bool = False
    refresh_interval_s: int = 30
    our_kart_number: int = 0


class RaceParamsUpdate(BaseModel):
    circuit_id: int | None = None
    duration_min: int | None = None
    min_stint_min: int | None = None
    max_stint_min: int | None = None
    min_pits: int | None = None
    pit_time_s: int | None = None
    min_driver_time_min: int | None = None
    rain: bool | None = None
    refresh_interval_s: int | None = None
    our_kart_number: int | None = None


class BoxConfigOut(BaseModel):
    id: int
    race_params_id: int
    number_karts: int
    lines: int

    model_config = {"from_attributes": True}


class BoxConfigCreate(BaseModel):
    race_params_id: int
    number_karts: int = 30
    lines: int = 2


class TeamPositionOut(BaseModel):
    id: int
    race_params_id: int
    position: int
    kart: int
    team_name: str

    model_config = {"from_attributes": True}


class TeamPositionCreate(BaseModel):
    race_params_id: int
    position: int
    kart: int
    team_name: str = ""


class KartStateOut(BaseModel):
    row_id: str
    kart_number: int
    team_name: str
    driver_name: str
    position: int
    total_laps: int
    last_lap_ms: int
    best_lap_ms: int
    gap: str
    interval: str
    pit_count: int
    pit_status: str
    pit_time: str
    stint_laps_count: int
    stint_duration_s: float
    tier_score: int
    avg_lap_ms: float
    best_avg_ms: float


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
