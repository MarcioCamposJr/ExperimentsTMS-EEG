from fastapi import APIRouter, Request
from models import tms_models
from utils import tms

tms_routers = APIRouter()

@tms_routers.get("/ports-tms")
async def get_ports_tms():
    return tms.get_ports()

@tms_routers.get("/get-connection-tms")
async def get_ports_tms():
    return tms_models.TmsStatusConnection(is_connected=tms.stim.is_connected,
                                    port=tms.stim.port)

@tms_routers.post("/connect-tms")
async def connect_tms(config: tms_models.TmsConnection):
    await tms.connect(config.port, config.port_name)
    return tms.stim.is_connected

@tms_routers.get("/get-tms-status")
async def get_tms_status(request: Request):
    return {"is_active": request.app.state.experiment['tms']}

@tms_routers.post("/enable-tms")
async def enable_tms(config: tms_models.TmsEnableConfig, request: Request):
    request.app.state.experiment['tms']= config.enable
    await tms.enable(config.enable)
    return {"status": "ok"}

@tms_routers.post("/set-tms-intensity")
async def set_tms_intensity(config: dict, request: Request):
    intensity = config.get("intensity", 50)
    intensity = max(0, min(100, int(intensity)))
    request.app.state.experiment['tms_intensity'] = intensity
    await tms.set_intensity(intensity)
    return {"status": "ok", "intensity": intensity}

