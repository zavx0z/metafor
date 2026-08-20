export const buttonHitRect = Symbol("@ui/elements/button-hit-rect")

export type ButtonInternalProps = Readonly<{
  [buttonHitRect]?: Readonly<{x: number; y: number; width: number; height: number}>
}>
