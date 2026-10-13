import {expect, test} from "bun:test"
import {createAgentChatHistory} from "../chat-history"
import type {AtomChatMessage} from "../atom"
const tick = () => Bun.sleep(0)
const messages = (count: number): AtomChatMessage[] => Array.from({length: count}, (_, i) => ({id: `message-${i}`, role: i % 2 ? "assistant" : "user", content: `Реплика ${i}`}))

test("shared history pages the already received snapshot and keeps the visible small message identity stable", async () => {
  const history = createAgentChatHistory(), data = messages(200)
  try {
    history.present("atom:1:chat", data); await tick()
    expect(history.getSnapshot().total).toBe(200)
    expect(history.getSnapshot().rows.length).toBeLessThanOrEqual(32)
    const first = history.getSnapshot(), entry = first.rows[0]!.body
    history.present("atom:1:chat", data.map(row => ({...row}))); await tick()
    expect(history.getSnapshot()).toBe(first)
    expect(history.getSnapshot().rows[0]!.body).toBe(entry)
    history.viewport({ids: [first.rows[0]!.header.id], nearStart: true, nearEnd: false, following: false}); await tick()
    expect(history.getSnapshot().rows.length).toBeLessThanOrEqual(96)
    expect(history.getSnapshot().rows.length).toBeGreaterThan(32)
  } finally {history.dispose()}
})

test("service roles stay explicit; selecting another Chat clears the old window without creating a model turn", async () => {
  const history = createAgentChatHistory()
  try {
    history.present("atom:1:chat", [{id: "service-one", role: "service", content: "Служебное наблюдение"}]); await tick()
    const body = history.getSnapshot().rows[0]!.body
    expect(body?.kind === "message" && body.role).toBe("system")
    history.present("atom:2:chat", []); await tick()
    expect(history.getSnapshot().conversationId).toBe("atom:2:chat")
    expect(history.getSnapshot().rows).toEqual([])
  } finally {history.dispose()}
})

test("Tool headers stay folded without bodies, expand lazily, refresh one correlated result and release details on collapse", async () => {
  const history = createAgentChatHistory()
  const tool: AtomChatMessage = {id: "tool-row", role: "assistant", content: "bun.evaluate", tool: {id: "decision:model-1", name: "bun.evaluate", status: "pending", input: {code: "40 + 2"}, correlation: {modelRequestId: "model-1", taskId: "task", step: 1}}}
  try {
    history.present("atom:1", [...messages(4), tool]); await tick()
    expect(history.getSnapshot().rows.at(-1)).toMatchObject({header: {kind: "tool", status: "pending"}, expanded: false})
    expect(history.getSnapshot().rows.at(-1)?.body).toBeUndefined()
    history.viewport({ids: ["tool-row"], nearStart: false, nearEnd: true, following: true})
    history.expand("tool-row", true); await tick()
    const pending = history.getSnapshot().rows.at(-1)!
    expect(pending.expanded).toBeTrue()
    expect(pending.body?.kind === "tool" && pending.body.call.rawInput).toEqual({code: "40 + 2"})
    const completed: AtomChatMessage = {...tool, tool: {...tool.tool!, status: "completed", output: {operation: "bun.evaluate", result: "42", stdout: "actual stdout", stderr: ""}, correlation: {...tool.tool!.correlation, resultRequestId: "model-2"}}}
    history.present("atom:1", [...messages(4), completed]); await tick()
    const updated = history.getSnapshot().rows.at(-1)!
    expect(updated.header.id).toBe(pending.header.id)
    expect(updated.expanded).toBeTrue()
    expect(updated.body?.kind === "tool" && updated.body.call.rawOutput).toMatchObject({result: "42", stdout: "actual stdout"})
    expect(history.timeline()).toBe(history.timeline())
    history.expand("tool-row", false); await tick()
    expect(history.getSnapshot().rows.at(-1)?.body).toBeUndefined()
    history.setActive(false); await tick()
    expect(history.getSnapshot().rows.every(row => row.body === undefined)).toBeTrue()
  } finally {history.dispose()}
})
