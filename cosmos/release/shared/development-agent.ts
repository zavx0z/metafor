/** Представление Source executor в Cosmos; имя принадлежит Storybook Session, пол — Cosmos. */
export type DevelopmentAgentScope = Readonly<{packageName: string, executorId: string}>
export type DevelopmentAgentPresentation = Readonly<{
  version: 1
  scope: DevelopmentAgentScope
  revision: number
  gender: "male" | "female"
}>
export type DevelopmentAgentProfile = DevelopmentAgentPresentation & Readonly<{name: string}>
export type DevelopmentAgentProfileUpdate = Readonly<{
  expectedRevision: number
  expectedName: string
  name: string
  gender: DevelopmentAgentPresentation["gender"]
}>
