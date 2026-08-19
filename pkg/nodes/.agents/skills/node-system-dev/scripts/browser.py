#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


CHROME_API = os.environ.get("NODE_SYSTEM_DEV_CHROME_API", "http://127.0.0.1:7880").rstrip("/")
TARGET_URL = os.environ.get("NODE_SYSTEM_DEV_TARGET_URL", "http://127.0.0.1:4016/")


class BrowserError(RuntimeError):
    pass


def request(path: str, method: str = "GET", payload: dict[str, Any] | None = None,
            timeout: float = 25) -> tuple[bytes, Any]:
    data = None if payload is None else json.dumps(payload).encode()
    headers = {} if payload is None else {"content-type": "application/json"}
    req = Request(f"{CHROME_API}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            return response.read(), response.headers
    except HTTPError as error:
        body = error.read().decode(errors="replace")
        raise BrowserError(f"{method} {path} returned {error.code}: {body}") from error
    except URLError as error:
        raise BrowserError(f"{method} {path} failed: {error.reason}") from error


def request_json(path: str, method: str = "GET", payload: dict[str, Any] | None = None,
                 timeout: float = 25) -> dict[str, Any]:
    raw, _ = request(path, method, payload, timeout)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise BrowserError(f"{method} {path} returned non-JSON data") from error
    if not isinstance(value, dict):
        raise BrowserError(f"{method} {path} returned a non-object JSON value")
    if "error" in value:
        raise BrowserError(f"{method} {path}: {value['error']}")
    return value


def require_health() -> dict[str, Any]:
    health = request_json("/health", timeout=5)
    cdp = health.get("cdp")
    if health.get("ok") is not True or not isinstance(cdp, dict) or cdp.get("available") is not True:
        raise BrowserError(f"@meta/chrome is not CDP-ready: {json.dumps(health, ensure_ascii=False)}")
    return health


def exact_target(create: bool = False) -> dict[str, Any]:
    targets = request_json("/cdp/targets", timeout=5).get("targets")
    if not isinstance(targets, list):
        raise BrowserError("GET /cdp/targets did not return targets[]")
    matches = [target for target in targets if isinstance(target, dict)
               and target.get("type") == "page" and target.get("url") == TARGET_URL]
    if not matches and create:
        request_json("/cdp/targets", "POST", {"url": TARGET_URL}, timeout=10)
        for _ in range(30):
            time.sleep(0.1)
            try:
                return exact_target(create=False)
            except BrowserError as error:
                if not str(error).startswith("No exact CDP page target"):
                    raise
        raise BrowserError(f"Created CDP page did not reach exact URL {TARGET_URL}")
    if not matches:
        raise BrowserError(f"No exact CDP page target for {TARGET_URL}; run the open command")
    if len(matches) != 1:
        ids = [target.get("targetId") for target in matches]
        raise BrowserError(f"Ambiguous exact CDP targets for {TARGET_URL}: {ids}")
    target = matches[0]
    if not isinstance(target.get("targetId"), str):
        raise BrowserError("Exact target has no targetId")
    return target


def evaluate(target_id: str, js: str) -> Any:
    result = request_json("/eval", "POST", {"targetId": target_id, "js": js})
    if "parsed" in result and result["parsed"] is not None:
        return result["parsed"]
    raw = result.get("result")
    if not isinstance(raw, str):
        raise BrowserError("POST /eval returned no string result")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


DOM_JS = r'''
const canvas = document.querySelector("canvas")
const status = document.querySelector("#status")
return {
  url: location.href,
  title: document.title,
  readyState: document.readyState,
  ready: document.documentElement.dataset.nodeComponentPlayground ?? null,
  selection: {
    kind: document.documentElement.dataset.selectedKind ?? null,
    id: document.documentElement.dataset.selectedId ?? null,
  },
  transform: {
    x: document.documentElement.dataset.canvasX ?? null,
    y: document.documentElement.dataset.canvasY ?? null,
    scale: document.documentElement.dataset.canvasScale ?? null,
  },
  inner: [innerWidth, innerHeight, devicePixelRatio],
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  canvas: canvas instanceof HTMLCanvasElement
    ? [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]
    : null,
  status: status instanceof HTMLOutputElement
    ? {value: status.value, state: status.dataset.state ?? null}
    : null,
}
'''


TOUCH_JS = r'''
const canvas = document.querySelector("canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Node component canvas not found")
if (typeof Touch !== "function" || typeof TouchEvent !== "function") {
  throw new Error("Touch constructors are unavailable in this target")
}
const snapshot = () => ({
  x: Number(document.documentElement.dataset.canvasX),
  y: Number(document.documentElement.dataset.canvasY),
  scale: Number(document.documentElement.dataset.canvasScale),
})
const valid = (transform) => Number.isFinite(transform.x)
  && Number.isFinite(transform.y)
  && Number.isFinite(transform.scale)
const point = (id, x, y) => new Touch({
  identifier: id,
  target: canvas,
  clientX: x,
  clientY: y,
  screenX: x,
  screenY: y,
  radiusX: 4,
  radiusY: 4,
  force: 1,
})
const emit = (target, type, touches, changedTouches) => target.dispatchEvent(new TouchEvent(type, {
  bubbles: true,
  cancelable: true,
  touches,
  targetTouches: touches,
  changedTouches,
}))
const before = snapshot()
const oneStart = point(1, 200, 300)
emit(canvas, "touchstart", [oneStart], [oneStart])
const oneMove = point(1, 230, 340)
emit(window, "touchmove", [oneMove], [oneMove])
emit(window, "touchend", [], [oneMove])
const pan = snapshot()
const a = point(1, 130, 360)
const b = point(2, 260, 360)
emit(canvas, "touchstart", [a, b], [a, b])
const c = point(1, 80, 360)
const d = point(2, 310, 360)
emit(window, "touchmove", [c, d], [c, d])
emit(window, "touchend", [], [c, d])
const pinch = snapshot()
return {
  evidence: "synthetic-page-touch",
  before,
  pan,
  pinch,
  panChanged: valid(pan) && (!valid(before) || pan.x !== before.x || pan.y !== before.y),
  pinchChanged: valid(pan) && valid(pinch) && pinch.scale > pan.scale,
  physicalDeviceProof: false,
  ownerAcceptance: false,
}
'''


def dom(target_id: str) -> dict[str, Any]:
    result = evaluate(target_id, DOM_JS)
    if not isinstance(result, dict):
        raise BrowserError("DOM evaluation did not return an object")
    return result


def console(target_id: str, duration_ms: int) -> dict[str, Any]:
    return request_json("/console", "POST", {"targetId": target_id, "durationMs": duration_ms},
                        timeout=max(10, duration_ms / 1000 + 5))


def console_errors(result: dict[str, Any]) -> list[Any]:
    entries = result.get("entries")
    if not isinstance(entries, list):
        return []
    return [entry for entry in entries if isinstance(entry, dict)
            and entry.get("level") == "error"]


def reload(target_id: str) -> dict[str, Any]:
    return request_json("/reload", "POST", {"targetId": target_id})


def restore_viewport(target_id: str) -> dict[str, Any]:
    cleared = request_json("/viewport", "DELETE", {"targetId": target_id})
    loaded = reload(target_id)
    return {"cleared": cleared, "reloaded": loaded}


def set_viewport(target_id: str, width: int, height: int) -> dict[str, Any]:
    return request_json("/viewport", "POST", {
        "targetId": target_id,
        "width": width,
        "height": height,
        "deviceScaleFactor": 2,
        "mobile": True,
    })


def capture_canvas(target_id: str, output: Path) -> dict[str, Any]:
    data_url = evaluate(target_id,
                        'return document.querySelector("canvas")?.toDataURL("image/png") ?? null')
    if not isinstance(data_url, str) or not data_url.startswith("data:image/png;base64,"):
        raise BrowserError("Canvas evaluation did not return a PNG data URL")
    try:
        image = base64.b64decode(data_url.split(",", 1)[1], validate=True)
    except ValueError as error:
        raise BrowserError("Canvas PNG base64 is invalid") from error
    if not image.startswith(b"\x89PNG\r\n\x1a\n"):
        raise BrowserError("Decoded canvas data is not a PNG")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(image)
    return {"path": str(output.resolve()), "bytes": len(image), "kind": "exact-canvas-png"}


def metrics_match(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return left.get("inner") == right.get("inner")


def validate_mobile(label: str, evidence: dict[str, Any], width: int, height: int) -> None:
    if evidence.get("ready") != "ready":
        raise BrowserError(f"{label}: playground readiness marker is {evidence.get('ready')!r}")
    inner = evidence.get("inner")
    scroll = evidence.get("scroll")
    if not isinstance(inner, list) or inner[:2] != [width, height]:
        raise BrowserError(f"{label}: expected inner {width}x{height}, got {inner}")
    if not isinstance(scroll, list) or scroll[0] != width:
        raise BrowserError(f"{label}: horizontal overflow or missing scroll metrics: {scroll}")


def command_viewports(target_id: str, args: argparse.Namespace) -> dict[str, Any]:
    output_dir = None if args.output_dir is None else Path(args.output_dir)
    restore_viewport(target_id)
    desktop = dom(target_id)
    if desktop.get("ready") != "ready":
        raise BrowserError(f"desktop: playground readiness marker is {desktop.get('ready')!r}")
    desktop_inner = desktop.get("inner")
    desktop_scroll = desktop.get("scroll")
    if (not isinstance(desktop_inner, list) or not isinstance(desktop_scroll, list)
            or desktop_scroll[0] != desktop_inner[0]):
        raise BrowserError(
            f"desktop: horizontal overflow or missing metrics: {desktop_inner}, {desktop_scroll}")
    desktop_console = console(target_id, args.console_ms)
    desktop_errors = console_errors(desktop_console)
    if desktop_errors:
        raise BrowserError(f"desktop: console errors: {json.dumps(desktop_errors, ensure_ascii=False)}")
    result: dict[str, Any] = {
        "targetId": target_id,
        "targetUrl": TARGET_URL,
        "desktopNative": {"dom": desktop, "console": desktop_console},
        "captures": {},
        "physicalDeviceProof": False,
        "ownerAcceptance": False,
    }
    if output_dir is not None:
        result["captures"]["desktop"] = capture_canvas(
            target_id, output_dir / "node-system-desktop.png")
    failure: Exception | None = None
    try:
        for label, width, height in (("portrait", 390, 844), ("landscape", 844, 390)):
            applied = set_viewport(target_id, width, height)
            evidence = dom(target_id)
            validate_mobile(label, evidence, width, height)
            console_result = console(target_id, args.console_ms)
            errors = console_errors(console_result)
            if errors:
                raise BrowserError(f"{label}: console errors: {json.dumps(errors, ensure_ascii=False)}")
            result[label] = {"applied": applied, "dom": evidence, "console": console_result}
            if output_dir is not None:
                result["captures"][label] = capture_canvas(
                    target_id, output_dir / f"node-system-{label}.png")
    except Exception as error:
        failure = error
    finally:
        try:
            result["restore"] = restore_viewport(target_id)
            result["restoredNative"] = dom(target_id)
            result["nativeMetricsRestored"] = metrics_match(desktop, result["restoredNative"])
            if not result["nativeMetricsRestored"] and failure is None:
                failure = BrowserError(
                    f"Native metrics were not restored: {desktop.get('inner')} -> "
                    f"{result['restoredNative'].get('inner')}")
        except Exception as restore_error:
            if failure is None:
                failure = restore_error
            else:
                failure = BrowserError(f"{failure}; viewport restore also failed: {restore_error}")
    if failure is not None:
        raise failure
    return result


def command_touch(target_id: str) -> dict[str, Any]:
    restore_viewport(target_id)
    native = dom(target_id)
    result: dict[str, Any] = {
        "targetId": target_id,
        "targetUrl": TARGET_URL,
        "nativeBefore": native,
    }
    failure: Exception | None = None
    try:
        result["applied"] = set_viewport(target_id, 390, 844)
        validate_mobile("touch portrait", dom(target_id), 390, 844)
        touch_result = evaluate(target_id, TOUCH_JS)
        if not isinstance(touch_result, dict):
            raise BrowserError("Atomic touch evaluation did not return an object")
        if touch_result.get("panChanged") is not True or touch_result.get("pinchChanged") is not True:
            raise BrowserError(f"Atomic touch did not change pan and pinch: {touch_result}")
        result["touch"] = touch_result
    except Exception as error:
        failure = error
    finally:
        try:
            result["restore"] = restore_viewport(target_id)
            result["nativeAfter"] = dom(target_id)
            result["nativeMetricsRestored"] = metrics_match(native, result["nativeAfter"])
            if not result["nativeMetricsRestored"] and failure is None:
                failure = BrowserError(
                    f"Native metrics were not restored: {native.get('inner')} -> "
                    f"{result['nativeAfter'].get('inner')}")
        except Exception as restore_error:
            if failure is None:
                failure = restore_error
            else:
                failure = BrowserError(f"{failure}; viewport restore also failed: {restore_error}")
    if failure is not None:
        raise failure
    return result


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Exact-target @nodes/ui playground evidence through @meta/chrome")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("health")
    subparsers.add_parser("target")
    subparsers.add_parser("open")
    subparsers.add_parser("reload")
    subparsers.add_parser("dom")
    console_parser = subparsers.add_parser("console")
    console_parser.add_argument("--duration-ms", type=int, default=1200)
    canvas_parser = subparsers.add_parser("canvas")
    canvas_parser.add_argument("output")
    viewport_parser = subparsers.add_parser("viewports")
    viewport_parser.add_argument("--output-dir")
    viewport_parser.add_argument("--console-ms", type=int, default=1200)
    subparsers.add_parser("touch")
    subparsers.add_parser("restore")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    health = require_health()
    if args.command == "health":
        print_json(health)
        return 0

    target = exact_target(create=args.command == "open")
    target_id = target["targetId"]
    if args.command in ("target", "open"):
        print_json(target)
    elif args.command == "reload":
        print_json(reload(target_id))
    elif args.command == "dom":
        print_json({"target": target, "dom": dom(target_id)})
    elif args.command == "console":
        result = console(target_id, args.duration_ms)
        print_json({"target": target, "console": result})
        if console_errors(result):
            return 1
    elif args.command == "canvas":
        print_json({"target": target, "capture": capture_canvas(target_id, Path(args.output))})
    elif args.command == "viewports":
        print_json(command_viewports(target_id, args))
    elif args.command == "touch":
        print_json(command_touch(target_id))
    elif args.command == "restore":
        restored = restore_viewport(target_id)
        print_json({"target": target, "restore": restored, "dom": dom(target_id)})
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrowserError as error:
        print(f"node-system-dev browser error: {error}", file=sys.stderr)
        raise SystemExit(1)
