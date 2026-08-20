import {Button, type ButtonColor, type ButtonSize, type ButtonVariant} from "@ui/components/button"
import {uiShapeMetrics} from "@ui/elements"
import type {PlaygroundStoryArgs, PlaygroundStoryModule} from "@ui/playground/stories"
import {definePlaygroundStoryModule} from "@ui/playground/stories"

type ButtonStoryArgs = PlaygroundStoryArgs & Readonly<{
  label: string
  variant: ButtonVariant
  color: ButtonColor
  size: ButtonSize
  disabled: boolean
}>

export function createButtonStory(options: Readonly<{
  variant: ButtonVariant
  disabled?: boolean
  onClick(): void
}>): PlaygroundStoryModule {
  return definePlaygroundStoryModule<ButtonStoryArgs>({
    defaultArgs: {
      label: "Основная",
      variant: options.variant,
      color: "primary",
      size: "medium",
      disabled: options.disabled === true,
    },
    controls: [
      {key: "label", label: "Подпись", group: "Основные", kind: "text"},
      {
        key: "color",
        label: "Цвет",
        group: "Основные",
        kind: "select",
        options: [
          {value: "primary", label: "Основной"},
          {value: "success", label: "Успех"},
          {value: "warning", label: "Предупреждение"},
          {value: "error", label: "Ошибка"},
          {value: "neutral", label: "Нейтральный"},
        ],
      },
      {
        key: "size",
        label: "Размер",
        group: "Основные",
        kind: "select",
        options: [
          {value: "small", label: "Маленький"},
          {value: "medium", label: "Средний"},
          {value: "large", label: "Большой"},
        ],
      },
      {key: "disabled", label: "Недоступна", group: "Состояние", kind: "boolean"},
    ],
    render(surface, args, frame) {
      const height = uiShapeMetrics.controlHeight
      const width = 146
      Button(surface, frame.x + (frame.w - width) / 2, frame.y + frame.h * 0.55 - height / 2, width, height, {
        children: args.label,
        variant: args.variant,
        color: args.color,
        size: args.size,
        disabled: args.disabled,
        onClick: options.onClick,
      })
    },
    source(args) {
      return [
        'import {Button} from "@ui/components/button"',
        "",
        "Button(surface, x, y, w, h, {",
        `  children: ${JSON.stringify(args.label)},`,
        `  variant: ${JSON.stringify(args.variant)},`,
        `  color: ${JSON.stringify(args.color)},`,
        `  size: ${JSON.stringify(args.size)},`,
        ...(args.disabled ? ["  disabled: true,"] : []),
        "})",
      ].join("\n")
    },
  })
}
