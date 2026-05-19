import {input as renderInput, type InputOpts} from "./internal/renderers.ts"
import type {Card, SxProps} from "@metafor/elements"

export type TextFieldProps = {
  value?: string
  children?: string
  active?: boolean
  disabled?: boolean
  fontPx?: number
  sx?: SxProps
  onClick?: () => void
  onActivate?: () => void
}

export function TextField(host: Card, x: number, y: number, width: number, height: number, props: TextFieldProps): void {
  const opts: InputOpts = {
    value: props.value ?? props.children ?? "",
    active: props.active === true,
    onActivate: props.onClick ?? props.onActivate ?? (() => {}),
  }
  const fontPx = props.fontPx ?? (props.sx?.fontSize === undefined ? undefined : Number(props.sx.fontSize))
  if (fontPx !== undefined) opts.fontPx = fontPx
  renderInput(host, x, y, width, height, opts)
}
