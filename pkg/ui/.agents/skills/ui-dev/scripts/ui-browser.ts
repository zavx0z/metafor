#!/usr/bin/env bun

import {join, resolve} from "node:path"
import {
  acceptCanvasEvidence,
  type CanvasEvidence,
  type RawCanvasSnapshot,
} from "./canvas-evidence.ts"
import {playgroundTargetUrl} from "./target-url.ts"

type JsonObject = Record<string, unknown>
type SupportedSelector = Readonly<{
  supported: true
  package: string
  cwd: string
  command: readonly string[]
  host: string
  hostEnv?: string
  port: number
  portEnv: string
  origin: string
  httpMarker: string
  ready: ReadyMarker
  canvas: CanvasDescriptor
  routes: Readonly<{default: string}>
  stateKey: string
  logName: string
}>
type UnsupportedSelector = Readonly<{
  supported: false
  package: string
  reason: string
}>
type Selector = SupportedSelector | UnsupportedSelector
type Registry = Readonly<{version: number; selectors: Readonly<Record<string, Selector>>}>
type ReadyMarker =
  | Readonly<{kind: "dataset"; name: string; value: string}>
  | Readonly<{kind: "canvas"; selector: string; minBackingWidth: number}>
type CanvasDescriptor = Readonly<{
  selector: string
  capability: "webgpu" | "webgpu-diagnostic" | "none"
  touch: boolean
}>
type Target = Readonly<{
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}>
type TargetConfig = Readonly<{
  checkout: string
  selector: string | null
  package: string | null
  origin: string | null
  targetUrl: string
  ready: ReadyMarker | null
  canvas: CanvasDescriptor
  testOverride: boolean
}>
type Options = Readonly<{
  route?: string
  targetId?: string
  output?: string
  outputDir?: string
  canvasSelector?: string
  durationMs: number
  frames: number
}>
type ConsoleEntry = Readonly<{
  source: "console" | "log"
  level: string
  text: string
  timestamp?: number
  url?: string
  line?: number
}>

const [action, checkoutInput, selectorOrUrl, ...optionArgs] = Bun.argv.slice(2)
const actions = new Set(["targets", "target", "open", "close", "reload", "dom", "console", "canvas", "viewports", "touch", "profile"])

if (!actions.has(action) || !checkoutInput || !selectorOrUrl) {
  fail("usage: ui-browser.ts {targets|target|open|close|reload|dom|console|canvas|viewports|touch|profile} <checkout> <selector|exact-url> [options]")
}

const checkout = resolve(checkoutInput)
validateCheckout(checkout)
const options = parseOptions(optionArgs)
const registry = await Bun.file(join(import.meta.dir, "playgrounds.json")).json() as Registry
const config = resolveTargetConfig(registry, checkout, selectorOrUrl, options)
const cdpPort = Number(Bun.env.UI_DEV_CDP_PORT ?? 9222)
if (!Number.isInteger(cdpPort) || cdpPort < 1 || cdpPort > 65535) fail("UI_DEV_CDP_PORT must be 1..65535")

if (action === "targets") {
  output({action, checkout, selector: config.selector, origin: config.origin, targets: await candidateTargets(config, cdpPort)})
  process.exit(0)
}
if (action === "close") {
  if (!options.targetId) fail("close requires --target-id <exact-created-target-id>")
  output({action, checkout, selector: config.selector, closed: await closeTarget(config, options.targetId, cdpPort)})
  process.exit(0)
}

const selected = await selectTarget(config, action === "open", options.targetId, cdpPort)
const target = selected.target
if (action === "target") output({action, ...targetResult(config, target), currentUrl: target.url})
else await withPage(target, async (cdp) => {
  await setFocusEmulation(cdp, false)
  if (selected.navigate) await navigateAndWait(cdp, config.targetUrl, config.ready)
  if (action === "open") {
    await waitReady(cdp, config.ready)
    output({action, ...targetResult(config, target), dom: await readDom(cdp, config.canvas.selector)})
  } else if (action === "reload") {
    await reloadAndWait(cdp, config.ready)
    output({action, ...targetResult(config, target), dom: await readDom(cdp, config.canvas.selector)})
  } else if (action === "dom") {
    await waitReady(cdp, config.ready)
    output({action, ...targetResult(config, target), dom: await readDom(cdp, config.canvas.selector)})
  } else if (action === "console") {
    await waitReady(cdp, config.ready)
    const collector = await createConsoleCollector(cdp)
    await Bun.sleep(options.durationMs)
    collector.stop()
    if (consoleErrors(collector.entries).length > 0) process.exitCode = 1
    output({action, ...targetResult(config, target), durationMs: options.durationMs, entries: collector.entries})
  } else if (action === "canvas") {
    await waitReady(cdp, config.ready)
    const destination = options.output ?? fail("canvas requires --output <png>")
    const capture = await captureCanvas(cdp, config, destination, true)
    output({action, ...targetResult(config, target), capture})
    if (!capture.written) process.exitCode = 1
  } else if (action === "viewports") {
    const result = await runViewports(cdp, config, target, options)
    output(result)
    if (result.outcome === "starting-or-idle-black") process.exitCode = 1
  } else if (action === "touch") {
    if (!config.canvas.touch) fail(`touch is unsupported for ${config.selector ?? config.targetUrl}`)
    output(await runTouch(cdp, config, target))
  } else if (action === "profile") {
    output(await runProfile(cdp, config, target, options.frames))
  }
})

function parseOptions(args: readonly string[]): Options {
  let route: string | undefined
  let targetId: string | undefined
  let outputPath: string | undefined
  let outputDir: string | undefined
  let canvasSelector: string | undefined
  let durationMs = 1000
  let frames = 60
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    const value = args[index + 1]
    if (!value) fail(`missing value for ${key}`)
    if (key === "--route") route = value
    else if (key === "--target-id") targetId = value
    else if (key === "--output") outputPath = value
    else if (key === "--output-dir") outputDir = value
    else if (key === "--canvas-selector") canvasSelector = value
    else if (key === "--duration-ms") durationMs = positiveInteger(value, key)
    else if (key === "--frames") frames = positiveInteger(value, key)
    else fail(`unknown option: ${key}`)
    index++
  }
  return {route, targetId, output: outputPath, outputDir, canvasSelector, durationMs, frames}
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) fail(`${label} must be a positive integer`)
  return parsed
}

function validateCheckout(path: string): void {
  const result = Bun.spawnSync(["git", "-C", path, "rev-parse", "--show-toplevel"])
  if (result.exitCode !== 0) fail(`not a Git checkout: ${path}`)
  const root = result.stdout.toString().trim()
  if (root !== path) fail(`pass the exact checkout root, got: ${path}`)
}

function resolveTargetConfig(registry: Registry, checkout: string, input: string, options: Options): TargetConfig {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const targetUrl = options.route === undefined
      ? new URL(input).href
      : playgroundTargetUrl(new URL(input).origin, options.route)
    return {
      checkout,
      selector: null,
      package: null,
      origin: null,
      targetUrl,
      ready: null,
      canvas: {selector: options.canvasSelector ?? "canvas", capability: "none", touch: false},
      testOverride: false,
    }
  }

  const descriptor = registry.selectors[input]
  if (!descriptor) fail(`unknown playground selector: ${input}`)
  if (!descriptor.supported) fail(`unsupported selector ${input}: ${descriptor.reason}`)
  const packageCwd = join(checkout, descriptor.cwd)
  if (!Bun.file(join(packageCwd, "package.json")).size) fail(`registry package cwd is missing: ${packageCwd}`)

  let port = descriptor.port
  let testOverride = false
  if (Bun.env.UI_DEV_TEST_PORT) {
    if (Bun.env.UI_DEV_TEST_MODE !== "1") fail("UI_DEV_TEST_PORT requires UI_DEV_TEST_MODE=1")
    port = positiveInteger(Bun.env.UI_DEV_TEST_PORT, "UI_DEV_TEST_PORT")
    if (port > 65535) fail("UI_DEV_TEST_PORT must be <= 65535")
    testOverride = true
  }
  const origin = `http://${descriptor.host}:${port}`
  if (!testOverride && origin !== descriptor.origin) fail(`registry origin mismatch for ${input}`)
  const route = options.route ?? descriptor.routes.default
  return {
    checkout,
    selector: input,
    package: descriptor.package,
    origin,
    targetUrl: playgroundTargetUrl(origin, route),
    ready: descriptor.ready,
    canvas: {...descriptor.canvas, selector: options.canvasSelector ?? descriptor.canvas.selector},
    testOverride,
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} returned ${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function listTargets(port: number): Promise<Target[]> {
  return fetchJson<Target[]>(`http://127.0.0.1:${port}/json/list`)
}

async function exactTarget(url: string, create: boolean, port: number): Promise<Target> {
  let matches = (await listTargets(port)).filter((target) => target.type === "page" && target.url === url)
  if (matches.length === 0 && create) {
    const version = await fetchJson<{webSocketDebuggerUrl?: string}>(`http://127.0.0.1:${port}/json/version`)
    if (!version.webSocketDebuggerUrl) throw new Error(`browser CDP websocket is unavailable on ${port}`)
    await withCdp(version.webSocketDebuggerUrl, async (cdp) => {
      await cdp.send("Target.createTarget", {url, background: true})
    })
    for (let attempt = 0; attempt < 50; attempt++) {
      matches = (await listTargets(port)).filter((target) => target.type === "page" && target.url === url)
      if (matches.length > 0) break
      await Bun.sleep(100)
    }
  }
  if (matches.length === 0) throw new Error(`no exact background target: ${url}; run open`)
  if (matches.length !== 1) throw new Error(`ambiguous exact background targets for ${url}: ${matches.map(({id}) => id).join(",")}`)
  if (!matches[0]!.webSocketDebuggerUrl) throw new Error(`target websocket is missing: ${matches[0]!.id}`)
  return matches[0]!
}

async function candidateTargets(config: TargetConfig, port: number): Promise<Target[]> {
  const pages = (await listTargets(port)).filter((target) => target.type === "page")
  if (config.origin === null) return pages.filter((target) => target.url === config.targetUrl)
  return pages.filter((target) => targetOrigin(target.url) === config.origin)
}

async function selectTarget(
  config: TargetConfig,
  create: boolean,
  requestedId: string | undefined,
  port: number,
): Promise<{target: Target; navigate: boolean}> {
  if (config.origin === null) {
    const target = await exactTarget(config.targetUrl, create, port)
    return {target, navigate: false}
  }

  let candidates = await candidateTargets(config, port)
  if (requestedId !== undefined) {
    candidates = candidates.filter((candidate) => candidate.id === requestedId)
    if (candidates.length !== 1) throw new Error(`target ${requestedId} is not an existing ${config.selector} target at ${config.origin}`)
  } else if (candidates.length > 1) {
    throw new Error(`ambiguous ${config.selector} targets at ${config.origin}; pass --target-id or reconcile exact created duplicates: ${candidates.map(({id, url}) => `${id}=${url}`).join(",")}`)
  }

  if (candidates.length === 0 && create) {
    const created = await exactTarget(config.targetUrl, true, port)
    return {target: created, navigate: false}
  }
  if (candidates.length === 0) throw new Error(`no background target for ${config.selector} at ${config.origin}; run open`)
  const target = candidates[0]!
  if (!target.webSocketDebuggerUrl) throw new Error(`target websocket is missing: ${target.id}`)
  return {target, navigate: target.url !== config.targetUrl}
}

async function closeTarget(config: TargetConfig, targetId: string, port: number): Promise<{id: string; url: string}> {
  if (config.origin === null) throw new Error("close is supported only for registry selectors")
  const candidate = (await candidateTargets(config, port)).find(({id}) => id === targetId)
  if (!candidate) throw new Error(`refusing to close target outside ${config.selector} origin: ${targetId}`)
  const version = await fetchJson<{webSocketDebuggerUrl?: string}>(`http://127.0.0.1:${port}/json/version`)
  if (!version.webSocketDebuggerUrl) throw new Error(`browser CDP websocket is unavailable on ${port}`)
  await withCdp(version.webSocketDebuggerUrl, async (cdp) => {
    const result = await cdp.send<{success?: boolean}>("Target.closeTarget", {targetId})
    if (result.success !== true) throw new Error(`Target.closeTarget rejected ${targetId}`)
  })
  return {id: candidate.id, url: candidate.url}
}

function targetOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

class CdpConnection {
  readonly #socket: WebSocket
  readonly #pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  readonly #listeners = new Map<string, Set<(params: unknown) => void>>()
  #sequence = 0

  private constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener("message", (event) => this.#message(String(event.data)))
    socket.addEventListener("close", () => {
      for (const [id, pending] of this.#pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`CDP closed before response ${id}`))
      }
      this.#pending.clear()
    })
  }

  static async open(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error(`CDP connection timeout: ${url}`)), 5000)
      socket.addEventListener("open", () => {
        clearTimeout(timer)
        resolveOpen()
      }, {once: true})
      socket.addEventListener("error", () => {
        clearTimeout(timer)
        rejectOpen(new Error(`CDP connection failed: ${url}`))
      }, {once: true})
    })
    return new CdpConnection(socket)
  }

  send<T = JsonObject>(method: string, params: unknown = {}): Promise<T> {
    return new Promise<T>((resolveSend, rejectSend) => {
      const id = ++this.#sequence
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        rejectSend(new Error(`CDP command timeout: ${method}`))
      }, 15000)
      this.#pending.set(id, {
        resolve: (value) => resolveSend(value as T),
        reject: rejectSend,
        timer,
      })
      this.#socket.send(JSON.stringify({id, method, params}))
    })
  }

  on(method: string, listener: (params: unknown) => void): () => void {
    const listeners = this.#listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  close(): void {
    this.#socket.close()
  }

  #message(raw: string): void {
    const message = JSON.parse(raw) as {id?: number; method?: string; params?: unknown; result?: unknown; error?: {message?: string}}
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed"))
      else pending.resolve(message.result)
      return
    }
    if (message.method) {
      for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params)
    }
  }
}

async function withCdp<T>(url: string, operation: (cdp: CdpConnection) => Promise<T>): Promise<T> {
  const cdp = await CdpConnection.open(url)
  try {
    return await operation(cdp)
  } finally {
    cdp.close()
  }
}

async function withPage<T>(target: Target, operation: (cdp: CdpConnection) => Promise<T>): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`page websocket is missing: ${target.id}`)
  return withCdp(target.webSocketDebuggerUrl, operation)
}

async function setFocusEmulation(cdp: CdpConnection, enabled: boolean): Promise<void> {
  await cdp.send("Emulation.setFocusEmulationEnabled", {enabled})
}

async function evaluate<T>(cdp: CdpConnection, expression: string, awaitPromise = false): Promise<T> {
  const response = await cdp.send<{
    result?: {value?: T; description?: string}
    exceptionDetails?: {text?: string; exception?: {description?: string}}
  }>("Runtime.evaluate", {expression, awaitPromise, returnByValue: true})
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Runtime.evaluate failed")
  }
  return response.result?.value as T
}

function readyExpression(marker: ReadyMarker | null): string {
  const complete = "document.readyState === 'complete'"
  if (marker === null) return complete
  if (marker.kind === "dataset") {
    return `${complete} && document.documentElement.dataset[${JSON.stringify(marker.name)}] === ${JSON.stringify(marker.value)}`
  }
  return `${complete} && (() => { const canvas = document.querySelector(${JSON.stringify(marker.selector)}); return canvas instanceof HTMLCanvasElement && canvas.width >= ${marker.minBackingWidth} })()`
}

async function waitReady(cdp: CdpConnection, marker: ReadyMarker | null): Promise<void> {
  const expression = readyExpression(marker)
  for (let attempt = 0; attempt < 75; attempt++) {
    try {
      if (await evaluate<boolean>(cdp, expression)) return
    } catch {
      // Navigation briefly destroys the execution context.
    }
    await Bun.sleep(200)
  }
  throw new Error(`page did not reach ready marker: ${expression}`)
}

async function reloadAndWait(cdp: CdpConnection, marker: ReadyMarker | null): Promise<void> {
  await cdp.send("Page.enable")
  await cdp.send("Page.reload", {ignoreCache: false})
  await waitReady(cdp, marker)
}

async function navigateAndWait(cdp: CdpConnection, url: string, marker: ReadyMarker | null): Promise<void> {
  await cdp.send("Page.enable")
  const result = await cdp.send<{errorText?: string}>("Page.navigate", {url})
  if (result.errorText) throw new Error(`Page.navigate failed: ${result.errorText}`)
  await waitReady(cdp, marker)
}

async function readDom(cdp: CdpConnection, canvasSelector: string): Promise<JsonObject> {
  return evaluate<JsonObject>(cdp, `(() => {
    const canvas = document.querySelector(${JSON.stringify(canvasSelector)})
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      dataset: {...document.documentElement.dataset},
      inner: [innerWidth, innerHeight, devicePixelRatio],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      canvas: canvas instanceof HTMLCanvasElement
        ? [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]
        : null,
    }
  })()`)
}

async function readCanvasSnapshot(cdp: CdpConnection, selector: string): Promise<RawCanvasSnapshot> {
  return evaluate<RawCanvasSnapshot>(cdp, `(async () => {
    const canvas = document.querySelector(${JSON.stringify(selector)})
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 1 || canvas.height < 1) {
      return {dataUrl:null, probe:null}
    }
    const dataUrl = canvas.toDataURL("image/png")
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const probe = document.createElement("canvas")
    probe.width = Math.min(128, bitmap.width)
    probe.height = Math.min(128, bitmap.height)
    const context = probe.getContext("2d", {willReadFrequently:true})
    if (context === null) {
      bitmap.close()
      return {dataUrl, probe:null}
    }
    context.drawImage(bitmap, 0, 0, probe.width, probe.height)
    bitmap.close()
    return {
      dataUrl,
      probe:{
        width:probe.width,
        height:probe.height,
        rgba:Array.from(context.getImageData(0, 0, probe.width, probe.height).data),
      },
    }
  })()`, true)
}

async function captureCanvas(
  cdp: CdpConnection,
  config: TargetConfig,
  outputPath: string,
  retryStartingBlack: boolean,
): Promise<CanvasEvidence> {
  const common = {
    destination: outputPath,
    snapshot: () => readCanvasSnapshot(cdp, config.canvas.selector),
  }
  return retryStartingBlack
    ? acceptCanvasEvidence({
        ...common,
        retryAfterBlack: () => awaitCanvasRendererActivity(cdp, config),
      })
    : acceptCanvasEvidence(common)
}

async function awaitCanvasRendererActivity(cdp: CdpConnection, config: TargetConfig): Promise<void> {
  await setFocusEmulation(cdp, true)
  try {
    await navigateAndWait(cdp, config.targetUrl, config.ready)
    const activity = await evaluate<{frames: number; timedOut: boolean}>(cdp, `new Promise((resolve) => {
      window.dispatchEvent(new Event("resize"))
      let settled = false
      let frames = 0
      const finish = (timedOut) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({frames, timedOut})
      }
      const timeout = setTimeout(() => finish(true), 2000)
      const step = () => {
        frames++
        if (frames < 2) requestAnimationFrame(step)
        else setTimeout(() => finish(false), 250)
      }
      requestAnimationFrame(step)
    })`, true)
    if (activity.timedOut || activity.frames < 2) {
      throw new Error(`canvas renderer activity timed out after ${activity.frames} frames`)
    }
  } finally {
    await setFocusEmulation(cdp, false)
  }
}

async function createConsoleCollector(cdp: CdpConnection) {
  const entries: ConsoleEntry[] = []
  const removeConsole = cdp.on("Runtime.consoleAPICalled", (raw) => {
    const event = raw as {type?: string; timestamp?: number; args?: Array<{value?: unknown; description?: string}>}
    const text = (event.args ?? []).map((arg) => arg.value === undefined ? arg.description ?? "" : printable(arg.value)).join(" ")
    entries.push({source: "console", level: event.type ?? "log", text, timestamp: event.timestamp})
  })
  const removeLog = cdp.on("Log.entryAdded", (raw) => {
    const entry = (raw as {entry?: {level?: string; text?: string; timestamp?: number; url?: string; lineNumber?: number}}).entry
    if (!entry) return
    entries.push({source: "log", level: entry.level ?? "info", text: entry.text ?? "", timestamp: entry.timestamp, url: entry.url, line: entry.lineNumber})
  })
  await cdp.send("Runtime.enable")
  await cdp.send("Log.enable")
  return {entries, stop: () => { removeConsole(); removeLog() }}
}

function printable(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function consoleErrors(entries: readonly ConsoleEntry[]): readonly ConsoleEntry[] {
  return entries.filter(({level}) => level === "error")
}

async function forceClearMetrics(cdp: CdpConnection): Promise<void> {
  await cdp.send("Emulation.clearDeviceMetricsOverride")
  await cdp.send("Emulation.setDeviceMetricsOverride", {width: 0, height: 0, deviceScaleFactor: 0, mobile: false})
  await cdp.send("Emulation.clearDeviceMetricsOverride")
  await cdp.send("Emulation.setTouchEmulationEnabled", {enabled: false})
}

async function setMobile(cdp: CdpConnection, width: number, height: number): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 2, mobile: true})
  await cdp.send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 2})
}

function validateViewport(label: string, dom: JsonObject, width?: number, height?: number): void {
  const inner = dom.inner as number[] | undefined
  const scroll = dom.scroll as number[] | undefined
  if (!inner || !scroll) throw new Error(`${label}: missing viewport metrics`)
  if (width !== undefined && height !== undefined && (inner[0] !== width || inner[1] !== height)) {
    throw new Error(`${label}: expected ${width}x${height}, got ${inner[0]}x${inner[1]}`)
  }
  if (scroll[0] !== inner[0]) throw new Error(`${label}: horizontal overflow ${scroll[0]} > ${inner[0]}`)
}

async function runViewports(cdp: CdpConnection, config: TargetConfig, target: Target, options: Options): Promise<JsonObject> {
  await setFocusEmulation(cdp, true)
  const collector = await createConsoleCollector(cdp)
  const captures: JsonObject = {}
  const result: JsonObject = {
    action: "viewports",
    ...targetResult(config, target),
    captures,
    rendererActivityEmulation: true,
    physicalDeviceProof: false,
    ownerAcceptance: false,
  }
  let failure: unknown = null
  let cursor = collector.entries.length
  let native: JsonObject | null = null
  try {
    await forceClearMetrics(cdp)
    await reloadAndWait(cdp, config.ready)
    native = await readDom(cdp, config.canvas.selector)
    validateViewport("desktop", native)
    const desktopEntries = collector.entries.slice(cursor)
    if (consoleErrors(desktopEntries).length > 0) throw new Error(`desktop: console errors ${JSON.stringify(consoleErrors(desktopEntries))}`)
    result.desktop = {dom: native, console: desktopEntries}
    if (options.outputDir) {
      const capture = await captureCanvas(cdp, config, join(options.outputDir, "desktop.png"), false)
      captures.desktop = capture
      if (!capture.written) throw new CanvasEvidenceRejected(capture)
    }

    for (const [label, width, height] of [["portrait", 390, 844], ["landscape", 844, 390]] as const) {
      cursor = collector.entries.length
      await setMobile(cdp, width, height)
      await reloadAndWait(cdp, config.ready)
      const dom = await readDom(cdp, config.canvas.selector)
      validateViewport(label, dom, width, height)
      const entries = collector.entries.slice(cursor)
      if (consoleErrors(entries).length > 0) throw new Error(`${label}: console errors ${JSON.stringify(consoleErrors(entries))}`)
      result[label] = {dom, console: entries}
      if (options.outputDir) {
        const capture = await captureCanvas(cdp, config, join(options.outputDir, `${label}.png`), false)
        captures[label] = capture
        if (!capture.written) throw new CanvasEvidenceRejected(capture)
      }
    }
  } catch (error) {
    failure = error
  } finally {
    try {
      await forceClearMetrics(cdp)
      await reloadAndWait(cdp, config.ready)
      await setFocusEmulation(cdp, false)
      const restored = await readDom(cdp, config.canvas.selector)
      result.restored = restored
      result.nativeMetricsRestored = native !== null && JSON.stringify(native.inner) === JSON.stringify(restored.inner)
      if (result.nativeMetricsRestored !== true && failure === null) failure = new Error(`native metrics were not restored`)
    } catch (restoreError) {
      failure = failure === null ? restoreError : new Error(`${errorText(failure)}; restore failed: ${errorText(restoreError)}`)
    }
    collector.stop()
    await setFocusEmulation(cdp, false)
  }
  if (failure instanceof CanvasEvidenceRejected) {
    result.outcome = failure.evidence.kind
    result.written = false
    return result
  }
  if (failure !== null) throw failure
  return result
}

class CanvasEvidenceRejected extends Error {
  readonly evidence: CanvasEvidence

  constructor(evidence: CanvasEvidence) {
    super(evidence.kind)
    this.evidence = evidence
  }
}

async function runTouch(cdp: CdpConnection, config: TargetConfig, target: Target): Promise<JsonObject> {
  let native: JsonObject | null = null
  let result: JsonObject = {action: "touch", ...targetResult(config, target)}
  let failure: unknown = null
  try {
    await forceClearMetrics(cdp)
    await reloadAndWait(cdp, config.ready)
    native = await readDom(cdp, config.canvas.selector)
    await setMobile(cdp, 390, 844)
    await reloadAndWait(cdp, config.ready)
    const selector = JSON.stringify(config.canvas.selector)
    const touch = await evaluate<JsonObject>(cdp, `(() => {
      const canvas = document.querySelector(${selector})
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("touch canvas not found")
      const snapshot = () => ({
        x: Number(document.documentElement.dataset.canvasX),
        y: Number(document.documentElement.dataset.canvasY),
        scale: Number(document.documentElement.dataset.canvasScale),
      })
      const valid = (value) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.scale)
      const point = (id, x, y) => new Touch({identifier:id, target:canvas, clientX:x, clientY:y, screenX:x, screenY:y, radiusX:4, radiusY:4, force:1})
      const emit = (target, type, touches, changedTouches) => target.dispatchEvent(new TouchEvent(type, {bubbles:true, cancelable:true, touches, targetTouches:touches, changedTouches}))
      const before = snapshot()
      const oneStart = point(1, 200, 300)
      emit(canvas, "touchstart", [oneStart], [oneStart])
      const oneMove = point(1, 230, 340)
      emit(window, "touchmove", [oneMove], [oneMove])
      emit(window, "touchend", [], [oneMove])
      const pan = snapshot()
      const a = point(1, 130, 360)
      const b = point(2, 260, 360)
      emit(canvas, "touchstart", [a,b], [a,b])
      const c = point(1, 80, 360)
      const d = point(2, 310, 360)
      emit(window, "touchmove", [c,d], [c,d])
      emit(window, "touchend", [], [c,d])
      const pinch = snapshot()
      return {
        evidence:"synthetic-page-touch", before, pan, pinch,
        panChanged:valid(pan) && (!valid(before) || pan.x !== before.x || pan.y !== before.y),
        pinchChanged:valid(pan) && valid(pinch) && pinch.scale > pan.scale,
        physicalDeviceProof:false, ownerAcceptance:false,
      }
    })()`)
    if (touch.panChanged !== true || touch.pinchChanged !== true) throw new Error(`touch transform did not change: ${JSON.stringify(touch)}`)
    result = {...result, touch}
  } catch (error) {
    failure = error
  } finally {
    try {
      await forceClearMetrics(cdp)
      await reloadAndWait(cdp, config.ready)
      const restored = await readDom(cdp, config.canvas.selector)
      result.restored = restored
      result.nativeMetricsRestored = native !== null && JSON.stringify(native.inner) === JSON.stringify(restored.inner)
      if (result.nativeMetricsRestored !== true && failure === null) failure = new Error("native metrics were not restored after touch")
    } catch (restoreError) {
      failure = failure === null ? restoreError : new Error(`${errorText(failure)}; restore failed: ${errorText(restoreError)}`)
    }
  }
  if (failure !== null) throw failure
  return result
}

async function runProfile(cdp: CdpConnection, config: TargetConfig, target: Target, frames: number): Promise<JsonObject> {
  await setFocusEmulation(cdp, true)
  await waitReady(cdp, config.ready)
  await cdp.send("Performance.enable", {timeDomain: "timeTicks"})
  try {
    const dom = await readDom(cdp, config.canvas.selector)
    const heapBefore = await cdp.send<JsonObject>("Runtime.getHeapUsage")
    const metricsBefore = await performanceMetrics(cdp)
    const frameEvidence = await evaluate<JsonObject>(cdp, `new Promise((resolve) => {
      const deltas = []
      let previous = null
      const step = (now) => {
        if (previous !== null) deltas.push(now - previous)
        previous = now
        if (deltas.length >= ${frames}) {
          resolve({count:deltas.length, durationMs:deltas.reduce((sum, value) => sum + value, 0), meanMs:deltas.reduce((sum, value) => sum + value, 0) / deltas.length, maxMs:Math.max(...deltas), deltas})
        } else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })`, true)
    const metricsAfter = await performanceMetrics(cdp)
    const heapAfter = await cdp.send<JsonObject>("Runtime.getHeapUsage")
    return {
      action: "profile",
      ...targetResult(config, target),
      dom,
      rendererActivityEmulation: true,
      performance: {before: metricsBefore, after: metricsAfter},
      heap: {
        before: heapBefore,
        after: heapAfter,
        usedSizeDelta: Number(heapAfter.usedSize) - Number(heapBefore.usedSize),
      },
      frames: frameEvidence,
      gpu: {
        status: "external-capture-required",
        sourceInstrumented: false,
        workflow: "references/profiling.md#external-webgpu-inspector",
        gpuTimeMeasured: false,
      },
      ownerAcceptance: false,
    }
  } finally {
    try {
      await cdp.send("Performance.disable")
    } finally {
      await setFocusEmulation(cdp, false)
    }
  }
}

async function performanceMetrics(cdp: CdpConnection): Promise<Record<string, number>> {
  const response = await cdp.send<{metrics?: Array<{name: string; value: number}>}>("Performance.getMetrics")
  return Object.fromEntries((response.metrics ?? []).map(({name, value}) => [name, value]))
}

function targetResult(config: TargetConfig, target: Target): JsonObject {
  return {
    checkout: config.checkout,
    selector: config.selector,
    package: config.package,
    targetId: target.id,
    targetUrl: config.targetUrl,
    testOverride: config.testOverride,
    backgroundOnly: true,
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function output(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function fail(message: string): never {
  throw new Error(message)
}
