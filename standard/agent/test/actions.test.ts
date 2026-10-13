import "@metafor/dsl"
import {expect, test} from "bun:test"
import {completing, composing, deciding, failed, planning, replying, completingCodespace, readAgentConfiguration, type AgentInput, type AgentValues} from "../actions.ts"
import sendChat from "../../chat/test/fixture/cycle.ts"
import type {ChatResult, ChatSession} from "../../chat/types.ts"
import type {ProviderDriver as ChatDriver, ProviderEnergy as ChatEnergy} from "@metafor/provider/runtime-types"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {OracleProcessEnvironment, OracleProcessEnvironmentRead} from "@metafor/types/metafor/environment"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import meta from "../meta.ts"

const declaration = {id: "assistant", atom: {kind: "atom", scope: "owner"},
  presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
  tools: [{kind: "oracle-tool", name: "scenario.run", input: {scenario: "agent-system.integrity"}}], displays: [{id: "world", source: {kind: "graph"}}]}
const configuration = JSON.stringify(declaration)
const task = {id: "task-1", text: "Проверь агентную систему"}
const toolResult = {scenario: "agent-system.integrity", passed: true, checks: [{name: "Canonical Atoms", passed: true}], atomCount: 4}

function fixture(initial?: unknown) {
  let stored: unknown = initial ?? null
  let reads = 0
  const mass: MassHandle = {
    async readText() {return stored === null ? "" : JSON.stringify(stored)},
    async readJson() {return structuredClone(stored)},
    async readBytes() {return new TextEncoder().encode(await this.readText())},
    async write(value) {stored = structuredClone(value)},
  }
  const observation = {contractVersion: 1, actor: {ref: "atom:2", meta: "@metafor/agent"}, scope: {kind: "full-root", root: "@metafor/environment"}, operations: [],
    graph: {schema: "metafor/graph/v1", root: "@metafor/environment", template: {"@metafor/scenario": {name: "Scenario",
      fields: ["request", "ack", "ackId", "response", "error"].map(key => ({key, type: key === "ack" ? "boolean" : "string"})), superposition: []}},
      runtime: {roots: [{kind: "atom", ref: "atom:2", meta: "@metafor/agent", state: "idle", values: {}, children: [
        {kind: "atom", ref: "atom:4", meta: "@metafor/scenario", state: "idle", values: {}, children: []},
      ]}], reactions: []}}} as unknown as OracleProcessEnvironmentRead
  const environment: OracleProcessEnvironment = {async read() {reads++; return structuredClone(observation)}, async call() {throw new Error("Unused")}}
  observation.graph.template[parseMetaAddress("@metafor/codespace")!] = structuredClone(observation.graph.template[parseMetaAddress("@metafor/scenario")!]!)
  observation.graph.runtime.roots[0]!.children!.push({kind: "atom", ref: "atom:5", meta: parseMetaAddress("@metafor/codespace")!, declaration: "#/template/@metafor~1agent/matter/2", state: "idle", values: {}, mass: []})
  const value: AgentValues = {task: JSON.stringify(task), answer: "previous", status: "idle", error: null, configuration, activeTaskId: null,
    chatRequest: null, chatAck: false, chatAckId: "", chatResponse: null, chatError: null,
    toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
    codespaceRequest: null, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
  const input: AgentInput = {value, mass: {task: mass}, signal: new AbortController().signal, environment}
  return {input, value, mass, observation, reads: () => reads, stored: () => structuredClone(stored), apply(result: Partial<AgentValues>) {Object.assign(value, result)}}
}

async function plan(local: ReturnType<typeof fixture>) {
  local.apply(await planning(local.input))
  local.value.chatAck = true
  local.value.chatAckId = `${task.id}:plan`
  local.value.chatResponse = JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity"})
}

async function planningFailure(input: AgentInput, message: string) {
  const result = await planning(input)
  expect(result).toMatchObject({status: "failed", activeTaskId: JSON.parse(input.value.task!).id, task: null, answer: null, chatRequest: null, toolRequest: null})
  expect(result.error).toContain(message)
  return result
}

test("Agent materializes exactly its own Chat and Scenario and stores task context separately", () => {
  expect(meta.mass).toEqual([{key: "task", format: "json"}, {key: "providerRegistry", format: "json"}])
  expect(meta.matter?.map(particle => particle.kind === "wimp" ? particle.src : particle.kind)).toEqual(["@metafor/chat", "@metafor/scenario", "@metafor/codespace", "@metafor/repl"])
  const chat = meta.matter?.[0]
  expect(chat?.kind === "wimp" && typeof chat.massBinding === "object" ? chat.massBinding.directMass : null)
    .toEqual({kind: "keys", entries: [{target: "providerRegistry", source: "providerRegistry"}]})
  expect(meta.matter?.slice(1).every(particle => particle.kind === "wimp" && particle.massBinding === undefined)).toBeTrue()
  const states = new Map(meta.superposition.map(state => [state.name, state.transitions]))
  expect(states.get("planning")).toMatchObject({done: {status: {eq: "completed"}}, "waiting-plan": {}})
  expect(states.get("planning")).toMatchObject({"waiting-conversation": {status: {eq: "running"}}})
  expect(states.get("planning")).toMatchObject({"waiting-codespace": {codespaceRequest: {null: false}}})
  expect(states.get("waiting-conversation")).toMatchObject({failed: {chatError: {null: false}}, replying: {chatAck: {eq: true}}})
  expect(states.get("waiting-plan")).toMatchObject({failed: {chatError: {null: false}}, deciding: {chatAck: {eq: true}}})
})

test("one canonical task plans, executes a verified tool and completes through two correlated Chat turns", async () => {
  const local = fixture()
  local.apply(await planning(local.input))
  expect(local.reads()).toBe(1)
  expect(local.value).toMatchObject({task: null, answer: null, error: null, status: "planning", activeTaskId: task.id, chatAck: false})
  const first = JSON.parse(local.value.chatRequest!)
  expect(first.id).toBe(`${task.id}:plan`)
  expect(JSON.parse(first.prompt)).toMatchObject({phase: "plan", task, tools: [{name: "scenario.run"}], environment: {scope: {kind: "full-root"}}})
  local.value.chatAck = true
  local.value.chatAckId = `${task.id}:plan`
  local.value.chatResponse = JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity"})
  local.apply(await deciding(local.input))
  expect(local.value.status).toBe("running")
  expect(JSON.parse(local.value.toolRequest!)).toEqual({id: `${task.id}:scenario`, scenario: "agent-system.integrity"})
  local.value.toolAck = true
  local.value.toolAckId = `${task.id}:scenario`
  local.value.toolResponse = JSON.stringify(toolResult)
  local.apply(await composing(local.input))
  const second = JSON.parse(local.value.chatRequest!)
  expect(second.id).toBe(`${task.id}:answer`)
  expect(JSON.parse(second.prompt)).toMatchObject({phase: "answer", task, result: toolResult})
  expect(JSON.parse(second.prompt).instructions).toContain("только JSON")
  local.value.chatAck = true
  local.value.chatAckId = `${task.id}:answer`
  local.value.chatResponse = JSON.stringify({answer: "Проверка пройдена"})
  local.apply(await completing(local.input))
  expect(local.value).toMatchObject({status: "completed", answer: "Проверка пройдена", error: null, task: null, chatRequest: null, toolRequest: null})
  expect(local.stored()).toMatchObject({version: 1, activeId: task.id, requests: [{id: task.id, text: task.text, phase: "completed", answer: "Проверка пройдена", result: toolResult}]})
  const restored = fixture(local.stored())
  restored.apply(await planning({...restored.input, environment: undefined}))
  expect(restored.value).toMatchObject({status: "completed", answer: "Проверка пройдена", chatRequest: null, toolRequest: null})
  expect(restored.reads()).toBe(0)
  restored.value.task = JSON.stringify({...task, text: "another intention"})
  await planningFailure(restored.input, "already bound")
})

test("unfinished replay preserves the original planning prompt without rereading a changed world", async () => {
  const local = fixture()
  local.apply(await planning(local.input))
  const first = local.value.chatRequest
  const restored = fixture(local.stored())
  restored.apply(await planning({...restored.input, environment: undefined}))
  expect(restored.value.chatRequest).toBe(first)
  expect(restored.reads()).toBe(0)
})

test("malformed or unpermitted model plans and mismatched acknowledgement cannot issue a tool", async () => {
  for (const response of ["not-json", JSON.stringify({operation: "shell.run", scenario: "agent-system.integrity"}), JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity", fabricated: true})]) {
    const local = fixture()
    await plan(local)
    local.value.chatResponse = response
    await expect(deciding(local.input)).rejects.toThrow()
    expect(local.value.toolRequest).toBeNull()
  }
  const local = fixture()
  await plan(local)
  local.value.chatAckId = "another-task:plan"
  await expect(deciding(local.input)).rejects.toThrow("not correlated")
  local.value.chatError = "sanitized child failure"
  local.value.chatAck = false
  local.apply(await failed(local.input))
  expect(local.value.status).toBe("failed")
  expect(local.stored()).toMatchObject({requests: [{phase: "failed", error: "Agent Chat failed: sanitized child failure"}]})
})

test("negative tool evidence and arbitrary model answer cannot become completion", async () => {
  const local = fixture()
  await plan(local)
  local.apply(await deciding(local.input))
  local.value.toolAck = true
  local.value.toolAckId = `${task.id}:scenario`
  local.value.toolResponse = JSON.stringify({...toolResult, passed: false})
  await expect(composing(local.input)).rejects.toThrow("did not pass")
  local.value.toolResponse = JSON.stringify(toolResult)
  local.apply(await composing(local.input))
  local.value.chatAck = true
  local.value.chatAckId = `${task.id}:answer`
  local.value.chatResponse = JSON.stringify({answer: "ok", status: "invented"})
  await expect(completing(local.input)).rejects.toThrow("exact nonempty")
  expect(local.stored()).toMatchObject({requests: [{phase: "answer", answer: null}]})
})

test("configuration, scoped Environment, corrupted task storage and abort fail before new intentions", async () => {
  expect(() => readAgentConfiguration(JSON.stringify({id: "assistant", tools: [], displays: [], execute: true}))).toThrow("configuration")
  expect(() => readAgentConfiguration(JSON.stringify({...declaration, tools: [{kind: "oracle-tool", name: "arbitrary", input: {}, owner: {meta: "../private"}}]}))).toThrow("invalid tool")
  const local = fixture()
  await planningFailure({...local.input, environment: undefined}, "unavailable")
  const corrupt = fixture({version: 999})
  await planningFailure(corrupt.input, "ledger")
  const abort = new AbortController()
  abort.abort()
  await expect(planning({...local.input, signal: abort.signal})).rejects.toThrow()
  expect(local.reads()).toBe(0)
  expect(local.stored()).toBeNull()
})

test("generic canonical tool definitions are not advertised as executable without their real handler and owner", async () => {
  const generic = {...declaration, tools: [{kind: "oracle-tool", name: "document.inspect", input: {query: "invoice", formats: ["pdf", null]}, owner: {meta: "@tools/document"}}]}
  expect(readAgentConfiguration(JSON.stringify(generic)).tools[0]?.name).toBe("document.inspect")
  const local = fixture()
  local.value.configuration = JSON.stringify(generic)
  await planningFailure(local.input, "No runtime handler")
  expect(local.value.chatRequest).toBeNull()
  expect(local.stored()).toBeNull()
  const missing = fixture()
  missing.observation.graph.runtime.roots[0]!.children = []
  await planningFailure(missing.input, "owning child Atom")
  expect(missing.stored()).toBeNull()
})

const conversation = {id: "conversation-1", text: "Привет! Чем ты можешь помочь?", mode: "conversation" as const}
const acceptChat = (local: ReturnType<typeof fixture>, result: ChatResult) => local.apply({
  chatAck: true, chatAckId: result.ackId, chatResponse: result.response, chatError: result.error,
})

function conversationChat(replies: readonly string[], failPrompt = false) {
  let text = ""
  const opens: Array<string | null> = []
  const prompts: string[] = []
  const mass: MassHandle = {
    async readText() {return text}, async readJson() {return JSON.parse(text)},
    async readBytes() {return new TextEncoder().encode(text)}, async write(value) {text = JSON.stringify(value)},
  }
  const energy: ChatEnergy = {}
  const driver: ChatDriver = {async open({sessionId}) {
    opens.push(sessionId)
    return {sessionId: sessionId ?? "continued-native-conversation", async prompt(prompt) {
      prompts.push(prompt)
      if (failPrompt) throw new Error("Provider outcome is uncertain")
      return replies[prompts.length - 1] ?? ""
    }, async close() {}}
  }}
  return {opens, prompts, session: () => JSON.parse(text) as ChatSession,
    turn: (local: ReturnType<typeof fixture>) => sendChat({request: local.value.chatRequest, mass: {session: mass}, energy, driver, signal: local.input.signal})}
}

test("ordinary conversation needs no Oracle grant, stores raw human text and never interprets response as a tool", async () => {
  const local = fixture()
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  expect(local.reads()).toBe(0)
  expect(local.value.status).toBe("running")
  expect(JSON.parse(local.value.chatRequest!)).toEqual({id: `${conversation.id}:conversation`, prompt: conversation.text})
  const response = JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity"})
  acceptChat(local, {ackId: `${conversation.id}:conversation`, response, error: null, sessionId: "native"})
  await expect(deciding(local.input)).rejects.toThrow("Conversation text")
  local.apply(await replying(local.input))
  expect(local.value).toMatchObject({answer: response, status: "completed", toolRequest: null, chatRequest: null})
  expect(local.stored()).toMatchObject({requests: [{mode: "conversation", phase: "completed", planPrompt: conversation.text, result: null}]})
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  expect(local.value).toMatchObject({answer: response, status: "completed", chatRequest: null, toolRequest: null})
  local.value.task = JSON.stringify({id: conversation.id, text: conversation.text, mode: "scenario", scenario: "agent-system.integrity"})
  await planningFailure(local.input, "already bound")
})

test("conversation, explicit scenario and another conversation share one native Chat and raw transcript", async () => {
  const local = fixture()
  const firstAnswer = "Привет! Могу обсудить задачу и отдельно выполнить разрешённый сценарий."
  const lastAnswer = "Проверка пройдена. Продолжим обсуждение."
  const chat = conversationChat([firstAnswer, JSON.stringify({operation: "scenario.run", scenario: "agent-system.integrity"}), JSON.stringify({answer: "Сценарий подтверждён"}), lastAnswer])
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  acceptChat(local, await chat.turn(local))
  local.apply(await replying(local.input))
  expect(local.value.answer).toBe(firstAnswer)

  const restored = fixture(local.stored())
  restored.value.task = JSON.stringify({...task, mode: "scenario", scenario: "agent-system.integrity"})
  restored.apply(await planning(restored.input))
  acceptChat(restored, await chat.turn(restored))
  restored.apply(await deciding(restored.input))
  restored.apply({toolAck: true, toolAckId: `${task.id}:scenario`, toolResponse: JSON.stringify(toolResult)})
  restored.apply(await composing(restored.input))
  acceptChat(restored, await chat.turn(restored))
  restored.apply(await completing(restored.input))
  expect(restored.value.answer).toBe("Сценарий подтверждён")

  restored.value.task = JSON.stringify({...conversation, id: "conversation-2", text: "Спасибо. Что получилось?"})
  restored.apply(await planning({...restored.input, environment: undefined}))
  acceptChat(restored, await chat.turn(restored))
  restored.apply(await replying(restored.input))
  expect(restored.value.answer).toBe(lastAnswer)
  expect(restored.value.toolRequest).toBeNull()
  expect(chat.opens).toEqual([null, "continued-native-conversation", "continued-native-conversation", "continued-native-conversation"])
  expect(chat.session().messages).toHaveLength(8)
  expect(chat.session().messages[0]).toEqual({requestId: `${conversation.id}:conversation`, role: "user", content: conversation.text})
  expect(chat.session().messages[6]?.content).toBe("Спасибо. Что получилось?")
  expect(chat.session().requests.map(row => row.id)).toEqual([`${conversation.id}:conversation`, `${task.id}:plan`, `${task.id}:answer`, "conversation-2:conversation"])
})

test("empty, failed and uncorrelated conversation replies cannot publish an answer", async () => {
  const local = fixture()
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  acceptChat(local, {ackId: "other:conversation", response: "Ответ", error: null, sessionId: "native"})
  await expect(replying(local.input)).rejects.toThrow("not correlated")
  local.value.chatAckId = `${conversation.id}:conversation`
  for (const response of [null, "", " \n", "x".repeat(128 * 1024 + 1)]) {
    local.value.chatResponse = response
    await expect(replying(local.input)).rejects.toThrow("nonempty bounded")
  }
  local.value.chatError = "Provider failed"
  await expect(replying(local.input)).rejects.toThrow("Chat failed")
  local.apply(await failed(local.input))
  expect(local.stored()).toMatchObject({requests: [{mode: "conversation", phase: "failed", answer: null}]})
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  expect(local.value).toMatchObject({status: "failed", chatRequest: null, toolRequest: null})
})

test("uncertain conversation keeps Chat pending and another task cannot resend its native prompt", async () => {
  const local = fixture()
  const chat = conversationChat([], true)
  local.value.task = JSON.stringify(conversation)
  local.apply(await planning({...local.input, environment: undefined}))
  acceptChat(local, await chat.turn(local))
  local.apply(await failed(local.input))
  expect(chat.session().requests[0]?.state).toBe("pending")
  local.value.task = JSON.stringify({...conversation, id: "fresh-conversation"})
  local.apply(await planning({...local.input, environment: undefined}))
  const refused = await chat.turn(local)
  expect(refused.error).toContain("неопределён")
  expect(chat.opens).toHaveLength(1)
  expect(chat.prompts).toEqual([conversation.text])
})

test("legacy scenario ledger remains readable and unsupported task modes fail before Chat", async () => {
  const local = fixture()
  local.apply(await planning(local.input))
  const old = local.stored() as {requests: Array<{mode?: string}>}
  delete old.requests[0]!.mode
  const restored = fixture(old)
  restored.value.task = JSON.stringify({...task, mode: "scenario", scenario: "agent-system.integrity"})
  restored.apply(await planning({...restored.input, environment: undefined}))
  expect(restored.value.chatRequest).toBe(local.value.chatRequest)
  for (const request of [{...conversation, mode: "shell"}, {...conversation, scenario: "agent-system.integrity"}, {...task, mode: "scenario", scenario: "unknown"}]) {
    const invalid = fixture()
    invalid.value.task = JSON.stringify(request)
    await expect(planning(invalid.input)).rejects.toThrow("supported mode")
    expect(invalid.stored()).toBeNull()
    expect(invalid.value.chatRequest).toBeNull()
  }
})

test("a valid admitted task remains correlated when planning fails before ledger creation", async () => {
  const local = fixture()
  local.value.task = JSON.stringify({...conversation, id: "admitted-task"})
  local.value.configuration = "{}"
  local.apply(await planningFailure({...local.input, environment: undefined}, "configuration"))
  expect(local.value).toMatchObject({activeTaskId: "admitted-task", status: "failed", task: null})
  expect(local.stored()).toBeNull()
  local.apply(await failed(local.input))
  expect(local.value.activeTaskId).toBe("admitted-task")
  expect(local.value.error).toContain("configuration")
})

test("explicit Codespace operation dispatches only to its declared owned Tool and retains a correlated receipt", async () => {
  const local = fixture()
  local.value.configuration = JSON.stringify({...declaration, tools: [{kind: "oracle-tool", name: "codespace.status", input: {}, owner: {meta: "@metafor/codespace"}}]})
  const request = {id: "codespace-1", text: "Проверь рабочее место", mode: "codespace", operation: "status"}
  local.value.task = JSON.stringify(request)
  local.apply(await planning(local.input))
  expect(local.value).toMatchObject({status: "running", chatRequest: null, toolRequest: null})
  expect(JSON.parse(local.value.codespaceRequest!)).toEqual({id: "codespace-1:codespace", operation: "status"})
  local.apply({codespaceAck: true, codespaceAckId: "other:codespace", codespaceResponse: JSON.stringify({schema: "metafor/codespace/v1", version: 1, operation: "status", target: {name: "workspace", account: "operator"}, state: "Available", outcome: "observed"})})
  await expect(completingCodespace(local.input)).rejects.toThrow("not correlated")
  local.value.codespaceAckId = "codespace-1:codespace"
  local.apply(await completingCodespace(local.input))
  expect(local.value).toMatchObject({status: "completed", answer: "Codespace workspace: Available.", codespaceRequest: null, chatRequest: null})
  const restored = fixture(local.stored())
  restored.value.configuration = local.value.configuration
  restored.value.task = JSON.stringify(request)
  restored.apply(await planning({...restored.input, environment: undefined}))
  expect(restored.value).toMatchObject({status: "completed", codespaceRequest: null, chatRequest: null})
  restored.value.task = JSON.stringify({...request, operation: "start"})
  await planningFailure(restored.input, "already bound")
})

test("Codespace start acceptance stays admission and errors cannot become successful completion", async () => {
  const local = fixture()
  local.value.configuration = JSON.stringify({...declaration, tools: [{kind: "oracle-tool", name: "codespace.start", input: {}}]})
  local.value.task = JSON.stringify({id: "start", text: "Запусти рабочее место", mode: "codespace", operation: "start"})
  local.apply(await planning(local.input))
  local.apply({codespaceAck: true, codespaceAckId: "start:codespace", codespaceResponse: JSON.stringify({schema: "metafor/codespace/v1", version: 1, operation: "start", target: {name: "workspace", account: "operator"}, state: "Shutdown", outcome: "start-accepted"})})
  local.value.codespaceError = "Native capability absent"
  await expect(completingCodespace(local.input)).rejects.toThrow("operation failed")
  local.value.codespaceError = null
  local.apply(await completingCodespace(local.input))
  expect(local.value.answer).toBe("Запрос запуска Codespace workspace принят. Наблюдаемое состояние: Shutdown.")
  expect(local.value.chatRequest).toBeNull()
})
