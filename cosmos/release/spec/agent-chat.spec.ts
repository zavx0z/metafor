import {expect, test} from "bun:test"
import {projectAgentChatMessages} from "../main/agent-chat"

const model = (char: string) => `model:${char.repeat(64)}`
const prompt = (taskId: string, step: number, result?: unknown) => JSON.stringify({phase: "development", task: {id: taskId, text: "Проверь среду"}, step, ...(result ? {result} : {})})
function fixture() {
  const first = model("a"), next = model("b"), initial = prompt("task-a", 1), followup = prompt("task-a", 2, {operation: "bun.evaluate", jobId: "observed-job", state: "completed", result: "42", error: null, stdout: "actual stdout", stderr: ""})
  return {requests: [{id: first, prompt: initial}, {id: next, prompt: followup}], messages: [
    {requestId: first, role: "user", content: initial}, {requestId: first, role: "assistant", content: JSON.stringify({operation: "bun.evaluate", code: "40 + 2"})},
    {requestId: next, role: "user", content: followup}, {requestId: next, role: "assistant", content: JSON.stringify({answer: "Проверено: 42"})},
  ]}
}

test("one real model decision and its exact next-step result become one typed Tool row with stable correlation", () => {
  const data = fixture(), rows = projectAgentChatMessages(data)
  expect(rows.map(row => row.content)).toEqual(["Проверь среду", "bun.evaluate", "Проверено: 42"])
  expect(rows[1]?.tool).toMatchObject({name: "bun.evaluate", status: "completed", input: {code: "40 + 2"}, output: {jobId: "observed-job", result: "42", stdout: "actual stdout"},
    correlation: {modelRequestId: model("a"), resultRequestId: model("b"), taskId: "task-a", step: 1}})
  const pending = fixture(); pending.messages = pending.messages.slice(0, 2)
  expect(projectAgentChatMessages(pending)[1]?.id).toBe(rows[1]?.id)
  expect(projectAgentChatMessages(pending)[1]?.tool?.status).toBe("pending")
  const failure = fixture()
  failure.requests[1]!.prompt = prompt("task-a", 2, {operation: "bun.evaluate", state: "failed", result: null, error: "observed failure"})
  failure.messages[2]!.content = failure.requests[1]!.prompt
  expect(projectAgentChatMessages(failure)[1]?.tool).toMatchObject({status: "failed", output: {error: "observed failure"}})
})

test("other task, malformed operation and ambiguous decisions never acquire someone else's result", () => {
  for (const kind of ["other-task", "wrong-operation", "ambiguous"] as const) {
    const data = fixture()
    if (kind === "other-task") {data.requests[1]!.prompt = prompt("other-task", 2, {operation: "bun.evaluate", state: "completed", result: "unrelated"}); data.messages[2]!.content = data.requests[1]!.prompt}
    if (kind === "wrong-operation") {data.requests[1]!.prompt = prompt("task-a", 2, {operation: "other", state: "completed", result: "unrelated"}); data.messages[2]!.content = data.requests[1]!.prompt}
    if (kind === "ambiguous") {data.requests.push({id: model("c"), prompt: prompt("task-a", 1)}); data.messages.splice(2, 0, {requestId: model("c"), role: "assistant", content: JSON.stringify({operation: "bun.evaluate", code: "40 + 2"})})}
    const rows = projectAgentChatMessages(data)
    expect(rows.filter(row => row.tool).every(row => row.tool?.status === "pending" && row.tool.output === undefined)).toBeTrue()
    expect(rows.some(row => row.role === "service" && row.content.includes("без подтверждённой связи"))).toBeTrue()
  }
})

test("literal protocol-like JSON remains user text and service feedback retains its own row", () => {
  const data = fixture(), literal = JSON.stringify({operation: "bun.evaluate", code: "never execute"})
  data.messages.push({requestId: "literal:conversation", role: "user", content: literal})
  const rows = projectAgentChatMessages({...data, feedback: [{id: "feedback", role: "service", includedIn: model("b"), text: "observed feedback", correlation: {clientId: "client", connectionId: "connection", annotationId: "annotation"}}]})
  expect(rows.at(-1)).toMatchObject({role: "user", content: literal})
  expect(rows.at(-1)?.tool).toBeUndefined()
  expect(rows.find(row => row.id === "service:feedback")).toMatchObject({role: "service", content: "Служебное наблюдение интерфейса"})
  expect(rows.findIndex(row => row.id === "service:feedback")).toBeLessThan(rows.findIndex(row => row.content === "Проверено: 42"))
})
