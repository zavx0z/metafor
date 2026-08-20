import {describe, expect, test} from "bun:test"
import {
  CanvasEvidenceRejected,
  type RejectedCanvasEvidence,
} from "../scripts/canvas-evidence.ts"
import {
  assertInteractionEvidence,
  executeInteractionPlan,
  interactionExitCode,
  interactionOutcome,
  parseInteractionPlan,
  validateInteractionInvocation,
  type InteractionCommandHost,
} from "../scripts/interaction-plan.ts"

describe("ui-dev data-only interaction plans", () => {
  test("parses one exact bounded schema and rejects executable or unknown data", () => {
    const plan = parseInteractionPlan({
      version: 1,
      settleMs: 120,
      steps: [
        {kind: "pointer-move", x: 10, y: 20, modifiers: ["shift"]},
        {kind: "pointer-down", x: 10, y: 20, button: "left"},
        {kind: "pointer-up", x: 10, y: 20, button: "left"},
        {kind: "key-down", key: "ArrowRight", code: "ArrowRight", modifiers: ["ctrl"]},
        {kind: "key-up", key: "ArrowRight", code: "ArrowRight", modifiers: ["ctrl"]},
        {kind: "text", text: "42"},
        {kind: "settle", ms: 50},
        {kind: "checkpoint", name: "after", dom: true, canvas: "/tmp/after.png"},
      ],
    })

    expect(plan).toMatchObject({version: 1, settleMs: 120})
    expect(plan.steps).toHaveLength(8)
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.steps)).toBe(true)
    expect(() => parseInteractionPlan({version: 1, steps: [], js: "alert(1)"})).toThrow("unknown plan key")
    expect(() => parseInteractionPlan({version: 1, steps: [{kind: "evaluate", expression: "1+1"}]})).toThrow("unsupported interaction step")
    expect(() => parseInteractionPlan({version: 1, settleMs: 2001, steps: []})).toThrow("settleMs")
    expect(() => parseInteractionPlan({version: 1, steps: [{kind: "pointer-move", x: -1, y: 0}]})).toThrow("x")
    expect(() => parseInteractionPlan({version: 1, steps: [{kind: "text", text: ""}]})).toThrow("text")
    expect(() => parseInteractionPlan({version: 1, steps: [{kind: "checkpoint", name: "empty"}]})).toThrow("checkpoint")
    expect(() => parseInteractionPlan({version: 1, steps: [
      {kind: "checkpoint", name: "same", dom: true},
      {kind: "checkpoint", name: "same", dom: true},
    ]})).toThrow("unique")
  })

  test("dispatches exact pointer, drag, keyboard, text and settle CDP payloads in order", async () => {
    const calls: Array<Readonly<{method: string; params: unknown}>> = []
    const settles: number[] = []
    const checkpoints: string[] = []
    const host: InteractionCommandHost = {
      viewport: {width: 800, height: 600},
      async send(method, params) { calls.push({method, params}) },
      async settle(ms) { settles.push(ms) },
      async checkpoint(step) {
        checkpoints.push(step.name)
        return {name: step.name, accepted: true}
      },
    }
    const plan = parseInteractionPlan({
      version: 1,
      settleMs: 100,
      steps: [
        {kind: "pointer-move", x: 10, y: 20, modifiers: ["shift"]},
        {kind: "pointer-down", x: 10, y: 20, button: "left", modifiers: ["ctrl"]},
        {kind: "pointer-move", x: 20, y: 30},
        {kind: "pointer-up", x: 20, y: 30, button: "left"},
        {kind: "pointer-drag", from: {x: 40, y: 50}, to: {x: 60, y: 70}, button: "right", modifiers: ["alt"], segments: 2},
        {kind: "key-down", key: "Escape", code: "Escape", modifiers: ["meta"]},
        {kind: "key-up", key: "Escape", code: "Escape", modifiers: ["meta"]},
        {kind: "text", text: "12.5"},
        {kind: "settle", ms: 40},
        {kind: "checkpoint", name: "result", dom: true},
      ],
    })

    const result = await executeInteractionPlan(plan, host)
    expect(calls).toEqual([
      {method: "Input.dispatchMouseEvent", params: {type: "mouseMoved", x: 10, y: 20, button: "none", buttons: 0, modifiers: 8}},
      {method: "Input.dispatchMouseEvent", params: {type: "mousePressed", x: 10, y: 20, button: "left", buttons: 1, modifiers: 2, clickCount: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseMoved", x: 20, y: 30, button: "none", buttons: 1, modifiers: 0}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseReleased", x: 20, y: 30, button: "left", buttons: 0, modifiers: 0, clickCount: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseMoved", x: 40, y: 50, button: "none", buttons: 0, modifiers: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mousePressed", x: 40, y: 50, button: "right", buttons: 2, modifiers: 1, clickCount: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseMoved", x: 50, y: 60, button: "none", buttons: 2, modifiers: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseMoved", x: 60, y: 70, button: "none", buttons: 2, modifiers: 1}},
      {method: "Input.dispatchMouseEvent", params: {type: "mouseReleased", x: 60, y: 70, button: "right", buttons: 0, modifiers: 1, clickCount: 1}},
      {method: "Input.dispatchKeyEvent", params: {type: "keyDown", key: "Escape", code: "Escape", modifiers: 4}},
      {method: "Input.dispatchKeyEvent", params: {type: "keyUp", key: "Escape", code: "Escape", modifiers: 4}},
      {method: "Input.insertText", params: {text: "12.5"}},
    ])
    expect(settles).toEqual([40, 100])
    expect(checkpoints).toEqual(["result"])
    expect(result.checkpoints).toEqual([{name: "result", accepted: true}])
  })

  test("fails closed on invalid event order or viewport coordinates and releases held input", async () => {
    const calls: Array<Readonly<{method: string; params: unknown}>> = []
    const host: InteractionCommandHost = {
      viewport: {width: 100, height: 80},
      async send(method, params) { calls.push({method, params}) },
      async settle() {},
      async checkpoint() { return {} },
    }

    await expect(executeInteractionPlan(parseInteractionPlan({
      version: 1,
      steps: [
        {kind: "pointer-down", x: 20, y: 20, button: "left"},
        {kind: "pointer-move", x: 101, y: 20},
      ],
    }), host)).rejects.toThrow("outside viewport")
    expect(calls.at(-1)).toEqual({
      method: "Input.dispatchMouseEvent",
      params: {type: "mouseReleased", x: 20, y: 20, button: "left", buttons: 0, modifiers: 0, clickCount: 1},
    })

    await expect(executeInteractionPlan(parseInteractionPlan({
      version: 1,
      steps: [{kind: "pointer-up", x: 20, y: 20, button: "left"}],
    }), host)).rejects.toThrow("is not pressed")
    await expect(executeInteractionPlan(parseInteractionPlan({
      version: 1,
      steps: [{kind: "key-up", key: "Escape"}],
    }), host)).rejects.toThrow("is not down")
  })

  test("requires an existing exact selector route and target before interaction", () => {
    const valid = {
      selector: "components",
      route: "/integer-input/default",
      targetId: "target-1",
      targetUrl: "http://127.0.0.1:4017/integer-input/default",
      currentUrl: "http://127.0.0.1:4017/integer-input/default",
    }
    expect(() => validateInteractionInvocation(valid)).not.toThrow()
    expect(() => validateInteractionInvocation({...valid, selector: null})).toThrow("registry selector")
    expect(() => validateInteractionInvocation({...valid, route: undefined})).toThrow("--route")
    expect(() => validateInteractionInvocation({...valid, targetId: undefined})).toThrow("--target-id")
    expect(() => validateInteractionInvocation({...valid, currentUrl: "http://127.0.0.1:4017/color-input/default"})).toThrow("exact route")
  })

  test("accepts only preserved-route, console-clean and written canvas evidence", () => {
    const accepted = {
      targetUrl: "http://127.0.0.1:4017/integer-input/basic/labeled",
      initialUrl: "http://127.0.0.1:4017/integer-input/basic/labeled",
      finalUrl: "http://127.0.0.1:4017/integer-input/basic/labeled",
      console: [{level: "log"}],
      captures: [{kind: "exact-canvas-png", written: true}],
    }
    expect(() => assertInteractionEvidence(accepted)).not.toThrow()
    expect(() => assertInteractionEvidence({...accepted, finalUrl: "http://127.0.0.1:4017/color-input/basic"})).toThrow("exact route")
    expect(() => assertInteractionEvidence({...accepted, console: [{level: "error"}]})).toThrow("console errors")
    expect(() => assertInteractionEvidence({...accepted, captures: [{kind: "starting-or-idle-black", written: false}]})).toThrow("canvas rejected")
  })

  test("returns a structured failed nonzero outcome for a rejected checkpoint", async () => {
    const evidence: RejectedCanvasEvidence = {
      kind: "starting-or-idle-black",
      written: false,
      path: "/tmp/rejected.png",
      bytes: 0,
      attempts: 1,
      rendererActivity: null,
      rejected: [],
      probe: {width: 1, height: 1, pixels: 1, nonBlackPixels: 0, maxRgb: 0, black: true},
    }
    let failure: unknown = null
    try {
      await executeInteractionPlan(parseInteractionPlan({
        version: 1,
        steps: [{kind: "checkpoint", name: "rejected", dom: true}],
      }), {
        viewport: {width: 100, height: 80},
        async send() {},
        async settle() {},
        async checkpoint() { throw new CanvasEvidenceRejected(evidence) },
      })
    } catch (error) {
      failure = error
    }
    const outcome = interactionOutcome(failure)
    expect(outcome).toEqual({
      outcome: "failed",
      error: "starting-or-idle-black",
      rejectedCanvas: evidence,
    })
    expect(interactionExitCode(outcome)).toBe(1)
    const passed = interactionOutcome(null)
    expect(passed).toEqual({outcome: "passed"})
    expect(interactionExitCode(passed)).toBe(0)
  })
})
