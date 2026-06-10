from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel

try:
    from . import database as db
except ImportError:
    import database as db

# Initialisation de l'API FastAPI
app = FastAPI(title="API Station IoT - EPT GIT")
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# Sécurité CORS : Autorise ton dashboard à communiquer avec l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialisation de la base de données au démarrage
@app.on_event("startup")
def startup_event():
    db.init_db()

# Dépendance pour obtenir la session de base de données
def get_db():
    database = db.SessionLocal()
    try:
        yield database
    finally:
        database.close()

# Modèles de données Pydantic (validation des requêtes)
class SensorDataCreate(BaseModel):
    device_id: str
    temperature: float
    humidity: float
    water_level: float

class CommandCreate(BaseModel):
    device_id: str
    command: str

# --- LES ROUTES DE L'API ---

# Route 1 : Recevoir les données de l'ESP32 (POST /data)
# Route 0 : Servir le dashboard web depuis le meme serveur
@app.get("/")
def serve_dashboard():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/style.css")
def serve_styles():
    return FileResponse(FRONTEND_DIR / "style.css")

@app.get("/app.js")
def serve_app_script():
    return FileResponse(FRONTEND_DIR / "app.js")

@app.post("/data")
def receive_data(data: SensorDataCreate, database: Session = Depends(get_db)):
    db_data = db.SensorData(
        device_id=data.device_id,
        temperature=data.temperature,
        humidity=data.humidity,
        water_level=data.water_level
    )
    database.add(db_data)
    database.commit()
    database.refresh(db_data)
    return {"status": "ok", "message": "Donnees enregistrees avec succes"}

# Route 2 : Récupérer l'historique des mesures (GET /history)
@app.get("/history")
def get_history(limit: int = 50, database: Session = Depends(get_db)):
    history = database.query(db.SensorData).order_by(db.SensorData.timestamp.desc()).limit(limit).all()
    return history

# Route 3 : Envoyer une commande depuis le Dashboard (POST /command)
@app.post("/command")
def send_command(cmd: CommandCreate, database: Session = Depends(get_db)):
    if cmd.command not in ["LED_ON", "LED_OFF"]:
        raise HTTPException(status_code=400, detail="Commande invalide. Utilisez LED_ON ou LED_OFF.")
    
    db_command = db.Command(
        device_id=cmd.device_id,
        command=cmd.command,
        executed=0
    )
    database.add(db_command)
    database.commit()
    return {"status": "ok", "message": f"Commande {cmd.command} mise en attente"}

# Route 4 : L'ESP32 récupère la dernière commande en attente (GET /command)
@app.get("/command")
def get_command(device_id: str, database: Session = Depends(get_db)):
    cmd = database.query(db.Command).filter(
        db.Command.device_id == device_id, 
        db.Command.executed == 0
    ).order_by(db.Command.created_at.asc()).first()
    
    if cmd:
        cmd.executed = 1
        database.commit()
        return {"command": cmd.command}
    
    return {"command": "NONE"}

# Route 5 : Vérifier le statut de l'ESP32 (GET /status)
@app.get("/status")
def get_status(device_id: str, database: Session = Depends(get_db)):
    last_data = database.query(db.SensorData).filter(
        db.SensorData.device_id == device_id
    ).order_by(db.SensorData.timestamp.desc()).first()
    
    if last_data:
        delta = (datetime.utcnow() - last_data.timestamp).total_seconds()
        if delta < 30:
            return {"online": True}
            
    return {"online": False}
