import json
from models.experiment import ExperimentStimulus
import time

def build_payload(payload: ExperimentStimulus):
    return json.dumps({"r": bool(payload.is_running), "c": payload.color, "i": payload.instruction})

async def broadcast_state(app, payload):
    clients = getattr(app.state, "ws_clients", set())
    if not clients:
        return True

    dead = []
    for ws in list(clients):
        try:
            app.state.temp = time.perf_counter()
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)

    for ws in dead:
        clients.discard(ws)
    
    return False
