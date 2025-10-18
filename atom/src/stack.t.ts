import type { Source } from "../electromagnetic.t"

export interface Task {
  atom: string
  timestamp: number
  src: Source
  op: "add" | "remove" | "replace" | "move" | "test"
  path: string
  value?: any
}

export enum Tasks {
  AtomCreate = "init",
  Transition = "transition",
  Action = "action",
  ActionAfterAtomCreate = "init-action",
  Success = "success",
  Error = "error",
  ContextUpdateSuccess = "success-update-context",
  ContextUpdateError = "error-update-context",
  ContextUpdateReaction = "reaction-update-context",
  Destroy = "destroy",
  Nothing = "",
}
