import {
  Field,
  measureFieldHeight,
  type FieldDefinition,
  type FieldRenderOptions,
} from "@ui/components/field"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryControl,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {FieldStoryKind} from "../stories.ts"

type FieldStoryArgs = PlaygroundStoryArgs & Readonly<{
  value: unknown
  density: "regular" | "compact"
  disabled: boolean
}>

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createFieldStory(options: Readonly<{
  kind: FieldStoryKind
  presentation: "default" | "input" | "slider" | "switch"
}>): PlaygroundStoryModule {
  const initial = initialFieldValue(options.kind)
  return definePlaygroundStoryModule<FieldStoryArgs>({
    defaultArgs: {
      value: initial,
      density: "regular",
      disabled: false,
    },
    controls: fieldControls(options.kind),
    render(surface, args, frame) {
      const definition = createFieldDefinition(options, args)
      const renderOptions: FieldRenderOptions = {density: args.density}
      const width = Math.min(520, Math.max(280, frame.w * 0.56))
      const height = measureFieldHeight(definition, renderOptions)
      Field(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        definition,
        renderOptions,
      )
    },
    source(args) {
      const definition = sourceFieldDefinition(options, args)
      return [
        'import {Field, type FieldDefinition} from "@ui/components/field"',
        "",
        `const field: FieldDefinition = ${definition}`,
        "",
        `Field(surface, x, y, width, field, {density: ${JSON.stringify(args.density)}})`,
      ].join("\n")
    },
  })
}

function fieldControls(kind: FieldStoryKind): readonly PlaygroundStoryControl<keyof FieldStoryArgs & string>[] {
  const valueControl: PlaygroundStoryControl<"value"> = kind === "boolean"
    ? {key: "value", label: "Значение", group: "Значение", kind: "boolean"}
    : kind === "enum"
      ? {
        key: "value",
        label: "Операция",
        group: "Значение",
        kind: "select",
        options: [
          {value: "add", label: "Сложение"},
          {value: "multiply", label: "Умножение"},
          {value: "power", label: "Степень"},
        ],
      }
      : {
        key: "value",
        label: kind === "color" ? "RGBA" : "Значение",
        group: "Значение",
        kind: kind === "number" ? "number" : kind === "color" ? "color" : kind === "text" ? "text" : "custom",
      }
  return [
    valueControl,
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
  ]
}

function initialFieldValue(kind: FieldStoryKind): unknown {
  if (kind === "text") return "Компонент UI"
  if (kind === "number") return 0.625
  if (kind === "boolean") return true
  if (kind === "enum") return "multiply"
  if (kind === "color") return {r: 0.18, g: 0.58, b: 0.92, a: 1}
  if (kind === "vector") return [1, 2, 3]
  if (kind === "rotation") return [0, 45, 90]
  if (kind === "matrix") return [[1, 0], [0, 1]]
  if (kind === "reference") return {id: "material-1", label: "Material.001", kind: "material"}
  return "Готово"
}

function createFieldDefinition(
  options: Readonly<{kind: FieldStoryKind; presentation: "default" | "input" | "slider" | "switch"}>,
  args: FieldStoryArgs,
): FieldDefinition {
  const base = {id: `story-${options.kind}`, label: fieldLabel(options.kind), disabled: args.disabled}
  const change = (value: unknown): void => globalThis.__componentsStoryControlBridge?.("value", value)
  if (options.kind === "text") return {...base, kind: "text", value: String(args.value), onChange: change}
  if (options.kind === "number") return {
    ...base,
    kind: "number",
    value: finiteNumber(args.value, 0.625),
    presentation: options.presentation === "slider" ? "slider" : "input",
    min: 0,
    max: 1,
    step: 0.025,
    onChange: change,
  }
  if (options.kind === "boolean") return {
    ...base,
    kind: "boolean",
    value: args.value === true,
    presentation: "switch",
    onChange: change,
  }
  if (options.kind === "enum") return {
    ...base,
    kind: "enum",
    value: String(args.value),
    options: [
      {value: "add", label: "Сложение"},
      {value: "multiply", label: "Умножение"},
      {value: "power", label: "Степень"},
    ],
    onChange: change,
  }
  if (options.kind === "color") return {
    ...base,
    kind: "color",
    value: colorValue(args.value),
    onChange: change,
  }
  if (options.kind === "vector") return {
    ...base,
    kind: "vector",
    value: vectorValue(args.value, [1, 2, 3]),
    dimensions: 3,
    onChange: change,
  }
  if (options.kind === "rotation") return {
    ...base,
    kind: "rotation",
    value: vectorValue(args.value, [0, 45, 90]),
    dimensions: 3,
    unit: "°",
    onChange: change,
  }
  if (options.kind === "matrix") return {
    ...base,
    kind: "matrix",
    value: matrixValue(args.value),
    onChange: change,
  }
  if (options.kind === "reference") return {
    ...base,
    kind: "reference",
    value: referenceValue(args.value),
    placeholder: "Не выбрано",
    onActivate: () => change(args.value === null ? initialFieldValue("reference") : null),
  }
  return {...base, kind: "readonly", value: String(args.value)}
}

function sourceFieldDefinition(
  options: Readonly<{kind: FieldStoryKind; presentation: "default" | "input" | "slider" | "switch"}>,
  args: FieldStoryArgs,
): string {
  const properties = [
    '  id: "example",',
    `  label: ${JSON.stringify(fieldLabel(options.kind))},`,
    `  kind: ${JSON.stringify(options.kind)},`,
    `  value: ${JSON.stringify(args.value)},`,
  ]
  if (options.kind === "number") {
    properties.push(`  presentation: ${JSON.stringify(options.presentation === "slider" ? "slider" : "input")},`)
    properties.push("  min: 0,", "  max: 1,", "  step: 0.025,")
  }
  if (options.kind === "boolean") properties.push('  presentation: "switch",')
  if (options.kind === "enum") properties.push(
    "  options: [",
    '    {value: "add", label: "Сложение"},',
    '    {value: "multiply", label: "Умножение"},',
    '    {value: "power", label: "Степень"},',
    "  ],",
  )
  if (options.kind === "vector" || options.kind === "rotation") properties.push("  dimensions: 3,")
  if (options.kind === "rotation") properties.push('  unit: "°",')
  if (options.kind !== "readonly") properties.push("  onChange: setValue,")
  if (args.disabled) properties.push("  disabled: true,")
  return ["{", ...properties, "}"].join("\n")
}

function fieldLabel(kind: FieldStoryKind): string {
  if (kind === "text") return "Текст"
  if (kind === "number") return "Число"
  if (kind === "boolean") return "Нормализовать"
  if (kind === "enum") return "Операция"
  if (kind === "color") return "Цвет"
  if (kind === "vector") return "Вектор"
  if (kind === "rotation") return "Вращение"
  if (kind === "matrix") return "Матрица"
  if (kind === "reference") return "Материал"
  return "Результат"
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function vectorValue(value: unknown, fallback: readonly number[]): readonly number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? value
    : fallback
}

function matrixValue(value: unknown): readonly (readonly number[])[] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every((entry) => typeof entry === "number" && Number.isFinite(entry)))
    ? value as readonly (readonly number[])[]
    : [[1, 0], [0, 1]]
}

function colorValue(value: unknown): Readonly<{r: number; g: number; b: number; a: number}> {
  if (typeof value !== "object" || value === null) return {r: 0.18, g: 0.58, b: 0.92, a: 1}
  const candidate = value as Record<string, unknown>
  return {
    r: finiteNumber(candidate["r"], 0.18),
    g: finiteNumber(candidate["g"], 0.58),
    b: finiteNumber(candidate["b"], 0.92),
    a: finiteNumber(candidate["a"], 1),
  }
}

function referenceValue(value: unknown): Readonly<{id: string; label: string; kind: string}> | null {
  if (value === null) return null
  if (typeof value !== "object" || value === null) return initialFieldValue("reference") as Readonly<{id: string; label: string; kind: string}>
  const candidate = value as Record<string, unknown>
  if (typeof candidate["id"] !== "string" || typeof candidate["label"] !== "string") return null
  return {id: candidate["id"], label: candidate["label"], kind: typeof candidate["kind"] === "string" ? candidate["kind"] : "resource"}
}
