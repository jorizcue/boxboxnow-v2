from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, UniqueConstraint, Index, LargeBinary, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    # "Internal" users bypass the active-subscription gate (they don't pay)
    # but still need at least one currently-valid UserCircuitAccess row to
    # enter the platform — same circuit-window check that paying users get.
    # Used for staff / partner accounts that operate on a circuit without
    # going through Stripe. Orthogonal to is_admin: an internal user is NOT
    # automatically an admin, and an admin doesn't need is_internal=True
    # (admins already bypass every gate).
    is_internal = Column(Boolean, default=False, nullable=False)
    max_devices = Column(Integer, default=1, nullable=False)
    # Per-user concurrency overrides. When set, they take priority over the
    # subscription plan's ProductTabConfig.concurrency_{web,mobile} and over
    # the legacy `max_devices`. When NULL, the resolver falls back to the
    # plan value, then to max_devices. Admins bypass all of these.
    concurrency_web = Column(Integer, nullable=True)
    concurrency_mobile = Column(Integer, nullable=True)
    mfa_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_required = Column(Boolean, default=False)  # Admin forces user to enable MFA
    email = Column(String(255), unique=True, nullable=True, index=True)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    has_custom_password = Column(Boolean, default=True, nullable=False)  # False for Google-only users
    stripe_customer_id = Column(String(255), unique=True, nullable=True, index=True)
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False, server_default="0")
    email_verification_token = Column(String(255), nullable=True)
    email_verification_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    circuit_access = relationship("UserCircuitAccess", back_populates="user", cascade="all, delete-orphan")
    tab_access = relationship("UserTabAccess", back_populates="user", cascade="all, delete-orphan")
    race_sessions = relationship("RaceSession", back_populates="user", cascade="all, delete-orphan")
    device_sessions = relationship("DeviceSession", back_populates="user", cascade="all, delete-orphan")
    gps_laps = relationship("GpsTelemetryLap", backref="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("UserPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")
    config_presets = relationship("DriverConfigPreset", back_populates="user", cascade="all, delete-orphan")


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
    # First N laps of each stint are excluded from "Tiempo_Promedio_Vuelta"
    # (the rolling 20-lap average) because tyres are cold and the times
    # aren't representative of the driver's real pace. Configurable per
    # circuit because shorter tracks reach temperature in fewer laps.
    warmup_laps_to_skip = Column(Integer, default=3, nullable=False)
    for_sale = Column(Boolean, nullable=False, default=True, server_default="1")
    is_beta = Column(Boolean, nullable=False, default=False, server_default="0")

    # ── Tracking module (vista de pista en vivo) ──
    # `track_polyline` es un JSON con un array de [lat, lon] que define
    # el trazado cerrado del circuito, en sentido "forward" (sentido por
    # defecto). El editor admin lo guarda aquí. Las distancias `s1/s2/s3`
    # y los pit-entry/exit son distancias acumuladas en metros desde la
    # meta (que está siempre a 0) recorriendo el polyline en sentido
    # forward. Cuando una carrera se corre al revés (`RaceSession.direction
    # = "reversed"`) calculamos las distancias efectivas como
    # `total - forward_distance` sin duplicar datos.
    track_polyline = Column(Text, nullable=True)  # JSON: [[lat, lon], ...]
    track_length_m = Column(Float, nullable=True)
    s1_distance_m = Column(Float, nullable=True)
    s2_distance_m = Column(Float, nullable=True)
    s3_distance_m = Column(Float, nullable=True)
    pit_entry_distance_m = Column(Float, nullable=True)  # legacy — superseded by pit_entry_lat/lon
    pit_exit_distance_m = Column(Float, nullable=True)
    # Pit-in / pit-out se guardan como (lat, lon) libres porque el
    # operador quiere ponerlos en la entrada/salida REAL del pit
    # (físicamente al lado del trazado), no forzados sobre el
    # polyline. El algoritmo de interpolación de karts NO usa estas
    # distancias — son solo marcadores visuales sobre el mapa, así
    # que coordenadas crudas son suficientes.
    pit_entry_lat = Column(Float, nullable=True)
    pit_entry_lon = Column(Float, nullable=True)
    pit_exit_lat = Column(Float, nullable=True)
    pit_exit_lon = Column(Float, nullable=True)
    pit_lane_polyline = Column(Text, nullable=True)  # JSON polyline abierto pit-in → boxes → pit-out
    pit_lane_length_m = Column(Float, nullable=True)
    pit_box_distance_m = Column(Float, nullable=True)  # punto en el pit_lane donde se aparcan los karts
    # Distancia desde polyline[0] hasta la META. Por defecto 0 (META
    # coincide con el primer vértice del polyline, que es lo que pasa
    # cuando el operador empieza a trazar desde la línea de meta).
    # Cuando el operador mueve la META a otro punto, guardamos la
    # distancia aquí en lugar de rotar el array del polyline — más
    # simple y el algoritmo de interpolación usa esta distancia como
    # ancla cuando un kart cruza meta (LAP event).
    meta_distance_m = Column(Float, default=0.0, nullable=False)
    default_direction = Column(String(16), default="forward", nullable=False)  # "forward" | "reversed"

    # Renderer SVG (arquitectura "Apex Timing"). Opcional — si está
    # poblado, el frontend lo prefiere sobre el polyline Leaflet porque
    # da movimiento suave a 60 fps via CSS `offset-path`, sin "saltar
    # al medio del circuito" cuando el polyline tiene vértices dispersos.
    #
    #   svg_viewbox: cadena tipo "0 0 800 600" — el sistema de
    #     coordenadas interno del SVG. Se elige una vez por circuito.
    #   svg_paths_json: dict JSON con paths SVG `d` por segmento:
    #     { "track": "M ... C ...",
    #       "s1":    "M ... C ..." (META→S1),
    #       "s2":    "..." (S1→S2),
    #       "s3":    "..." (S2→S3),
    #       "in":    "..." (pit-in → boxes),
    #       "out":   "..." (boxes → pit-out) }
    #   svg_image_url: URL de la imagen de fondo (foto cenital / dibujo
    #     del trazado). Puede ser una URL absoluta, una ruta relativa
    #     servida por nosotros, o un data: URL (base64) para evitar
    #     gestionar ficheros estáticos.
    svg_viewbox = Column(String(64), nullable=True)
    svg_paths_json = Column(Text, nullable=True)
    svg_image_url = Column(String(2048), nullable=True)

    user_access = relationship("UserCircuitAccess", back_populates="circuit", cascade="all, delete-orphan")

    @property
    def has_track_config(self) -> bool:
        """True when the admin has saved a polyline for this circuit.
        Surfaced to `CircuitOut.has_track_config` via Pydantic's
        `from_attributes`, so the frontend can show/hide the Tracking
        module per-circuit without a separate API call."""
        return bool(self.track_polyline)


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


class UserPreferences(Base):
    """Per-user preferences (driver view config, etc.)."""
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    visible_cards = Column(Text, nullable=False, default="{}")    # JSON: Record<DriverCardId, boolean>
    card_order = Column(Text, nullable=False, default="[]")       # JSON: DriverCardId[]
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="preferences")


class DriverConfigPreset(Base):
    """Named preset for driver view card configuration (max 10 per user)."""
    __tablename__ = "driver_config_presets"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_preset_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    visible_cards = Column(Text, nullable=False, default="{}")
    card_order = Column(Text, nullable=False, default="[]")
    # Only one preset per user should have is_default=True. Enforced in application
    # code (config_routes.py) since SQLite lacks partial unique indexes in a portable way.
    is_default = Column(Boolean, default=False, nullable=False)
    # Display options applied when this preset is selected in DriverView.
    # All three are optional — None means "keep whatever the user has now".
    contrast = Column(Float, nullable=True)          # 0.0..1.0
    orientation = Column(String(16), nullable=True)  # "free" | "portrait" | "landscape"
    audio_enabled = Column(Boolean, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="config_presets")


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

    # Team auto-load — desactivado por defecto. Cuando está ON la app
    # vuelve a recargar la plantilla de equipos/pilotos del backend cada
    # vez que llega un `teams_updated` por WebSocket (típicamente al
    # arrancar la carrera). Por petición del usuario lo dejamos OFF por
    # defecto: que el strategist active manualmente la opción si quiere
    # ese comportamiento — la mayoría prefiere editar a mano los
    # equipos sin que un broadcast sobreescriba su trabajo.
    auto_load_teams = Column(Boolean, default=False, nullable=False)

    # Number of drivers in the team. Used by the pit-gate feasibility check
    # (pit_gate.py) to decide whether pitting now still allows every driver
    # to reach `min_driver_time_min`. When 0 or NULL the gate falls back to
    # the count observed in `kart.driver_total_ms` (Apex-discovered drivers),
    # which means the check only kicks in after a driver change has been
    # registered. Configurable up-front by the strategist to enforce the
    # constraint from lap 1.
    team_drivers_count = Column(Integer, default=0, nullable=False)

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
    stripe_price_id = Column(String(255), unique=True, nullable=False, index=True)  # Unique per price (source of truth)
    plan_type = Column(String(50), nullable=False)  # Label: may repeat across rows (e.g. two products both tagged "basic_monthly")
    tabs = Column(Text, nullable=False, default="[]")  # JSON array of tab slugs
    # JSON array of driver-card ids the plan exposes in the pilot view's
    # preset editor (e.g. ["raceTimer","lastLap","gpsSpeed",…]). Empty
    # string defaults to "every card" via the resolver in auth_routes.py
    # so existing plans don't suddenly hide cards from active users —
    # admins narrow the list manually as they refresh each plan.
    allowed_cards = Column(Text, nullable=False, default="[]")
    max_devices = Column(Integer, nullable=False, default=1)  # DEPRECATED: kept for backward compat, fallback when web/mobile not set
    concurrency_web = Column(Integer, nullable=True)  # Max concurrent browser sessions (NULL = use max_devices)
    concurrency_mobile = Column(Integer, nullable=True)  # Max concurrent mobile-app sessions (NULL = use max_devices)
    per_circuit = Column(Boolean, nullable=False, default=True)  # If False, grants access to ALL circuits on purchase
    # Number of circuits the buyer must pick during the per-circuit purchase
    # flow. Only meaningful when per_circuit=True. Default 1 keeps existing
    # plans behaving exactly as before (single-circuit checkout). Values > 1
    # turn the circuit selector into a checkbox grid that requires the user
    # to choose exactly N circuits before the "Continuar al pago" button
    # unlocks. The backend webhook then grants N UserCircuitAccess rows for
    # the selected circuits in one Stripe payment.
    circuits_to_select = Column(Integer, nullable=False, default=1)
    display_name = Column(String(100), nullable=False, default="")
    description = Column(Text, nullable=True)
    features = Column(Text, nullable=True, default="[]")  # JSON array of feature strings
    # Per-locale plan copy. Spanish stays the source/fallback in the
    # columns above; these hold a JSON object keyed by locale. The
    # display_name/description blobs are {"en","it","de","fr": "..."};
    # features_i18n is {"en","it","de","fr": ["...", ...]} where each
    # list mirrors the es `features` length/order (untranslated bullets
    # fall back to the es bullet at request time). NULL/empty ⇒ the
    # resolver returns the Spanish value (regression-safe). JSON-encoded
    # Text, mirroring how `features` above is stored/decoded.
    display_name_i18n = Column(Text, nullable=True)
    description_i18n = Column(Text, nullable=True)
    features_i18n = Column(Text, nullable=True)
    price_amount = Column(Float, nullable=True)  # Price in EUR for this specific interval
    billing_interval = Column(String(20), nullable=True)  # "month", "year", "one_time"
    is_popular = Column(Boolean, default=False, nullable=False)
    # When True the plan is announced but not yet on sale: the landing
    # disables its subscribe button ("Próximamente") and the comparison
    # table flags the column. Purely presentational — does NOT block the
    # Stripe checkout route, so an admin can still test purchases.
    coming_soon = Column(Boolean, default=False, nullable=False)
    is_visible = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    # Optional custom HTML body for the subscription confirmation email.
    # Supports {username}, {plan_name}, {circuit_name} placeholders.
    # When null/empty the default template in email_service.py is used.
    email_template = Column(Text, nullable=True)


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
    # Tags each session as web or mobile so the login endpoint can enforce
    # per-kind device limits (ProductTabConfig.concurrency_web /
    # concurrency_mobile) the same way the WebSocket endpoint does. Old rows
    # default to 'web' via the migration in database.py.
    client_kind = Column(String(16), nullable=False, default="web", server_default="web")
    # Platform tag ("ios", "android", "web" or "") derived from the
    # `X-App-Platform` header at login time — so admin can filter /
    # report on mobile usage independently of client_kind (which is
    # purely about concurrency buckets and could conceivably be "web"
    # for an iPad dashboard running the web UI).
    app_platform = Column(String(16), default="", server_default="")
    # Client-reported semver from the `X-App-Version` header. Populated on
    # login and refreshed on every authenticated request through
    # `get_current_user`, so the admin panel's "Sesiones activas" list
    # shows whatever build the device most recently hit the API with.
    # Blank for web sessions (the header isn't attached there).
    app_version = Column(String(32), default="", server_default="")
    created_at = Column(DateTime, server_default=func.now())
    last_active = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="device_sessions")


class GpsTelemetryLap(Base):
    __tablename__ = "gps_telemetry_laps"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True)
    race_session_id = Column(Integer, ForeignKey("race_sessions.id"), nullable=True)
    # Physical kart number that produced this telemetry — read from the
    # user's active session at upload time. Lets us cross-reference GPS
    # laps with Apex Timing laps in the replay (sync the same kart's data).
    kart_number = Column(Integer, nullable=True, index=True)

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


class WaitlistEntry(Base):
    """Pre-launch waitlist — stores interested users before the public launch."""
    __tablename__ = "waitlist_entry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    source = Column(String(50), default="landing")
    created_at = Column(DateTime, server_default=func.now())


# ───────────────────────── Chatbot ─────────────────────────
#
# RAG-based support chatbot. The ingest CLI splits Markdown docs in
# `docs/chatbot/` into chunks, embeds each chunk with OpenAI's
# text-embedding-3-small, and stores the float32 vector as a BLOB. At query
# time the /api/chat endpoint embeds the user's question, runs cosine
# similarity in numpy against every chunk (O(N) — fine for ~hundreds of
# chunks), picks top-k, and feeds them as context to a Groq LLM.

class DocChunk(Base):
    """One semantically-coherent slice of the documentation, with its
    embedding stored inline as a float32 BLOB."""
    __tablename__ = "doc_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_path = Column(String(255), nullable=False, index=True)   # e.g. "conceptos/circuitos.md"
    section_title = Column(String(255), nullable=True)              # closest H1/H2/H3 above the chunk
    content = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=True)
    # Float32 little-endian bytes (1536 dims * 4B = 6KB per chunk for OpenAI
    # text-embedding-3-small). Loaded into numpy at query time.
    embedding = Column(LargeBinary, nullable=False)
    embedding_dim = Column(Integer, nullable=False)
    embedding_model = Column(String(100), nullable=False)
    indexed_at = Column(DateTime, server_default=func.now())


class ChatUsage(Base):
    """Per-user, per-day usage counter — the hard cap that keeps the LLM
    bill predictable. Checked & incremented atomically before each
    completion. A row is created on first message of the day."""
    __tablename__ = "chat_usage"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day = Column(Date, primary_key=True)
    message_count = Column(Integer, default=0, nullable=False)
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)


class UsageEvent(Base):
    """Granular log of every meaningful product interaction. Drives the
    admin "Analítica" panel: DAU/WAU/MAU, tab popularity, acquisition
    funnel, and first-touch attribution.

    Design notes:
      * `user_id` is nullable because a chunk of the acquisition funnel
        (landing.view → pricing.view → register.start) fires before the
        visitor has an account. `visitor_id` (UUID stored in
        localStorage as `bbn_vid`) is what stitches anonymous events
        together. On register/login the backend writes a
        VisitorIdentity row tying the visitor_id to the user_id.
      * `event_type` is a coarse category: "session_start" |
        "tab_view" | "action" | "funnel". `event_key` is the specific
        identifier within that category (e.g. event_type="tab_view"
        event_key="race").
      * `utm_*` and `referrer` are SNAPSHOTTED from first-touch on
        every event of the visitor — replicated, not joined — so admin
        queries don't need to walk back to the first event of the
        session to know attribution.
      * IP is intentionally NOT stored here (we already capture it in
        DeviceSession for auth; analytics doesn't need it).
      * Rows older than 30 days get deleted by the daily cleanup task
        — the aggregated `usage_daily` table is the durable source for
        long-term analysis.
    """
    __tablename__ = "usage_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    visitor_id = Column(String(36), nullable=True, index=True)
    ts = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    event_type = Column(String(20), nullable=False, index=True)
    event_key = Column(String(80), nullable=False, index=True)
    client_kind = Column(String(16), nullable=True)   # "web" | "mobile"
    app_platform = Column(String(16), nullable=True)  # "ios" | "android" | "web"
    app_version = Column(String(32), nullable=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=True)
    props_json = Column(Text, nullable=True)
    # First-touch attribution snapshot. Replicated on every event of
    # the same visitor so funnel queries don't need a join.
    utm_source = Column(String(64), nullable=True, index=True)
    utm_medium = Column(String(64), nullable=True)
    utm_campaign = Column(String(64), nullable=True, index=True)
    referrer = Column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_usage_events_ts_event_key", "ts", "event_key"),
        Index("ix_usage_events_ts_user", "ts", "user_id"),
    )


class VisitorIdentity(Base):
    """Stitches an anonymous `visitor_id` (UUID from localStorage) to
    the `user_id` it eventually becomes. Created on register or first
    login of a known browser.

    The row's `first_*` columns hold the first-touch attribution
    captured BEFORE the visitor authenticated — this is what lets the
    admin funnel attribute a paid subscription to "google_ads /
    Lanzamiento" even though that UTM stopped appearing on the URL
    days ago.

    A given visitor_id maps to at most one user_id (PK). A user can
    have multiple visitor_ids if they sign in from different browsers
    — each browser gets its own VisitorIdentity row.
    """
    __tablename__ = "visitor_identity"

    visitor_id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    first_seen = Column(DateTime, nullable=True)
    linked_at = Column(DateTime, server_default=func.now(), nullable=False)
    first_utm_source = Column(String(64), nullable=True)
    first_utm_medium = Column(String(64), nullable=True)
    first_utm_campaign = Column(String(64), nullable=True)
    first_referrer = Column(String(255), nullable=True)


class UsageDaily(Base):
    """Daily rollup of `usage_events`. Populated by a nightly task —
    `usage_events` rows older than 30 days are deleted but the rollup
    stays. Drives the admin time-series + heatmap views without
    scanning the raw events table.

    A row says: for (user_id, day, event_key), the event happened
    `count` times and `unique_visitors` distinct visitors triggered it.
    `user_id=NULL` rows aggregate anonymous events.

    A surrogate `id` PK is used instead of a composite key because
    SQLite treats NULL in a composite PK as "always distinct" — which
    would let us insert duplicate (NULL, day, key) rows. The explicit
    UNIQUE INDEX below treats NULL as a single value via COALESCE.
    """
    __tablename__ = "usage_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    day = Column(Date, nullable=False, index=True)
    event_key = Column(String(80), nullable=False, index=True)
    count = Column(Integer, default=0, nullable=False)
    unique_visitors = Column(Integer, default=0, nullable=False)


class ChatMessage(Base):
    """Persisted history of every chat exchange. Used to continue
    conversations across reloads and to surface the most-asked questions
    in admin analytics. Grouped by `session_id` (UUID generated client-
    side and stored in localStorage)."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(36), nullable=False, index=True)
    role = Column(String(16), nullable=False)   # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_chat_messages_user_session", "user_id", "session_id", "created_at"),
    )


# ─── Ranking (Glicko-2) ──────────────────────────────────────────────────────
#
# Skill-rating system across all recorded Apex sessions. Pilots are
# identified by name only (Apex doesn't emit unique IDs), so we keep a
# canonical name + an alias table for the typo/casing/accent variants
# the parser sees in the wild. The rating math is Glicko-2 (not pure
# ELO) because the data per pilot is sparse — most have 1–4 sessions —
# and Glicko's RD (rating deviation) gives an explicit confidence
# bound. See `backend/app/services/ranking/` for the implementation.


class Driver(Base):
    """A pilot identified by a canonical (normalised) name. The original
    raw strings the parser saw live in `DriverAlias` rows pointing at this
    driver. Admin can merge two `Driver` rows (move all aliases + results
    onto one canonical) or split one row back into two if a name collision
    was a false positive."""
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Display form — usually the most common raw variant we saw, but the
    # admin can override.
    canonical_name = Column(String(120), nullable=False, index=True)
    # Output of `ranking.normalizer.normalize_name`: uppercase, accent-
    # stripped, single-spaced. Used for fast lookups when matching new
    # Apex events to existing drivers.
    normalized_key = Column(String(120), nullable=False, unique=True, index=True)
    # Rolling counters maintained by the processor — cheap to keep
    # denormalised so the admin Ranking page doesn't need to JOIN every
    # session_results row to sort by activity.
    sessions_count = Column(Integer, default=0, nullable=False)
    total_laps = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)


class DriverAlias(Base):
    """Alternative name forms that all point at the same canonical
    `Driver`. Populated automatically by the parser (one row per distinct
    raw string seen) and editable by the admin via the merge tool.

    Example: `MATÍAS GARCÍA` and `MATIAS GARCIA` both alias to one
    `Driver` row with normalized_key='MATIAS GARCIA'."""
    __tablename__ = "driver_aliases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String(120), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class DriverRating(Base):
    """Current Glicko-2 state for a driver across ALL circuits (global
    rating). One row per driver. Updated in-place every time the
    processor consumes a new session containing that driver. The full
    update trail lives in `RatingHistory`.

    A driver's per-circuit rating lives in `DriverCircuitRating` below.
    Both are maintained simultaneously by `processor.apply_extracts` —
    the same pairwise outcomes drive both updates."""
    __tablename__ = "driver_ratings"

    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), primary_key=True)
    rating = Column(Float, default=1500.0, nullable=False)
    rd = Column(Float, default=350.0, nullable=False)           # rating deviation (uncertainty)
    volatility = Column(Float, default=0.06, nullable=False)    # Glicko-2 sigma
    sessions_count = Column(Integer, default=0, nullable=False)
    last_session_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)


class DriverCircuitRating(Base):
    """Per-circuit Glicko-2 rating. Same algorithm as the global
    `DriverRating` but isolated per circuit, so a driver who only races
    at Ariza gets a meaningful Ariza-specific rating without being
    diluted by single-shot appearances at other tracks.

    Maintained alongside the global rating: every time the processor
    runs a session, it updates BOTH the global state and the
    per-circuit state for each participating driver. The pre-states
    used for the pairwise comparisons differ (each rating uses its own
    pre-state), so a driver can have wildly different global vs
    per-circuit ratings — useful signal for the strategist who knows
    one team is "the Ariza specialist" without dominating elsewhere."""
    __tablename__ = "driver_circuit_ratings"

    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), primary_key=True)
    circuit_name = Column(String(64), primary_key=True)
    rating = Column(Float, default=1500.0, nullable=False)
    rd = Column(Float, default=350.0, nullable=False)
    volatility = Column(Float, default=0.06, nullable=False)
    sessions_count = Column(Integer, default=0, nullable=False)
    last_session_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_driver_circuit_ratings_circuit", "circuit_name", "rating"),
    )


class SessionResult(Base):
    """One row per (recorded session, driver) — the materialised stats
    that feed Glicko-2 per session. We keep these in the DB (rather than
    re-deriving from the log every time) so the rating math is
    reproducible: replaying the algorithm only needs SessionResult rows,
    not the original 100 MB of Apex logs."""
    __tablename__ = "session_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Session identity comes from the recording filename + the
    # title1/title2 the operator set in Apex. Three fields together
    # uniquely identify the session.
    circuit_name = Column(String(64), nullable=False, index=True)
    log_date = Column(String(10), nullable=False, index=True)   # YYYY-MM-DD
    title1 = Column(String(120), default="", nullable=False)
    title2 = Column(String(120), default="", nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    kart_number = Column(Integer, nullable=True)
    team_name = Column(String(120), default="", nullable=False)
    total_laps = Column(Integer, default=0, nullable=False)
    best_lap_ms = Column(Integer, default=0, nullable=False)
    avg_lap_ms = Column(Float, default=0.0, nullable=False)
    median_lap_ms = Column(Integer, default=0, nullable=False)
    # Kart-bias correction: how much the kart this driver was in
    # over/under-performed vs the session's field. Subtracted from
    # avg/median to give the kart-corrected pace used for the
    # Glicko-2 pairwise comparison.
    kart_bias_ms = Column(Float, default=0.0, nullable=False)
    corrected_avg_ms = Column(Float, default=0.0, nullable=False)
    final_position = Column(Integer, nullable=True)
    session_seq = Column(Integer, default=1, nullable=False)
    session_type = Column(String(8), default="pace", nullable=False)   # race|pace
    team_mode = Column(String(12), default="individual", nullable=False)  # endurance|individual
    effective_score = Column(Float, nullable=True)
    duration_s = Column(Integer, default=0, nullable=False)
    # Raw last Apex RANKING value seen for the row — DIAGNOSTIC ONLY.
    # The rating uses `final_position` (reconstructed from lap data);
    # this is kept to audit how wrong Apex's live position was.
    apex_last_position = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("circuit_name", "log_date", "session_seq", "driver_id",
                         name="uq_session_result"),
        Index("ix_session_results_session", "circuit_name", "log_date", "title1", "title2"),
    )


class RankingSessionOverride(Base):
    """Admin-forced session type for a recorded session. Consulted by
    apply_extracts (effective type = override ?? classifier). Lives in
    its own table so reset_ratings (which truncates session_results /
    rating_history / processed_logs) does NOT wipe manual fixes."""
    __tablename__ = "ranking_session_overrides"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_name = Column(String(64), nullable=False, index=True)
    log_date = Column(String(10), nullable=False, index=True)
    session_seq = Column(Integer, nullable=False)
    forced_type = Column(String(8), nullable=False)  # "race" | "pace"
    title1 = Column(String(120), default="", nullable=False)
    title2 = Column(String(120), default="", nullable=False)
    updated_at = Column(DateTime, server_default=func.now(),
                        onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("circuit_name", "log_date", "session_seq",
                         name="uq_ranking_session_override"),
    )


class RatingHistory(Base):
    """Append-only log of every Glicko-2 update applied to a driver.
    One row per (session_result, driver). Useful for audit / undo and for
    the per-driver rating-over-time chart in the admin UI."""
    __tablename__ = "rating_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    session_result_id = Column(Integer, ForeignKey("session_results.id", ondelete="CASCADE"), nullable=False, index=True)
    rating_before = Column(Float, nullable=False)
    rd_before = Column(Float, nullable=False)
    rating_after = Column(Float, nullable=False)
    rd_after = Column(Float, nullable=False)
    delta = Column(Float, nullable=False)
    computed_at = Column(DateTime, server_default=func.now(), nullable=False)


class ProcessedLog(Base):
    """Tracks which `data/recordings/<Circuit>/<YYYY-MM-DD>.log[.gz]`
    files the processor has already turned into SessionResult rows. The
    daily batch only looks at files NOT in this table — fast incremental
    operation. If the algorithm changes and we need to reprocess,
    truncate this table + `session_results` + `rating_history` and
    rerun."""
    __tablename__ = "processed_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_name = Column(String(64), nullable=False, index=True)
    log_date = Column(String(10), nullable=False, index=True)
    sessions_count = Column(Integer, default=0, nullable=False)
    laps_count = Column(Integer, default=0, nullable=False)
    processed_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("circuit_name", "log_date", name="uq_processed_log"),
    )

