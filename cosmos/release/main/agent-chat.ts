import type {AtomChatMessage, AtomChatToolCall} from "@metafor/agent/atom"
import {parseAgentFeedbackRequest, type AgentJsonValue} from "@metafor/types/metafor/agents"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const json = (value: string): Record<string, unknown> | null => {try {const parsed: unknown = JSON.parse(value); return object(parsed) ? parsed : null} catch {return null}}
type Protocol = {phase: "plan" | "answer" | "development"; prompt: string; data: Record<string, unknown>; taskId: string | null; step: number | null}
type Row = {message: AtomChatMessage; requestId: string; index: number}

/** Chat Mass остаётся источником; только объявленный request protocol определяет Tool, обычный пользовательский JSON — текст. */
export function projectAgentChatMessages(value: Record<string, unknown> | null): AtomChatMessage[] {
  if (!value) return []
  const protocols = new Map<string, Protocol>()
  for (const request of value.requests as unknown[]) if (object(request) && typeof request.id === "string" && typeof request.prompt === "string") {
    const data = json(request.prompt)
    if (!data || !object(data.task) || typeof data.task.text !== "string") continue
    const phase = data.phase
    if ((phase === "plan" || phase === "answer") && request.id.endsWith(`:${phase}`) || phase === "development" && /^model:[a-f0-9]{64}$/u.test(request.id))
      protocols.set(request.id, {phase: phase as Protocol["phase"], prompt: request.prompt, data,
        taskId: typeof data.task.id === "string" ? data.task.id : null,
        step: Number.isSafeInteger(data.step) && Number(data.step) >= 1 ? Number(data.step) : null})
  }
  const rows: Row[] = [], calls = new Map<string, Row[]>(), results: Array<{key: string; requestId: string; index: number; output: Record<string, unknown>}> = []
  const key = (protocol: Protocol, previous = false) => protocol.taskId === null ? null : protocol.phase === "development"
    ? protocol.step === null ? null : JSON.stringify([protocol.taskId, protocol.step - (previous ? 1 : 0)]) : JSON.stringify([protocol.taskId, "scenario"])
  for (const [index, raw] of (value.messages as unknown[]).entries()) {
    if (!object(raw) || typeof raw.requestId !== "string" || typeof raw.content !== "string" || raw.role !== "user" && raw.role !== "assistant") throw new Error("История содержит неподдерживаемое сообщение")
    const protocol = protocols.get(raw.requestId), data = json(raw.content)
    const id = `${raw.requestId}:${raw.role}:${index}`
    let message: AtomChatMessage = {id, role: raw.role, content: raw.content}
    if (protocol && raw.role === "user" && raw.content === protocol.prompt) {
      if (protocol.phase === "development" && protocol.step === 1 || protocol.phase === "plan") {
        message = {id, role: "user", content: (protocol.data.task as {text: string}).text}
      } else if (object(protocol.data.result)) {
        const pair = key(protocol, protocol.phase === "development")
        if (pair) results.push({key: pair, requestId: raw.requestId, index, output: protocol.data.result})
        else rows.push({message: {id, role: "service", content: "Результат инструмента без подтверждённой связи"}, requestId: raw.requestId, index})
        continue
      } else message = {id, role: "service", content: "Контекст выполнения"}
    } else if (protocol && raw.role === "assistant" && data) {
      let tool: AtomChatToolCall | undefined
      if (protocol.phase === "development" && Object.keys(data).length === 2 && data.operation === "bun.evaluate" && typeof data.code === "string")
        tool = {id: `decision:${raw.requestId}`, name: "bun.evaluate", status: "pending", input: {code: data.code}, correlation: {modelRequestId: raw.requestId, taskId: protocol.taskId, step: protocol.step}}
      if (protocol.phase === "plan" && Object.keys(data).length === 2 && data.operation === "scenario.run" && data.scenario === "agent-system.integrity")
        tool = {id: `decision:${raw.requestId}`, name: "scenario.run", status: "pending", input: {scenario: data.scenario}, correlation: {modelRequestId: raw.requestId, taskId: protocol.taskId, step: null}}
      if (tool) message = {id, role: "assistant", content: tool.name, tool}
      else if (protocol.phase !== "plan" && Object.keys(data).length === 1 && typeof data.answer === "string") message = {id, role: "assistant", content: data.answer}
    }
    const row = {message, requestId: raw.requestId, index}
    rows.push(row)
    if (message.tool && protocol) {const pair = key(protocol); if (pair) {const matches = calls.get(pair) ?? []; matches.push(row); calls.set(pair, matches)}}
  }
  for (const result of results) {
    const matches = (calls.get(result.key) ?? []).filter(row => row.index < result.index)
    const row = matches.length === 1 ? matches[0] : undefined, tool = row?.message.tool
    const status = tool?.name === "bun.evaluate" && result.output.operation === "bun.evaluate" && (result.output.state === "completed" || result.output.state === "failed") ? result.output.state
      : tool?.name === "scenario.run" && typeof result.output.passed === "boolean" ? result.output.passed ? "completed" : "failed" : null
    if (row && tool && status && tool.output === undefined) row.message = {...row.message, tool: {...tool, status, output: result.output as AgentJsonValue,
      correlation: {...tool.correlation, resultRequestId: result.requestId}}}
    else rows.push({message: {id: `${result.requestId}:result`, role: "service", content: "Результат инструмента без подтверждённой связи"}, requestId: result.requestId, index: result.index})
  }
  rows.sort((left, right) => left.index - right.index)
  const feedback = new Map<string, AtomChatMessage[]>(), trailing: AtomChatMessage[] = []
  if (value.feedback !== undefined) {
    if (!Array.isArray(value.feedback) || value.feedback.length > 512) throw new Error("Недопустимая история служебной обратной связи")
    for (const record of value.feedback) {
      if (!object(record) || record.role !== "service" || !(record.includedIn === null || typeof record.includedIn === "string")) throw new Error("Недопустимая служебная запись")
      const request = parseAgentFeedbackRequest({id: record.id, text: record.text, correlation: record.correlation})
      let content = "Служебное наблюдение интерфейса"
      const data = json(request.text)
      if (data?.kind === "ui.annotation.selected" && object(data.annotation)) {
        const item = data.annotation, tag = typeof item.tag === "string" ? item.tag.slice(0, 64) : "элемент", owner = typeof item.ownAtomRef === "string" ? item.ownAtomRef.slice(0, 256) : "Atom неизвестен"
        content = `Аннотация · ${tag} · ${owner}`
      }
      const message: AtomChatMessage = {id: `service:${request.id}`, role: "service", content}
      if (typeof record.includedIn === "string") {const list = feedback.get(record.includedIn) ?? []; list.push(message); feedback.set(record.includedIn, list)}
      else trailing.push(message)
    }
  }
  const result: AtomChatMessage[] = []
  for (const row of rows) {const service = feedback.get(row.requestId); if (service) {result.push(...service); feedback.delete(row.requestId)}; result.push(row.message)}
  return [...result, ...[...feedback.values()].flat(), ...trailing]
}
