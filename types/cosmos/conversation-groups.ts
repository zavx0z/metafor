import type {CosmosAgentScope} from "./agent-profile"

export type CosmosRoomScope = Pick<CosmosAgentScope, "verseId" | "atomRef">
/** Группа участников комнаты Cosmos. Создание группы не отправляет сообщения моделям. */
export type CosmosConversationGroup = Readonly<{
  id: string
  title: string
  members: readonly string[]
}>
export type CosmosRoomGroups = Readonly<{
  version: 1
  scope: CosmosRoomScope
  revision: number
  groups: readonly CosmosConversationGroup[]
}>
