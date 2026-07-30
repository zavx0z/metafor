import {defineVisualComponent} from "./internal/component.ts"

export const States = defineVisualComponent({
  entity: "States",
  slug: "states",
  description: "Все State-рукава: State, причинные частицы и каналы.",
  selection: "states",
  layers: [
    "state",
    "causal",
    "transition",
    "field-proxy",
    "relation",
    "label",
    "grid",
  ],
})
