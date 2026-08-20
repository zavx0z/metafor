import {
  measureMatrixInputHeight,
  MatrixInput,
} from "@ui/components/matrix-input"
import {
  measureVectorInputHeight,
  VectorInput,
} from "@ui/components/vector-input"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {StandaloneInputStory} from "../stories.ts"

type StandaloneInputArgs = PlaygroundStoryArgs & Readonly<{
  value: unknown
  density: "regular" | "compact"
  disabled: boolean
}>

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createStandaloneInputStory(component: StandaloneInputStory): PlaygroundStoryModule {
  const value = component === "vector-input" ? [1, 2, 3] : [[1, 0], [0, 1]]
  return definePlaygroundStoryModule<StandaloneInputArgs>({
    defaultArgs: {
      value,
      density: "regular",
      disabled: false,
    },
    controls: [
      {
        key: "value",
        label: component === "vector-input" ? "Координаты" : "Ячейки",
        group: "Значение",
        kind: "custom",
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
    ],
    render(surface, args, frame) {
      const change = (next: unknown): void => globalThis.__componentsStoryControlBridge?.("value", next)
      if (component === "vector-input") {
        const vector = vectorValue(args.value)
        const width = 146
        const height = measureVectorInputHeight({value: vector, dimensions: 3, density: args.density})
        VectorInput(
          surface,
          frame.x + (frame.w - width) / 2,
          frame.y + frame.h * 0.56 - height / 2,
          width,
          height,
          {
            key: "components-story-vector-input",
            value: vector,
            dimensions: 3,
            density: args.density,
            disabled: args.disabled,
            onChange: change,
          },
        )
        return
      }
      const matrix = matrixValue(args.value)
      const width = 146
      const height = measureMatrixInputHeight({value: matrix, density: args.density})
      MatrixInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        {
          key: "components-story-matrix-input",
          value: matrix,
          density: args.density,
          disabled: args.disabled,
          onChange: change,
        },
      )
    },
    source(args) {
      return component === "vector-input" ? vectorSource(args) : matrixSource(args)
    },
  })
}

function vectorSource(args: StandaloneInputArgs): string {
  const properties = [
    '  key: "position",',
    `  value: ${JSON.stringify(vectorValue(args.value))},`,
    "  dimensions: 3,",
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.disabled) properties.push("  disabled: true,")
  properties.push("  onChange: setValue,")
  return [
    'import {VectorInput} from "@ui/components/vector-input"',
    "",
    "VectorInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}

function matrixSource(args: StandaloneInputArgs): string {
  const properties = [
    '  key: "transform",',
    `  value: ${JSON.stringify(matrixValue(args.value))},`,
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.disabled) properties.push("  disabled: true,")
  properties.push("  onChange: setValue,")
  return [
    'import {MatrixInput} from "@ui/components/matrix-input"',
    "",
    "MatrixInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}

function vectorValue(value: unknown): readonly number[] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
    ? value
    : [1, 2, 3]
}

function matrixValue(value: unknown): readonly (readonly number[])[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 &&
    value.every((row) => Array.isArray(row) && row.length === value.length && row.every(isFiniteNumber))
    ? value as readonly (readonly number[])[]
    : [[1, 0], [0, 1]]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
