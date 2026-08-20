import {
  ColorInput,
  normalizeColorInputValue,
  type ColorInputValue,
} from "@ui/components/color-input"
import {uiShapeMetrics} from "@ui/elements"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {ColorInputStoryVariant} from "../stories.ts"

type ColorInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: ColorInputValue
  open: boolean
  disabled: boolean
  readonly: boolean
  event: string
}>

const SAMPLE_COLOR = Object.freeze({r: 0.18, g: 0.58, b: 0.92, a: 0.72}) satisfies ColorInputValue

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createColorInputStory(variant: ColorInputStoryVariant): PlaygroundStoryModule {
  return definePlaygroundStoryModule<ColorInputStoryArgs>({
    defaultArgs: {
      value: SAMPLE_COLOR,
      open: variant === "open",
      disabled: false,
      readonly: false,
      event: "Ожидание",
    },
    controls: [
      {key: "value", label: "RGBA", group: "Значение", kind: "custom"},
      {key: "open", label: "Picker открыт", group: "Состояние", kind: "boolean"},
      {key: "disabled", label: "Недоступно", group: "Состояние", kind: "boolean"},
      {key: "readonly", label: "Только чтение", group: "Состояние", kind: "boolean"},
      {key: "event", label: "Последнее событие", group: "События", kind: "custom"},
    ],
    render(surface, args, frame) {
      const value = colorValue(args.value)
      const width = Math.min(146, frame.w)
      const height = uiShapeMetrics.controlHeight
      ColorInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.36 - height / 2,
        width,
        height,
        {
          key: "components-story-color-input",
          value,
          open: args.open,
          disabled: args.disabled,
          readOnly: args.readonly,
          onChange(next) {
            globalThis.__componentsStoryControlBridge?.("value", next)
            globalThis.__componentsStoryControlBridge?.("event", `onChange: ${JSON.stringify(next)}`)
          },
          onOpenChange(open) {
            globalThis.__componentsStoryControlBridge?.("open", open)
            globalThis.__componentsStoryControlBridge?.("event", `onOpenChange: ${open}`)
          },
        },
      )
    },
    source(args) {
      const states = [
        "  open,",
        ...(args.disabled ? ["  disabled: true,"] : []),
        ...(args.readonly ? ["  readOnly: true,"] : []),
      ]
      return [
        'import {ColorInput, type ColorInputValue} from "@ui/components/color-input"',
        "",
        `let value: ColorInputValue = ${JSON.stringify(colorValue(args.value))}`,
        `let open = ${args.open}`,
        "",
        "ColorInput(surface, x, y, width, height, {",
        "  value,",
        ...states,
        "  onChange: setValue,",
        "  onOpenChange: setOpen,",
        "})",
      ].join("\n")
    },
  })
}

function colorValue(value: unknown): ColorInputValue {
  if (typeof value !== "object" || value === null) return SAMPLE_COLOR
  const candidate = value as Record<string, unknown>
  return normalizeColorInputValue({
    r: finite(candidate["r"], SAMPLE_COLOR.r),
    g: finite(candidate["g"], SAMPLE_COLOR.g),
    b: finite(candidate["b"], SAMPLE_COLOR.b),
    a: finite(candidate["a"], SAMPLE_COLOR.a),
  })
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}
