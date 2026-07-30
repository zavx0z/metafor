import {defineVisualComponent} from "./internal/component.ts"

export const Finally = defineVisualComponent({
  entity: "Finally",
  slug: "finally",
  description: "Finally occurrences и их State-якоря.",
  selection: "finally",
  layers: ["state", "causal", "label", "grid"],
})
