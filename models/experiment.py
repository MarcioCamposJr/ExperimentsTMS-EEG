from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum


class ExperimentStatus(str, Enum):
    running = "running"
    paused = "paused"
    canceled = "canceled"
    finished = "finished"

FingerTappingStatus = ExperimentStatus


class StatusPayload(BaseModel):
    status: ExperimentStatus

StatusFingerTappingPayload = StatusPayload


class PhaseConfig(BaseModel):
    """Timing configuration for a protocol phase."""
    duration_seconds: float = 5.0
    jitter_seconds: float = 0.0


class PulsePoint(BaseModel):
    """Single TMS pulse with temporal position and jitter."""
    position_ms: float = 500
    jitter_ms: float = 0


class PulseConfig(BaseModel):
    """TMS pulse configuration for a specific protocol phase."""
    enabled: bool = False
    pulses: List[PulsePoint] = [PulsePoint()]


class TriggerCodes(BaseModel):
    """Trigger codes sent to ESP32 for each protocol state (1-16)."""
    rest: int = 1
    prep: int = 2
    task_right: int = 3
    task_left: int = 4
    task_bilateral: int = 5
    tms_pulse: int = 10


class ExperimentConfig(BaseModel):
    """Generic experiment protocol configuration."""
    task_type: str = "finger_tapping"
    num_trials: int = 10
    randomize: bool = False
    seed: Optional[int] = None

    rest: PhaseConfig = PhaseConfig(duration_seconds=5.0)
    prep: PhaseConfig = PhaseConfig(duration_seconds=3.0, jitter_seconds=0.0)
    task: PhaseConfig = PhaseConfig(duration_seconds=5.0)

    pulse_rest: PulseConfig = PulseConfig()
    pulse_prep: PulseConfig = PulseConfig()
    pulse_task: PulseConfig = PulseConfig()

    movement_type: str = "Unilateral"
    mixed_task_types: List[str] = []

    # TMS intensity (0-100% MSO)
    tms_intensity: int = 50

    # Trigger codes for EEG markers
    trigger_codes: TriggerCodes = TriggerCodes()

FingerTappingConfig = ExperimentConfig


class ExperimentState(BaseModel):
    is_running: bool
    total_trial: int
    idx_trial: int
    time_remaining: float
    time_remaining_trial: float
    status: ExperimentStatus

FingerTappingState = ExperimentState


class ExperimentStimulus(BaseModel):
    is_running: bool
    color: str
    instruction: str
    phase: str = "rest"
    target: int = 0  # 1=Right, 2=Left, 3=Bilateral

FingerTappingStimulus = ExperimentStimulus