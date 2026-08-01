import {defineVisualComponent} from "./internal/component.ts"

/** One Field marker development page. */
export const Field = defineVisualComponent({
  entity: "Field",
  slug: "field",
  description: "Один Field marker из ядра Atom.",
  selection: "first-field",
  layers: ["field", "label", "grid"],
})
