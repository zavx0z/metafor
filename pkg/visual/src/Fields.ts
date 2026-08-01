import {defineVisualComponent} from "./internal/component.ts"

/** The complete Field nucleus of every Atom in the saved snapshot. */
export const Fields = defineVisualComponent({
  entity: "Fields",
  slug: "fields",
  description: "Все Field markers в их исходных Atom-local ядрах.",
  selection: "fields",
  layers: ["field", "label", "grid"],
})
