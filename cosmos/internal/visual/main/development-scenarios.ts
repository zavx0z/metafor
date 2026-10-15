import type {Document} from "@zavx0z/immersive"
import {createSourceScenarioReportPresentation, type SourceScenarioModel, type SourceScenarioReport,
  type SourceScenarioSnapshot} from "@zavx0z/storybook-app-web-page-package/content"
import {DEVELOPMENT_PATH} from "../../../release/shared/development"

type Listing = Readonly<{packageName: string; nodeId: string; sources: readonly Readonly<{path: string; digest: string}>[]; revision: string}>

async function request(path: string, body: object, signal: AbortSignal): Promise<Response> {
  const reader = await fetch(`${DEVELOPMENT_PATH}/reader`, {method: "POST", headers: {"content-type": "application/json"}, body: "{}", signal})
  if (!reader.ok) throw new Error("Не удалось назначить чтение сценария")
  const grant = await reader.json()
  if (typeof grant.readerToken !== "string") throw new Error("Некорректный reader grant сценария")
  return fetch(`${DEVELOPMENT_PATH}/scenarios/${path}`, {method: "POST", signal,
    headers: {"content-type": "application/json", "x-storybook-session": grant.readerToken,
      ...(path === "run" ? {accept: "application/x-ndjson"} : {})}, body: JSON.stringify(body)})
}

async function responseError(response: Response): Promise<Error> {
  const value = await response.json().catch(() => null)
  return new Error(typeof value?.error === "string" ? value.error
    : typeof value?.error?.message === "string" ? value.error.message : "Сценарий недоступен")
}

async function runScenario(body: object, signal: AbortSignal,
  onProgress: (value: Readonly<{phase: string; text?: string}>) => void): Promise<SourceScenarioReport> {
  const response = await request("run", body, signal)
  if (!response.ok) throw await responseError(response)
  if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body)
    throw new Error("Нет потока выполнения сценария")
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let pending = "", result: SourceScenarioReport | null = null
  const line = (text: string) => {
    if (!text.trim()) return
    const event = JSON.parse(text)
    if (event.type === "progress") onProgress(event.progress)
    else if (event.type === "result") result = event.result
    else if (event.type === "error") throw new Error(event.error)
    else throw new Error("Неизвестное сообщение сценария")
  }
  const cancel = () => {void reader.cancel(signal.reason).catch(() => {})}
  signal.addEventListener("abort", cancel, {once: true})
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, {stream: true})
      let end: number
      while ((end = pending.indexOf("\n")) >= 0) {
        line(pending.slice(0, end))
        pending = pending.slice(end + 1)
      }
      if (chunk.done) break
    }
    if (pending) line(pending)
    signal.throwIfAborted()
    if (!result) throw new Error("Поток завершился без отчёта сценария")
    return result
  } finally {
    signal.removeEventListener("abort", cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Один same-Document view сохраняется при навигации по узлам Package. */
export function createDevelopmentScenarioPresentation(document: Document, packageName: string) {
  const listeners = new Set<() => void>()
  let selectedNode: string | null = null
  let generation = 0, disposed = false, requestController: AbortController | null = null
  let snapshot: SourceScenarioSnapshot = {sources: [], selectedPath: null, status: "idle", output: "", report: null, error: null}
  const publish = (next: SourceScenarioSnapshot) => {snapshot = next; for (const listener of listeners) listener()}
  const model: SourceScenarioModel = {
    getSnapshot: () => snapshot,
    subscribe(listener) {listeners.add(listener); return () => {listeners.delete(listener)}},
    select(path) {
      if (!snapshot.sources.some(source => source.path === path)) throw new Error("Сценарий не принадлежит выбранному узлу")
      if (path === snapshot.selectedPath) return
      requestController?.abort()
      generation++
      publish({...snapshot, selectedPath: path, status: "idle", output: "", report: null, error: null})
    },
    run() {
      if (disposed || !selectedNode || !snapshot.selectedPath || snapshot.status === "running") return
      const source = snapshot.sources.find(value => value.path === snapshot.selectedPath)
      if (!source) return
      requestController?.abort()
      const controller = new AbortController(), current = generation
      requestController = controller
      publish({...snapshot, status: "running", phase: "Ожидание запуска", output: "", report: null, error: null})
      void runScenario({packageName, nodeId: selectedNode, sourcePath: source.path, expectedDigest: source.digest}, controller.signal,
        progress => {
          if (disposed || current !== generation || controller.signal.aborted) return
          publish({...snapshot, phase: progress.phase, output: (snapshot.output + (progress.text ?? "")).slice(-262_144)})
        }).then(report => {
        if (disposed || current !== generation || controller.signal.aborted) return
        if (report.sourcePath !== source.path || report.digest !== source.digest) throw new Error("Identity отчёта сценария изменилась")
        publish({...snapshot, status: "complete", report, error: null})
      }).catch(error => {
        if (disposed || current !== generation || controller.signal.aborted) return
        publish({...snapshot, status: "error", error: error instanceof Error ? error.message : "Сценарий не выполнен"})
      })
    },
  }
  const presentation = createSourceScenarioReportPresentation(document, model)
  return {...presentation, model, async configure(nodeId: string, sourcePaths: readonly string[], available = true) {
    if (disposed) throw new Error("Scenario presentation is disposed")
    requestController?.abort()
    const current = ++generation, controller = new AbortController()
    requestController = controller
    selectedNode = nodeId
    publish({sources: [], selectedPath: null, status: "idle", output: "", report: null, error: null})
    if (!sourcePaths.length) return
    if (!available) {
      publish({...snapshot, status: "error", error: "Для этого Package выполнение Bun Test не назначено"})
      return
    }
    try {
      const response = await request("list", {packageName, nodeId}, controller.signal)
      if (!response.ok) throw await responseError(response)
      const value = await response.json() as Listing
      if (value.packageName !== packageName || value.nodeId !== nodeId || !Array.isArray(value.sources) ||
        value.sources.some(source => !sourcePaths.includes(source.path) || typeof source.digest !== "string"))
        throw new Error("Некорректное назначение сценариев Package")
      if (disposed || current !== generation) return
      publish({...snapshot, sources: value.sources, selectedPath: value.sources[0]?.path ?? null})
    } catch (error) {
      if (disposed || current !== generation || controller.signal.aborted) return
      publish({...snapshot, status: "error", error: error instanceof Error ? error.message : "Сценарии недоступны"})
      throw error
    }
  }, dispose() {
    if (disposed) return
    disposed = true
    requestController?.abort()
    presentation.dispose()
    listeners.clear()
  }}
}
