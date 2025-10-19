import type { Source } from "../em.t"

export interface Impulse {
  atom: string
  timestamp: number
  src: Source
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
