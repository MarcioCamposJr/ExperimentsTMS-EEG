from components.arduino_connection import ArduinoConnection
from config import settings
import re

arduino = ArduinoConnection()

def connect_trigger(port, boud_rate = None):
    match = re.search(r'COM\d+', port)
    arduino.connect(port=match.group(), baudrate = boud_rate, port_name=port)
    return arduino.arduino_connected

def pulse_default_trigger(code=None):
    """Send a trigger pulse with optional code. If code is given, sends the numeric code."""
    if arduino.arduino_connected:
        if code is not None:
            arduino.send_to_arduino(str(code))
        else:
            arduino.send_to_arduino("SINGLE")

def pulse_tms_trigger(code=None):
    """Send a TMS trigger pulse with optional code."""
    if arduino.arduino_connected:
        if code is not None:
            arduino.send_to_arduino(str(code))
        else:
            arduino.send_to_arduino("SINGLE_TMS")