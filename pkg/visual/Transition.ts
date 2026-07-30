import {defineVisualComponent} from "./internal/component.ts"

export const Transition = defineVisualComponent({
  entity: "Transition",
  slug: "transition",
  description: "Один Transition вместе с его State endpoints.",
  selection: "first-transition",
  layers: ["state", "transition", "label", "grid"],
})
