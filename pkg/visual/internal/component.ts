import type {BulkVisualLayer} from "@metafor/types/bulk/viewport"

export type VisualEntity =
  | "Atom"
  | "Matter"
  | "Field"
  | "Fields"
  | "State"
  | "States"
  | "Transition"
  | "Process"
  | "Reaction"
  | "Finally"
  | "Axion"

export type VisualSelection =
  | "all"
  | "matter"
  | "first-field"
  | "fields"
  | "first-state"
  | "states"
  | "first-transition"
  | "processes"
  | "reactions"
  | "finally"
  | "axions"

export type VisualComponent = Readonly<{
  description: string
  entity: VisualEntity
  layers: readonly BulkVisualLayer[]
  selection: VisualSelection
  slug: string
}>

export const defineVisualComponent = (
  component: VisualComponent,
): VisualComponent => Object.freeze({
  ...component,
  layers: Object.freeze([...component.layers]),
})
