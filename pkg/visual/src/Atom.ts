import {defineVisualComponent} from "./internal/component.ts"

/** One complete Atom projected through the shared Torus visual form. */
export const Atom = defineVisualComponent({
  entity: "Atom",
  slug: "atom",
  description: "Полный Atom: ядро Fields, Matter, State-рукава и связи.",
  selection: "all",
  layers: [
    "atom",
    "matter",
    "field",
    "state",
    "causal",
    "transition",
    "field-proxy",
    "relation",
    "label",
    "grid",
  ],
})
