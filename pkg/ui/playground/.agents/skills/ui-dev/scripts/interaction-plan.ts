import {isAbsolute} from "node:path"
import {
  CanvasEvidenceRejected,
  type CanvasEvidence,
} from "./canvas-evidence.ts"

type JsonObject = Readonly<Record<string, unknown>>

/** Data-only background interaction plan for one exact playground route. */
export type InteractionModifier = "alt" | "ctrl" | "meta" | "shift"
export type InteractionButton = "left" | "middle" | "right"
export type InteractionPoint = Readonly<{x: number; y: number}>
export type InteractionCheckpointStep = Readonly<{
  kind: "checkpoint"
  name: string
  dom: boolean
  canvas?: string
}>
export type InteractionStep =
  | Readonly<{kind: "pointer-move"; x: number; y: number; modifiers: readonly InteractionModifier[]}>
  | Readonly<{kind: "pointer-down" | "pointer-up"; x: number; y: number; button: InteractionButton; modifiers: readonly InteractionModifier[]}>
  | Readonly<{kind: "pointer-drag"; from: InteractionPoint; to: InteractionPoint; button: InteractionButton; modifiers: readonly InteractionModifier[]; segments: number}>
  | Readonly<{kind: "key-down" | "key-up"; key: string; code?: string; modifiers: readonly InteractionModifier[]}>
  | Readonly<{kind: "text"; text: string}>
  | Readonly<{kind: "settle"; ms: number}>
  | InteractionCheckpointStep
export type InteractionPlan = Readonly<{
  version: 1
  settleMs: number
  steps: readonly InteractionStep[]
}>
export type InteractionCommandHost = Readonly<{
  viewport: Readonly<{width: number; height: number}>
  send(method: string, params: JsonObject): Promise<void>
  settle(ms: number): Promise<void>
  checkpoint(step: InteractionCheckpointStep): Promise<unknown>
}>
export type InteractionInvocation = Readonly<{
  selector: string | null
  route: string | undefined
  targetId: string | undefined
  targetUrl: string
  currentUrl: string
}>
export type InteractionEvidence = Readonly<{
  targetUrl: string
  initialUrl: unknown
  finalUrl: unknown
  console: readonly Readonly<{level: string}>[]
  captures: readonly Readonly<{kind: string; written: boolean}>[]
}>
export type InteractionOutcome =
  | Readonly<{outcome: "passed"}>
  | Readonly<{outcome: "failed"; error: string; rejectedCanvas?: CanvasEvidence}>
export type BackgroundInputFocusState = Readonly<{
  requested: true
  enabledDuringPlan: boolean
  restored: boolean
}>
export type BackgroundInputModeResult<T> = Readonly<{
  value: T | null
  failure: unknown
  focusEmulation: BackgroundInputFocusState
}>
export type InteractionRenderBarrier = Readonly<{
  requestedMs: number
  frames: number
  timedOut: boolean
  elapsedMs: number
}>

export class InteractionRenderBarrierRejected extends Error {
  readonly barrier: InteractionRenderBarrier

  constructor(barrier: InteractionRenderBarrier) {
    super(`interaction render barrier timed out after ${barrier.frames} frames`)
    this.name = "InteractionRenderBarrierRejected"
    this.barrier = barrier
  }
}

const MAX_STEPS = 256
const MAX_SETTLE_MS = 2_000
const MAX_TOTAL_SETTLE_MS = 10_000
const MAX_COORDINATE = 100_000
const MAX_DRAG_SEGMENTS = 60
const DEFAULT_DRAG_SEGMENTS = 8
const DEFAULT_FINAL_SETTLE_MS = 100
const BUTTON_BITS: Readonly<Record<InteractionButton, number>> = Object.freeze({left: 1, right: 2, middle: 4})
const MODIFIER_BITS: Readonly<Record<InteractionModifier, number>> = Object.freeze({alt: 1, ctrl: 2, meta: 4, shift: 8})

/** Parse the only accepted data schema. Unknown keys and action kinds fail closed. */
export function parseInteractionPlan(value: unknown): InteractionPlan {
  const plan = exactObject(value, "plan", ["version", "settleMs", "steps"])
  if (plan.version !== 1) throw new Error("interaction plan version must be 1")
  const settleMs = plan.settleMs === undefined
    ? DEFAULT_FINAL_SETTLE_MS
    : boundedInteger(plan.settleMs, "settleMs", 0, MAX_SETTLE_MS)
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > MAX_STEPS) {
    throw new Error(`interaction plan steps must contain 1..${MAX_STEPS} entries`)
  }
  const steps = plan.steps.map((step, index) => parseStep(step, index))
  const checkpointNames = steps.flatMap((step) => step.kind === "checkpoint" ? [step.name] : [])
  if (new Set(checkpointNames).size !== checkpointNames.length) {
    throw new Error("interaction checkpoint names must be unique")
  }
  const totalSettleMs = settleMs + steps.reduce((total, step) => total + (step.kind === "settle" ? step.ms : 0), 0)
  if (totalSettleMs > MAX_TOTAL_SETTLE_MS) {
    throw new Error(`interaction plan total settle exceeds ${MAX_TOTAL_SETTLE_MS}ms`)
  }
  return Object.freeze({version: 1, settleMs, steps: Object.freeze(steps)})
}

/** Require an already loaded exact selector route and target before dispatch. */
export function validateInteractionInvocation(invocation: InteractionInvocation): void {
  if (invocation.selector === null) throw new Error("interact requires a registry selector")
  if (invocation.route === undefined) throw new Error("interact requires --route")
  if (invocation.targetId === undefined) throw new Error("interact requires --target-id")
  if (invocation.currentUrl !== invocation.targetUrl) {
    throw new Error(`interaction target is not on the exact route: expected ${invocation.targetUrl}, got ${invocation.currentUrl}; run reload first`)
  }
}

/** Validate route, console and every requested canvas before accepting a run. */
export function assertInteractionEvidence(evidence: InteractionEvidence): void {
  if (evidence.initialUrl !== evidence.targetUrl || evidence.finalUrl !== evidence.targetUrl) {
    throw new Error(`interaction changed the exact route: expected ${evidence.targetUrl}`)
  }
  const errors = evidence.console.filter(({level}) => level === "error")
  if (errors.length > 0) throw new Error(`interaction console errors: ${JSON.stringify(errors)}`)
  const rejected = evidence.captures.find(({written}) => !written)
  if (rejected !== undefined) throw new Error(`interaction canvas rejected: ${rejected.kind}`)
}

/** Convert any execution failure into the command's stable structured result. */
export function interactionOutcome(failure: unknown): InteractionOutcome {
  if (failure === null) return Object.freeze({outcome: "passed"})
  return Object.freeze({
    outcome: "failed",
    error: errorText(failure),
    ...(failure instanceof CanvasEvidenceRejected ? {rejectedCanvas: failure.evidence} : {}),
  })
}

export function interactionExitCode(result: Readonly<Record<string, unknown>>): 0 | 1 {
  return result.outcome === "passed" ? 0 : 1
}

/** Enable background renderer input only for one plan and always restore it. */
export async function runBackgroundInputMode<T>(
  host: Readonly<{setFocusEmulation(enabled: boolean): Promise<void>}>,
  operation: () => Promise<T>,
): Promise<BackgroundInputModeResult<T>> {
  let enabledDuringPlan = false
  let restored = false
  let value: T | null = null
  let failure: unknown = null
  try {
    await host.setFocusEmulation(true)
    enabledDuringPlan = true
    try {
      value = await operation()
    } catch (error) {
      failure = error
    }
  } catch (error) {
    failure = error
  } finally {
    try {
      await host.setFocusEmulation(false)
      restored = true
    } catch (restoreError) {
      failure = failure === null
        ? restoreError
        : new Error(`${errorText(failure)}; focus emulation restore failed: ${errorText(restoreError)}`)
    }
  }
  return Object.freeze({
    value,
    failure,
    focusEmulation: Object.freeze({requested: true, enabledDuringPlan, restored}),
  })
}

/** Wait inside the target for the requested delay and two committed frames. */
export async function runInteractionRenderBarrier(
  host: Readonly<{evaluate(source: string, awaitPromise: true): Promise<unknown>}>,
  requested: number,
): Promise<InteractionRenderBarrier> {
  const requestedMs = boundedInteger(requested, "interaction render barrier requestedMs", 0, MAX_SETTLE_MS)
  const timeoutMs = requestedMs + 2_000
  const source = `new Promise((resolve) => {
    const requestedMs = ${requestedMs}
    const timeoutMs = ${timeoutMs}
    const started = performance.now()
    let settled = false
    let frames = 0
    const finish = (timedOut) => {
      if (settled) return
      settled = true
      clearTimeout(delay)
      clearTimeout(timeout)
      resolve({requestedMs, frames, timedOut, elapsedMs: performance.now() - started})
    }
    const step = () => {
      if (settled) return
      frames++
      if (frames >= 2) finish(false)
      else requestAnimationFrame(step)
    }
    const delay = setTimeout(() => requestAnimationFrame(step), requestedMs)
    const timeout = setTimeout(() => finish(true), timeoutMs)
  })`
  const raw = exactObject(await host.evaluate(source, true), "interaction render barrier", [
    "requestedMs",
    "frames",
    "timedOut",
    "elapsedMs",
  ])
  const barrier = Object.freeze({
    requestedMs: boundedInteger(raw.requestedMs, "interaction render barrier requestedMs", 0, MAX_SETTLE_MS),
    frames: boundedInteger(raw.frames, "interaction render barrier frames", 0, 10_000),
    timedOut: booleanValue(raw.timedOut, "interaction render barrier timedOut"),
    elapsedMs: finiteNonNegative(raw.elapsedMs, "interaction render barrier elapsedMs"),
  })
  if (barrier.requestedMs !== requestedMs) throw new Error("interaction render barrier returned a different requestedMs")
  if (barrier.timedOut || barrier.frames < 2) throw new InteractionRenderBarrierRejected(barrier)
  return barrier
}

/** Dispatch validated synthetic input in order and release held input on failure. */
export async function executeInteractionPlan(
  plan: InteractionPlan,
  host: InteractionCommandHost,
): Promise<Readonly<{checkpoints: readonly unknown[]}>> {
  validateViewport(host.viewport)
  const pressedButtons = new Set<InteractionButton>()
  const downKeys = new Map<string, Readonly<{code?: string}>>()
  const checkpoints: unknown[] = []
  let lastPoint: InteractionPoint = {x: 0, y: 0}
  try {
    for (const step of plan.steps) {
      if (step.kind === "pointer-move") {
        lastPoint = pointInViewport(step, host.viewport)
        await mouse(host, "mouseMoved", lastPoint, "none", buttonMask(pressedButtons), modifierMask(step.modifiers))
      } else if (step.kind === "pointer-down") {
        lastPoint = pointInViewport(step, host.viewport)
        if (pressedButtons.has(step.button)) throw new Error(`pointer button ${step.button} is already pressed`)
        pressedButtons.add(step.button)
        await mouse(host, "mousePressed", lastPoint, step.button, buttonMask(pressedButtons), modifierMask(step.modifiers), 1)
      } else if (step.kind === "pointer-up") {
        lastPoint = pointInViewport(step, host.viewport)
        if (!pressedButtons.has(step.button)) throw new Error(`pointer button ${step.button} is not pressed`)
        pressedButtons.delete(step.button)
        try {
          await mouse(host, "mouseReleased", lastPoint, step.button, buttonMask(pressedButtons), modifierMask(step.modifiers), 1)
        } catch (error) {
          pressedButtons.add(step.button)
          throw error
        }
      } else if (step.kind === "pointer-drag") {
        if (pressedButtons.size > 0) throw new Error("pointer-drag requires no previously pressed buttons")
        const from = pointInViewport(step.from, host.viewport)
        const to = pointInViewport(step.to, host.viewport)
        const modifiers = modifierMask(step.modifiers)
        lastPoint = from
        await mouse(host, "mouseMoved", from, "none", 0, modifiers)
        pressedButtons.add(step.button)
        await mouse(host, "mousePressed", from, step.button, buttonMask(pressedButtons), modifiers, 1)
        for (let segment = 1; segment <= step.segments; segment++) {
          const progress = segment / step.segments
          lastPoint = {
            x: from.x + (to.x - from.x) * progress,
            y: from.y + (to.y - from.y) * progress,
          }
          await mouse(host, "mouseMoved", lastPoint, "none", buttonMask(pressedButtons), modifiers)
        }
        pressedButtons.delete(step.button)
        try {
          await mouse(host, "mouseReleased", to, step.button, 0, modifiers, 1)
        } catch (error) {
          pressedButtons.add(step.button)
          throw error
        }
      } else if (step.kind === "key-down") {
        if (downKeys.has(step.key)) throw new Error(`keyboard key ${step.key} is already down`)
        downKeys.set(step.key, step.code === undefined ? {} : {code: step.code})
        await host.send("Input.dispatchKeyEvent", keyEvent("keyDown", step))
      } else if (step.kind === "key-up") {
        const down = downKeys.get(step.key)
        if (down === undefined) throw new Error(`keyboard key ${step.key} is not down`)
        if (step.code !== undefined && step.code !== down.code) {
          throw new Error(`keyboard key ${step.key} code does not match its key-down`)
        }
        downKeys.delete(step.key)
        try {
          await host.send("Input.dispatchKeyEvent", keyEvent("keyUp", step))
        } catch (error) {
          downKeys.set(step.key, down)
          throw error
        }
      } else if (step.kind === "text") {
        await host.send("Input.insertText", {text: step.text})
      } else if (step.kind === "settle") {
        await host.settle(step.ms)
      } else if (step.kind === "checkpoint") {
        checkpoints.push(await host.checkpoint(step))
      } else {
        throw new Error(`unsupported interaction step: ${JSON.stringify(step)}`)
      }
    }
    if (pressedButtons.size > 0) throw new Error(`interaction plan ended with pressed pointer buttons: ${[...pressedButtons].join(",")}`)
    if (downKeys.size > 0) throw new Error(`interaction plan ended with down keyboard keys: ${[...downKeys.keys()].join(",")}`)
    if (plan.settleMs > 0) await host.settle(plan.settleMs)
    return Object.freeze({checkpoints: Object.freeze(checkpoints)})
  } catch (error) {
    const cleanupErrors: string[] = []
    for (const button of [...pressedButtons].reverse()) {
      pressedButtons.delete(button)
      try {
        await mouse(host, "mouseReleased", lastPoint, button, buttonMask(pressedButtons), 0, 1)
      } catch (cleanupError) {
        cleanupErrors.push(errorText(cleanupError))
      }
    }
    for (const [key, descriptor] of [...downKeys].reverse()) {
      downKeys.delete(key)
      try {
        await host.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          ...(descriptor.code === undefined ? {} : {code: descriptor.code}),
          ...virtualKeyCode(key),
          modifiers: 0,
        })
      } catch (cleanupError) {
        cleanupErrors.push(errorText(cleanupError))
      }
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`${errorText(error)}; input cleanup failed: ${cleanupErrors.join("; ")}`)
    }
    throw error
  }
}

function parseStep(value: unknown, index: number): InteractionStep {
  const base = objectValue(value, `steps[${index}]`)
  const kind = base.kind
  if (kind === "pointer-move") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "x", "y", "modifiers"])
    return Object.freeze({kind, ...parsePoint(step, index), modifiers: parseModifiers(step.modifiers, index)})
  }
  if (kind === "pointer-down" || kind === "pointer-up") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "x", "y", "button", "modifiers"])
    return Object.freeze({kind, ...parsePoint(step, index), button: parseButton(step.button, index), modifiers: parseModifiers(step.modifiers, index)})
  }
  if (kind === "pointer-drag") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "from", "to", "button", "modifiers", "segments"])
    return Object.freeze({
      kind,
      from: parseNamedPoint(step.from, `steps[${index}].from`),
      to: parseNamedPoint(step.to, `steps[${index}].to`),
      button: parseButton(step.button, index),
      modifiers: parseModifiers(step.modifiers, index),
      segments: step.segments === undefined
        ? DEFAULT_DRAG_SEGMENTS
        : boundedInteger(step.segments, `steps[${index}].segments`, 1, MAX_DRAG_SEGMENTS),
    })
  }
  if (kind === "key-down" || kind === "key-up") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "key", "code", "modifiers"])
    return Object.freeze({
      kind,
      key: boundedString(step.key, `steps[${index}].key`, 1, 64),
      ...(step.code === undefined ? {} : {code: boundedString(step.code, `steps[${index}].code`, 1, 64)}),
      modifiers: parseModifiers(step.modifiers, index),
    })
  }
  if (kind === "text") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "text"])
    return Object.freeze({kind, text: boundedString(step.text, `steps[${index}].text`, 1, 4_096)})
  }
  if (kind === "settle") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "ms"])
    return Object.freeze({kind, ms: boundedInteger(step.ms, `steps[${index}].ms`, 0, MAX_SETTLE_MS)})
  }
  if (kind === "checkpoint") {
    const step = exactObject(value, `steps[${index}]`, ["kind", "name", "dom", "canvas"])
    const name = boundedString(step.name, `steps[${index}].name`, 1, 64)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`steps[${index}].name contains unsupported characters`)
    const dom = step.dom === undefined ? false : booleanValue(step.dom, `steps[${index}].dom`)
    const canvas = step.canvas === undefined ? undefined : boundedString(step.canvas, `steps[${index}].canvas`, 1, 4_096)
    if (canvas !== undefined && !isAbsolute(canvas)) throw new Error(`steps[${index}].canvas must be an absolute path`)
    if (!dom && canvas === undefined) throw new Error(`steps[${index}] checkpoint requires dom:true and/or canvas`)
    return Object.freeze({kind, name, dom, ...(canvas === undefined ? {} : {canvas})})
  }
  throw new Error(`unsupported interaction step at steps[${index}]: ${String(kind)}`)
}

function exactObject(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  const object = objectValue(value, label)
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new Error(`unknown ${label} key: ${key}`)
  }
  return object
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function parsePoint(value: Record<string, unknown>, index: number): InteractionPoint {
  return Object.freeze({
    x: coordinate(value.x, `steps[${index}].x`),
    y: coordinate(value.y, `steps[${index}].y`),
  })
}

function parseNamedPoint(value: unknown, label: string): InteractionPoint {
  const point = exactObject(value, label, ["x", "y"])
  return Object.freeze({x: coordinate(point.x, `${label}.x`), y: coordinate(point.y, `${label}.y`)})
}

function parseButton(value: unknown, index: number): InteractionButton {
  if (value !== "left" && value !== "middle" && value !== "right") {
    throw new Error(`steps[${index}].button must be left, middle or right`)
  }
  return value
}

function parseModifiers(value: unknown, index: number): readonly InteractionModifier[] {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value)) throw new Error(`steps[${index}].modifiers must be an array`)
  const modifiers = value.map((modifier): InteractionModifier => {
    if (modifier !== "alt" && modifier !== "ctrl" && modifier !== "meta" && modifier !== "shift") {
      throw new Error(`steps[${index}].modifiers contains unsupported modifier: ${String(modifier)}`)
    }
    return modifier
  })
  if (new Set(modifiers).size !== modifiers.length) throw new Error(`steps[${index}].modifiers contains duplicates`)
  return Object.freeze(modifiers)
}

function coordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_COORDINATE) {
    throw new Error(`${label} must be a finite coordinate from 0 to ${MAX_COORDINATE}`)
  }
  return value
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return Number(value)
}

function boundedString(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}..${maximum} characters`)
  }
  return value
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`)
  return value
}

function validateViewport(viewport: Readonly<{width: number; height: number}>): void {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error(`interaction viewport must have positive finite dimensions`)
  }
}

function pointInViewport(point: InteractionPoint, viewport: Readonly<{width: number; height: number}>): InteractionPoint {
  if (point.x >= viewport.width || point.y >= viewport.height) {
    throw new Error(`interaction point ${point.x},${point.y} is outside viewport ${viewport.width}x${viewport.height}`)
  }
  return point
}

function buttonMask(buttons: ReadonlySet<InteractionButton>): number {
  let mask = 0
  for (const button of buttons) mask |= BUTTON_BITS[button]
  return mask
}

function modifierMask(modifiers: readonly InteractionModifier[]): number {
  let mask = 0
  for (const modifier of modifiers) mask |= MODIFIER_BITS[modifier]
  return mask
}

function keyEvent(
  type: "keyDown" | "keyUp",
  step: Extract<InteractionStep, {kind: "key-down" | "key-up"}>,
): JsonObject {
  return {
    type,
    key: step.key,
    ...(step.code === undefined ? {} : {code: step.code}),
    ...virtualKeyCode(step.key),
    modifiers: modifierMask(step.modifiers),
  }
}

function virtualKeyCode(key: string): JsonObject {
  const match = /^F([1-9]|1[0-2])$/.exec(key)
  if (match === null) return {}
  const code = 111 + Number(match[1])
  return {windowsVirtualKeyCode: code, nativeVirtualKeyCode: code}
}

async function mouse(
  host: InteractionCommandHost,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  point: InteractionPoint,
  button: InteractionButton | "none",
  buttons: number,
  modifiers: number,
  clickCount?: number,
): Promise<void> {
  await host.send("Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button,
    buttons,
    modifiers,
    ...(clickCount === undefined ? {} : {clickCount}),
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
