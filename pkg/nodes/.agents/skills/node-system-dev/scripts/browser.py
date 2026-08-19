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
const retainedDiagnostics = document.documentElement.dataset.retainedDiagnostics
return {
  url: location.href,
  title: document.title,
  readyState: document.readyState,
  visibility: document.visibilityState,
  focused: document.hasFocus(),
  ready: document.documentElement.dataset.nodeComponentPlayground ?? null,
  comparison: document.documentElement.dataset.comparison ?? null,
  selection: {
    kind: document.documentElement.dataset.selectedKind ?? null,
    id: document.documentElement.dataset.selectedId ?? null,
  },
  transform: {
    x: document.documentElement.dataset.canvasX ?? null,
    y: document.documentElement.dataset.canvasY ?? null,
    scale: document.documentElement.dataset.canvasScale ?? null,
  },
  retained: {
    contentRootCount: document.documentElement.dataset.retainedContentRootCount ?? null,
    diagnostics: retainedDiagnostics === undefined ? null : JSON.parse(retainedDiagnostics),
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


RETAINED_OBSERVER = "globalThis.__nodeComponentRetainedObserver"


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


def retained_call(target_id: str, expression: str) -> dict[str, Any]:
    result = evaluate(target_id, f'''
const observer = {RETAINED_OBSERVER}
if (observer === undefined) throw new Error("Playground retained observer is unavailable")
return observer.{expression}
''')
    if not isinstance(result, dict):
        raise BrowserError(f"Retained observer {expression} did not return an object")
    return result


def retained_snapshot(target_id: str) -> dict[str, Any]:
    return retained_call(target_id, "snapshot()")


def retained_diagnostics(snapshot: dict[str, Any]) -> dict[str, int]:
    diagnostics = snapshot.get("diagnostics")
    if not isinstance(diagnostics, dict):
        raise BrowserError(f"Retained snapshot has no diagnostics: {snapshot}")
    result: dict[str, int] = {}
    for key in ("localLayoutPlans", "materializations", "transformOnlyFrames"):
        value = diagnostics.get(key)
        if not isinstance(value, int) or value < 0:
            raise BrowserError(f"Retained diagnostic {key} is invalid: {value!r}")
        result[key] = value
    return result


def retained_wait(target_id: str, predicate: Any, label: str, timeout: float = 6) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    latest: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        latest = retained_snapshot(target_id)
        if predicate(latest):
            return latest
        time.sleep(0.05)
    raise BrowserError(f"Timed out waiting for retained {label}: {json.dumps(latest, ensure_ascii=False)}")


def require_retained_snapshot(snapshot: dict[str, Any], label: str) -> None:
    content_root = snapshot.get("contentRoot")
    if not isinstance(content_root, dict) or content_root.get("count") != 1:
        raise BrowserError(f"{label}: expected one exact content root, got {content_root}")
    if not isinstance(content_root.get("objectId"), str):
        raise BrowserError(f"{label}: content root has no stable object identity")
    components = snapshot.get("components")
    if not isinstance(components, list) or not components:
        raise BrowserError(f"{label}: retained component samples are empty")
    diagnostics = retained_diagnostics(snapshot)
    if diagnostics["localLayoutPlans"] <= 0 or diagnostics["materializations"] <= 0:
        raise BrowserError(f"{label}: initial retained content was not materialized: {diagnostics}")
    links = snapshot.get("links")
    if not isinstance(links, list) or not links:
        raise BrowserError(f"{label}: actual retained Link evidence is empty")
    for link in links:
        if not isinstance(link, dict):
            raise BrowserError(f"{label}: invalid Link evidence {link!r}")
        for left_key, right_key in (
            ("rawFirstPoint", "sourceSocketCenter"),
            ("rawLastPoint", "targetSocketCenter"),
            ("actualGeometryFirstPoint", "sourceSocketCenter"),
            ("actualGeometryLastPoint", "targetSocketCenter"),
        ):
            if not close_point(link.get(left_key), link.get(right_key)):
                raise BrowserError(
                    f"{label}: Link {link.get('id')} {left_key} != {right_key}: "
                    f"{link.get(left_key)} != {link.get(right_key)}")
        clip = link.get("framebufferClip")
        if (not isinstance(clip, list) or len(clip) != 4
                or not all(isinstance(value, (int, float)) for value in clip)
                or clip[2] <= clip[0] or clip[3] <= clip[1]):
            raise BrowserError(f"{label}: Link {link.get('id')} has no fixed framebuffer clip: {clip}")


def close_point(left: Any, right: Any, tolerance: float = 1e-4) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    try:
        return (abs(float(left["x"]) - float(right["x"])) <= tolerance
                and abs(float(left["y"]) - float(right["y"])) <= tolerance)
    except (KeyError, TypeError, ValueError):
        return False


def retained_identity(snapshot: dict[str, Any]) -> dict[str, Any]:
    content_root = snapshot["contentRoot"]
    components = snapshot["components"]
    return {
        "contentRoot": content_root["objectId"],
        "contentChildren": content_root["childObjectIds"],
        "components": [{
            "name": component["name"],
            "objectId": component["objectId"],
            "childObjectIds": component["childObjectIds"],
            "geometryIds": component["geometryIds"],
            "visualObjectIds": [sample["objectId"] for sample in component["visualSamples"]],
        } for component in components],
        "links": [{
            "id": link["id"],
            "parentObjectId": link["parentObjectId"],
            "geometryObjectId": link["geometryObjectId"],
            "geometryId": link["geometryId"],
        } for link in snapshot["links"]],
    }


def retained_ratios(snapshot: dict[str, Any]) -> dict[str, list[float]]:
    node = snapshot.get("representativeNode")
    if not isinstance(node, dict):
        raise BrowserError("Retained snapshot has no representative Node")
    samples = node.get("visualSamples")
    if not isinstance(samples, list) or not samples:
        raise BrowserError("Representative Node has no actual visual samples")
    ratios: dict[str, list[float]] = {}
    for sample in samples:
        if not isinstance(sample, dict) or not isinstance(sample.get("objectId"), str):
            raise BrowserError(f"Invalid retained visual sample: {sample}")
        ratio = sample.get("worldScaleRatioToContentRoot")
        if (not isinstance(ratio, list) or len(ratio) != 2
                or not all(isinstance(value, (int, float)) for value in ratio)):
            raise BrowserError(f"Invalid matrixWorld scale ratio: {ratio}")
        ratios[sample["objectId"]] = [float(ratio[0]), float(ratio[1])]
    return ratios


def require_same_ratios(expected: dict[str, list[float]], snapshot: dict[str, Any], label: str) -> None:
    actual = retained_ratios(snapshot)
    if actual.keys() != expected.keys():
        raise BrowserError(f"{label}: representative visual identity changed across transforms")
    for object_id, ratio in expected.items():
        candidate = actual[object_id]
        if any(abs(left - right) > 1e-6 for left, right in zip(ratio, candidate)):
            raise BrowserError(
                f"{label}: matrixWorld ratio changed for {object_id}: {ratio} -> {candidate}")


def require_same_clips(expected: dict[str, Any], snapshot: dict[str, Any], label: str) -> None:
    actual = {link["id"]: link["framebufferClip"] for link in snapshot["links"]}
    if actual != expected:
        raise BrowserError(f"{label}: fixed viewport Link clips changed: {expected} -> {actual}")


def same_selection(left: Any, right: Any) -> bool:
    return left == right


def same_transform(left: Any, right: Any, tolerance: float = 1e-7) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    try:
        return all(abs(float(left[key]) - float(right[key])) <= tolerance
                   for key in ("x", "y", "scale"))
    except (KeyError, TypeError, ValueError):
        return False


def retained_evidence_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    components = snapshot["components"]
    return {
        "transform": snapshot["transform"],
        "selection": snapshot["selection"],
        "diagnostics": snapshot["diagnostics"],
        "contentRoot": snapshot["contentRoot"],
        "components": [{
            "name": component["name"],
            "objectId": component["objectId"],
            "visible": component["visible"],
            "descendantCount": component["descendantCount"],
            "geometryCount": component["geometryCount"],
            "textCount": component["textCount"],
            "bounded": component["bounded"],
        } for component in components],
        "representativeNode": snapshot["representativeNode"],
        "links": snapshot["links"],
    }


def command_retained(target_id: str, args: argparse.Namespace) -> dict[str, Any]:
    focus = request_json("/cdp/command", "POST", {
        "targetId": target_id,
        "method": "Page.bringToFront",
        "params": {},
    })
    focus_dom: dict[str, Any] | None = None
    for _ in range(30):
        focus_dom = dom(target_id)
        if focus_dom.get("visibility") == "visible" and focus_dom.get("focused") is True:
            break
        time.sleep(0.05)
    if focus_dom is None or focus_dom.get("visibility") != "visible" or focus_dom.get("focused") is not True:
        raise BrowserError(f"Exact retained target did not become foreground-visible: {focus_dom}")
    initial = retained_snapshot(target_id)
    require_retained_snapshot(initial, "initial")
    original_transform = initial["transform"]
    original_selection = initial["selection"]
    initial_diagnostics = retained_diagnostics(initial)
    stable_identity = retained_identity(initial)
    stable_ratios = retained_ratios(initial)
    stable_clips = {link["id"]: link["framebufferClip"] for link in initial["links"]}
    result: dict[str, Any] = {
        "targetId": target_id,
        "targetUrl": TARGET_URL,
        "focus": {"command": focus, "dom": focus_dom},
        "initial": retained_evidence_snapshot(initial),
        "retainedIdentity": stable_identity,
        "transformPhases": [],
        "physicalDeviceProof": False,
        "ownerAcceptance": False,
    }
    failure: Exception | None = None
    try:
        transforms = (
            {"x": original_transform["x"] + 17, "y": original_transform["y"] + 11, "scale": 0.26},
            {"x": original_transform["x"] - 13, "y": original_transform["y"] + 19, "scale": 0.75},
            {"x": original_transform["x"] + 5, "y": original_transform["y"] - 7, "scale": 1.6},
        )
        for index, transform in enumerate(transforms, start=1):
            phase = retained_call(target_id, f"setTransform({json.dumps(transform)})")
            if phase.get("accepted") is not True or not isinstance(phase.get("snapshot"), dict):
                raise BrowserError(f"transform-{index}: observer rejected transform: {phase}")
            snapshot = phase["snapshot"]
            require_retained_snapshot(snapshot, f"transform-{index}")
            diagnostics = retained_diagnostics(snapshot)
            if diagnostics["localLayoutPlans"] != initial_diagnostics["localLayoutPlans"]:
                raise BrowserError(f"transform-{index}: local layout counter changed: {diagnostics}")
            if diagnostics["materializations"] != initial_diagnostics["materializations"]:
                raise BrowserError(f"transform-{index}: materialization counter changed: {diagnostics}")
            if diagnostics["transformOnlyFrames"] != initial_diagnostics["transformOnlyFrames"] + index:
                raise BrowserError(f"transform-{index}: transform-only counter is not exact: {diagnostics}")
            if retained_identity(snapshot) != stable_identity:
                raise BrowserError(f"transform-{index}: retained object/geometry identity changed")
            require_same_ratios(stable_ratios, snapshot, f"transform-{index}")
            require_same_clips(stable_clips, snapshot, f"transform-{index}")
            result["transformPhases"].append(retained_evidence_snapshot(snapshot))

        overview_node = result["transformPhases"][0].get("representativeNode")
        if (not isinstance(overview_node, dict) or overview_node.get("geometryCount", 0) <= 0
                or overview_node.get("textCount", 0) <= 0):
            raise BrowserError(f"overview: representative Node body/text is not materialized: {overview_node}")
        overview_kinds = {sample.get("kind") for sample in overview_node.get("visualSamples", [])
                          if isinstance(sample, dict)}
        if not {"mesh", "text"}.issubset(overview_kinds):
            raise BrowserError(f"overview: actual Node visual samples are incomplete: {overview_kinds}")

        wheel = retained_call(target_id, "wheelZoom()")
        wheel_snapshot = wheel.get("snapshot")
        if not isinstance(wheel_snapshot, dict) or same_transform(wheel.get("before"), wheel.get("after")):
            raise BrowserError(f"wheel: retained transform did not change: {wheel}")
        require_retained_transform_only(
            wheel_snapshot, initial_diagnostics, 4, stable_identity, stable_ratios, stable_clips, "wheel")
        result["wheel"] = {
            "before": wheel["before"],
            "after": wheel["after"],
            "snapshot": retained_evidence_snapshot(wheel_snapshot),
        }

        pinch = retained_call(target_id, "pinchZoom()")
        pinch_snapshot = pinch.get("snapshot")
        if not isinstance(pinch_snapshot, dict) or same_transform(pinch.get("before"), pinch.get("after")):
            raise BrowserError(f"pinch: retained transform did not change: {pinch}")
        require_retained_transform_only(
            pinch_snapshot, initial_diagnostics, 5, stable_identity, stable_ratios, stable_clips, "pinch")
        result["pinch"] = {
            "before": pinch["before"],
            "after": pinch["after"],
            "snapshot": retained_evidence_snapshot(pinch_snapshot),
        }

        selectable_nodes = [component["name"].split(":", 1)[1]
                            for component in pinch_snapshot["components"]
                            if component["name"].startswith("NodeCanvas.node:") and component["visible"]]
        selected_id = original_selection.get("id") if isinstance(original_selection, dict) else None
        node_id = next((candidate for candidate in selectable_nodes if candidate != selected_id), None)
        if node_id is None:
            raise BrowserError(f"No visible retained Node is available for transformed hit: {selectable_nodes}")
        before_hit = retained_diagnostics(pinch_snapshot)
        hit = retained_call(target_id, f"hitNode({json.dumps(node_id)})")
        expected_selection = {"kind": "node", "id": node_id}
        if not same_selection(hit.get("after"), expected_selection):
            raise BrowserError(f"Transformed retained hit selected the wrong target: {hit}")
        hit_snapshot = retained_wait(
            target_id,
            lambda current: (same_selection(current.get("selection"), expected_selection)
                             and retained_diagnostics(current)["materializations"] >= before_hit["materializations"] + 1),
            "dirty selection materialization",
        )
        after_hit = retained_diagnostics(hit_snapshot)
        if after_hit != {
            "localLayoutPlans": before_hit["localLayoutPlans"] + 1,
            "materializations": before_hit["materializations"] + 1,
            "transformOnlyFrames": before_hit["transformOnlyFrames"],
        }:
            raise BrowserError(f"Dirty selection did not increment exact counters once: {before_hit} -> {after_hit}")
        result["dirtySelection"] = {
            "command": {
                "nodeId": hit["nodeId"],
                "before": hit["before"],
                "after": hit["after"],
                "surfacePoint": hit["surfacePoint"],
            },
            "settled": retained_evidence_snapshot(hit_snapshot),
        }
        result["validations"] = {
            "oneExactContentRoot": True,
            "stableComponentAndGeometryIdentity": True,
            "dirtySelectionPlannedAndMaterializedOnce": True,
            "transformOnlyCounters": True,
            "matrixWorldScaleRatiosStable": True,
            "overviewBodyAndTextMaterialized": True,
            "linkEndpointsEqualSocketCenters": True,
            "fixedViewportClipStable": True,
            "transformedSelection": True,
        }
    except Exception as error:
        failure = error
    finally:
        restore_before = retained_snapshot(target_id)
        restore_transform = retained_call(
            target_id, f"setTransform({json.dumps(original_transform)})")
        restore_selection = retained_call(
            target_id, f"select({json.dumps(original_selection)})")
        try:
            restored = retained_wait(
                target_id,
                lambda current: (same_transform(current.get("transform"), original_transform)
                                 and same_selection(current.get("selection"), original_selection)),
                "original transform and selection restore",
            )
            result["restore"] = {
                "before": {
                    "transform": restore_before["transform"],
                    "selection": restore_before["selection"],
                    "diagnostics": restore_before["diagnostics"],
                },
                "transformCommandAccepted": restore_transform.get("accepted") is True,
                "selectionCommandAccepted": restore_selection.get("accepted") is True,
                "postRestore": retained_evidence_snapshot(restored),
                "transformRestored": same_transform(restored.get("transform"), original_transform),
                "selectionRestored": same_selection(restored.get("selection"), original_selection),
                "postRestoreCounters": retained_diagnostics(restored),
            }
        except Exception as restore_error:
            if failure is None:
                failure = restore_error
            else:
                failure = BrowserError(f"{failure}; retained state restore also failed: {restore_error}")
    if failure is not None:
        raise failure
    if args.output is not None:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        result["output"] = str(output.resolve())
    return result


def require_retained_transform_only(
    snapshot: dict[str, Any],
    initial_diagnostics: dict[str, int],
    expected_transform_delta: int,
    stable_identity: dict[str, Any],
    stable_ratios: dict[str, list[float]],
    stable_clips: dict[str, Any],
    label: str,
) -> None:
    require_retained_snapshot(snapshot, label)
    diagnostics = retained_diagnostics(snapshot)
    if diagnostics != {
        "localLayoutPlans": initial_diagnostics["localLayoutPlans"],
        "materializations": initial_diagnostics["materializations"],
        "transformOnlyFrames": initial_diagnostics["transformOnlyFrames"] + expected_transform_delta,
    }:
        raise BrowserError(f"{label}: counters are not transform-only: {diagnostics}")
    if retained_identity(snapshot) != stable_identity:
        raise BrowserError(f"{label}: retained object/geometry identity changed")
    require_same_ratios(stable_ratios, snapshot, label)
    require_same_clips(stable_clips, snapshot, label)


def command_evidence(target_id: str, args: argparse.Namespace) -> dict[str, Any]:
    focus = request_json("/cdp/command", "POST", {
        "targetId": target_id,
        "method": "Page.bringToFront",
        "params": {},
    })
    touch_result = command_touch(target_id)
    viewport_result = command_viewports(target_id, args)
    final_dom = dom(target_id)
    final_console = console(target_id, args.console_ms)
    errors = console_errors(final_console)
    if errors:
        raise BrowserError(f"final native console errors: {json.dumps(errors, ensure_ascii=False)}")
    result: dict[str, Any] = {
        "targetId": target_id,
        "targetUrl": TARGET_URL,
        "focus": focus,
        "touch": touch_result,
        "viewports": viewport_result,
        "finalNative": {"dom": final_dom, "console": final_console},
        "nativeMetricsRestored": (
            touch_result.get("nativeMetricsRestored") is True
            and viewport_result.get("nativeMetricsRestored") is True
        ),
        "physicalDeviceProof": False,
        "ownerAcceptance": False,
    }
    if result["nativeMetricsRestored"] is not True:
        raise BrowserError("Combined browser evidence did not restore native metrics")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    result["output"] = str(output.resolve())
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
    subparsers.add_parser("focus")
    subparsers.add_parser("dom")
    console_parser = subparsers.add_parser("console")
    console_parser.add_argument("--duration-ms", type=int, default=1200)
    canvas_parser = subparsers.add_parser("canvas")
    canvas_parser.add_argument("output")
    viewport_parser = subparsers.add_parser("viewports")
    viewport_parser.add_argument("--output-dir")
    viewport_parser.add_argument("--console-ms", type=int, default=1200)
    subparsers.add_parser("touch")
    retained_parser = subparsers.add_parser("retained")
    retained_parser.add_argument("--output")
    evidence_parser = subparsers.add_parser("evidence")
    evidence_parser.add_argument("--output-dir", required=True)
    evidence_parser.add_argument("--output", required=True)
    evidence_parser.add_argument("--console-ms", type=int, default=1200)
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
    elif args.command == "focus":
        print_json(request_json("/cdp/command", "POST", {
            "targetId": target_id,
            "method": "Page.bringToFront",
            "params": {},
        }))
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
    elif args.command == "retained":
        print_json(command_retained(target_id, args))
    elif args.command == "evidence":
        print_json(command_evidence(target_id, args))
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
