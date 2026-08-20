import {
  Button,
  type ButtonColor,
  type ButtonSize,
  type ButtonVariant,
} from "@ui/components/button"
import {uiIcons} from "@ui/elements/icons"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {ButtonStorySection, ButtonStoryVariant} from "../stories.ts"

type ButtonStoryArgs = PlaygroundStoryArgs & Readonly<{
  label: string
  variant: ButtonVariant
  color: ButtonColor
  size: ButtonSize
  disabled: boolean
  icon: "none" | "apply"
  iconPosition: "start" | "end"
}>

export function createButtonStory(options: Readonly<{
  section: ButtonStorySection
  variant: ButtonStoryVariant
}>): PlaygroundStoryModule {
  const initial = initialButtonArgs(options)
  return definePlaygroundStoryModule<ButtonStoryArgs>({
    defaultArgs: initial,
    controls: [
      {key: "label", label: "Подпись", group: "Основные", kind: "text"},
      {
        key: "variant",
        label: "Вариант",
        group: "Основные",
        kind: "select",
        options: [
          {value: "text", label: "Текстовая"},
          {value: "contained", label: "Заполненная"},
          {value: "outlined", label: "Контурная"},
          {value: "glass", label: "Стекло"},
        ],
      },
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
      const height = 40
      const width = args.icon === "apply" && args.label.length === 0
        ? height
        : Math.min(320, Math.max(180, frame.w * 0.32))
      const props: Parameters<typeof Button>[5] = {
        children: args.label,
        variant: args.variant,
        color: args.color,
        size: args.size,
        disabled: args.disabled,
        onClick: () => {},
      }
      if (args.icon === "apply") {
        props.iconSrc = uiIcons.apply
        props.iconPosition = args.iconPosition
        props.iconOnly = args.label.length === 0
        props.tooltip = "Применить"
      }
      Button(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        props,
      )
    },
    source(args) {
      const properties = [
        `  children: ${JSON.stringify(args.label)},`,
        `  variant: ${JSON.stringify(args.variant)},`,
        `  color: ${JSON.stringify(args.color)},`,
        `  size: ${JSON.stringify(args.size)},`,
        ...(args.icon === "apply" ? [
          "  iconSrc: uiIcons.apply,",
          `  iconPosition: ${JSON.stringify(args.iconPosition)},`,
          ...(args.label.length === 0 ? ["  iconOnly: true,"] : []),
        ] : []),
        ...(args.disabled ? ["  disabled: true,"] : []),
      ]
      return [
        'import {Button} from "@ui/components/button"',
        ...(args.icon === "apply" ? ['import {uiIcons} from "@ui/elements/icons"'] : []),
        "",
        "Button(surface, x, y, w, h, {",
        ...properties,
        "})",
      ].join("\n")
    },
  })
}

function initialButtonArgs(options: Readonly<{
  section: ButtonStorySection
  variant: ButtonStoryVariant
}>): ButtonStoryArgs {
  const args: ButtonStoryArgs = {
    label: "Основная",
    variant: "contained",
    color: "primary",
    size: "medium",
    disabled: false,
    icon: "none",
    iconPosition: "start",
  }
  if (options.section === "basic") return {...args, variant: options.variant as ButtonVariant}
  if (options.section === "icon") return {...args, label: "", icon: "apply"}
  if (options.section === "icon-label") {
    return {...args, icon: "apply", iconPosition: options.variant === "right" ? "end" : "start"}
  }
  if (options.section === "sizes") return {...args, size: options.variant as ButtonSize}
  return {...args, color: options.variant as ButtonColor}
}
