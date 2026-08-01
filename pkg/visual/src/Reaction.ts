import {defineVisualComponent} from "./internal/component.ts"

export const Reaction = defineVisualComponent({
  entity: "Reaction",
  slug: "reaction",
  description: "Reaction occurrences и их State-якоря.",
  selection: "reactions",
  layers: ["state", "causal", "field-proxy", "relation", "label", "grid"],
})
