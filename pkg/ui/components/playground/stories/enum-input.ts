import {
  EnumInput,
  type EnumInputOption,
  type EnumInputProps,
} from "@ui/components/enum-input"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {EnumInputStoryVariant} from "../stories.ts"
import {uiShapeMetrics} from "@ui/elements"

type EnumInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: string
  presentation: "cycle" | "expanded"
  options: "ready" | "empty" | "undefined"
  state: "ready" | "error"
  density: "regular" | "compact"
  disabled: boolean
  readonly: boolean
  event: string
}>

const SAMPLE_OPTIONS = Object.freeze([
  Object.freeze({value: "add", label: "Сложение", description: "Сложить входные значения"}),
  Object.freeze({value: "multiply", label: "Умножение", description: "Умножить входные значения"}),
  Object.freeze({value: "subtract", label: "Вычитание", description: "Вычесть второе значение"}),
]) satisfies readonly EnumInputOption[]

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createEnumInputStory(variant: EnumInputStoryVariant): PlaygroundStoryModule {
  return definePlaygroundStoryModule<EnumInputStoryArgs>({
    defaultArgs: enumInputDefaults(variant),
    controls: [
      {
        key: "value",
        label: "Значение",
        group: "Значение",
        kind: "select",
        options: [
          {value: "add", label: "Сложение"},
          {value: "multiply", label: "Умножение"},
          {value: "subtract", label: "Вычитание"},
          {value: "missing", label: "Неизвестное устаревшее"},
        ],
      },
      {
        key: "presentation",
        label: "Представление",
        group: "Внешний вид",
        kind: "select",
        options: [
          {value: "cycle", label: "Цикл"},
          {value: "expanded", label: "Варианты в строке"},
        ],
      },
      {
        key: "options",
        label: "Варианты",
        group: "Данные",
        kind: "select",
        options: [
          {value: "ready", label: "Готовы"},
          {value: "empty", label: "No Items"},
          {value: "undefined", label: "Menu Undefined"},
        ],
      },
      {
        key: "state",
        label: "Состояние меню",
        group: "Данные",
        kind: "select",
        options: [
          {value: "ready", label: "Готово"},
          {value: "error", label: "Menu Error"},
        ],
      },
      {
        key: "density",
        label: "Плотность",
        group: "Внешний вид",
        kind: "select",
        options: [
          {value: "regular", label: "Обычная"},
          {value: "compact", label: "Компактная"},
        ],
      },
      {key: "disabled", label: "Недоступно", group: "Состояние", kind: "boolean"},
      {key: "readonly", label: "Только чтение", group: "Состояние", kind: "boolean"},
      {key: "event", label: "Последнее событие", group: "События", kind: "custom"},
    ],
    render(surface, args, frame) {
      const width = args.presentation === "expanded"
        ? Math.min(444, frame.w)
        : Math.min(146, frame.w)
      const height = args.density === "compact" ? uiShapeMetrics.controlHeight : uiShapeMetrics.rowHeight
      const props: EnumInputProps = {
        value: args.value,
        presentation: args.presentation,
        density: args.density,
        disabled: args.disabled,
        readOnly: args.readonly,
        tooltip: "Выберите операцию",
        onChange(value) {
          globalThis.__componentsStoryControlBridge?.("value", value)
          globalThis.__componentsStoryControlBridge?.("event", `onChange: ${value}`)
        },
      }
      if (args.options !== "undefined") props.options = args.options === "empty" ? [] : SAMPLE_OPTIONS
      if (args.state === "error") props.state = "error"
      EnumInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        props,
      )
    },
    source(args) {
      return enumInputSource(args)
    },
  })
}

function enumInputDefaults(variant: EnumInputStoryVariant): EnumInputStoryArgs {
  return Object.freeze({
    value: variant === "invalid-legacy" ? "missing" : "multiply",
    presentation: variant === "expanded" ? "expanded" : "cycle",
    options: variant === "no-items" ? "empty" : variant === "menu-undefined" ? "undefined" : "ready",
    state: variant === "menu-error" ? "error" : "ready",
    density: "regular",
    disabled: variant === "disabled",
    readonly: variant === "readonly",
    event: "Ожидание",
  })
}

function enumInputSource(args: EnumInputStoryArgs): string {
  const imports = args.options === "undefined"
    ? 'import {EnumInput} from "@ui/components/enum-input"'
    : 'import {EnumInput, type EnumInputOption} from "@ui/components/enum-input"'
  const setup = args.options === "undefined"
    ? []
    : [
      "",
      `const options: readonly EnumInputOption[] = ${JSON.stringify(args.options === "empty" ? [] : SAMPLE_OPTIONS)}`,
    ]
  const properties = [
    `  value: ${JSON.stringify(args.value)},`,
    `  presentation: ${JSON.stringify(args.presentation)},`,
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.options !== "undefined") properties.push("  options,")
  if (args.state === "error") properties.push('  state: "error",')
  if (args.disabled) properties.push("  disabled: true,")
  if (args.readonly) properties.push("  readOnly: true,")
  properties.push("  onChange: setValue,")
  return [
    imports,
    ...setup,
    "",
    "EnumInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}
