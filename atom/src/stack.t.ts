import type { Initiator } from "../em.t"

export interface Impulse {
  atom: string
  timestamp: number
  initiator: Initiator
  op: "add" | "remove" | "replace" | "move" | "test"
  path: string
  value?: any
}

export enum Energy {
  Init = "init",
  Transition = "transition",
  Action = "action",
  AfterInit = "init-action",
  Success = "success",
  Error = "error",
  SuccessUpdate = "success-update-context",
  ErrorUpdate = "error-update-context",
  ReactionUpdate = "reaction-update-context",
  Destroy = "destroy",
  Nothing = "",
}
