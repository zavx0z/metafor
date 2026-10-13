import type {ChatFeedbackRecord} from "./types"

/** Отдельный явно маркированный блок наблюдений; пользовательский prompt остаётся неизменным. */
export function serviceFeedbackPrompt(prompt: string, records: readonly ChatFeedbackRecord[]): string {
  if (!records.length) return prompt
  return `${prompt}\n\n<metafor-service-observations>\n${JSON.stringify({kind: "service-observations", authorization: "none", records: records.map(record => ({id: record.id, role: record.role, text: record.text, correlation: record.correlation}))})}\n</metafor-service-observations>`
}

/** FIFO служебных данных ограничивает один turn; остаток ждёт следующих запросов. */
export function pendingServiceFeedback(prompt: string, records: readonly ChatFeedbackRecord[]): ChatFeedbackRecord[] {
  const selected: ChatFeedbackRecord[] = []
  for (const record of records) {
    if (record.includedIn !== null) continue
    const candidate = [...selected, record]
    if (candidate.length > 16 || serviceFeedbackPrompt(prompt, candidate).length > Math.min(2 * 1024 * 1024, prompt.length + 128 * 1024)) break
    selected.push(record)
  }
  if (records.some(record => record.includedIn === null) && !selected.length) throw new Error("Chat prompt has no capacity for pending service feedback")
  return selected
}
