from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Apex Timing
    apex_ws_host: str = "www.apex-timing.com"
    apex_ws_port: int = 8092
    apex_php_api_url: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/boxboxnow.db"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    # Race defaults
    default_circuit_length: int = 1100
    default_pit_time: int = 120
    default_laps_discard: int = 2
    default_lap_differential: float = 1.15

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def apex_ws_url(self) -> str:
        return f"wss://{self.apex_ws_host}:{self.apex_ws_port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
