import {defineVisualComponent} from "./internal/component.ts"

export const Axion = defineVisualComponent({
  entity: "Axion",
  slug: "axion",
  description: "State-Axion occurrences и их State-якоря.",
  selection: "axions",
  layers: ["state", "causal", "field-proxy", "relation", "label", "grid"],
})
