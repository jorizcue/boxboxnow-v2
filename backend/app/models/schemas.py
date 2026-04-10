from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    max_devices = Column(Integer, default=1, nullable=False)
    mfa_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_required = Column(Boolean, default=False)  # Admin forces user to enable MFA
    email = Column(String(255), unique=True, nullable=True, index=True)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    stripe_customer_id = Column(String(255), unique=True, nullable=True, index=True)
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    circuit_access = relationship("UserCircuitAccess", back_populates="user", cascade="all, delete-orphan")
    tab_access = relationship("UserTabAccess", back_populates="user", cascade="all, delete-orphan")
    race_sessions = relationship("RaceSession", back_populates="user", cascade="all, delete-orphan")
    device_sessions = relationship("DeviceSession", back_populates="user", cascade="all, delete-orphan")
    gps_laps = relationship("GpsTelemetryLap", backref="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")


class Circuit(Base):
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    length_m = Column(Integer, nullable=True)
    pit_time_s = Column(Integer, nullable=True)
    ws_port = Column(Integer, nullable=False)
    ws_port_data = Column(Integer, nullable=True)  # WS data port (ws://), defaults to ws_port - 1
    php_api_port = Column(Integer, default=0)
    laps_discard = Column(Integer, default=2)
    lap_differential = Column(Integer, default=3000)
    php_api_url = Column(String(255), default="")
    live_timing_url = Column(String(255), default="")
    retention_days = Column(Integer, default=30, nullable=False)
    finish_lat1 = Column(Float, nullable=True)
    finish_lon1 = Column(Float, nullable=True)
    finish_lat2 = Column(Float, nullable=True)
    finish_lon2 = Column(Float, nullable=True)

    user_access = relationship("UserCircuitAccess", back_populates="circuit", cascade="all, delete-orphan")


class UserCircuitAccess(Base):
    __tablename__ = "user_circuit_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    circuit_id = Column(Integer, ForeignKey("circuits.id", ondelete="CASCADE"), nullable=False)
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False)

    user = relationship("User", back_populates="circuit_access")
    circuit = relationship("Circuit", back_populates="user_access")


class UserTabAccess(Base):
    """Controls which optional tabs a user can see (replay, analytics)."""
    __tablename__ = "user_tab_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tab = Column(String(50), nullable=False)  # "replay" | "analytics"

    user = relationship("User", back_populates="tab_access")


class RaceSession(Base):
    """
    Unified race configuration per user.
    Combines old: parameters + race_parameters + box_configuration.
    One active session per user at a time.
    """
    __tablename__ = "race_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=False)
    name = Column(String(100), default="")

    # Race parameters
    duration_min = Column(Integer, default=180)
    min_stint_min = Column(Integer, default=15)
    max_stint_min = Column(Integer, default=40)
    min_pits = Column(Integer, default=3)
    pit_time_s = Column(Integer, default=120)
    min_driver_time_min = Column(Integer, default=30)
    rain = Column(Boolean, default=False)

    # Pit window
    pit_closed_start_min = Column(Integer, default=0)  # pit closed first N minutes
    pit_closed_end_min = Column(Integer, default=0)     # pit closed last N minutes

    # Box configuration
    box_lines = Column(Integer, default=2)
    box_karts = Column(Integer, default=30)

    # User params
    our_kart_number = Column(Integer, default=0)
    refresh_interval_s = Column(Integer, default=30)

    # State
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="race_sessions")
    circuit = relationship("Circuit")
    team_positions = relationship("TeamPosition", back_populates="race_session", cascade="all, delete-orphan")


class TeamPosition(Base):
    __tablename__ = "team_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    race_session_id = Column(Integer, ForeignKey("race_sessions.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False)
    kart = Column(Integer, nullable=False)
    team_name = Column(String(100), default="")

    race_session = relationship("RaceSession", back_populates="team_positions")
    drivers = relationship("TeamDriver", back_populates="team_position", cascade="all, delete-orphan",
                           order_by="TeamDriver.driver_name")


class TeamDriver(Base):
    """
    Individual driver within a team.
    Each driver has a time differential (in milliseconds) that adjusts
    the kart's average lap time for clustering purposes.

    Example: if a slow driver adds +2500ms to average, set differential_ms=2500.
    When that driver is on track, the clustering engine subtracts this from
    the observed average to estimate the kart's "true" pace.
    """
    __tablename__ = "team_drivers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    team_position_id = Column(Integer, ForeignKey("team_positions.id", ondelete="CASCADE"), nullable=False)
    driver_name = Column(String(100), nullable=False)
    differential_ms = Column(Integer, default=0)  # positive = slower than reference, negative = faster

    team_position = relationship("TeamPosition", back_populates="drivers")


class RaceLog(Base):
    """Historical record of a completed race at a circuit."""
    __tablename__ = "race_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    race_date = Column(DateTime, nullable=False)
    session_name = Column(String(200), default="")
    duration_min = Column(Integer, default=0)
    total_karts = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    circuit = relationship("Circuit")
    laps = relationship("KartLap", back_populates="race_log", cascade="all, delete-orphan")


class KartLap(Base):
    """Individual lap time for a kart in a historical race."""
    __tablename__ = "kart_laps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    race_log_id = Column(Integer, ForeignKey("race_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    kart_number = Column(Integer, nullable=False, index=True)
    team_name = Column(String(100), default="")
    driver_name = Column(String(100), default="")
    lap_number = Column(Integer, nullable=False)
    lap_time_ms = Column(Integer, nullable=False)
    is_valid = Column(Boolean, default=True)
    recorded_at = Column(DateTime, nullable=True)  # exact time this lap was recorded

    race_log = relationship("RaceLog", back_populates="laps")


class LiveRaceState(Base):
    """
    Persists the current live race at a circuit.
    One row per circuit (unique constraint). Managed by CircuitConnection
    when it detects race start/end from Apex WS messages.
    Cleared when a new race starts or the race ends (checkered flag / reset).
    """
    __tablename__ = "live_race_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=False, unique=True, index=True)
    race_start_at = Column(DateTime, nullable=False)           # wall clock of race start (UTC)
    duration_ms = Column(Integer, nullable=False)               # race duration in ms (from countdown)
    is_count_up = Column(Boolean, default=False)                # True if circuit uses count-up mode
    created_at = Column(DateTime, server_default=func.now())

    circuit = relationship("Circuit")
    pit_events = relationship("LivePitEvent", back_populates="live_race", cascade="all, delete-orphan")


class LivePitEvent(Base):
    """
    Persists each pit-in / pit-out event for karts in the current live race.
    Used to reconstruct stint times after backend restart or browser refresh.
    """
    __tablename__ = "live_pit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    live_race_id = Column(Integer, ForeignKey("live_race_state.id", ondelete="CASCADE"), nullable=False, index=True)
    kart_number = Column(Integer, nullable=False)
    team_name = Column(String(100), default="")
    driver_name = Column(String(100), default="")
    stint_number = Column(Integer, default=0)
    pit_in_at = Column(DateTime, nullable=True)                 # wall clock of pit entry
    pit_out_at = Column(DateTime, nullable=True)                # wall clock of pit exit (null = still in pit)
    pit_in_countdown_ms = Column(Integer, nullable=True)        # countdown at pit entry
    pit_out_countdown_ms = Column(Integer, nullable=True)       # countdown at pit exit

    live_race = relationship("LiveRaceState", back_populates="pit_events")


class AppSetting(Base):
    """Global application settings (key-value store). Admin-only."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(String(500), nullable=False)


class ProductTabConfig(Base):
    """Maps a Stripe price to the capabilities it grants and pricing display info.

    Each Stripe product can have multiple prices (monthly/annual). Each price
    gets its own row with a unique plan_type (e.g., basic_monthly, basic_annual).
    Rows sharing the same stripe_product_id represent the same product at different
    billing intervals.
    """
    __tablename__ = "product_tab_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stripe_product_id = Column(String(255), nullable=False, index=True)  # NOT unique — shared across prices
    stripe_price_id = Column(String(255), unique=True, nullable=False, index=True)  # Unique per price
    plan_type = Column(String(50), nullable=False, unique=True)  # basic_monthly, basic_annual, etc. — unique
    tabs = Column(Text, nullable=False, default="[]")  # JSON array of tab slugs
    max_devices = Column(Integer, nullable=False, default=1)
    display_name = Column(String(100), nullable=False, default="")
    description = Column(Text, nullable=True)
    features = Column(Text, nullable=True, default="[]")  # JSON array of feature strings
    price_amount = Column(Float, nullable=True)  # Price in EUR for this specific interval
    billing_interval = Column(String(20), nullable=True)  # "month", "year", "one_time"
    is_popular = Column(Boolean, default=False, nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)


class DeviceSession(Base):
    """
    Tracks active device sessions per user (OTT-style concurrent device control).
    Each login from a new device creates a session. When max_devices is reached,
    login is blocked until the user kills an existing session.
    """
    __tablename__ = "device_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_name = Column(String(200), default="")
    ip_address = Column(String(45), default="")
    created_at = Column(DateTime, server_default=func.now())
    last_active = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="device_sessions")


class GpsTelemetryLap(Base):
    __tablename__ = "gps_telemetry_laps"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True)
    race_session_id = Column(Integer, ForeignKey("race_sessions.id"), nullable=True)

    lap_number = Column(Integer, nullable=False)
    duration_ms = Column(Float, nullable=False)
    total_distance_m = Column(Float, nullable=False)
    max_speed_kmh = Column(Float, nullable=True)

    # JSON arrays for the full lap trace (distances[], timestamps[], lat/lon[], speed[], gforce[])
    distances_json = Column(Text, nullable=True)      # JSON array of cumulative meters
    timestamps_json = Column(Text, nullable=True)      # JSON array of ms timestamps
    positions_json = Column(Text, nullable=True)       # JSON array of {lat, lon}
    speeds_json = Column(Text, nullable=True)          # JSON array of km/h
    gforce_lat_json = Column(Text, nullable=True)      # JSON array of lateral G
    gforce_lon_json = Column(Text, nullable=True)      # JSON array of longitudinal G

    gps_source = Column(String, nullable=True)         # "racebox" or "phone"
    recorded_at = Column(DateTime, server_default=func.now())


class Subscription(Base):
    """Tracks Stripe subscriptions for users."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    stripe_price_id = Column(String(255), nullable=True)
    plan_type = Column(String(50), nullable=False)  # "trial", "basic_monthly", "basic_annual", "pro_monthly", "pro_annual", "event"
    status = Column(String(50), nullable=False, default="active")  # "active", "canceled", "past_due", "expired"
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True)  # Which circuit this sub covers
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    pending_plan = Column(String(50), nullable=True)  # Scheduled plan change (applied on next renewal)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="subscriptions")
    circuit = relationship("Circuit")
