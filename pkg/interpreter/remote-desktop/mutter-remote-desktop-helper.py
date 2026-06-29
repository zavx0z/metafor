#!/usr/bin/env python3
import json
import math
import signal
import subprocess
import sys
import threading
import time

import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib


DBusGMainLoop(set_as_default=True)


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def pipewire_serial_for_node(node_id):
    data = json.loads(subprocess.check_output(["pw-dump"], text=True))
    for item in data:
        if item.get("id") != node_id:
            continue
        props = item.get("info", {}).get("props", {})
        serial = props.get("object.serial")
        if serial is not None:
            return str(serial)
    return None


bus = dbus.SessionBus()
screen_cast = dbus.Interface(
    bus.get_object("org.gnome.Mutter.ScreenCast", "/org/gnome/Mutter/ScreenCast"),
    "org.gnome.Mutter.ScreenCast",
)
remote_desktop = dbus.Interface(
    bus.get_object("org.gnome.Mutter.RemoteDesktop", "/org/gnome/Mutter/RemoteDesktop"),
    "org.gnome.Mutter.RemoteDesktop",
)
display_config = dbus.Interface(
    bus.get_object("org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig"),
    "org.gnome.Mutter.DisplayConfig",
)
remote_session_path = remote_desktop.CreateSession()
remote_session_object = bus.get_object("org.gnome.Mutter.RemoteDesktop", remote_session_path)
remote_session = dbus.Interface(
    remote_session_object,
    "org.gnome.Mutter.RemoteDesktop.Session",
)
remote_session_props = dbus.Interface(remote_session_object, "org.freedesktop.DBus.Properties")
remote_session_id = str(remote_session_props.Get("org.gnome.Mutter.RemoteDesktop.Session", "SessionId"))
session_path = screen_cast.CreateSession(dbus.Dictionary({
    "remote-desktop-session-id": dbus.String(remote_session_id),
}, signature="sv"))
session = dbus.Interface(
    bus.get_object("org.gnome.Mutter.ScreenCast", session_path),
    "org.gnome.Mutter.ScreenCast.Session",
)


BUTTON_CODES = {
    "left": 0x110,
    "right": 0x111,
    "middle": 0x112,
    "back": 0x113,
    "forward": 0x114,
}

KEYSYMS = {
    "Backspace": 0xFF08,
    "Tab": 0xFF09,
    "Enter": 0xFF0D,
    "Escape": 0xFF1B,
    "Shift": 0xFFE1,
    "ShiftLeft": 0xFFE1,
    "ShiftRight": 0xFFE2,
    "Control": 0xFFE3,
    "ControlLeft": 0xFFE3,
    "ControlRight": 0xFFE4,
    "Ctrl": 0xFFE3,
    "Alt": 0xFFE9,
    "AltLeft": 0xFFE9,
    "AltRight": 0xFE03,
    "Meta": 0xFFEB,
    "Super": 0xFFEB,
    "OS": 0xFFEB,
    "ArrowLeft": 0xFF51,
    "ArrowUp": 0xFF52,
    "ArrowRight": 0xFF53,
    "ArrowDown": 0xFF54,
    "Delete": 0xFFFF,
    "Home": 0xFF50,
    "End": 0xFF57,
    "PageUp": 0xFF55,
    "PageDown": 0xFF56,
    "F12": 0xFFC9,
    " ": 0x20,
}

loop = GLib.MainLoop()
timeout_id = None
stream_ready = False
remote_started = False
active_modifier_keysyms = set()
KEYSYM_TEXT_DELAY_SECONDS = float(__import__("os").environ.get("METAFOR_MUTTER_KEYSYM_TEXT_DELAY", "0.006"))


def selected_monitor_connector():
    try:
        _serial, monitors, _logical_monitors, _properties = display_config.GetCurrentState()
    except Exception:
        return None
    connectors = []
    for monitor in monitors:
        try:
            connector = str(monitor[0][0])
        except Exception:
            continue
        if connector:
            connectors.append(connector)
    for connector in connectors:
        if connector.startswith("Meta-"):
            return connector
    return connectors[0] if connectors else None


def create_screen_cast_stream():
    properties = dbus.Dictionary({"cursor-mode": dbus.UInt32(1)}, signature="sv")
    connector = selected_monitor_connector()
    if connector is not None:
        try:
            return (
                session.RecordMonitor(dbus.String(connector), properties),
                {"type": "monitor", "connector": connector},
            )
        except Exception as error:
            emit({
                "type": "streamSelection",
                "target": {"type": "monitor", "connector": connector},
                "error": str(error),
            })
    return session.RecordVirtual(properties), {"type": "virtual", "connector": None}


stream_path, stream_target = create_screen_cast_stream()


def stop(*_args):
    try:
        remote_session.Stop()
    except Exception:
        pass
    try:
        session.Stop()
    except Exception:
        pass
    loop.quit()


def start_remote_session():
    global remote_started
    if remote_started:
        return
    remote_session.Start()
    remote_started = True
    emit({
        "type": "remoteDesktop",
        "sessionPath": str(remote_session_path),
        "sessionId": remote_session_id,
        "started": True,
    })


def on_pipewire_stream_added(node):
    global timeout_id, stream_ready
    if timeout_id is not None:
        GLib.source_remove(timeout_id)
        timeout_id = None
    node_id = int(node)
    serial = pipewire_serial_for_node(node_id)
    stream_ready = True
    emit({
        "type": "stream",
        "sessionPath": str(session_path),
        "streamPath": str(stream_path),
        "streamTarget": stream_target,
        "remoteSessionPath": str(remote_session_path),
        "remoteSessionId": remote_session_id,
        "remoteDesktopStarted": remote_started,
        "nodeId": node_id,
        "serial": serial,
    })


def handle_input_command(request_id, body):
    try:
        result = dispatch_input(body)
        emit({"type": "inputResult", "id": request_id, "ok": True, "input": result})
    except Exception as error:
        emit({"type": "inputResult", "id": request_id, "ok": False, "error": str(error)})
    return False


def dispatch_input(body):
    if not isinstance(body, dict):
        raise ValueError("input body must be an object")
    if not stream_ready:
        raise RuntimeError("PipeWire stream is not ready")
    start_remote_session()
    event_type = str(body.get("type", ""))
    if event_type == "focus":
        return {"type": "focus"}
    if event_type in ("click", "doubleclick"):
        move_pointer(body)
        button = button_code(body.get("button"))
        click_count = 2 if event_type == "doubleclick" else max(1, int(body.get("clickCount", 1) or 1))
        for _ in range(click_count):
            send_pointer_button(button, True)
            send_pointer_button(button, False)
        return {"type": event_type, "transport": "mutter-dbus", "button": button_name(body.get("button")), "clickCount": click_count, **point_result(body)}
    if event_type in ("pointerMove", "mouseMove", "move"):
        move_pointer(body)
        return {"type": "mouseMove", "transport": "mutter-dbus", **point_result(body)}
    if event_type in ("pointerDown", "mouseDown", "pointerUp", "mouseUp"):
        move_pointer(body)
        pressed = event_type in ("pointerDown", "mouseDown")
        button = button_code(body.get("button"))
        send_pointer_button(button, pressed)
        return {"type": "mouseDown" if pressed else "mouseUp", "transport": "mutter-dbus", "button": button_name(body.get("button")), **point_result(body)}
    if event_type in ("wheel", "mouseWheel", "scroll"):
        move_pointer(body)
        dx = float(body.get("deltaX", body.get("dx", 0)) or 0)
        dy = float(body.get("deltaY", body.get("dy", 0)) or 0)
        remote_session.NotifyPointerAxis(dbus.Double(dx), dbus.Double(dy), dbus.UInt32(0))
        return {"type": "mouseWheel", "transport": "mutter-dbus", "deltaX": dx, "deltaY": dy, **point_result(body)}
    if event_type in ("pinch", "zoom"):
        move_pointer(body)
        dx = clamp_float(numeric_input(body, ("deltaX", "dx"), 0.0), -240.0, 240.0)
        dy = pinch_delta_y(body)
        scale = numeric_input(body, ("scale",), 1.0)
        send_control_wheel(dx, dy)
        return {"type": "pinch", "transport": "mutter-dbus-ctrl-wheel", "deltaX": dx, "deltaY": dy, "scale": scale, **point_result(body)}
    if event_type in ("text", "type"):
        text = body.get("text")
        if not isinstance(text, str):
            raise ValueError("text input requires string field 'text'")
        for char in text:
            send_keysym(ord(char))
        return {"type": event_type, "transport": "mutter-dbus", "textLength": len(text)}
    if event_type in ("keyDown", "keyUp", "char", "key"):
        key = body.get("key", body.get("keyCode", ""))
        keysym = keysym_for(key)
        if keysym is None:
            raise ValueError("unsupported keyboard key")
        if event_type == "char":
            send_keysym(keysym)
        elif event_type == "key":
            send_key_shortcut(keysym, modifier_keysyms(body))
        else:
            send_key_state(keysym, event_type != "keyUp", modifier_keysyms(body))
        return {"type": event_type, "transport": "mutter-dbus", "key": str(key)}
    raise ValueError("unsupported desktop input type")


def move_pointer(body):
    point = input_point(body)
    remote_session.NotifyPointerMotionAbsolute(
        str(stream_path),
        dbus.Double(point["x"]),
        dbus.Double(point["y"]),
    )


def send_pointer_button(button, pressed):
    remote_session.NotifyPointerButton(dbus.Int32(button), dbus.Boolean(pressed))


def send_control_wheel(dx, dy):
    control_keysym = KEYSYMS["Control"]
    control_was_pressed = control_keysym in active_modifier_keysyms
    set_modifier_key(control_keysym, True)
    try:
        remote_session.NotifyPointerAxis(dbus.Double(dx), dbus.Double(dy), dbus.UInt32(0))
    finally:
        if not control_was_pressed:
            set_modifier_key(control_keysym, False)


def input_point(body):
    x = float(body.get("x"))
    y = float(body.get("y"))
    if not (x >= 0 and y >= 0):
        raise ValueError("x and y must be non-negative numbers")
    return {"x": x, "y": y}


def point_result(body):
    point = input_point(body)
    return {"x": round(point["x"]), "y": round(point["y"])}


def numeric_input(body, names, default=0.0):
    for name in names:
        if name not in body:
            continue
        value = body.get(name)
        if value is None or value == "":
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            return number
    return default


def clamp_float(value, minimum, maximum):
    return min(maximum, max(minimum, value))


def pinch_delta_y(body):
    dy = numeric_input(body, ("deltaY", "dy"), 0.0)
    if abs(dy) >= 0.01:
        return clamp_float(dy, -240.0, 240.0)
    scale = numeric_input(body, ("scale",), 1.0)
    if scale > 1.01:
        return -120.0
    if scale < 0.99:
        return 120.0
    return 0.0


def button_name(value):
    if value in BUTTON_CODES:
        return str(value)
    return "left"


def button_code(value):
    return BUTTON_CODES[button_name(value)]


def send_keysym(keysym):
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(True))
    if KEYSYM_TEXT_DELAY_SECONDS > 0:
        time.sleep(KEYSYM_TEXT_DELAY_SECONDS)
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(False))
    if KEYSYM_TEXT_DELAY_SECONDS > 0:
        time.sleep(KEYSYM_TEXT_DELAY_SECONDS)


def send_key_shortcut(keysym, modifiers):
    for modifier in modifiers:
        set_modifier_key(modifier, True)
    send_keysym(keysym)
    for modifier in reversed(modifiers):
        set_modifier_key(modifier, False)


def send_key_state(keysym, pressed, modifiers):
    if pressed:
        for modifier in modifiers:
            set_modifier_key(modifier, True)
        remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(True))
        return
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(False))
    for modifier in reversed(modifiers):
        set_modifier_key(modifier, False)


def set_modifier_key(keysym, pressed):
    if pressed:
        if keysym in active_modifier_keysyms:
            return
        active_modifier_keysyms.add(keysym)
    else:
        if keysym not in active_modifier_keysyms:
            return
        active_modifier_keysyms.remove(keysym)
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(pressed))
    if KEYSYM_TEXT_DELAY_SECONDS > 0:
        time.sleep(KEYSYM_TEXT_DELAY_SECONDS)


def modifier_keysyms(body):
    modifiers = body.get("modifiers", [])
    if not isinstance(modifiers, list):
        return []
    keysyms = []
    for modifier in modifiers:
        keysym = keysym_for(modifier)
        if keysym is not None and keysym not in keysyms:
            keysyms.append(keysym)
    return keysyms


def keysym_for(value):
    if not isinstance(value, str) or len(value) == 0:
        return None
    if value in KEYSYMS:
        return KEYSYMS[value]
    if len(value) == 1:
        return ord(value)
    return None


def on_stdin_line(line):
    try:
        payload = json.loads(line)
        request_id = payload.get("id")
        body = payload.get("body")
    except Exception as error:
        emit({"type": "inputResult", "id": None, "ok": False, "error": str(error)})
        return False
    return handle_input_command(request_id, body)


def stdin_loop():
    for line in sys.stdin:
        stripped = line.strip()
        if stripped:
            GLib.idle_add(on_stdin_line, stripped)


def on_timeout():
    emit({"type": "error", "error": "Timed out waiting for Mutter PipeWire stream"})
    stop()
    return False


bus.add_signal_receiver(
    on_pipewire_stream_added,
    signal_name="PipeWireStreamAdded",
    dbus_interface="org.gnome.Mutter.ScreenCast.Stream",
    path=stream_path,
)

signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
timeout_id = GLib.timeout_add_seconds(8, on_timeout)
threading.Thread(target=stdin_loop, daemon=True).start()

try:
    start_remote_session()
    loop.run()
except Exception as error:
    emit({"type": "error", "error": str(error)})
    stop()
    sys.exit(1)
