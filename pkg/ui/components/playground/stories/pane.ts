import {Pane, type PaneVariant} from "@ui/components/pane"
import {Typography} from "@ui/components/typography"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"

type PaneStoryArgs = PlaygroundStoryArgs & Readonly<{
  variant: PaneVariant
  radius: "rounded" | "compact"
}>

export function createPaneStory(variant: PaneVariant): PlaygroundStoryModule {
  return definePlaygroundStoryModule<PaneStoryArgs>({
    defaultArgs: {variant, radius: "rounded"},
    controls: [
      {
        key: "variant",
        label: "Вариант",
        group: "Основные",
        kind: "select",
        options: [
          {value: "glass", label: "Стекло"},
          {value: "outlined", label: "Контурная"},
          {value: "filled", label: "Заполненная"},
        ],
      },
      {
        key: "radius",
        label: "Скругление",
        group: "Внешний вид",
        kind: "select",
        options: [
          {value: "rounded", label: "Крупное"},
          {value: "compact", label: "Компактное"},
        ],
      },
    ],
    render(surface, args, frame) {
      const width = Math.min(430, Math.max(260, frame.w * 0.48))
      const height = Math.min(260, Math.max(180, frame.h * 0.34))
      const x = frame.x + (frame.w - width) / 2
      const y = frame.y + (frame.h - height) / 2 + 24
      Pane(surface, x, y, width, height, {
        variant: args.variant,
        sx: {borderRadius: args.radius === "rounded" ? 30 : 14},
      })
      Typography(surface, x + 28, y + 54, width - 56, 34, {
        children: "Рабочий компонент Pane",
        variant: "title",
        sx: {textAlign: "center"},
      })
      Typography(surface, x + 28, y + 102, width - 56, 28, {
        children: `${args.variant} · ${args.radius}`,
        variant: "caption",
        color: "muted",
        sx: {textAlign: "center"},
      })
    },
    source(args) {
      return [
        'import {Pane} from "@ui/components/pane"',
        "",
        "Pane(surface, x, y, w, h, {",
        `  variant: ${JSON.stringify(args.variant)},`,
        `  sx: {borderRadius: ${args.radius === "rounded" ? 30 : 14}},`,
        "})",
      ].join("\n")
    },
  })
}
