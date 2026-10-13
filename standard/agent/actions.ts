/**
One task advances through canonical Agent States. Helpers produce ordinary Field
results and persist only the task ledger in the Agent's own Mass. Chat owns
model/session replay, Scenario owns tool replay, and no helper writes source.
@packageDocumentation
*/
import type {AgentConfiguration, AgentToolReference} from "@metafor/types/metafor/agents"
import type {OracleProcessEnvironment, OracleProcessEnvironmentRead} from "@metafor/types/metafor/environment"
import type {MassHandle} from "@metafor/types/metafor/mass"
import {isMetaPackageName, type RuntimeNode} from "@metafor/types/metafor/graph"
import {isCodespaceResult} from "@metafor/types/metafor/codespace"
import {createHash} from "node:crypto"

/**
Root task Field accepts one closed JSON intention. Conversation sends literal
human text to the existing Chat; explicit scenario retains the verified tool
cycle. The legacy two-property form means scenario for installed task history.
Identity includes normalized mode, text and Agent configuration. [Owner](README.md).
*/
export type AgentTask =
  | Readonly<{id: string; text: string; mode: "conversation"}>
  | Readonly<{id: string; text: string; mode: "development"; maxSteps?: number}>
  | Readonly<{id: string; text: string; mode: "scenario"; scenario: "agent-system.integrity"}>
  | Readonly<{id: string; text: string; mode: "codespace"; operation: "status" | "start"}>
  | Readonly<{id: string; text: string; mode?: never; scenario?: never}>

export interface AgentValues {
  task: string | null
  answer: string | null
  status: string
  error: string | null
  configuration: string
  activeTaskId: string | null
  chatRequest: string | null
  chatAck: boolean
  chatAckId: string
  chatResponse: string | null
  chatError: string | null
  toolRequest: string | null
  toolAck: boolean
  toolAckId: string
  toolResponse: string | null
  toolError: string | null
  codespaceRequest: string | null
  codespaceAck: boolean
  codespaceAckId: string
  codespaceResponse: string | null
  codespaceError: string | null
  replRequest?: string | null
  replAck?: boolean
  replAckId?: string
  replResponse?: string | null
  replError?: string | null
}

export interface AgentInput {
  value: AgentValues
  mass: {task: MassHandle}
  signal: AbortSignal
  environment?: OracleProcessEnvironment | undefined
}

export interface AgentResult {
  task: null
  answer: string | null
  status: string
  error: string | null
  activeTaskId: string | null
  chatRequest: string | null
  chatAck: boolean
  chatAckId: string
  chatResponse: string | null
  chatError: string | null
  toolRequest: string | null
  toolAck: boolean
  toolAckId: string
  toolResponse: string | null
  toolError: string | null
  codespaceRequest: string | null
  codespaceAck: boolean
  codespaceAckId: string
  codespaceResponse: string | null
  codespaceError: string | null
  replRequest: string | null
  replAck: boolean
  replAckId: string
  replResponse: string | null
  replError: string | null
}

interface TaskRecord {
  id: string
  text: string
  /** Absent only in retained legacy scenario records. */
  mode?: "conversation" | "scenario" | "codespace" | "development"
  operation?: "status" | "start"
  configuration: string
  maxSteps?: number
  steps?: {index: number; chatId: string; prompt: string; toolRequest: string | null; result: unknown; answer: string | null}[]
  phase: "plan" | "tool" | "answer" | "completed" | "failed" | "development-model" | "development-tool"
  planPrompt: string
  answerPrompt: string | null
  result: unknown
  answer: string | null
  error: string | null
}

interface TaskLedger {
  version: 1
  activeId: string | null
  requests: TaskRecord[]
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, required: readonly string[]): value is Record<string, unknown> =>
  object(value) && Object.keys(value).length === required.length && required.every(key => Object.hasOwn(value, key))
const identity = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/u.test(value)
const fail = (message: string): never => {throw new Error(message)}
const parse = (value: string | null, label: string): unknown => {
  if (typeof value !== "string" || Buffer.byteLength(value) > 1024 * 1024) return fail(`${label} must be bounded JSON`)
  try {return JSON.parse(value)} catch {return fail(`${label} is malformed JSON`)}
}

function taskRequest(input: string | null): {id: string; text: string; mode: "conversation" | "scenario" | "codespace" | "development"; maxSteps?: number; operation?: "status" | "start"} {
  const request = parse(input, "Agent task")
  if (!object(request) || !identity(request.id) || typeof request.text !== "string" || !request.text.trim() || request.text.length > 64 * 1024)
    return fail("Agent task requires exact id, text and supported mode")
  const has = (keys: readonly string[]): boolean => exact(request, keys)
  if (has(["id", "text"])) return {id: request.id, text: request.text, mode: "scenario"}
  if (has(["id", "text", "mode"]) && request.mode === "conversation")
    return {id: request.id, text: request.text, mode: "conversation"}
  if ((has(["id", "text", "mode"]) || has(["id", "text", "mode", "maxSteps"])) && request.mode === "development" &&
      (request.maxSteps === undefined || typeof request.maxSteps === "number" && Number.isSafeInteger(request.maxSteps) && request.maxSteps >= 1 && request.maxSteps <= 64))
    return {id: request.id, text: request.text, mode: "development", maxSteps: typeof request.maxSteps === "number" ? request.maxSteps : 16}
  if (has(["id", "text", "mode", "scenario"]) && request.mode === "scenario" && request.scenario === "agent-system.integrity")
    return {id: request.id, text: request.text, mode: "scenario"}
  if (has(["id", "text", "mode", "operation"]) && request.mode === "codespace" && (request.operation === "status" || request.operation === "start"))
    return {id: request.id, text: request.text, mode: "codespace", operation: request.operation}
  return fail("Agent task requires exact id, text and supported mode")
}

const jsonInput = (value: unknown, depth = 0): boolean => depth <= 32 && (
  value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) ||
  Array.isArray(value) && value.every(item => jsonInput(item, depth + 1)) ||
  object(value) && Object.values(value).every(item => jsonInput(item, depth + 1))
)

/** Configuration is a closed declaration of this Agent's implemented tools and displays. */
export function readAgentConfiguration(input: string): AgentConfiguration {
  const value = parse(input, "Agent configuration")
  if (!exact(value, ["id", "atom", "presentation", "tools", "displays"]) || !identity(value.id) || !Array.isArray(value.tools) || !Array.isArray(value.displays)) return fail("Invalid Agent configuration")
  if (!exact(value.atom, ["kind", "scope"]) || value.atom.kind !== "atom" || value.atom.scope !== "owner") return fail("Invalid Agent owning Atom")
  if (!exact(value.presentation, ["kind", "defaultTab", "tabs"]) || value.presentation.kind !== "agent-inspector" || value.presentation.defaultTab !== "chat" ||
      JSON.stringify(value.presentation.tabs) !== JSON.stringify(["chat", "provider", "tools", "context"])) return fail("Invalid Agent default presentation")
  if (value.tools.length > 64) return fail("Agent configuration tool limit exceeded")
  const tools = new Set<string>()
  for (const tool of value.tools) {
    if (!object(tool) || !exact(tool, tool.owner === undefined ? ["kind", "name", "input"] : ["kind", "name", "input", "owner"]) ||
        tool.kind !== "oracle-tool" || typeof tool.name !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(tool.name) || !jsonInput(tool.input) ||
        tool.owner !== undefined && (!exact(tool.owner, ["meta"]) || !isMetaPackageName(tool.owner.meta))) return fail("Agent configuration contains an invalid tool declaration")
    const key = JSON.stringify(tool)
    if (tools.has(key)) return fail("Agent configuration contains duplicate tools")
    tools.add(key)
  }
  const ids = new Set<string>()
  if (value.displays.length > 64) return fail("Agent display limit exceeded")
  for (const display of value.displays) {
    if (!exact(display, ["id", "source"]) || !identity(display.id) || ids.has(display.id) || !object(display.source)) return fail("Invalid Agent display")
    ids.add(display.id)
    if (display.source.kind === "atom") {
      if (!exact(display.source, ["kind", "scope"]) || display.source.scope !== "owner") return fail("Invalid Agent Atom display")
    } else if (display.source.kind === "mass") {
      if (!exact(display.source, ["kind", "key"]) || !identity(display.source.key)) return fail("Invalid Agent Mass display")
    } else if (!exact(display.source, ["kind"]) || !["graph", "force", "oracle"].includes(String(display.source.kind))) return fail("Unsupported Agent display source")
  }
  return structuredClone(value) as unknown as AgentConfiguration
}

/**
Declarations do not grant execution. The current example resolves only its
known scenario handler, and only against the Agent's actual child Tool Atom.
Unresolved declarations fail before they can be advertised to the model.
*/
export function resolveAgentTools(configuration: AgentConfiguration, observation: OracleProcessEnvironmentRead): AgentToolReference[] {
  const pending: RuntimeNode[] = [...observation.graph.runtime.roots]
  let actor: Extract<RuntimeNode, {kind: "atom"}> | undefined
  for (let index = 0; index < pending.length; index++) {
    const node = pending[index]!
    if (node.kind === "atom" && node.ref === observation.actor.ref && node.meta === observation.actor.meta) actor = node
    pending.push(...(node.children ?? []))
  }
  if (!actor || actor.meta !== "@metafor/agent") return fail("Agent tool owner is absent from the observed Graph")
  return configuration.tools.map(tool => {
    const codespace = ["codespace.status", "codespace.start"].includes(tool.name) && exact(tool.input, [])
    const repl = tool.name === "bun.evaluate" && exact(tool.input, [])
    const ownerMeta = repl ? "@metafor/repl" : codespace ? "@metafor/codespace" : "@metafor/scenario"
    if ((!codespace && !repl && (tool.name !== "scenario.run" || !exact(tool.input, ["scenario"]) || tool.input.scenario !== "agent-system.integrity")) ||
        tool.owner !== undefined && tool.owner.meta !== ownerMeta) return fail(`No runtime handler is available for declared tool ${tool.name}`)
    const owners = (actor.children ?? []).filter(node => node.kind === "atom" && node.meta === ownerMeta)
    if (owners.length !== 1) return fail("The declared scenario tool requires one owning child Atom")
    const owner = owners[0]!
    if (owner.kind !== "atom") return fail("Scenario tool owner is not an Atom")
    if (repl && !observation.toolCapabilities?.some(capability => capability.actor.ref === owner.ref && capability.actor.meta === ownerMeta && capability.operations.includes("cosmos.repl.evaluate"))) return fail("Native REPL capability is not assigned to the declared Tool")
    const template = observation.graph.template[owner.meta]
    if (!template || !["request", "ack", "ackId", "response", "error"].every(key => template.fields.some(field => field.key === key))) return fail("The owning Tool Atom does not declare its supported request contract")
    return {...structuredClone(tool), owner: {meta: ownerMeta}}
  })
}

async function ledger(input: AgentInput): Promise<TaskLedger> {
  input.signal.throwIfAborted()
  const text = await input.mass.task.readText()
  if (!text) return {version: 1, activeId: null, requests: []}
  const value = parse(text, "Agent task ledger")
  if (!exact(value, ["version", "activeId", "requests"]) || value.version !== 1 ||
      !(value.activeId === null || identity(value.activeId)) || !Array.isArray(value.requests) || value.requests.length > 1024) return fail("Invalid Agent task ledger")
  const ids = new Set<string>()
  for (const row of value.requests) {
    if (!object(row) || !exact(row, ["id", "text", "configuration", "phase", "planPrompt", "answerPrompt", "result", "answer", "error", ...(Object.hasOwn(row, "mode") ? ["mode"] : []), ...(Object.hasOwn(row, "operation") ? ["operation"] : []), ...(Object.hasOwn(row, "steps") ? ["steps", "maxSteps"] : [])]) ||
        !identity(row.id) || ids.has(row.id) || typeof row.text !== "string" || typeof row.configuration !== "string" ||
        Object.hasOwn(row, "mode") && row.mode !== "conversation" && row.mode !== "scenario" && row.mode !== "codespace" && row.mode !== "development" ||
        row.mode === "codespace" && row.operation !== "status" && row.operation !== "start" || row.mode !== "codespace" && Object.hasOwn(row, "operation") ||
        !["plan", "tool", "answer", "completed", "failed", "development-model", "development-tool"].includes(String(row.phase)) || typeof row.planPrompt !== "string" ||
        !(row.answerPrompt === null || typeof row.answerPrompt === "string") || !(row.answer === null || typeof row.answer === "string") ||
        !(row.error === null || typeof row.error === "string")) return fail("Invalid Agent task ledger entry")
    if (row.mode === "development" && (!Number.isSafeInteger(row.maxSteps) || Number(row.maxSteps) < 1 || Number(row.maxSteps) > 64 || !Array.isArray(row.steps) || !row.steps.length || row.steps.length > Number(row.maxSteps) || row.steps.some((step, index) => !exact(step, ["index", "chatId", "prompt", "toolRequest", "result", "answer"]) || step.index !== index || !identity(step.chatId) || typeof step.prompt !== "string" || !(step.toolRequest === null || typeof step.toolRequest === "string") || !(step.answer === null || typeof step.answer === "string")))) return fail("Invalid Agent development ledger")
    ids.add(row.id)
  }
  if (value.activeId !== null && !ids.has(value.activeId as string)) return fail("Agent active task is absent from its ledger")
  return structuredClone(value) as unknown as TaskLedger
}

async function save(input: AgentInput, state: TaskLedger) {
  input.signal.throwIfAborted()
  if (Buffer.byteLength(JSON.stringify(state)) > 1024 * 1024) return fail("Agent task ledger capacity exceeded")
  await input.mass.task.write(state)
  input.signal.throwIfAborted()
}

const active = (input: AgentInput, state: TaskLedger): TaskRecord => {
  if (!input.value.activeTaskId || input.value.activeTaskId !== state.activeId) return fail("Agent task identity is not correlated")
  return state.requests.find(row => row.id === state.activeId) ?? fail("Agent task context is unavailable")
}

const output = (input: AgentInput, status: string, error: string | null = null): AgentResult => ({
  task: null, answer: null, status, error, activeTaskId: input.value.activeTaskId,
  chatRequest: input.value.chatRequest, chatAck: input.value.chatAck, chatAckId: input.value.chatAckId,
  chatResponse: input.value.chatResponse, chatError: input.value.chatError,
  toolRequest: input.value.toolRequest, toolAck: input.value.toolAck, toolAckId: input.value.toolAckId,
  toolResponse: input.value.toolResponse, toolError: input.value.toolError,
  codespaceRequest: input.value.codespaceRequest, codespaceAck: input.value.codespaceAck, codespaceAckId: input.value.codespaceAckId,
  codespaceResponse: input.value.codespaceResponse, codespaceError: input.value.codespaceError,
  replRequest: input.value.replRequest ?? null, replAck: input.value.replAck ?? false, replAckId: input.value.replAckId ?? "", replResponse: input.value.replResponse ?? null, replError: input.value.replError ?? null,
})

/** A bounded summary explicitly marks previews; it is not a new canonical Graph. */
function environmentSummary(observation: OracleProcessEnvironmentRead) {
  const nodes: RuntimeNode[] = [...observation.graph.runtime.roots]
  const atoms: unknown[] = []
  let truncated = false
  for (let index = 0; index < nodes.length && index < 256; index++) {
    const node = nodes[index]!
    nodes.push(...(node.children ?? []))
    if (node.kind !== "atom") continue
    const values = Object.fromEntries(Object.entries(node.values).filter(([key]) => !["configuration", "request", "response"].includes(key) && !/^(chat|tool)/.test(key)).map(([key, value]) => {
      if (typeof value === "string" && value.length > 256) {truncated = true; return [key, {preview: value.slice(0, 256), truncated: true}]}
      return [key, value]
    }))
    atoms.push({ref: node.ref, meta: node.meta, state: node.state, values})
  }
  truncated ||= nodes.length > 256
  return {contractVersion: observation.contractVersion, actor: observation.actor, scope: observation.scope, operations: observation.operations,
    graph: {root: observation.graph.root, templates: Object.entries(observation.graph.template).slice(0, 256).map(([meta, template]) => ({meta, name: template.name,
      fields: template.fields.map(field => ({key: field.key, type: field.type})), states: template.superposition.map(state => state.name)})), atoms, truncated}}
}

/**
Begins one task or returns its retained completion. Controlled failure after
valid input retains incoming activeTaskId in the same failed Field proposal,
even before Mass exists, so an admitted browser task remains observable. Abort
and malformed task input still reject without inventing a correlated result.
*/
export async function planning(input: AgentInput): Promise<AgentResult> {
  const request = taskRequest(input.value.task)
  try {return await planTask(input, request)}
  catch (error) {
    input.signal.throwIfAborted()
    return {...output(input, "failed", (error instanceof Error ? error.message : "Agent planning failed").slice(0, 4096)), activeTaskId: request.id,
      chatRequest: null, chatAck: false, chatAckId: "", chatResponse: null, chatError: null,
      toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
      replRequest: null, replAck: false, replAckId: "", replResponse: null, replError: null,
      codespaceRequest: null, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
  }
}

async function planTask(input: AgentInput, request: ReturnType<typeof taskRequest>): Promise<AgentResult> {
  const configuration = readAgentConfiguration(input.value.configuration)
  const state = await ledger(input)
  let row = state.requests.find(row => row.id === request.id)
  if (row && (row.text !== request.text || (row.mode ?? "scenario") !== request.mode || row.operation !== request.operation || row.maxSteps !== request.maxSteps || row.configuration !== JSON.stringify(configuration))) return fail("Agent task id is already bound to another request")
  if (row?.phase === "completed") return {...output(input, "completed"), activeTaskId: row.id, answer: row.answer,
    chatRequest: null, chatAck: false, chatAckId: "", chatResponse: null, chatError: null, toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
    codespaceRequest: null, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
  if (row?.phase === "failed") return {...output(input, "failed", row.error ?? "Agent task previously failed"), activeTaskId: row.id, chatRequest: null, toolRequest: null, codespaceRequest: null}
  if (state.activeId && state.activeId !== request.id && state.requests.some(item => item.id === state.activeId && !["completed", "failed"].includes(item.phase))) return fail("Another Agent task is unfinished")
  if (!row) {
    if (state.requests.length >= 1024) return fail("Agent task ledger capacity exceeded")
    let planPrompt = request.text
    if (request.mode === "scenario" || request.mode === "development") {
      if (!input.environment) return fail("Oracle Environment is unavailable to this Agent")
      let observation: OracleProcessEnvironmentRead
      try {observation = await input.environment.read()} catch {input.signal.throwIfAborted(); return fail("Oracle Environment observation failed")}
      if (observation.actor.meta !== "@metafor/agent") return fail("Oracle Environment belongs to another Atom")
      const availableTools = resolveAgentTools(configuration, observation)
      if (request.mode === "development" && !availableTools.some(tool => tool.name === "bun.evaluate")) return fail("Development requires the declared and assigned bun.evaluate Tool")
      planPrompt = request.mode === "development" ? JSON.stringify({phase: "development", instructions: developmentInstructions, task: {id: request.id, text: request.text}, maxSteps: request.maxSteps, step: 1, tools: availableTools.filter(tool => tool.name === "bun.evaluate"), environment: environmentSummary(observation)}) : JSON.stringify({phase: "plan",
        instructions: "Ты участник агентной системы MetaFor. Выбери разрешённое предметное действие из tools. Не исполняй команды, не читай файлы и не используй native инструменты Codex: выбранное действие исполнит отдельный Atom. Верни только JSON без Markdown и пояснений: {\"operation\":\"scenario.run\",\"scenario\":\"agent-system.integrity\"}. Не объявляй сценарий выполненным: это только намерение.",
        task: {id: request.id, text: request.text}, environment: environmentSummary(observation), tools: availableTools})
    }
    if (request.mode === "codespace") {
      const name = `codespace.${request.operation}`
      if (!configuration.tools.some(tool => tool.name === name && exact(tool.input, []) && (tool.owner === undefined || tool.owner.meta === "@metafor/codespace"))) return fail("Codespace operation is not declared for this Agent")
      if (!input.environment) return fail("Oracle Environment is unavailable to this Agent")
      const observation = await input.environment.read()
      resolveAgentTools(configuration, observation)
      planPrompt = JSON.stringify({id: `${request.id}:codespace`, operation: request.operation})
    }
    row = {id: request.id, text: request.text, mode: request.mode, ...(request.operation ? {operation: request.operation} : {}), configuration: JSON.stringify(configuration), phase: request.mode === "conversation" ? "answer" : request.mode === "codespace" ? "tool" : "plan", planPrompt,
      answerPrompt: null, result: null, answer: null, error: null}
    if (request.mode === "development") {row.phase = "development-model"; row.maxSteps = request.maxSteps!; row.steps = [{index: 0, chatId: developmentIdentity(row.id, 0, "model"), prompt: planPrompt, toolRequest: null, result: null, answer: null}]}
    state.requests.push(row)
  }
  state.activeId = row.id
  await save(input, state)
  if (row.mode === "development") return developmentOutput(input, row)
  if (row.mode === "codespace") return {...output(input, "running"), activeTaskId: row.id,
    chatRequest: null, chatAck: false, chatAckId: "", chatResponse: null, chatError: null,
    toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
    codespaceRequest: row.planPrompt, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
  const conversation = (row.mode ?? "scenario") === "conversation"
  return {...output(input, conversation ? "running" : "planning"), activeTaskId: row.id, chatRequest: JSON.stringify({id: `${row.id}:${conversation ? "conversation" : "plan"}`, prompt: row.planPrompt}),
    chatAck: false, chatAckId: "", chatResponse: null, chatError: null, toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
    codespaceRequest: null, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
}

/** Accepts only the owned Tool's exact correlated receipt; start acceptance never claims a running host. */
export async function completingCodespace(input: AgentInput): Promise<AgentResult> {
  if (input.value.codespaceError !== null) return fail("Agent Codespace operation failed")
  const state = await ledger(input), row = active(input, state)
  if (row.mode !== "codespace" || row.phase !== "tool" && row.phase !== "completed" || !input.value.codespaceAck || input.value.codespaceAckId !== `${row.id}:codespace`) return fail("Agent Codespace acknowledgement is not correlated")
  const result = parse(input.value.codespaceResponse, "Agent Codespace result")
  if (!isCodespaceResult(result) || result.operation !== row.operation) return fail("Invalid Codespace operation result")
  if (row.result !== null && JSON.stringify(row.result) !== JSON.stringify(result)) return fail("Codespace result changed for the same task")
  row.result = result
  row.answer = result.outcome === "start-accepted" ? `Запрос запуска Codespace ${result.target.name} принят. Наблюдаемое состояние: ${result.state}.`
    : `Codespace ${result.target.name}: ${result.state}.`
  row.error = null
  row.phase = "completed"
  await save(input, state)
  return {...output(input, "completed"), answer: row.answer, codespaceRequest: null, chatRequest: null, toolRequest: null}
}

/**
Completes one ordinary model turn after exact Chat correlation. Literal text is
never parsed as a tool intention. Mass precedes answer/completed Fields; failed
or uncertain Chat turns retain Chat's refusal and replay policy. [Tests](test/actions.test.ts).
*/
export async function replying(input: AgentInput): Promise<AgentResult> {
  if (input.value.chatError !== null) return fail("Agent conversation Chat failed")
  const state = await ledger(input)
  const row = active(input, state)
  if (row.mode !== "conversation" || row.phase !== "answer" && row.phase !== "completed") return fail("Agent task is not an ordinary conversation")
  if (!input.value.chatAck || input.value.chatAckId !== `${row.id}:conversation`) return fail("Agent conversation Chat acknowledgement is not correlated")
  const answer = input.value.chatResponse
  if (typeof answer !== "string" || !answer.trim() || answer.length > 128 * 1024) return fail("Agent conversation requires nonempty bounded response text")
  if (row.phase === "completed" && row.answer !== answer) return fail("Agent final answer changed for the same task")
  row.answer = answer
  row.error = null
  row.phase = "completed"
  await save(input, state)
  return {...output(input, "completed"), answer, chatRequest: null, toolRequest: null}
}

/** Accepts only the declared scenario after an exactly correlated successful model turn. */
export async function deciding(input: AgentInput): Promise<AgentResult> {
  if (input.value.chatError !== null) return fail("Agent planning Chat failed")
  const state = await ledger(input)
  const row = active(input, state)
  if (row.mode === "conversation" || row.mode === "codespace") return fail("Conversation text or Codespace operation cannot request a scenario")
  if (!input.value.chatAck || input.value.chatAckId !== `${row.id}:plan`) return fail("Agent planning Chat acknowledgement is not correlated")
  const plan = parse(input.value.chatResponse, "Agent model plan")
  if (!exact(plan, ["operation", "scenario"]) || plan.operation !== "scenario.run" || plan.scenario !== "agent-system.integrity") return fail("Agent model plan is not an allowed scenario operation")
  const configuration = readAgentConfiguration(row.configuration)
  const advertised = parse(row.planPrompt, "Agent retained planning context")
  if (!object(advertised) || !Array.isArray(advertised.tools) || !configuration.tools.some(tool => tool.name === plan.operation && exact(tool.input, ["scenario"]) && tool.input.scenario === plan.scenario) ||
      !advertised.tools.some(tool => object(tool) && tool.name === plan.operation && object(tool.input) && tool.input.scenario === plan.scenario && exact(tool.owner, ["meta"]) && tool.owner.meta === "@metafor/scenario")) return fail("Agent scenario tool is not permitted or resolved")
  row.phase = "tool"
  await save(input, state)
  return {...output(input, "running"), chatRequest: null, toolRequest: JSON.stringify({id: `${row.id}:scenario`, scenario: "agent-system.integrity"}),
    toolAck: false, toolAckId: "", toolResponse: null, toolError: null}
}

/** A tool reply is evidence only after correlation, closed result checks and passed=true. */
export async function composing(input: AgentInput): Promise<AgentResult> {
  if (input.value.toolError !== null) return fail("Agent scenario execution failed")
  const state = await ledger(input)
  const row = active(input, state)
  if (row.mode === "conversation" || row.mode === "codespace") return fail("Conversation text or Codespace operation cannot consume a scenario result")
  if (!input.value.toolAck || input.value.toolAckId !== `${row.id}:scenario`) return fail("Agent tool acknowledgement is not correlated")
  const result = parse(input.value.toolResponse, "Agent scenario result")
  if (!exact(result, ["scenario", "passed", "checks", "atomCount"]) || result.scenario !== "agent-system.integrity" || typeof result.passed !== "boolean" ||
      !Number.isSafeInteger(result.atomCount) || Number(result.atomCount) < 0 || !Array.isArray(result.checks) || !result.checks.length || result.checks.length > 64 ||
      result.checks.some(check => !exact(check, ["name", "passed"]) || typeof check.name !== "string" || !check.name || typeof check.passed !== "boolean")) return fail("Agent scenario returned an invalid result")
  if (!result.passed || result.checks.some(check => !check.passed)) return fail("Agent scenario checks did not pass")
  if (row.result !== null && JSON.stringify(row.result) !== JSON.stringify(result)) return fail("Agent tool result changed for the same task")
  row.result = result
  row.answerPrompt ??= JSON.stringify({phase: "answer",
    instructions: "Сценарий исполнен отдельным Atom. Его проверенный результат передан в result. Сформулируй короткий ответ пользователю на русском только по этому результату. Верни только JSON без Markdown и пояснений: {\"answer\":\"текст ответа\"}. Не вызывай native инструменты и не повторяй действие.",
    task: {id: row.id, text: row.text}, result})
  row.phase = "answer"
  await save(input, state)
  return {...output(input, "composing"), toolRequest: null, chatRequest: JSON.stringify({id: `${row.id}:answer`, prompt: row.answerPrompt}),
    chatAck: false, chatAckId: "", chatResponse: null, chatError: null}
}

/** Commits the final model text to task Mass before canonical answer/completed Fields. */
export async function completing(input: AgentInput): Promise<AgentResult> {
  if (input.value.chatError !== null) return fail("Agent answering Chat failed")
  const state = await ledger(input)
  const row = active(input, state)
  if (row.mode === "conversation" || row.mode === "codespace") return fail("Conversation text or Codespace operation requires its own reply contract")
  if (!input.value.chatAck || input.value.chatAckId !== `${row.id}:answer`) return fail("Agent answer Chat acknowledgement is not correlated")
  if (row.phase !== "answer" && row.phase !== "completed") return fail("Agent task has no verified tool result")
  const answer = parse(input.value.chatResponse, "Agent model answer")
  if (!exact(answer, ["answer"]) || typeof answer.answer !== "string" || !answer.answer.trim() || answer.answer.length > 128 * 1024) return fail("Agent model answer requires exact nonempty answer text")
  if (row.phase === "completed" && row.answer !== answer.answer) return fail("Agent final answer changed for the same task")
  row.answer = answer.answer
  row.error = null
  row.phase = "completed"
  await save(input, state)
  return {...output(input, "completed"), answer: row.answer, chatRequest: null, toolRequest: null}
}

/** Failed State records a terminal refusal; child errors do not need a matching ackId. */
export async function failed(input: AgentInput): Promise<{task: null, status: string, error: string}> {
  input.signal.throwIfAborted()
  const message = (input.value.error ?? (input.value.chatError !== null ? `Agent Chat failed: ${input.value.chatError}` : input.value.toolError !== null ? `Agent scenario failed: ${input.value.toolError}` : input.value.codespaceError !== null ? `Agent Codespace failed: ${input.value.codespaceError}` : input.value.replError != null ? `Agent REPL failed: ${input.value.replError}` : "Agent task failed")).slice(0, 4096)
  const state = await ledger(input)
  const row = input.value.activeTaskId ? state.requests.find(row => row.id === input.value.activeTaskId) : undefined
  if (row && row.phase !== "completed") {row.phase = "failed"; row.error = message; await save(input, state)}
  return {task: null, status: "failed", error: message}
}


const developmentInstructions = 'Ты разрабатываешь через назначенный нативный Bun REPL. Верни только JSON: {"operation":"bun.evaluate","code":"JavaScript"} либо {"answer":"итог на русском"}. Код имеет возможности ОС; heap сохраняется между командами. Oracle вызывается строго oracle.call(target, method, params), например await oracle.call("dark", "readGraph", {}). Доступные методы можно сверить в переданном environment; ошибка вызова не является фактом о мире. Пользуйся fs, Bun.spawn, import и await по задаче пользователя. Выполнение делает отдельный Tool Atom. Каноническое состояние мира изменяется только через выданный Oracle и Force path; прямые записи в SQLite Boundary или Mass запрещены. Ошибка JavaScript — наблюдаемый результат, неизвестный исход повторять нельзя. Конечный ответ утверждает только проверенное. Каждое обращение к модели расходует один шаг явного бюджета.'
const developmentIdentity = (task: string, step: number, kind: "model" | "repl") => `${kind}:${createHash("sha256").update(JSON.stringify([task, step])).digest("hex")}`

function developmentOutput(input: AgentInput, row: TaskRecord): AgentResult {
  const step = row.steps?.at(-1) ?? fail("Agent development step is absent")
  return {...output(input, row.phase), activeTaskId: row.id,
    chatRequest: row.phase === "development-model" ? JSON.stringify({id: step.chatId, prompt: step.prompt}) : null,
    chatAck: false, chatAckId: "", chatResponse: null, chatError: null,
    replRequest: row.phase === "development-tool" ? step.toolRequest : null, replAck: false, replAckId: "", replResponse: null, replError: null,
    toolRequest: null, codespaceRequest: null}
}

/** Один коррелированный model turn выбирает код либо финальный ответ; намерение сохраняется до Tool Fields. */
export async function developing(input: AgentInput): Promise<AgentResult> {
  const state = await ledger(input), row = active(input, state), step = row.steps?.at(-1)
  if (row.mode !== "development" || !step || input.value.chatError !== null || !input.value.chatAck || input.value.chatAckId !== step.chatId) return fail("Agent development model acknowledgement is not correlated")
  if (row.phase === "development-tool") return developmentOutput(input, row)
  if (row.phase === "completed") {
    const answer = parse(input.value.chatResponse, "Agent retained development answer")
    if (!exact(answer, ["answer"]) || answer.answer !== row.answer) return fail("Agent development answer changed for the same step")
    return {...output(input, "completed"), answer: row.answer, chatRequest: null, replRequest: null}
  }
  if (row.phase !== "development-model") return fail("Agent development is not waiting for a model decision")
  const plan = parse(input.value.chatResponse, "Agent development plan")
  if (exact(plan, ["answer"]) && typeof plan.answer === "string" && plan.answer.trim() && plan.answer.length <= 128 * 1024) {
    step.answer = plan.answer; row.answer = plan.answer; row.phase = "completed"; row.error = null
    await save(input, state)
    return {...output(input, "completed"), answer: row.answer, chatRequest: null, replRequest: null}
  }
  if (!exact(plan, ["operation", "code"]) || plan.operation !== "bun.evaluate" || typeof plan.code !== "string" || Buffer.byteLength(plan.code) > 524288) return fail("Agent development plan requires bun.evaluate code or answer")
  const advertised = parse(row.planPrompt, "Agent retained development context")
  if (!object(advertised) || !Array.isArray(advertised.tools) || !advertised.tools.some(tool => object(tool) && tool.name === "bun.evaluate" && object(tool.owner) && tool.owner.meta === "@metafor/repl")) return fail("Agent native Tool was not resolved")
  step.toolRequest = JSON.stringify({id: developmentIdentity(row.id, step.index, "repl"), code: plan.code})
  row.phase = "development-tool"
  await save(input, state)
  return developmentOutput(input, row)
}

/** Результат Tool, включая JavaScript failure, становится следующим сообщением того же Chat. */
export async function collectingDevelopment(input: AgentInput): Promise<AgentResult> {
  const state = await ledger(input), row = active(input, state), step = row.phase === "development-model" ? row.steps?.at(-2) : row.steps?.at(-1)
  if (row.mode !== "development" || !step || input.value.replError != null || !input.value.replAck || input.value.replAckId !== developmentIdentity(row.id, step.index, "repl")) return fail("Agent development Tool acknowledgement is not correlated")
  const result = parse(input.value.replResponse ?? null, "Agent native Tool result")
  if (!object(result) || result.operation !== "bun.evaluate" || !["completed", "failed"].includes(String(result.state)) || !(result.result === null || typeof result.result === "string") || !(result.error === null || typeof result.error === "string")) return fail("Invalid Agent native Tool result")
  if (row.phase === "development-model" || row.phase === "failed") {
    if (JSON.stringify(step.result) !== JSON.stringify(result)) return fail("Agent development result changed for the same step")
    return row.phase === "failed" ? {...output(input, "failed", row.error), chatRequest: null, replRequest: null} : developmentOutput(input, row)
  }
  if (row.phase !== "development-tool") return fail("Agent development is not waiting for a Tool")
  step.result = result; row.result = result
  if (row.steps!.length >= row.maxSteps!) {
    row.phase = "failed"; row.error = `Agent development step budget exhausted (${row.maxSteps})`
    await save(input, state)
    return {...output(input, "failed", row.error), chatRequest: null, replRequest: null}
  }
  const index = row.steps!.length
  row.steps!.push({index, chatId: developmentIdentity(row.id, index, "model"), prompt: JSON.stringify({phase: "development", instructions: developmentInstructions, task: {id: row.id, text: row.text}, step: index + 1, maxSteps: row.maxSteps, result}), toolRequest: null, result: null, answer: null})
  row.phase = "development-model"
  await save(input, state)
  return developmentOutput(input, row)
}
