/** Адрес участника бесед Cosmos; имя и внешний вид не меняют Quantum identity. */
export type CosmosAgentScope = Readonly<{verseId: string; atomRef: string; agentRef: string}>

/** Сохранённое представление Agent в [Cosmos](../../cosmos/README.md#беседы-и-представление-агентов). */
export type CosmosAgentProfile = Readonly<{
  version: 1
  scope: CosmosAgentScope
  revision: number
  name: string
  gender: "male" | "female"
}>

export type CosmosAgentProfileUpdate = Readonly<{
  expectedRevision: number
  name: string
  gender: CosmosAgentProfile["gender"]
}>
