import {Element, DisplayElement, HUDElement, type Node, type Presentation} from "@zavx0z/immersive"
import type {ClientCapture, ClientDiagnostics, ClientDiagnosticsOptions} from "@metafor/types/cosmos/client"

const NODE_LIMIT = 50_000, PROJECTION_LIMIT = 32, RECORD_LIMIT = 128, RESOURCE_LIMIT = 64, INTERVAL_LIMIT = 240, LONG_TASK_LIMIT = 64
const CAPTURE_BYTES = 8 * 1024 * 1024
type ReadyPresentation = Pick<Presentation, "document" | "getProjection" | "subscribePresented" | "presentedFrame" | "captureLastPresentedFramePng" | "disposed">
type PerformanceSource = Pick<Performance, "now" | "getEntriesByType">
type Observer = {observe(options: PerformanceObserverInit): void; disconnect(): void}
type ObserverFactory = (callback: (entries: Array<{startTime: number; duration: number}>) => void) => Observer
const bounded = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(value, 1e9)) : 0
const coordinate = (value: number) => Number.isFinite(value) ? Math.max(-1e9, Math.min(value, 1e9)) : 0
const unsupported = (message: string) => Object.assign(new Error(message), {code: "unsupported"})

/**
Читает только уже готовую public Presentation. Дерево, projection frames и boxes
имеют явные пределы; presented cadence не выдаётся за CPU layout или GPU timing.
Подписки живут только во время запрошенного sample и снимаются при abort/dispose.
Capture использует только captureLastPresentedFramePng; нового render, RAF,
Inspector loader, OS capture или private renderer fields здесь нет.
Владение — [Visual](../README.md#совместная-работа-с-клиентом).
*/
export function createClientDiagnostics(presentation: ReadyPresentation, options: {
  viewport?: () => {width: number; height: number; devicePixelRatio: number}
  performance?: PerformanceSource | null
  observerFactory?: ObserverFactory | null
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
} = {}) {
  const lifetime = new AbortController()
  const performance = options.performance === undefined ? globalThis.performance ?? null : options.performance
  const now = () => performance?.now() ?? Date.now()
  const viewport = options.viewport ?? (() => ({width: globalThis.innerWidth ?? 0, height: globalThis.innerHeight ?? 0, devicePixelRatio: globalThis.devicePixelRatio ?? 1}))
  const ObserverClass = globalThis.PerformanceObserver
  const observerFactory = options.observerFactory === undefined
    ? typeof ObserverClass === "function" && ObserverClass.supportedEntryTypes.includes("longtask")
      ? (callback: Parameters<ObserverFactory>[0]) => new ObserverClass(list => callback(list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration}))))
      : null
    : options.observerFactory
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();lifetime.signal.throwIfAborted()
    if (presentation.disposed) throw Object.assign(new Error("Presentation is disposed"), {code: "disconnected"})
  }
  let capturing = false
  return {
    async diagnostics(request: ClientDiagnosticsOptions, inputSignal: AbortSignal): Promise<ClientDiagnostics> {
      const signal = AbortSignal.any([inputSignal, lifetime.signal]);check(signal)
      const started = now(), limit = request.limit ?? 64, after = request.afterIndex ?? 0, sampleMs = request.sampleMs ?? 0
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > RECORD_LIMIT || !Number.isSafeInteger(after) || after < 0 || after > 1_000_000 || !Number.isSafeInteger(sampleMs) || sampleMs !== 0 && (sampleMs < 1000 || sampleMs > 3000)) throw new Error("Invalid bounded diagnostics request")
      const semantic = {nodes: 0, elements: 0, displays: 0, huds: 0, complete: true, scanLimit: NODE_LIMIT}
      const owners: Array<DisplayElement | HUDElement> = []
      const stack: Array<{node: Node; children: readonly Node[]; index: number; entered: boolean}> = [{node: presentation.document, children: presentation.document.childNodes, index: 0, entered: false}]
      while (stack.length && semantic.nodes < NODE_LIMIT) {
        const top = stack.at(-1)!
        if (!top.entered) {
          top.entered = true;semantic.nodes++
          if (top.node instanceof Element) semantic.elements++
          if (top.node instanceof DisplayElement) semantic.displays++
          if (top.node instanceof HUDElement) semantic.huds++
          if ((top.node instanceof DisplayElement || top.node instanceof HUDElement) && owners.length < PROJECTION_LIMIT) owners.push(top.node)
        }
        const child = top.children[top.index++]
        if (child) stack.push({node: child, children: child.childNodes, index: 0, entered: false})
        else stack.pop()
      }
      semantic.complete = stack.length === 0
      const projections: ClientDiagnostics["projections"] = [], boxes: ClientDiagnostics["boxes"] = []
      let total = 0
      for (const owner of owners) {
        check(signal)
        let frame: ReturnType<ReturnType<ReadyPresentation["getProjection"]>["readFrame"]> = null
        try {frame = presentation.getProjection(owner).readFrame()} catch {}
        const index = projections.length
        projections.push({index, kind: owner instanceof HUDElement ? "hud" : "display", id: owner.getAttribute("id")?.slice(0, 128) ?? null,
          available: frame !== null, revision: frame?.revision ?? null, viewport: frame ? {width: bounded(frame.viewport.width), height: bounded(frame.viewport.height)} : null,
          boxes: frame?.boxes.length ?? 0, displayItems: frame?.displayList.length ?? 0, hits: frame?.hits.size ?? 0, scrolls: frame?.scrolls.size ?? 0})
        if (frame) {
          const first = Math.max(0, after - total), end = Math.min(frame.boxes.length, first + limit - boxes.length)
          for (let offset = first; offset < end; offset++) {
            const box = frame.boxes[offset]!, element = box.node instanceof Element ? box.node : null
            boxes.push({index: total + offset, projection: index, tag: element?.tagName.toLowerCase().slice(0, 32) ?? null, id: element?.getAttribute("id")?.slice(0, 128) ?? null,
              x: coordinate(box.x), y: coordinate(box.y), width: bounded(box.width), height: bounded(box.height)})
          }
          total += frame.boxes.length
        }
      }
      const resources: ClientDiagnostics["resources"] = []
      let resourcesAvailable = typeof performance?.getEntriesByType === "function", resourcesTruncated = false
      if (resourcesAvailable) try {
        const entries = performance!.getEntriesByType("resource") as PerformanceResourceTiming[]
        resourcesTruncated = entries.length > RESOURCE_LIMIT
        for (const entry of entries.slice(-RESOURCE_LIMIT)) {
          let url = "unavailable"
          try {const parsed = new URL(entry.name.slice(0, 4096));url = /^https?:$/u.test(parsed.protocol) ? parsed.origin + parsed.pathname : parsed.protocol + "[inline]"} catch {}
          const size = (value: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
          resources.push({url: url.slice(0, 1024), initiatorType: entry.initiatorType.slice(0, 64), durationMs: bounded(entry.duration),
            transferBytes: size(entry.transferSize), encodedBytes: size(entry.encodedBodySize), decodedBytes: size(entry.decodedBodySize)})
        }
      } catch {resourcesAvailable = false}
      const sample: ClientDiagnostics["sample"] = {requestedMs: sampleMs, elapsedMs: 0, presentedEvents: 0, intervalsMs: [], intervalsTruncated: false, longTasks: [], longTasksTruncated: false}
      let longTasksAvailable = observerFactory !== null
      if (sampleMs) {
        const sampleStart = now();let previous: number | undefined, observer: Observer | undefined
        const stop = presentation.subscribePresented(() => {
          const stamp = now();sample.presentedEvents++
          if (previous !== undefined) {if (sample.intervalsMs.length < INTERVAL_LIMIT) sample.intervalsMs.push(bounded(stamp - previous));else sample.intervalsTruncated = true}
          previous = stamp
        })
        try {
          if (observerFactory) try {
            observer = observerFactory(entries => {for (const entry of entries) {if (sample.longTasks.length < LONG_TASK_LIMIT) sample.longTasks.push({startTime: bounded(entry.startTime), durationMs: bounded(entry.duration)});else sample.longTasksTruncated = true}})
            observer.observe({type: "longtask", buffered: false})
          } catch {longTasksAvailable = false;observer?.disconnect();observer = undefined}
          await (options.wait ?? wait)(sampleMs, signal);check(signal)
          sample.elapsedMs = bounded(now() - sampleStart)
        } finally {stop();observer?.disconnect()}
      }
      check(signal)
      const actual = viewport()
      return {schema: "cosmos/client-diagnostics/v1", version: 1, durationMs: bounded(now() - started),
        viewport: {width: bounded(actual.width), height: bounded(actual.height), devicePixelRatio: bounded(actual.devicePixelRatio)}, semantic,
        projections, projectionsComplete: semantic.complete && semantic.displays + semantic.huds <= PROJECTION_LIMIT,
        boxes, page: {cursor: Math.min(total, after + boxes.length), total, truncated: after + boxes.length < total}, sample, resources, resourcesTruncated,
        availability: {presentedIntervals: {available: true, reason: null}, longTasks: {available: longTasksAvailable, reason: longTasksAvailable ? null : "Browser Long Tasks API is unavailable"},
          resources: {available: resourcesAvailable, reason: resourcesAvailable ? null : "Browser Resource Timing API is unavailable"},
          cpuLayoutTime: {available: false, reason: "Public Presentation exposes no CPU layout duration counter"},
          drawCalls: {available: false, reason: "Public Presentation exposes no GPU draw-call counter"}, gpuTime: {available: false, reason: "Public Presentation exposes no GPU timestamp counter"}},
        timings: {cpuLayoutMs: null, drawCalls: null, gpuMs: null}}
    },
    async capture(inputSignal: AbortSignal): Promise<ClientCapture> {
      const signal = AbortSignal.any([inputSignal, lifetime.signal]);check(signal)
      if (capturing) throw new Error("Presentation capture is already running")
      capturing = true
      try {
        const started = now(), presentedBefore = presentation.presentedFrame
        const blob = await presentation.captureLastPresentedFramePng();check(signal)
        if (!blob) throw unsupported("No presented PNG frame is available")
        if (blob.type !== "image/png" || blob.size < 33 || blob.size > CAPTURE_BYTES) throw new Error("Presented PNG exceeds the bounded capture contract")
        const bytes = new Uint8Array(await blob.arrayBuffer());check(signal)
        if (bytes.byteLength !== blob.size || [137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value) || String.fromCharCode(...bytes.subarray(12,16))!=="IHDR") throw new Error("Presented frame is not PNG")
        const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = header.getUint32(16), height = header.getUint32(20)
        if (!width || !height || width > 65_536 || height > 65_536) throw new Error("Presented PNG dimensions are invalid")
        const pieces: string[] = []
        for (let offset=0;offset<bytes.byteLength;offset+=24_576) pieces.push(btoa(String.fromCharCode(...bytes.subarray(offset,offset+24_576))))
        return {schema: "cosmos/client-capture/v1", version: 1, mimeType: "image/png", width, height, byteLength: bytes.byteLength, pngBase64: pieces.join(""),
          presentedBefore, presentedAfter: presentation.presentedFrame, durationMs: bounded(now() - started)}
      } finally {capturing = false}
    },
    dispose() {lifetime.abort(new Error("Client diagnostics owner disposed"))},
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{const aborted=()=>{clearTimeout(timer);signal.removeEventListener("abort",aborted);reject(signal.reason)}
    const timer=setTimeout(()=>{signal.removeEventListener("abort",aborted);resolve()},milliseconds);signal.addEventListener("abort",aborted,{once:true})})
}
