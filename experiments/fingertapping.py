from models.experiment import FingerTappingConfig, FingerTappingStatus, FingerTappingStimulus
from utils import trigger, tms, navigation, websocket_helpers
from utils.experimental_helpers import elepesed_time

import asyncio
import random
from fastapi import FastAPI
from time import time, perf_counter
import threading

dict_stimulus = {
    0: {"instruction": "Descanse", "color": "gray"},
    1: {"instruction": "Mão Direita", "color": "green"},
    2: {"instruction": "Mão Esquerda", "color": "blue"},
    3: {"instruction": "Mexa a Mão", "color": "green"},
    4: {"instruction": "Prepare-se", "color": "yellow"}
}

sleep_check_interval = 0.001 

async def run_prep_phase(config: FingerTappingConfig, app: FastAPI):
    """Exibe tela de preparo com contagem regressiva antes de cada trial."""
    prep_duration = config.prep_duration_seconds
    if prep_duration <= 0:
        return

    countdown = int(prep_duration)
    while countdown > 0:
        if app.state.experiment['status'] == FingerTappingStatus.canceled:
            return

        while app.state.experiment['status'] == FingerTappingStatus.paused:
            await asyncio.sleep(sleep_check_interval)
            if app.state.experiment['status'] == FingerTappingStatus.canceled:
                return

        instruction = f"Prepare-se... {countdown}"
        payload_ws = websocket_helpers.build_payload(
            FingerTappingStimulus(is_running=True, color='yellow', instruction=instruction)
        )
        app.state.experiment['color'] = 'yellow'
        app.state.experiment['instruction'] = instruction
        await websocket_helpers.broadcast_state(app, payload_ws)

        # Aguardar 1 segundo para cada contagem
        start = time()
        while (time() - start) < 1.0:
            if app.state.experiment['status'] == FingerTappingStatus.canceled:
                return
            while app.state.experiment['status'] == FingerTappingStatus.paused:
                await asyncio.sleep(sleep_check_interval)
                if app.state.experiment['status'] == FingerTappingStatus.canceled:
                    return
            await asyncio.sleep(sleep_check_interval)

        countdown -= 1


async def start_exp(config: FingerTappingConfig, sequence = [], app: FastAPI = None):
    app.state.experiment['is_running'] = True
    app.state.experiment['total_trial'] = config.num_trials
    app.state.experiment['trial_duration'] = config.task_duration_seconds
    app.state.experiment['status'] = FingerTappingStatus.running
    app.state.experiment['remaining_duration'] = 0
    app.state.experiment['time_remaining'] = 0

    exp_start_time = time()
    app.state.experiment['exp_start_time'] = exp_start_time
    total_duration = config.task_duration_seconds * config.num_trials

    for idx_trial, stimulus in enumerate(sequence):
        if app.state.experiment['status'] == FingerTappingStatus.canceled:
            break

        # --- Fase de preparo (antes de cada trial de tarefa, não de repouso) ---
        if stimulus != 0:
            await run_prep_phase(config, app)
            if app.state.experiment['status'] == FingerTappingStatus.canceled:
                break

        # --- Sortear tempo TMS aleatório para este trial ---
        if config.tms_time_min > 0 and config.tms_time_max > 0 and config.tms_time_max >= config.tms_time_min:
            tms_delay = random.uniform(config.tms_time_min, config.tms_time_max)
        elif config.tms_time > 0:
            tms_delay = config.tms_time
        else:
            tms_delay = 0

        app.state.experiment['trigger'] = pulsed = False
        app.state.experiment['is_running'] = True
        app.state.experiment['color'] = dict_stimulus[stimulus]['color']
        app.state.experiment['instruction'] = dict_stimulus[stimulus]['instruction']
        payload_ws = websocket_helpers.build_payload(FingerTappingStimulus(is_running=True, color=dict_stimulus[stimulus]['color'], instruction=dict_stimulus[stimulus]['instruction']))
        app.state.experiment['current_step'] = idx_trial
        app.state.experiment['trial_start_time'] = time()
        remaining_duration = config.task_duration_seconds

        if not await websocket_helpers.broadcast_state(app, payload_ws):
            while not app.state.experiment['trigger']:
                remaining_duration, total_duration = await elepesed_time(sleep_check_interval, remaining_duration, total_duration)
        trigger.pulse_default_trigger()
        while remaining_duration > 0 and app.state.experiment['status'] != FingerTappingStatus.canceled:
            while app.state.experiment['status'] == FingerTappingStatus.paused:
                await asyncio.sleep(sleep_check_interval)
                if app.state.experiment['status'] == FingerTappingStatus.canceled:
                    break 
            if app.state.experiment['status'] == FingerTappingStatus.canceled:
                break

            remaining_duration, total_duration = await elepesed_time(sleep_check_interval, remaining_duration, total_duration)

            app.state.experiment['remaining_duration'] = max(0, remaining_duration)
            app.state.experiment['time_remaining'] = max(0, total_duration)
            if app.state.experiment['tms'] and tms_delay > 0 and remaining_duration - config.task_duration_seconds < -(tms_delay / 1000):
                if navigation.navigation.is_connected():
                    while not navigation.on_taget():
                        while app.state.experiment['status'] == FingerTappingStatus.paused:
                            await asyncio.sleep(sleep_check_interval)
                            if app.state.experiment['status'] == FingerTappingStatus.canceled:
                                break
                        if app.state.experiment['status'] == FingerTappingStatus.canceled:
                                break
                        await asyncio.sleep(sleep_check_interval)
                if not pulsed:
                    pulsed = True
                    trigger.pulse_tms_trigger()

    payload_ws = websocket_helpers.build_payload(FingerTappingStimulus(is_running=False, color='gray', instruction='Finalizado'))
    await websocket_helpers.broadcast_state(app, payload_ws)
    app.state.experiment['is_running'] = False

def generate_sequence(taskType, num_trials, mixed_types=None):
    # Mapeamento de nomes de tipo para códigos de estímulo
    type_to_stimulus = {
        "Unilateral": 1,
        "Mão Direita": 1,
        "Mão Esquerda": 2,
        "Bilateral Simultâneo": 3,
    }

    if taskType == "Misto" and mixed_types and len(mixed_types) > 0:
        # Gerar lista de estímulos com base nos tipos selecionados
        stimulus_codes = []
        for t in mixed_types:
            code = type_to_stimulus.get(t, None)
            if code is not None:
                stimulus_codes.append(code)
        
        if not stimulus_codes:
            stimulus_codes = [1]  # fallback para mão direita

        # Criar pares (repouso + estímulo) randomizados
        pairs = []
        for i in range(num_trials // 2):
            stimulus = random.choice(stimulus_codes)
            pairs.append((0, stimulus))

        random.shuffle(pairs)
        
        sequence = []
        for rest, stim in pairs:
            sequence.append(rest)
            sequence.append(stim)

        return sequence[:num_trials]
    
    elif taskType == "Unilateral":
        padrao = [0, 1]
    elif taskType == "Bilateral":
        padrao = [0, 1, 0, 2]
    elif taskType == "Bilateral Simultâneo":
        padrao = [0, 3]
    else:
        padrao = [0]

    reps = (num_trials // len(padrao)) + 1
    sequencia = padrao * reps
    return sequencia[:num_trials]