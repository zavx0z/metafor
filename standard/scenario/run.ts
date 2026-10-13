import {validateGraph, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"

export interface ScenarioResult {
  scenario: "agent-system.integrity"
  passed: boolean
  checks: Array<{name: string, passed: boolean}>
  atomCount: number
}

export interface ScenarioLedger {
  version: 1
  requests: Array<{id: string, scenario: "agent-system.integrity", result: ScenarioResult}>
}

type JsonMass = {readText(): Promise<string>, write(value: unknown): Promise<void>}
export interface RunScenarioInput {
  request: string | null
  mass: {result: JsonMass}
  environment?: OracleProcessEnvironment | undefined
  signal: AbortSignal
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const completedResult = (value: unknown): value is ScenarioResult => {
  if (!record(value) || Object.keys(value).sort().join(",") !== "atomCount,checks,passed,scenario" ||
      value.scenario !== "agent-system.integrity" || typeof value.passed !== "boolean" ||
      typeof value.atomCount !== "number" || !Number.isSafeInteger(value.atomCount) || value.atomCount < 0 ||
      !Array.isArray(value.checks) || !value.checks.length || value.checks.length > 128) return false
  return value.checks.every(check => record(check) && Object.keys(check).sort().join(",") === "name,passed" &&
      typeof check.name === "string" && check.name.length > 0 && check.name.length <= 1024 && typeof check.passed === "boolean") &&
    value.passed === value.checks.every(check => check.passed)
}

/** Reads only the ordinary public Graph supplied to this exact Process execution. */
export function inspectAgentSystem(graph: Graph): ScenarioResult {
  const atoms: RuntimeAtom[] = []
  const visit = (node: RuntimeNode): void => {
    if (node.kind === "atom") atoms.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  graph.runtime.roots.forEach(visit)
  const agents = atoms.filter(atom => atom.meta === "@metafor/agent")
  const chats = atoms.filter(atom => atom.meta === "@metafor/chat")
  const tools = atoms.filter(atom => atom.meta === "@metafor/scenario")
  const checks = [
    {name: "Публичный Graph согласован", passed: validateGraph(graph).ok},
    {name: "Один корень рабочего окружения", passed: graph.root === "@metafor/environment" && graph.runtime.roots.length === 1},
    {name: "Один действующий Agent", passed: agents.length === 1},
    {name: "У Agent отдельный Chat с Mass сессии", passed: chats.length === 1 && chats[0]!.mass.some(mass => mass.key === "session" && mass.format === "json")},
    {name: "Сценарий сохраняет результат в Mass", passed: tools.length === 1 && tools[0]!.mass.some(mass => mass.key === "result" && mass.format === "json")},
    {name: "Agent содержит Chat и инструмент", passed: agents.length === 1 && (agents[0]!.children ?? []).some(node => node.kind === "atom" && node.meta === "@metafor/chat") && (agents[0]!.children ?? []).some(node => node.kind === "atom" && node.meta === "@metafor/scenario")},
  ]
  return {scenario: "agent-system.integrity", passed: checks.every(check => check.passed), checks, atomCount: atoms.length}
}

/**
Executes the declared read-only scenario and persists its receipt before the
Process proposes its result. Completion is reused by request identity; malformed
storage is never silently replaced. A interrupted observation may be repeated
because it has no external effect. [Owner](README.md).
*/
export default async function runScenario(input: RunScenarioInput): Promise<{ackId: string, response: string, error: null}> {
  input.signal.throwIfAborted()
  const request: unknown = JSON.parse(input.request ?? "null")
  if (!record(request) || Object.keys(request).sort().join(",") !== "id,scenario" ||
      typeof request.id !== "string" || request.id.length < 1 || request.id.length > 200 ||
      request.scenario !== "agent-system.integrity") throw new Error("Недопустимый запрос сценария")
  const bytes = await input.mass.result.readText()
  const stored: unknown = bytes === "" ? null : JSON.parse(bytes)
  let ledger: ScenarioLedger
  if (stored === null) ledger = {version: 1, requests: []}
  else if (record(stored) && stored.version === 1 && Object.keys(stored).sort().join(",") === "requests,version" &&
      Array.isArray(stored.requests) && stored.requests.length <= 1024 && stored.requests.every(entry =>
    record(entry) && Object.keys(entry).sort().join(",") === "id,result,scenario" &&
    typeof entry.id === "string" && entry.id.length > 0 && entry.id.length <= 200 &&
    entry.scenario === "agent-system.integrity" && completedResult(entry.result)) &&
      new Set(stored.requests.map(entry => entry.id)).size === stored.requests.length) {
    ledger = structuredClone(stored) as unknown as ScenarioLedger
  } else throw new Error("Повреждён журнал результатов сценария")
  const previous = ledger.requests.find(entry => entry.id === request.id)
  if (previous) return {ackId: request.id, response: JSON.stringify(previous.result), error: null}
  if (ledger.requests.length >= 1024) throw new Error("Журнал сценария заполнен")
  if (!input.environment) throw new Error("Oracle Environment не предоставлен инструменту")
  const snapshot = await input.environment.read()
  if (snapshot.actor.meta !== "@metafor/scenario") throw new Error("Oracle Environment принадлежит другому участнику")
  input.signal.throwIfAborted()
  const result = inspectAgentSystem(snapshot.graph)
  ledger.requests.push({id: request.id, scenario: request.scenario, result})
  await input.mass.result.write(ledger)
  input.signal.throwIfAborted()
  return {ackId: request.id, response: JSON.stringify(result), error: null}
}
