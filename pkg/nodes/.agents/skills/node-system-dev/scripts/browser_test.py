#!/usr/bin/env python3

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


sys.dont_write_bytecode = True
MODULE_PATH = Path(__file__).with_name("browser.py")
SPEC = importlib.util.spec_from_file_location("node_system_dev_browser", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load {MODULE_PATH}")
browser = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(browser)


def snapshot() -> dict[str, object]:
    point = {"x": 10, "y": 20}
    visual = {
        "objectId": "object-visual",
        "worldScaleRatioToContentRoot": [1, 1],
    }
    link = {
        "id": "link-1",
        "parentObjectId": "object-link",
        "geometryObjectId": "object-link-geometry",
        "geometryId": "geometry-link",
        "rawFirstPoint": point,
        "rawLastPoint": point,
        "sourceSocketCenter": point,
        "targetSocketCenter": point,
        "actualGeometryFirstPoint": point,
        "actualGeometryLastPoint": point,
        "framebufferClip": [0, 0, 100, 100],
    }
    component = {
        "name": "NodeCanvas.node:node-1",
        "objectId": "object-node",
        "visible": True,
        "childObjectIds": ["object-visual"],
        "descendantCount": 1,
        "geometryCount": 1,
        "textCount": 1,
        "geometryIds": ["geometry-node"],
        "visualSamples": [visual],
        "bounded": False,
    }
    return {
        "transform": {"x": 12, "y": 34, "scale": 0.5},
        "selection": {"kind": "link", "id": "link-1"},
        "diagnostics": {
            "localLayoutPlans": 1,
            "materializations": 1,
            "transformOnlyFrames": 0,
        },
        "contentRoot": {
            "count": 1,
            "objectId": "object-root",
            "childObjectIds": ["object-node", "object-link"],
        },
        "components": [component],
        "representativeNode": component,
        "links": [link],
    }


class RetainedRestoreTest(unittest.TestCase):
    def test_compares_exact_restored_transform(self) -> None:
        transform = {"x": 12, "y": 34, "scale": 0.5}
        self.assertTrue(browser.same_transform(transform, dict(transform)))
        self.assertFalse(browser.same_transform(transform, {**transform, "scale": 0.6}))

    def test_restores_original_transform_and_selection_after_phase_failure(self) -> None:
        initial = snapshot()
        calls: list[str] = []

        def retained_call(_target_id: str, expression: str) -> dict[str, object]:
            calls.append(expression)
            if len(calls) == 1:
                raise browser.BrowserError("injected transform failure")
            return {"accepted": True, "snapshot": initial}

        with (
            patch.object(browser, "request_json", return_value={"ok": True}) as request_json,
            patch.object(browser, "dom", return_value={"visibility": "visible", "focused": True}),
            patch.object(browser, "retained_snapshot", return_value=initial),
            patch.object(browser, "retained_call", side_effect=retained_call),
            patch.object(browser, "retained_wait", return_value=initial),
        ):
            with self.assertRaisesRegex(browser.BrowserError, "injected transform failure"):
                browser.command_retained("target-1", argparse.Namespace(output=None))

        request_json.assert_called_once_with("/cdp/command", "POST", {
            "targetId": "target-1",
            "method": "Page.bringToFront",
            "params": {},
        })
        self.assertEqual(len(calls), 3)
        self.assertTrue(calls[1].startswith("setTransform("), calls)
        self.assertIn('"x": 12', calls[1])
        self.assertIn('"y": 34', calls[1])
        self.assertIn('"scale": 0.5', calls[1])
        self.assertTrue(calls[2].startswith("select("), calls)
        self.assertIn('"kind": "link"', calls[2])
        self.assertIn('"id": "link-1"', calls[2])


if __name__ == "__main__":
    unittest.main()
