import {defineVisualComponent} from "./internal/component.ts"

export const Process = defineVisualComponent({
  entity: "Process",
  slug: "process",
  description: "Process occurrences и их State-якоря.",
  selection: "processes",
  layers: ["state", "causal", "field-proxy", "relation", "label", "grid"],
})
