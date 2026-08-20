import {
  input as renderInput,
  createInputEditState,
  focusInput,
  handleInputKey,
  insertInputText,
  type InputEditState,
  type InputAppearance,
  type InputKeyOptions,
  type InputKeyResult,
  type InputType,
} from "@ui/elements"
import type {UiSurface, StyleProps} from "@ui/elements"

export type TextFieldProps = {
  key?: string
  value?: string
  children?: string
  placeholder?: string
  active?: boolean
  disabled?: boolean
  cursor?: number
  selectionAnchor?: number | null
  cursorVisible?: boolean
  fontPx?: number
  appearance?: InputAppearance
  type?: InputType
  sx?: StyleProps
  onChange?: (value: string, state: TextFieldEditState) => void
  onSubmit?: (value: string, state: TextFieldEditState) => void
  submitOnEnter?: boolean
  allowTab?: boolean
  onClick?: () => void
  onActivate?: () => void
}

export function TextField(host: UiSurface, x: number, y: number, width: number, height: number, props: TextFieldProps): void {
  const inputProps: Parameters<typeof renderInput>[5] = {
    value: props.value ?? props.children ?? "",
  }
  if (props.key !== undefined) inputProps.key = props.key
  if (props.active !== undefined) inputProps.active = props.active
  if (props.sx !== undefined) inputProps.style = props.sx
  if (props.placeholder !== undefined) inputProps.placeholder = props.placeholder
  if (props.disabled !== undefined) inputProps.disabled = props.disabled
  if (props.cursor !== undefined) inputProps.cursor = props.cursor
  if (props.selectionAnchor !== undefined) inputProps.selectionAnchor = props.selectionAnchor
  if (props.cursorVisible !== undefined) inputProps.cursorVisible = props.cursorVisible
  if (props.appearance !== undefined) inputProps.appearance = props.appearance
  if (props.type !== undefined) inputProps.type = props.type
  if (props.onChange !== undefined) inputProps.onChange = props.onChange
  if (props.onSubmit !== undefined) inputProps.onSubmit = props.onSubmit
  if (props.submitOnEnter !== undefined) inputProps.submitOnEnter = props.submitOnEnter
  if (props.allowTab !== undefined) inputProps.allowTab = props.allowTab
  const fontPx = props.fontPx ?? (props.sx?.fontSize === undefined ? undefined : Number(props.sx.fontSize))
  if (fontPx !== undefined) inputProps.fontPx = fontPx
  const onActivate = props.onClick ?? props.onActivate
  if (onActivate !== undefined) inputProps.onActivate = onActivate
  renderInput(host, x, y, width, height, inputProps)
}

export type TextFieldEditState = InputEditState
export type TextFieldKeyOptions = InputKeyOptions
export type TextFieldKeyResult = InputKeyResult

export const createTextFieldState = createInputEditState
export const focusTextField = focusInput
export const handleTextFieldKey = handleInputKey
export const insertTextFieldText = insertInputText
