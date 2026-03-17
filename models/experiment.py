from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class MovementType(str, Enum):
    unilateral = "Unilateral"
    bilateral = "Bilateral"
    bilateral_simultaneous = "Bilateral Simultâneo"
    misto = "Misto"

class FingerTappingStatus(str, Enum):
    running = "running"
    paused = "paused"
    canceled = "canceled"
    finished = "finished"

class StatusFingerTappingPayload(BaseModel):
    status: FingerTappingStatus

class FingerTappingConfig(BaseModel):
    num_trials: int
    task_duration_seconds: int
    rest_duration_seconds: int
    movement_type: MovementType
    tms_time: float = 0
    mixed_task_types: List[str] = []
    tms_time_min: float = 0
    tms_time_max: float = 0
    num_tms_pulses: int = 1
    tms_pulse_interval: float = 0
    prep_duration_seconds: float = 3

class FingerTappingState(BaseModel):
    is_running: bool
    total_trial: int
    idx_trial: int
    time_remaining: float
    time_remaining_trial: float
    status: FingerTappingStatus

class FingerTappingStimulus(BaseModel):
    is_running: bool
    color: str
    instruction: str