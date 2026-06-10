from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Configuration de la base de données SQLite locale
SQLALCHEMY_DATABASE_URL = "sqlite:///./iot_project.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Table 1 : Stockage des mesures des capteurs
class SensorData(Base):
    __tablename__ = "sensor_data"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True)
    temperature = Column(Float)
    humidity = Column(Float)
    water_level = Column(Float)  # En %
    timestamp = Column(DateTime, default=datetime.utcnow)

# Table 2 : Stockage des commandes envoyées à l'ESP32
class Command(Base):
    __tablename__ = "commands"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True)
    command = Column(String)  # ex: "LED_ON" ou "LED_OFF"
    executed = Column(Integer, default=0)  # 0 = en attente, 1 = exécutée
    created_at = Column(DateTime, default=datetime.utcnow)

# Fonction pour créer les tables au démarrage
def init_db():
    Base.metadata.create_all(bind=engine)