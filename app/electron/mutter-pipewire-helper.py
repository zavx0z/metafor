#!/usr/bin/env python3
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading

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
stream_path = session.RecordVirtual(dbus.Dictionary({"cursor-mode": dbus.UInt32(1)}, signature="sv"))
loop = GLib.MainLoop()
timeout_id = None
stream_ready = False
remote_started = False
eis_process = None
eis_ready = False
eis_request_id = 0
eis_results = {}
eis_condition = threading.Condition()

EIS_HELPER_SOURCE = Path(__file__).with_name("mutter-eis-input.c")
EIS_HELPER_BINARY = Path(os.environ.get("METAFOR_MUTTER_EIS_HELPER", "/tmp/metafor-mutter-eis-input"))
EIS_REQUEST_TIMEOUT_SECONDS = float(os.environ.get("METAFOR_MUTTER_EIS_TIMEOUT", "1.5"))

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
    "ArrowLeft": 0xFF51,
    "ArrowUp": 0xFF52,
    "ArrowRight": 0xFF53,
    "ArrowDown": 0xFF54,
    "Delete": 0xFFFF,
    "Home": 0xFF50,
    "End": 0xFF57,
    "PageUp": 0xFF55,
    "PageDown": 0xFF56,
    " ": 0x20,
}


def stop(*_args):
    global eis_process
    if eis_process is not None:
        try:
            eis_process.terminate()
        except Exception:
            pass
        eis_process = None
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
    start_eis_bridge()


def compile_eis_helper():
    if not EIS_HELPER_SOURCE.exists():
        raise RuntimeError(f"EIS helper source not found: {EIS_HELPER_SOURCE}")
    if EIS_HELPER_BINARY.exists() and EIS_HELPER_BINARY.stat().st_mtime >= EIS_HELPER_SOURCE.stat().st_mtime:
        return
    EIS_HELPER_BINARY.parent.mkdir(parents=True, exist_ok=True)
    tmp = EIS_HELPER_BINARY.with_suffix(".tmp")
    subprocess.check_call([
        "gcc",
        "-O2",
        "-Wall",
        "-Wextra",
        str(EIS_HELPER_SOURCE),
        "-ldl",
        "-o",
        str(tmp),
    ])
    os.replace(tmp, EIS_HELPER_BINARY)


def start_eis_bridge():
    global eis_process, eis_ready
    if eis_process is not None and eis_process.poll() is None:
        return
    compile_eis_helper()
    eis_fd = remote_session.ConnectToEIS(dbus.Dictionary({}, signature="sv")).take()
    try:
        eis_process = subprocess.Popen(
            [str(EIS_HELPER_BINARY), str(eis_fd)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            pass_fds=(eis_fd,),
        )
    finally:
        try:
            os.close(eis_fd)
        except OSError:
            pass
    eis_ready = False
    threading.Thread(target=eis_stdout_loop, args=(eis_process,), daemon=True).start()
    threading.Thread(target=eis_stderr_loop, args=(eis_process,), daemon=True).start()


def eis_stdout_loop(process):
    for line in process.stdout or []:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
        except Exception:
            emit({"type": "eisLog", "line": stripped})
            continue
        handle_eis_payload(payload)


def eis_stderr_loop(process):
    for line in process.stderr or []:
        stripped = line.strip()
        if stripped:
            emit({"type": "eisLog", "level": "stderr", "line": stripped})


def handle_eis_payload(payload):
    global eis_ready
    if payload.get("type") == "eisReady":
        eis_ready = True
        emit(payload)
        return
    if payload.get("type") != "eisResult":
        emit(payload)
        return
    request_id = payload.get("id")
    with eis_condition:
        eis_results[request_id] = payload
        eis_condition.notify_all()


def send_eis_line(command):
    global eis_request_id
    start_eis_bridge()
    if eis_process is None or eis_process.poll() is not None or eis_process.stdin is None:
        raise RuntimeError("EIS helper is not running")
    with eis_condition:
        eis_request_id += 1
        request_id = eis_request_id
        eis_results.pop(request_id, None)
        eis_process.stdin.write(f"{request_id} {command}\n")
        eis_process.stdin.flush()
        if not eis_condition.wait_for(lambda: request_id in eis_results, EIS_REQUEST_TIMEOUT_SECONDS):
            raise RuntimeError("EIS input timed out")
        payload = eis_results.pop(request_id)
    if payload.get("ok") is not True:
        raise RuntimeError(str(payload.get("error") or "EIS input failed"))
    return payload.get("input") if isinstance(payload.get("input"), dict) else {}


def send_eis_move(body):
    point = input_point(body)
    frame_w = float(body.get("frameW") or 1920)
    frame_h = float(body.get("frameH") or 1080)
    return send_eis_line(f"move {point['x']} {point['y']} {frame_w} {frame_h}")


def send_eis_button(button, pressed):
    return send_eis_line(f"button {button} {1 if pressed else 0}")


def send_eis_scroll(dx, dy):
    return send_eis_line(f"scroll {float(dx)} {float(dy)}")


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
        send_eis_move(body)
        button = button_code(body.get("button"))
        click_count = 2 if event_type == "doubleclick" else max(1, int(body.get("clickCount", 1) or 1))
        for _ in range(click_count):
            send_eis_button(button, True)
            send_eis_button(button, False)
        return {"type": event_type, "transport": "mutter-eis", "button": button_name(body.get("button")), "clickCount": click_count, **point_result(body)}
    if event_type in ("pointerMove", "mouseMove", "move"):
        send_eis_move(body)
        return {"type": "mouseMove", "transport": "mutter-eis", **point_result(body)}
    if event_type in ("pointerDown", "mouseDown", "pointerUp", "mouseUp"):
        send_eis_move(body)
        pressed = event_type in ("pointerDown", "mouseDown")
        button = button_code(body.get("button"))
        send_eis_button(button, pressed)
        return {"type": "mouseDown" if pressed else "mouseUp", "transport": "mutter-eis", "button": button_name(body.get("button")), **point_result(body)}
    if event_type in ("wheel", "mouseWheel", "scroll"):
        send_eis_move(body)
        dx = float(body.get("deltaX", body.get("dx", 0)) or 0)
        dy = float(body.get("deltaY", body.get("dy", 0)) or 0)
        send_eis_scroll(dx, dy)
        return {"type": "mouseWheel", "transport": "mutter-eis", "deltaX": dx, "deltaY": dy, **point_result(body)}
    if event_type in ("text", "type"):
        text = body.get("text")
        if not isinstance(text, str):
            raise ValueError("text input requires string field 'text'")
        for char in text:
            send_keysym(ord(char))
        return {"type": event_type, "textLength": len(text)}
    if event_type in ("keyDown", "keyUp", "char", "key"):
        key = body.get("key", body.get("keyCode", ""))
        keysym = keysym_for(key)
        if keysym is None:
            raise ValueError("unsupported keyboard key")
        if event_type == "char":
            send_keysym(keysym)
        else:
            remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(event_type != "keyUp"))
        return {"type": event_type, "key": str(key)}
    raise ValueError("unsupported desktop input type")


def move_pointer(body):
    point = input_point(body)
    remote_session.NotifyPointerMotionAbsolute(
        str(stream_path),
        dbus.Double(point["x"]),
        dbus.Double(point["y"]),
    )


def input_point(body):
    x = float(body.get("x"))
    y = float(body.get("y"))
    if not (x >= 0 and y >= 0):
        raise ValueError("x and y must be non-negative numbers")
    return {"x": x, "y": y}


def point_result(body):
    point = input_point(body)
    return {"x": round(point["x"]), "y": round(point["y"])}


def button_name(value):
    if value in BUTTON_CODES:
        return str(value)
    return "left"


def button_code(value):
    return BUTTON_CODES[button_name(value)]


def send_keysym(keysym):
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(True))
    remote_session.NotifyKeyboardKeysym(dbus.UInt32(keysym), dbus.Boolean(False))


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
