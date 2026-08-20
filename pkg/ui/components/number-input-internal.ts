export const numberInputLabel = Symbol("@ui/components/number-input-label")

export type NumberInputInternalProps = Readonly<{
  [numberInputLabel]?: Readonly<{text: string}>
}>
