import type {StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {CosmosRoomScope} from "./conversation-groups"
import type {CosmosAgentScope, CosmosAgentProfile, CosmosAgentProfileUpdate} from "./agent-profile"

export const COSMOS_CONVERSATIONS_PATH = "/conversations"
export type CosmosConversationScope = CosmosAgentScope
export type CosmosAtomConversationScope = Pick<CosmosAgentScope, "verseId" | "atomRef">
export type CosmosConversationAgent = Readonly<{scope: CosmosAgentScope; profile: CosmosAgentProfile}>
export type CosmosConversationStore = StorybookChatSession.Output
export type CosmosConversationSnapshot = Awaited<ReturnType<CosmosConversationStore["read"]>>
export type CosmosConversationSelection = Parameters<CosmosConversationStore["configureExecution"]>[1]["selection"]
export type CosmosConversationProfile = CosmosAgentProfile

/** Неизменённый архив прежней Quantum Chat. Он не является продолжаемой native сессией Cosmos. */
export type CosmosLegacyConversation = Readonly<{
  version: 1
  scope: CosmosAgentScope
  archivedAt: string
  source: Readonly<{root: string; chat: Readonly<Record<string, unknown>>; frontier: Readonly<Record<string, unknown>>; digest: string}>
  session: unknown
}>

type Selected = Readonly<{scope: CosmosAgentScope; sessionId?: string}>
export type CosmosConversationRequest =
  | Readonly<{action: "group.list"; scope: CosmosRoomScope}>
  | Readonly<{action: "group.create"; scope: CosmosRoomScope; expectedRevision: number; title: string; members: readonly string[]}>
  | Readonly<{action: "group.update"; scope: CosmosRoomScope; expectedRevision: number; id: string; title: string; members: readonly string[]}>
  | Readonly<{action: "agent.list"; scope: CosmosAtomConversationScope}>
  | Readonly<{action: "agent.create"; scope: CosmosAtomConversationScope; name: string}>
  | Readonly<{action: "agent.ensure"; scope: CosmosAtomConversationScope; name: string}>
  | Readonly<{action: "legacy.read"; scope: CosmosAgentScope}>
  | Readonly<{action: "profile.read"; scope: CosmosAgentScope}>
  | Readonly<{action: "profile.update"; scope: CosmosAgentScope; update: CosmosAgentProfileUpdate}>
  | Readonly<{action: "list"; scope: CosmosAgentScope}>
  | Readonly<{action: "create"; scope: CosmosAgentScope; label?: string}>
  | Selected & Readonly<{action: "read" | "prepare" | "cancel" | "stop" | "delete" | "restore" | "purge"}>
  | Selected & Readonly<{action: "permission"; id: string; optionId: string; requestHash?: string}>
  | Selected & Readonly<{action: "rename"; label: string}>
  | Selected & Readonly<{action: "configure"; id: string; value: string}>
  | Selected & Readonly<{action: "configureExecution"; selection: CosmosConversationSelection}>
  | Selected & Readonly<{action: "prompt"; text: string; requestId: string}>
  | Selected & Readonly<{action: "displayHistory"; query?: Parameters<CosmosConversationStore["displayHistory"]>[1]}>
  | Selected & Readonly<{action: "historyItem"; id: string}>
  | Selected & Readonly<{action: "groupHistory"; groupId: string; query?: Parameters<CosmosConversationStore["groupHistory"]>[2]}>
  | Selected & Readonly<{action: "groupHistoryItem"; groupId: string; id: string}>
  | Selected & Readonly<{action: "historyContent"; id: string; query?: Parameters<CosmosConversationStore["historyContent"]>[2]}>
  | Selected & Readonly<{action: "historyDetail"; id: string; query?: Parameters<CosmosConversationStore["historyDetail"]>[2]}>
  | Selected & Readonly<{action: "historyTerminal"; id: string; query?: Parameters<CosmosConversationStore["historyTerminal"]>[2]}>
  | Selected & Readonly<{action: "historyEvidence"; id: string; query?: Parameters<CosmosConversationStore["historyEvidence"]>[2]}>

export type CosmosConversationReply<Result = unknown> =
  | Readonly<{ok: true; result: Result}>
  | Readonly<{ok: false; error: Readonly<{code: string; message: string}>}>
