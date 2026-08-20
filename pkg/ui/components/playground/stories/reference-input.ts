import {
  ReferenceInput,
  type ReferenceInputValue,
} from "@ui/components/reference-input"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import {uiShapeMetrics} from "@ui/elements"

type ReferenceInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: ReferenceInputValue | null
  density: "regular" | "compact"
  disabled: boolean
  readonly: boolean
  event: string
}>

const SAMPLE_REFERENCE: ReferenceInputValue = Object.freeze({
  id: "texture.brick",
  label: "Кирпичная текстура",
  kind: "Texture",
})

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createReferenceInputStory(): PlaygroundStoryModule {
  return definePlaygroundStoryModule<ReferenceInputStoryArgs>({
    defaultArgs: {
      value: SAMPLE_REFERENCE,
      density: "regular",
      disabled: false,
      readonly: false,
      event: "Ожидание",
    },
    controls: [
      {key: "value", label: "Ссылка", group: "Значение", kind: "custom"},
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
      const value = referenceValue(args.value)
      const height = args.density === "compact" ? uiShapeMetrics.controlHeight : uiShapeMetrics.rowHeight
      const width = Math.min(146, frame.w)
      ReferenceInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        {
          value,
          placeholder: "Выберите ресурс",
          tooltip: "Непрозрачная ссылка владельца",
          density: args.density,
          disabled: args.disabled,
          readOnly: args.readonly,
          onActivate() {
            if (value === null) globalThis.__componentsStoryControlBridge?.("value", SAMPLE_REFERENCE)
            globalThis.__componentsStoryControlBridge?.("event", "onActivate")
          },
          onPick() {
            globalThis.__componentsStoryControlBridge?.("event", "onPick")
          },
          onClear() {
            globalThis.__componentsStoryControlBridge?.("value", null)
            globalThis.__componentsStoryControlBridge?.("event", "onClear")
          },
        },
      )
    },
    source(args) {
      return referenceInputSource(args)
    },
  })
}

function referenceInputSource(args: ReferenceInputStoryArgs): string {
  const properties = [
    "  value,",
    '  placeholder: "Выберите ресурс",',
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.disabled) properties.push("  disabled: true,")
  if (args.readonly) properties.push("  readOnly: true,")
  properties.push(
    "  onActivate: openReferencePicker,",
    "  onPick: pickReference,",
    "  onClear: () => setValue(null),",
  )
  return [
    'import {ReferenceInput, type ReferenceInputValue} from "@ui/components/reference-input"',
    "",
    `let value: ReferenceInputValue | null = ${JSON.stringify(referenceValue(args.value))}`,
    "",
    "ReferenceInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}

function referenceValue(value: unknown): ReferenceInputValue | null {
  if (value === null) return null
  if (typeof value !== "object") return SAMPLE_REFERENCE
  const candidate = value as Readonly<Record<string, unknown>>
  if (typeof candidate.id !== "string" || typeof candidate.label !== "string") return SAMPLE_REFERENCE
  if (typeof candidate.kind !== "string") return {id: candidate.id, label: candidate.label}
  return {id: candidate.id, label: candidate.label, kind: candidate.kind}
}
