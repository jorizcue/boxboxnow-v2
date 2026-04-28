import secrets
import logging

from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)


def _generate_jwt_secret() -> str:
    """Generate a random JWT secret and warn that it should be configured via .env."""
    logger.warning(
        "JWT_SECRET not set — using a random secret. "
        "Sessions will NOT survive restarts. Set JWT_SECRET in .env for production."
    )
    return secrets.token_urlsafe(64)


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
    allowed_origins: str = "https://boxboxnow.com,https://www.boxboxnow.com"

    # Auth
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Race defaults
    default_circuit_length: int = 1100
    default_pit_time: int = 120
    default_laps_discard: int = 2
    default_lap_differential: float = 1.15

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_basic_monthly_price_id: str = ""
    stripe_basic_annual_price_id: str = ""
    stripe_pro_monthly_price_id: str = ""
    stripe_pro_annual_price_id: str = ""
    stripe_event_price_id: str = ""
    frontend_url: str = "http://localhost:3000"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    from_email: str = "BoxBoxNow <noreply@boxboxnow.com>"

    # Chatbot — RAG support agent on /dashboard.
    # OpenAI is used only for embeddings (cheap; ~$0.02/M tokens). Groq runs
    # the LLM on its free tier. Both default to empty so the chat endpoint
    # responds with a clear "not configured" error if keys aren't set.
    openai_api_key: str = ""
    groq_api_key: str = ""
    chatbot_daily_message_limit: int = 30
    chatbot_max_input_chars: int = 800
    chatbot_max_output_tokens: int = 600
    chatbot_llm_model: str = "llama-3.1-8b-instant"
    chatbot_embed_model: str = "text-embedding-3-small"
    chatbot_top_k: int = 5

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def apex_ws_url(self) -> str:
        return f"wss://{self.apex_ws_host}:{self.apex_ws_port}"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret:
        s.jwt_secret = _generate_jwt_secret()
    return s
