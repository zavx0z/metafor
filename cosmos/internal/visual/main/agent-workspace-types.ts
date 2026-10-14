import type {AtomContext, AtomBrowserConnection, AtomProvidersSnapshot, AtomProviderRegistryError, ProviderBrowserTarget, AtomChatMessage} from "@metafor/agent/atom"
import type {OfficeBounds} from "@metafor/agent/office-layout"
import type {AtomRef, Graph} from "@metafor/types/metafor/graph"
import type {AgentConfigurationObservation} from "@metafor/types/metafor/agent-observation"
import type {ProfileCatalogReceipt, ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"
import type {CosmosAgentScope, CosmosAgentProfile, CosmosAgentProfileUpdate} from "@metafor/types/cosmos/agent-profile"
import type {CosmosRoomGroups, CosmosRoomScope} from "@metafor/types/cosmos/conversation-groups"
import type {CosmosConversationStore as ConversationStore, CosmosConversationSnapshot, CosmosConversationSelection, CosmosConversationAgent, CosmosAtomConversationScope, CosmosLegacyConversation} from "@metafor/types/cosmos/conversations"
export type {CosmosConversationSnapshot, CosmosConversationSelection} from "@metafor/types/cosmos/conversations"
export type CosmosLegacyChatView = Readonly<{record: CosmosLegacyConversation; messages: readonly AtomChatMessage[]}>

/**
Window предоставляет scoped клиент [бесед Cosmos](../../../README.md#беседы-и-представление-агентов).
Visual не создаёт transport или canonical Store. Dispose освобождает только
lease клиента и чтения; уже принятый turn сохраняется у backend.
*/
export interface CosmosConversationClient {
  readonly scope: CosmosAgentScope
  subscribe(sessionId: string, listener: (value: CosmosConversationSnapshot) => void, onError: (error: Error) => void): () => void
  list(signal?: AbortSignal): Promise<readonly CosmosConversationSnapshot[]>
  read(sessionId?: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  readLegacy(signal?: AbortSignal): Promise<CosmosLegacyConversation | null>
  legacy(signal?: AbortSignal): Promise<CosmosLegacyChatView | null>
  create(label?: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  rename(sessionId: string, label: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  delete(sessionId: string, signal?: AbortSignal): Promise<void>
  prepare(sessionId: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  cancel(sessionId: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  stop(sessionId: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  permission(sessionId: string, id: string, optionId: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  configure(sessionId: string, id: string, value: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  configureExecution(sessionId: string, selection: CosmosConversationSelection, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  prompt(sessionId: string, text: string, requestId: string, signal?: AbortSignal): Promise<CosmosConversationSnapshot>
  displayHistory(sessionId: string, query?: Parameters<ConversationStore["displayHistory"]>[1], signal?: AbortSignal): ReturnType<ConversationStore["displayHistory"]>
  historyItem(sessionId: string, id: string, signal?: AbortSignal): ReturnType<ConversationStore["historyItem"]>
  groupHistory(sessionId: string, groupId: string, query?: Parameters<ConversationStore["groupHistory"]>[2], signal?: AbortSignal): ReturnType<ConversationStore["groupHistory"]>
  groupHistoryItem(sessionId: string, groupId: string, id: string, signal?: AbortSignal): ReturnType<ConversationStore["groupHistoryItem"]>
  historyEvidence(sessionId: string, id: string, query?: Parameters<ConversationStore["historyEvidence"]>[2], signal?: AbortSignal): ReturnType<ConversationStore["historyEvidence"]>
  historyContent(sessionId: string, id: string, query?: Parameters<ConversationStore["historyContent"]>[2], signal?: AbortSignal): ReturnType<ConversationStore["historyContent"]>
  historyDetail(sessionId: string, id: string, query?: Parameters<ConversationStore["historyDetail"]>[2], signal?: AbortSignal): ReturnType<ConversationStore["historyDetail"]>
  historyTerminal(sessionId: string, id: string, query?: Parameters<ConversationStore["historyTerminal"]>[2], signal?: AbortSignal): ReturnType<ConversationStore["historyTerminal"]>
  dispose(): void
}

/** Каталог Room: явное создание actors/групп не создаёт Quantum Atom и не отправляет prompt. */
export interface CosmosConversationDirectoryClient {
  listAgents(scope: CosmosAtomConversationScope, signal?: AbortSignal): Promise<readonly CosmosConversationAgent[]>
  createAgent(scope: CosmosAtomConversationScope, name: string, signal?: AbortSignal): Promise<CosmosConversationAgent>
  ensureAgent(scope: CosmosAtomConversationScope, name: string, signal?: AbortSignal): Promise<CosmosConversationAgent>
  readProfile(scope: CosmosAgentScope, signal?: AbortSignal): Promise<CosmosAgentProfile>
  readLegacy(scope: CosmosAgentScope, signal?: AbortSignal): Promise<CosmosLegacyConversation | null>
  legacy(scope: CosmosAgentScope, signal?: AbortSignal): Promise<CosmosLegacyChatView | null>
  updateProfile(scope: CosmosAgentScope, update: CosmosAgentProfileUpdate, signal?: AbortSignal): Promise<CosmosAgentProfile>
  listGroups(scope: CosmosRoomScope, signal?: AbortSignal): Promise<CosmosRoomGroups>
  createGroup(scope: CosmosRoomScope, expectedRevision: number, title: string, members: readonly string[], signal?: AbortSignal): Promise<CosmosRoomGroups>
  updateGroup(scope: CosmosRoomScope, expectedRevision: number, id: string, title: string, members: readonly string[], signal?: AbortSignal): Promise<CosmosRoomGroups>
  forActor(scope: CosmosAgentScope): CosmosConversationClient
  dispose(): void
}

/** Значение редактируемого Field публичного Graph; массив содержит конечные числа. */
export type AgentFieldValue = string | number | boolean | null | readonly number[]
/** Один элемент общей операции сохранения; expectedValue фиксируется при начале правки. */
export type AgentFieldUpdate = Readonly<{field: string; value: AgentFieldValue; expectedValue: AgentFieldValue}>

/** Browser binding; transport, identity grants и канонические snapshots принадлежат передавшему source. */
export type AgentWorkspaceSource = Readonly<{
  getSnapshot(): AgentWorkspaceSnapshot
  subscribe(listener: () => void): () => void
  conversations?: CosmosConversationDirectoryClient
  refreshRoom?(atomRef: AtomRef): Promise<void>
  saveAgentProfile?(scope: CosmosAgentScope, update: CosmosAgentProfileUpdate): Promise<CosmosAgentProfile>
  createAgent?(atomRef: AtomRef, name: string): Promise<void>
  connectSlot?(slotRef: AtomRef, signal: AbortSignal): Promise<void>
  editField?(atomRef: AtomRef, field: string, value: string | number | boolean | null, expectedValue: string | number | boolean | null, signal: AbortSignal): Promise<void>
  /** Передаёт все черновики Atom одним запросом; источник подтверждает общую запись либо отклоняет её. */
  saveFields?(atomRef: AtomRef, updates: readonly AgentFieldUpdate[], signal: AbortSignal): Promise<void>
  profileIntent?(request: ProfileIntentRequest, signal: AbortSignal): Promise<void>
  connectProviderBrowser?(target: ProviderBrowserTarget, signal: AbortSignal): Promise<AtomBrowserConnection>
}>
/** A real declared ordinary slot; it is not itself an Agent or an implicit model request. */
export type AgentConnectableSlot = Readonly<{
  ref: AtomRef
  meta: "@metafor/agent-slot"
  owner: Readonly<{ref: AtomRef; meta: string}> | null
  enabled: boolean
  state: string | null
  configuration: AgentConfigurationObservation
}>
/** Один fixed prism owning Atom и только явно подключённые Agent. */
export type AgentOfficeSnapshot = Readonly<{
  id: string
  owner: AtomRef
  label: string
  bounds: OfficeBounds
  agents: readonly AgentOfficeActor[]
}>
/** Cosmos-участник комнаты может ссылаться на прежний Quantum Agent, но не изображает его наличие. */
export type AgentOfficeActor = Readonly<{id: string; scope?: CosmosAgentScope; profile?: CosmosAgentProfile; atom?: AtomContext}>
/** Отсутствие подключённых Agent является обычным ready состоянием, не поводом создавать AI. */
export type AgentWorkspaceSnapshot = Readonly<{
  status: "loading" | "ready" | "error"
  error?: string | null
  /** Последний валидный полный Graph, включая Atoms без Agent; null до первого чтения. */
  graph: Graph | null
  /** Назначенный host opaque address; не causal cut. */
  verseId: string | null
  observedWorld: Readonly<{root: string; cutId: string}> | null
  offices: readonly AgentOfficeSnapshot[]
  providerRegistries?: readonly AtomProvidersSnapshot[]
  providerRegistryErrors?: readonly AtomProviderRegistryError[]
  connectableSlots?: readonly AgentConnectableSlot[]
  profiles?: ProfileCatalogReceipt | null
  profileError?: string | null
}>

