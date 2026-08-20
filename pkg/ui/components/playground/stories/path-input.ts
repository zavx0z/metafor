import {PathInput} from "@ui/components/path-input"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {PathInputStoryVariant} from "../stories.ts"

type PathInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: string
  density: "regular" | "compact"
  disabled: boolean
  readonly: boolean
  event: string
}>

const SAMPLE_PATH = "/textures/source.exr"

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createPathInputStory(variant: PathInputStoryVariant): PlaygroundStoryModule {
  return definePlaygroundStoryModule<PathInputStoryArgs>({
    defaultArgs: pathInputDefaults(variant),
    controls: [
      {key: "value", label: "Путь", group: "Значение", kind: "text"},
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
      const height = args.density === "compact" ? 22 : 28
      const width = Math.min(480, Math.max(320, frame.w * 0.52))
      PathInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        {
          key: "components-story-path-input",
          value: pathValue(args.value),
          placeholder: "Выберите файл",
          density: args.density,
          disabled: args.disabled,
          readOnly: args.readonly,
          onChange(value) {
            globalThis.__componentsStoryControlBridge?.("value", value)
            globalThis.__componentsStoryControlBridge?.("event", `onChange: ${value}`)
          },
          onBrowse() {
            globalThis.__componentsStoryControlBridge?.("event", "onBrowse")
          },
        },
      )
    },
    source(args) {
      return pathInputSource(args)
    },
  })
}

function pathInputDefaults(variant: PathInputStoryVariant): PathInputStoryArgs {
  return Object.freeze({
    value: variant === "empty" ? "" : SAMPLE_PATH,
    density: variant === "compact" ? "compact" : "regular",
    disabled: variant === "disabled",
    readonly: variant === "readonly",
    event: "Ожидание",
  })
}

function pathInputSource(args: PathInputStoryArgs): string {
  const properties = [
    '  key: "texture-path",',
    "  value,",
    '  placeholder: "Выберите файл",',
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.disabled) properties.push("  disabled: true,")
  if (args.readonly) properties.push("  readOnly: true,")
  properties.push(
    "  onChange: setValue,",
    "  onBrowse: openPathPicker,",
  )
  return [
    'import {PathInput} from "@ui/components/path-input"',
    "",
    `let value = ${JSON.stringify(pathValue(args.value))}`,
    "",
    "PathInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}

function pathValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}
