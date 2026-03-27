from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.models.database import Base


class Circuit(Base):
    __tablename__ = "circuits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    length_m = Column(Integer, nullable=False)
    pit_time_s = Column(Integer, default=120)
    ws_port = Column(Integer, nullable=False)
    php_api_port = Column(Integer, default=0)
    laps_discard = Column(Integer, default=2)
    lap_differential = Column(Float, default=1.15)
    php_api_url = Column(String(255), default="")


class RaceParameters(Base):
    __tablename__ = "race_parameters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=False)
    duration_min = Column(Integer, default=180)
    min_stint_min = Column(Integer, default=15)
    max_stint_min = Column(Integer, default=40)
    min_pits = Column(Integer, default=3)
    pit_time_s = Column(Integer, default=120)
    min_driver_time_min = Column(Integer, default=30)
    rain = Column(Boolean, default=False)
    refresh_interval_s = Column(Integer, default=30)
    our_kart_number = Column(Integer, default=0)

    circuit = relationship("Circuit")


class BoxConfiguration(Base):
    __tablename__ = "box_configuration"

    id = Column(Integer, primary_key=True, autoincrement=True)
    race_params_id = Column(Integer, ForeignKey("race_parameters.id"), nullable=False)
    number_karts = Column(Integer, default=30)
    lines = Column(Integer, default=2)


class TeamPosition(Base):
    __tablename__ = "teams_level"

    id = Column(Integer, primary_key=True, autoincrement=True)
    race_params_id = Column(Integer, ForeignKey("race_parameters.id"), nullable=False)
    position = Column(Integer, nullable=False)
    kart = Column(Integer, nullable=False)
    team_name = Column(String(100), default="")


class RaceSnapshot(Base):
    __tablename__ = "race_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    race_params_id = Column(Integer, ForeignKey("race_parameters.id"), nullable=False)
    timestamp = Column(String(30), nullable=False)
    data_json = Column(Text, nullable=False)
