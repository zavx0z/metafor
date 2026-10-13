/** Изолированный ACP executable; model/auth/network здесь нет. Скомпилированный JS используется acceptance harness. */
import {agent, methods, ndJsonStream, PROTOCOL_VERSION, type AgentConnection} from "@agentclientprotocol/sdk"
import {readFile, writeFile} from "node:fs/promises"
import {Readable, Writable} from "node:stream"
import {spawn} from "node:child_process"

type Store = {sessionId: string; prompts: string[]; resumes: number}
const path = process.env.ORACLE_AGENT_FIXTURE_STORE
if (!path) throw new Error("ACP fixture требует собственный store")
const descendant = process.env.ORACLE_AGENT_FIXTURE_DESCENDANT_EXECUTABLE
if (descendant) {
  const child = spawn(process.execPath, [descendant], {env: process.env, stdio: "ignore"})
  child.unref()
  const marker = process.env.ORACLE_AGENT_FIXTURE_DESCENDANT_MARKER
  if (!marker) throw new Error("Descendant fixture requires its private marker")
  const deadline = Date.now() + 5000
  while (!await Bun.file(marker).exists()) {
    if (Date.now() >= deadline) throw new Error("Descendant fixture did not start")
    await Bun.sleep(10)
  }
}
if (process.env.ORACLE_AGENT_FIXTURE_ASSERT_FENCE === "1"
  && (process.env.COSMOS_QUANTUM_TOKEN !== undefined || process.env.COSMOS_CONTROL_TOKEN !== undefined
    || process.env.ORACLE_ENVIRONMENT_GRAPH_SCOPES !== undefined || process.env.ORACLE_ENVIRONMENT_FIXTURE_TOKEN !== undefined
    || process.env.ORACLE_AGENT_PROVIDER_CONFIG !== undefined
    || process.env.ORACLE_REPL_CONFIG !== undefined
    || process.env.METAFOR_FIXTURE_CONTEXT !== undefined)) throw new Error("Private domain context leaked into provider")
async function read(): Promise<Store | null> {
  try {return JSON.parse(await readFile(path!, "utf8")) as Store}
  catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error}
}
let current: Store | null = null
let connection: AgentConnection | undefined
const application = agent({name: "metafor-chat-fixture"})
  .onConnect(value => {connection = value})
  .onRequest(methods.agent.initialize, async () => {
    if (process.env.ORACLE_AGENT_FIXTURE_DELAY_INITIALIZE === "1") await Bun.sleep(10000)
    return {protocolVersion: PROTOCOL_VERSION, agentCapabilities: {loadSession: true, sessionCapabilities: {resume: {}}}}
  })
  .onRequest(methods.agent.session.new, async () => {
    if (await read()) throw new Error("Fixture rejects creating another session over persisted native history")
    current = {sessionId: crypto.randomUUID(), prompts: [], resumes: 0}
    await writeFile(path, JSON.stringify(current))
    return {sessionId: current.sessionId}
  })
const restore = async (id: string) => {
  current = await read()
  if (!current || current.sessionId !== id || process.env.ORACLE_AGENT_FIXTURE_FAIL_RESTORE === "1") throw new Error("Native session missing")
  current.resumes++
  await writeFile(path, JSON.stringify(current))
  await connection!.client.notify(methods.client.session.update, {sessionId: id, update: {sessionUpdate: "agent_message_chunk", content: {type: "text", text: "replay must not leak"}}})
  return {}
}
const running = application
  .onRequest(methods.agent.session.resume, ({params}) => restore(params.sessionId))
  .onRequest(methods.agent.session.load, ({params}) => restore(params.sessionId))
  .onRequest(methods.agent.session.prompt, async ({params}) => {
    if (!current || params.sessionId !== current.sessionId) throw new Error("Wrong session")
    const text = params.prompt.flatMap(block => block.type === "text" ? [block.text] : []).join("")
    const index = current.prompts.length
    current.prompts.push(text)
    await writeFile(path, JSON.stringify(current))
    if (process.env.ORACLE_AGENT_FIXTURE_PERMISSION === "1") {
      const permission = await connection!.client.request(methods.client.session.requestPermission, {sessionId: current.sessionId,
        toolCall: {toolCallId: "forbidden", title: "Forbidden native operation"}, options: [{optionId: "allow", name: "Allow", kind: "allow_once"}]})
      if (permission.outcome.outcome !== "cancelled") throw new Error("Fixture permission was unexpectedly allowed")
    }
    let response = JSON.stringify({echo: text, turn: index + 1})
    const replies = process.env.ORACLE_AGENT_FIXTURE_REPLY_FILE
    if (replies) {
      const values: unknown = JSON.parse(await readFile(replies, "utf8"))
      if (!Array.isArray(values) || values[index] === undefined) throw new Error("Fixture reply queue exhausted")
      response = typeof values[index] === "string" ? values[index] : JSON.stringify(values[index])
    }
    const identity = process.env.ORACLE_AGENT_FIXTURE_FOREIGN === "1" ? "foreign-session" : current.sessionId
    if (process.env.ORACLE_AGENT_FIXTURE_PRELUDE === "1") await connection!.client.notify(methods.client.session.update, {
      sessionId: identity, update: {sessionUpdate: "agent_message_chunk", messageId: `commentary:${index}`, content: {type: "text", text: "Working on the request"}},
    })
    for (const part of [response.slice(0, 3), response.slice(3)]) await connection!.client.notify(methods.client.session.update, {
      sessionId: identity, update: {sessionUpdate: "agent_message_chunk", messageId: `reply:${index}`, content: {type: "text", text: part}},
    })
    return {stopReason: "end_turn" as const}
  })
  .onNotification(methods.agent.session.cancel, () => {})
  .connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>))
await running.closed
