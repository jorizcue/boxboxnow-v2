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
    created_at = Column(DateTime, server_default=func.now())

    circuit_access = relationship("UserCircuitAccess", back_populates="user", cascade="all, delete-orphan")
    race_sessions = relationship("RaceSession", back_populates="user", cascade="all, delete-orphan")
    device_sessions = relationship("DeviceSession", back_populates="user", cascade="all, delete-orphan")


class Circuit(Base):
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    length_m = Column(Integer, nullable=True)
    pit_time_s = Column(Integer, nullable=True)
    ws_port = Column(Integer, nullable=False)
    php_api_port = Column(Integer, default=0)
    laps_discard = Column(Integer, default=2)
    lap_differential = Column(Integer, default=3000)
    php_api_url = Column(String(255), default="")

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
