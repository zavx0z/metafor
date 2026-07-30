import {defineVisualComponent} from "./internal/component.ts"

/** Atom toruses and their immediate recursive Matter composition. */
export const Matter = defineVisualComponent({
  entity: "Matter",
  slug: "matter",
  description: "Родительский Atom и вложенные Matter-торы без причинных слоёв.",
  selection: "matter",
  layers: ["atom", "matter", "label", "grid"],
})
