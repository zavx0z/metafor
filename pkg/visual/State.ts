import {defineVisualComponent} from "./internal/component.ts"

export const State = defineVisualComponent({
  entity: "State",
  slug: "state",
  description: "Один канонический State marker.",
  selection: "first-state",
  layers: ["state", "label", "grid"],
})
