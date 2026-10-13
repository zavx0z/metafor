import type {ProviderBinding} from "@metafor/types/metafor/providers"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {AgentFeedbackRequest} from "@metafor/types/metafor/agents"

/** Один коррелированный turn [беседы](./README.md); prompt передаётся модели буквально. */
export type ChatRequest = Readonly<{id: string; prompt: string}>

/** Подтверждённый результат turn либо явный отказ без утверждения ответа модели. */
export type ChatResult = Readonly<{
  ackId: string
  response: string | null
  error: string | null
  sessionId: string | null
}>

/** Полный текст сообщения; requestId связывает transcript с устойчивым журналом запросов. */
export type ChatMessage = Readonly<{requestId: string; role: "user" | "assistant"; content: string}>

/** Pending is uncertain after prompt start. Failed proves prompt was not called and replays its terminal refusal. */
export type ChatRequestRecord = ChatRequest & Readonly<{providerRequest?: string; providerPrompt?: string; feedbackIds?: readonly string[]}> & (
  | Readonly<{state: "pending"}>
  | Readonly<{state: "completed"; result: ChatResult}>
  | Readonly<{state: "failed"; result: ChatResult}>
)

/** Служебная запись отделена от user/assistant transcript и не вызывает Provider. */
export type ChatFeedbackRecord = AgentFeedbackRequest & {role: "service"; includedIn: string | null}

/**
Единственный JSON Mass [Chat](./README.md). Native identity и весь transcript
сохраняются до подтверждения результата; handles и credentials сюда не входят.
Проверки повторов и аварий находятся в [send tests](./test/send.test.ts).
*/
export type ChatSession = {
  version: 1
  provider: string | null
  binding?: ProviderBinding
  providerRef?: string
  bindingId?: string | null
  sessionId: string | null
  messages: ChatMessage[]
  requests: ChatRequestRecord[]
  feedback?: ChatFeedbackRecord[]
}

/** Публичный action получает только собственный Mass и live Energy; driver подменяется в изолированных tests. */
export type ChatSendInput = Readonly<{
  request: string | null
  binding?: string | null
  providerRef?: string | null
  mass: Readonly<{session: MassHandle}>
  signal: AbortSignal
}>

/** Chat receives only its child's ordinary correlated Field projection, never a native driver handle. */
export type ChatReceiveInput = ChatSendInput & Readonly<{
  providerAck: boolean
  providerAckId: string
  providerResponse: string | null
  providerError: string | null
  providerSessionId: string | null
  providerOutcome: string | null
  providerBindingDescriptor: string | null
}>
export type ChatActionResult = ChatResult & Readonly<{ack: boolean; providerRequest: string | null; providerAck: boolean; providerAckId: string;
  providerResponse: string | null; providerError: string | null; providerSessionId: string | null;
  providerOutcome: "completed" | "not-sent" | "uncertain" | null; providerBindingDescriptor: string | null}>

