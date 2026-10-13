import type {AtomRef} from "@metafor/types/metafor/graph"
import type {BrowserPeerClient} from "@zavx0z/provider-tech-peer/browser-types"
import type {CapsuleRtcIceServer} from "@capsule/webrtc/ice"
import type {ProviderBinding, ProviderRegistry} from "@metafor/types/metafor/providers"
import type {ProfileTargetDescriptor, ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"
import type {AgentConfiguration, AgentJsonValue, AgentToolReference, AgentFeedbackRequest, AgentFeedbackReceipt} from "@metafor/types/metafor/agents"

/** Наблюдаемый Agent Tool intent и связанный результат; это не выдуманное native ACP событие. */
export type AtomChatToolCall = Readonly<{
  id: string
  name: "bun.evaluate" | "scenario.run"
  status: "pending" | "completed" | "failed"
  input: AgentJsonValue
  output?: AgentJsonValue
  correlation: Readonly<{modelRequestId: string; taskId: string | null; step: number | null; resultRequestId?: string}>
}>
/** Строка собственной беседы; tool details раскрываются отдельно от обычного текста. */
export type AtomChatMessage = Readonly<{id: string; role: "user" | "assistant" | "service"; content: string; tool?: AtomChatToolCall}>

/** Фактически объявленные provider settings; пустые варианты не подменяются локальным каталогом моделей. */
export type AtomProviderSnapshot = Readonly<{
  id: string
  sessionId: string | null
  model: string | null
  reasoning: string | null
  models: readonly Readonly<{id: string; label: string}>[]
  reasoningLevels: readonly Readonly<{id: string; label: string}>[]
}>

/** One canonical Provider registry projection; no URL, profile credentials or native group token. */
export type AtomProvidersSnapshot = Readonly<{ref: AtomRef; registry: ProviderRegistry}>
export type AtomProviderRegistryError = Readonly<{ref: AtomRef; message: string}>
/** Exact owner Provider scope для просмотра; Agent binding/model settings сюда не входят. */
export type ProviderBrowserTarget = Readonly<{providerRef: AtomRef; entryId: string}>

/** An exclusive viewer grant. Closing its client releases only this preview, never the shared native peer network or ACP session. */
export type AtomBrowserConnection = Readonly<{
  client: BrowserPeerClient
  binding: ProviderBinding
  iceServers: CapsuleRtcIceServer[]
  /** Verified native profile media capabilities; omission never grants microphone capture. */
  media?: Readonly<{audio: boolean; microphoneTransport: "data-channel" | "rtp" | null}>
}>

/**
Read-only проекция одного owning Atom для [представления Agent](./README.md).
Хост владеет получением Graph/Mass и обновлением snapshot. Компонент не хранит
второй Store и не выводит canonical факт из результата UI callback.
*/
export type AtomViewSnapshot = Readonly<{
  ref: AtomRef
  revision: string
  state: string | null
  configuration: AgentConfiguration
  chat: readonly AtomChatMessage[]
  provider: AtomProviderSnapshot | null
  providers?: AtomProvidersSnapshot
  providerBinding?: Readonly<{id: string | null; locked: boolean}>
  profileTargets?: readonly ProfileTargetDescriptor[]
  profileError?: string | null
  /** Имена реально доступных операций назначенного Environment, отдельно от authored tools. */
  operations: readonly string[]
  context: AgentJsonValue
}>

/** Callback связывает UI с уже назначенным Environment; имя нового RPC отсюда не возникает. */
export type AtomViewActions = Readonly<{
  connectBrowser?(entryId: string, signal: AbortSignal): Promise<AtomBrowserConnection>
  selectProvider?(entryId: string, signal: AbortSignal): Promise<void>
  profileIntent?(request: ProfileIntentRequest, signal: AbortSignal): Promise<void>
  sendMessage?(text: string, signal: AbortSignal): Promise<void>
  /** Сохраняет служебный контекст без изменения draft, task или запуска модельного turn. */
  feedback?(request: AgentFeedbackRequest, signal: AbortSignal): Promise<AgentFeedbackReceipt>
  /** Явная задача разработки с назначенным Bun; обычный sendMessage остаётся беседой. */
  runDevelopment?(text: string, signal: AbortSignal): Promise<void>
  prepareProviderSettings?(signal: AbortSignal): Promise<void>
  configureProvider?(settings: Readonly<{model: string | null; reasoning: string | null}>, signal: AbortSignal): Promise<void>
  invokeTool?(tool: AgentToolReference, signal: AbortSignal): Promise<void>
}>

/**
Явная привязка к owning Atom. Identity, snapshot и subscription предоставляет
владелец проекции; actions вызывают его выданное Environment. Object identity
и исходные snapshots сохраняются. Нет global context, canvas или скрытого registry.
Сценарии идентичности — [atom tests](./test/atom.test.ts).
*/
export type AtomContext = Readonly<{
  ref: AtomRef
  getSnapshot(): AtomViewSnapshot
  subscribe(listener: () => void): () => void
  actions: AtomViewActions
}>

/**
Получает исключительно переданную runtime-привязку owning Atom. Декларативный
`{kind:"atom",scope:"owner"}` должен разрешить host до mount; он не является live
context. Функция не создаёт store и возвращает тот же object. Реактивное чтение
компонента использует его public subscription.
*/
export function useAtom(atom: AtomContext): AtomContext {
  if (!atom || typeof atom.ref !== "string" || !atom.ref.trim() || typeof atom.getSnapshot !== "function"
    || typeof atom.subscribe !== "function" || atom.actions === null || typeof atom.actions !== "object") {
    throw new TypeError("Agent view требует явно переданный AtomContext")
  }
  if (atom.getSnapshot().ref !== atom.ref) throw new Error("Atom view snapshot принадлежит другой identity")
  return atom
}
