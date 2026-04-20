from models.experiment import ExperimentConfig, ExperimentStatus, ExperimentStimulus, PulseConfig
from utils import trigger, tms, navigation, websocket_helpers
from utils.experimental_helpers import elepesed_time

import asyncio
import math
import random
from fastapi import FastAPI
from time import time

dict_stimulus = {
    1: {"instruction": "Mão Direita", "color": "green"},
    2: {"instruction": "Mão Esquerda", "color": "blue"},
    3: {"instruction": "Mexa a Mão", "color": "green"},
}

# Map stimulus code to trigger code field name
STIMULUS_TO_TRIGGER_KEY = {
    1: "task_right",
    2: "task_left",
    3: "task_bilateral",
}

SLEEP_INTERVAL = 0.001


def _compute_fire_times(pulse_config: PulseConfig, tms_enabled: bool):
    """Pre-compute sorted list of fire times (seconds) for a phase."""
    if not pulse_config or not pulse_config.enabled or not tms_enabled:
        return []
    fire_times = []
    for p in pulse_config.pulses:
        t = (p.position_ms + random.uniform(-p.jitter_ms, p.jitter_ms)) / 1000.0
        fire_times.append(max(0, t))
    fire_times.sort()
    return fire_times


async def start_exp(config: ExperimentConfig, sequence: list, app: FastAPI):
    """Main experiment loop. Sequence contains task stimulus codes (1, 2, 3)."""
    exp = app.state.experiment
    exp['is_running'] = True
    exp['total_trial'] = len(sequence)
    exp['status'] = ExperimentStatus.running
    exp['remaining_duration'] = 0
    exp['time_remaining'] = 0
    exp['exp_start_time'] = time()

    codes = config.trigger_codes

    trial_avg = config.rest.duration_seconds + config.prep.duration_seconds + config.task.duration_seconds
    total_remaining = [trial_avg * len(sequence)]

    for idx, task_code in enumerate(sequence):
        if exp['status'] == ExperimentStatus.canceled:
            break
        exp['current_step'] = idx

        rest_dur = max(0.1, config.rest.duration_seconds + random.uniform(
            -config.rest.jitter_seconds, config.rest.jitter_seconds))
        prep_dur = max(0, config.prep.duration_seconds + random.uniform(
            -config.prep.jitter_seconds, config.prep.jitter_seconds))
        task_dur = max(0.1, config.task.duration_seconds + random.uniform(
            -config.task.jitter_seconds, config.task.jitter_seconds))

        # Phase 1: REST
        await _run_phase(app, rest_dur, "gray", "Descanse",
                         config.pulse_rest, total_remaining,
                         trigger_code=codes.rest, tms_trigger_code=codes.tms_pulse,
                         phase_name="rest", target=task_code)
        if exp['status'] == ExperimentStatus.canceled: break

        # Phase 2: PREP
        await _run_prep_phase(app, prep_dur, config.pulse_prep, total_remaining,
                              trigger_code=codes.prep, tms_trigger_code=codes.tms_pulse,
                              target=task_code)
        if exp['status'] == ExperimentStatus.canceled: break

        # Phase 3: TASK
        stim = dict_stimulus.get(task_code, {"instruction": "Tarefa", "color": "green"})
        task_trigger_key = STIMULUS_TO_TRIGGER_KEY.get(task_code, "task_right")
        task_trigger_code = getattr(codes, task_trigger_key, codes.task_right)
        await _run_phase(app, task_dur, stim['color'], stim['instruction'],
                         config.pulse_task, total_remaining,
                         trigger_code=task_trigger_code, tms_trigger_code=codes.tms_pulse,
                         phase_name="task", target=task_code)

    payload = websocket_helpers.build_payload(
        ExperimentStimulus(is_running=False, color='gray', instruction='Finalizado', phase='finished', target=0)
    )
    await websocket_helpers.broadcast_state(app, payload)
    exp['is_running'] = False


async def _run_phase(app, duration, color, instruction, pulse_config: PulseConfig,
                     total_remaining: list, trigger_code=None, tms_trigger_code=None,
                     phase_name="rest", target=0):
    """Run a timed phase (rest or task) with per-pulse TMS firing."""
    exp = app.state.experiment
    if exp['status'] == ExperimentStatus.canceled:
        return

    exp['color'] = color
    exp['instruction'] = instruction
    exp['phase'] = phase_name
    exp['target'] = target
    exp['trigger'] = False
    payload = websocket_helpers.build_payload(
        ExperimentStimulus(is_running=True, color=color, instruction=instruction, phase=phase_name, target=target)
    )

    if not await websocket_helpers.broadcast_state(app, payload):
        while not exp['trigger']:
            if exp['status'] == ExperimentStatus.canceled:
                return
            _, total_remaining[0] = await elepesed_time(SLEEP_INTERVAL, duration, total_remaining[0])
    trigger.pulse_default_trigger(code=trigger_code)

    # Compute fire times for each configured pulse
    fire_times = _compute_fire_times(pulse_config, exp.get('tms', False))
    fired_count = 0

    remaining = duration
    phase_start = time()

    while remaining > 0 and exp['status'] != ExperimentStatus.canceled:
        while exp['status'] == ExperimentStatus.paused:
            await asyncio.sleep(SLEEP_INTERVAL)
            if exp['status'] == ExperimentStatus.canceled:
                return
        if exp['status'] == ExperimentStatus.canceled:
            break

        remaining, total_remaining[0] = await elepesed_time(SLEEP_INTERVAL, remaining, total_remaining[0])
        exp['remaining_duration'] = max(0, remaining)
        exp['time_remaining'] = max(0, total_remaining[0])

        # Fire pulses at their scheduled times
        if fired_count < len(fire_times):
            elapsed = time() - phase_start
            if elapsed >= fire_times[fired_count]:
                if navigation.navigation.is_connected():
                    while not navigation.on_taget():
                        while exp['status'] == ExperimentStatus.paused:
                            await asyncio.sleep(SLEEP_INTERVAL)
                            if exp['status'] == ExperimentStatus.canceled: break
                        if exp['status'] == ExperimentStatus.canceled: break
                        await asyncio.sleep(SLEEP_INTERVAL)

                if exp['status'] != ExperimentStatus.canceled:
                    trigger.pulse_tms_trigger(code=tms_trigger_code)
                    await asyncio.shield(tms.single_pulse())
                    fired_count += 1


async def _run_prep_phase(app, duration, pulse_config: PulseConfig, total_remaining: list,
                          trigger_code=None, tms_trigger_code=None, target=0):
    """Run preparation phase with countdown and per-pulse TMS firing."""
    exp = app.state.experiment
    if duration <= 0 or exp['status'] == ExperimentStatus.canceled:
        return

    # Send trigger code for prep phase start
    trigger.pulse_default_trigger(code=trigger_code)

    fire_times = _compute_fire_times(pulse_config, exp.get('tms', False))
    fired_count = 0

    phase_start = time()
    remaining = duration
    # Send payload once for the prep phase
    exp['color'] = 'yellow'
    exp['instruction'] = 'Prepare-se'
    exp['phase'] = 'prep'
    exp['target'] = target
    payload = websocket_helpers.build_payload(
        ExperimentStimulus(is_running=True, color='yellow', instruction='Prepare-se', phase='prep', target=target)
    )
    await websocket_helpers.broadcast_state(app, payload)

    while remaining > 0:
        if exp['status'] == ExperimentStatus.canceled: return
        while exp['status'] == ExperimentStatus.paused:
            await asyncio.sleep(SLEEP_INTERVAL)
            if exp['status'] == ExperimentStatus.canceled: return

        remaining, total_remaining[0] = await elepesed_time(SLEEP_INTERVAL, remaining, total_remaining[0])
        exp['remaining_duration'] = max(0, remaining)
        exp['time_remaining'] = max(0, total_remaining[0])

        # Fire pulses at scheduled times
        if fired_count < len(fire_times):
            elapsed = time() - phase_start
            if elapsed >= fire_times[fired_count]:
                if navigation.navigation.is_connected():
                    while not navigation.on_taget():
                        while exp['status'] == ExperimentStatus.paused:
                            await asyncio.sleep(SLEEP_INTERVAL)
                            if exp['status'] == ExperimentStatus.canceled: break
                        if exp['status'] == ExperimentStatus.canceled: break
                        await asyncio.sleep(SLEEP_INTERVAL)
                if exp['status'] != ExperimentStatus.canceled:
                    trigger.pulse_tms_trigger(code=tms_trigger_code)
                    await asyncio.shield(tms.single_pulse())
                    fired_count += 1


def generate_sequence(movement_type, num_trials, mixed_types=None, randomize=False, seed=None):
    """Generate sequence of task stimulus codes (1, 2, 3)."""
    type_to_stimulus = {
        "Mão Direita": 1,
        "Mão Esquerda": 2,
        "Bilateral Simultâneo": 3,
    }

    if seed is not None:
        random.seed(seed)

    if movement_type == "Misto" and mixed_types and len(mixed_types) > 0:
        codes = [type_to_stimulus[t] for t in mixed_types if t in type_to_stimulus]
        if not codes: codes = [1]
        sequence = [random.choice(codes) for _ in range(num_trials)]
    elif movement_type in ("Unilateral", "Mão Direita"):
        sequence = [1] * num_trials
    elif movement_type == "Bilateral":
        pattern = [1, 2]
        sequence = (pattern * ((num_trials // len(pattern)) + 1))[:num_trials]
    elif movement_type == "Bilateral Simultâneo":
        sequence = [3] * num_trials
    elif movement_type == "Mão Esquerda":
        sequence = [2] * num_trials
    else:
        sequence = [1] * num_trials

    if randomize:
        random.shuffle(sequence)
    return sequence