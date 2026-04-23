from models import experiment
from experiments.fingertapping import start_exp, generate_sequence

from fastapi import APIRouter, Request, BackgroundTasks, WebSocket, WebSocketDisconnect
from time import time
import json

config_routers= APIRouter()


def _save_config_to_file(config: experiment.ExperimentConfig):
    """Persist the current config back to default_config.json so it is
    automatically loaded next time the configuration page is opened."""
    data = {
        "num_trials": config.num_trials,
        "task": config.task_type,
        "randomize": config.randomize,
        "seed": config.seed,
        "tms_intensity": config.tms_intensity,
        "trigger_codes": {
            "rest": config.trigger_codes.rest,
            "prep": config.trigger_codes.prep,
            "task_right": config.trigger_codes.task_right,
            "task_left": config.trigger_codes.task_left,
            "task_bilateral": config.trigger_codes.task_bilateral,
            "tms_pulse": config.trigger_codes.tms_pulse,
        },
        "phases": {
            "rest": {
                "duration": config.rest.duration_seconds,
                "jitter": config.rest.jitter_seconds,
                "pulse": {
                    "enabled": config.pulse_rest.enabled,
                    "points": [
                        {"position": p.position_ms, "jitter": p.jitter_ms}
                        for p in config.pulse_rest.pulses
                    ],
                },
            },
            "prep": {
                "duration": config.prep.duration_seconds,
                "jitter": config.prep.jitter_seconds,
                "pulse": {
                    "enabled": config.pulse_prep.enabled,
                    "points": [
                        {"position": p.position_ms, "jitter": p.jitter_ms}
                        for p in config.pulse_prep.pulses
                    ],
                },
            },
            "task": {
                "duration": config.task.duration_seconds,
                "jitter": config.task.jitter_seconds,
                "pulse": {
                    "enabled": config.pulse_task.enabled,
                    "points": [
                        {"position": p.position_ms, "jitter": p.jitter_ms}
                        for p in config.pulse_task.pulses
                    ],
                },
                "taskTypes": config.mixed_task_types,
            },
        },
    }
    try:
        with open("default_config.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[WARNING] Não foi possível salvar default_config.json: {e}")


@config_routers.get("/default-config")
async def get_default_config():
    try:
        with open("default_config.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

@config_routers.post("/set-config")
async def set_config(config: experiment.ExperimentConfig, request: Request, background_tasks: BackgroundTasks):
    if not request.app.state.experiment['is_running']:
        # Persist config so it survives across sessions
        _save_config_to_file(config)

        sequence = generate_sequence(
            config.movement_type, config.num_trials,
            config.mixed_task_types, config.randomize, config.seed
        )
        background_tasks.add_task(start_exp, config, sequence, request.app)
        return {"message": "Experiment started in the background"}

@config_routers.get("/state-exp")
async def get_state_exp(request: Request):
    exp_state = request.app.state.experiment
    if exp_state.get('is_running'):
        return experiment.ExperimentState(
            idx_trial=exp_state.get("current_step", 0),
            total_trial=exp_state.get("total_trial", 0),
            time_remaining=exp_state.get("time_remaining", 0),
            time_remaining_trial=exp_state.get("remaining_duration", 0),
            is_running=True,
            status = exp_state.get("status", experiment.ExperimentStatus.finished),
        )
    
    return experiment.ExperimentState(
            idx_trial=0,
            total_trial=0,
            time_remaining=0,
            time_remaining_trial=0,
            is_running=False,
            status = experiment.ExperimentStatus.finished,
        )

@config_routers.get("/stimulus-exp")
async def set_stimulus(request: Request):
    exp_state = request.app.state.experiment
    return experiment.ExperimentStimulus(
        is_running=exp_state.get('is_running', False),
        color=exp_state.get('color', 'gray'),
        instruction=exp_state.get('instruction', ''),
        phase=exp_state.get('phase', 'rest'),
        target=exp_state.get('target', 0)
    )

@config_routers.post("/status-exp")
async def set_stimulus(status: experiment.StatusPayload, request: Request):
    if request.app.state.experiment['is_running']:
        status = status.status
        if status == experiment.ExperimentStatus.paused and request.app.state.experiment['status'] == experiment.ExperimentStatus.paused:
                request.app.state.experiment['status'] = experiment.ExperimentStatus.running
                return
    
        request.app.state.experiment['status'] = status

@config_routers.websocket("/ws/stimulus")
async def ws_stimulus(ws: WebSocket):
    await ws.accept()
    clients = ws.app.state.__dict__.setdefault("ws_clients", set())
    clients.add(ws)
    try:
        while True:
            response = await ws.receive_json()
            ws.app.state.experiment['trigger'] = response.get('trigger', False)
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)