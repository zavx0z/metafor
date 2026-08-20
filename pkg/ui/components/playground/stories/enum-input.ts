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
import {uiIcons, uiShapeMetrics} from "@ui/elements"

type EnumInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: string
  presentation: "cycle" | "expanded"
  options: "ready" | "empty" | "undefined"
  state: "ready" | "error"
  density: "regular" | "compact"
  disabled: boolean
  readonly: boolean
  icons: "none" | "all" | "mixed"
  open: boolean
  event: string
}>

const SAMPLE_OPTIONS = Object.freeze([
  Object.freeze({value: "add", label: "Сложение", description: "Сложить входные значения"}),
  Object.freeze({value: "multiply", label: "Умножение", description: "Умножить входные значения"}),
  Object.freeze({value: "subtract", label: "Вычитание", description: "Вычесть второе значение"}),
]) satisfies readonly EnumInputOption[]

const ICON_OPTIONS = Object.freeze([
  Object.freeze({...SAMPLE_OPTIONS[0]!, iconSrc: uiIcons.plus}),
  Object.freeze({...SAMPLE_OPTIONS[1]!, iconSrc: uiIcons.apply}),
  Object.freeze({...SAMPLE_OPTIONS[2]!, iconSrc: uiIcons.minus}),
]) satisfies readonly EnumInputOption[]

const MIXED_ICON_OPTIONS = Object.freeze([
  ICON_OPTIONS[0]!,
  SAMPLE_OPTIONS[1]!,
  ICON_OPTIONS[2]!,
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
      {key: "open", label: "Раскрыто", group: "Состояние", kind: "boolean"},
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
        open: args.open,
        onOpenChange(open) {
          globalThis.__componentsStoryControlBridge?.("open", open)
        },
        onChange(value) {
          globalThis.__componentsStoryControlBridge?.("value", value)
          globalThis.__componentsStoryControlBridge?.("event", `onChange: ${value}`)
        },
      }
      if (args.options !== "undefined") {
        props.options = args.options === "empty"
          ? []
          : args.icons === "all"
            ? ICON_OPTIONS
            : args.icons === "mixed"
              ? MIXED_ICON_OPTIONS
              : SAMPLE_OPTIONS
      }
      if (args.icons !== "none") props.popupLabel = "Операция"
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
    icons: variant === "header-icons" ? "all" : variant === "mixed-icons" ? "mixed" : "none",
    open: variant === "header-icons" || variant === "mixed-icons",
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
      ...enumOptionsSource(args),
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
  if (args.open) properties.push("  open: true,", "  onOpenChange: setOpen,")
  if (args.icons !== "none") properties.push('  popupLabel: "Операция",')
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

function enumOptionsSource(args: EnumInputStoryArgs): string[] {
  if (args.options === "empty") return ["const options: readonly EnumInputOption[] = []"]
  if (args.icons === "none") return [`const options: readonly EnumInputOption[] = ${JSON.stringify(SAMPLE_OPTIONS)}`]
  const middleIcon = args.icons === "all" ? "iconSrc: uiIcons.apply, " : ""
  return [
    'import {uiIcons} from "@ui/elements/icons"',
    "",
    "const options: readonly EnumInputOption[] = [",
    `  {value: "add", label: "Сложение", iconSrc: uiIcons.plus},`,
    `  {value: "multiply", label: "Умножение", ${middleIcon}description: "Умножить входные значения"},`,
    `  {value: "subtract", label: "Вычитание", iconSrc: uiIcons.minus},`,
    "]",
  ]
}
