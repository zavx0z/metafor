import {div} from "@ui/elements/div"
import {span} from "@ui/elements/span"
import {h1, h2, p} from "@ui/elements/text"
import {palette} from "@ui/elements/theme"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {StyleStoryComponent} from "../stories.ts"

type StyleStoryArgs = PlaygroundStoryArgs & Readonly<{
  tone: "cyan" | "green" | "orange" | "red"
  radius: number
  padding: number
  opacity: number
  state: string
}>

export function createStyleStory(options: Readonly<{
  component: StyleStoryComponent
  section: string
  variant: string
}>): PlaygroundStoryModule {
  return definePlaygroundStoryModule<StyleStoryArgs>({
    defaultArgs: {
      tone: options.component === "theme" ? tone(options.variant) : "cyan",
      radius: options.variant === "capsule" ? 999 : 28,
      padding: 28,
      opacity: 0.84,
      state: options.variant,
    },
    controls: [
      {
        key: "tone",
        label: "Акцент",
        group: "Тема",
        kind: "select",
        options: [
          {value: "cyan", label: "Голубой"},
          {value: "green", label: "Зелёный"},
          {value: "orange", label: "Оранжевый"},
          {value: "red", label: "Красный"},
        ],
      },
      {key: "radius", label: "Скругление", group: "Коробка", kind: "number"},
      {key: "padding", label: "Отступ", group: "Коробка", kind: "number"},
      {key: "opacity", label: "Непрозрачность", group: "Коробка", kind: "number"},
    ],
    render(surface, args, frame) {
      renderStyleStory(surface, args, frame, options)
    },
    source(args) {
      return styleSource(options, args)
    },
  })
}

function renderStyleStory(
  surface: Parameters<typeof div>[0],
  args: StyleStoryArgs,
  frame: Readonly<{x: number; y: number; w: number; h: number}>,
  options: Readonly<{component: StyleStoryComponent; section: string; variant: string}>,
): void {
  const width = Math.min(680, Math.max(360, frame.w * 0.68))
  const x = frame.x + (frame.w - width) / 2
  const y = frame.y + frame.h * 0.57 - 145
  if (options.component === "theme") {
    renderTheme(surface, args, x, y, width)
    return
  }
  if (options.section === "padding") {
    div(surface, x, y, width, 290, {
      style: {background: "rgba(111, 211, 255, 0.10)", borderColor: args.tone, borderRadius: args.radius},
    })
    div(surface, x + args.padding, y + args.padding, width - args.padding * 2, 290 - args.padding * 2, {
      style: {background: "rgba(255, 255, 255, 0.07)", borderColor: "rgba(255, 255, 255, 0.18)", borderRadius: Math.max(8, args.radius - 8)},
    })
    span(surface, x + args.padding + 24, y + 125, width - args.padding * 2 - 48, 34, {
      children: `padding: ${args.padding}px`,
      style: {fontSize: 14, color: "text", textAlign: "center"},
    })
    return
  }
  if (options.section === "flex") {
    div(surface, x, y, width, 290, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: args.radius},
    })
    const itemWidth = (width - args.padding * 2 - 32) / 3
    for (const [index, itemTone] of (["cyan", "green", "orange"] as const).entries()) {
      div(surface, x + args.padding + index * (itemWidth + 16), y + 86, itemWidth, 118, {
        style: {background: itemTone, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: Math.max(8, args.radius - 8), opacity: args.opacity},
      })
    }
    return
  }
  if (options.section === "border") {
    div(surface, x + 40, y + 60, width - 80, 170, {
      style: {background: "rgba(111, 211, 255, 0.08)", borderColor: args.tone, borderWidth: 2, borderRadius: args.radius, opacity: args.opacity},
    })
    span(surface, x + 70, y + 126, width - 140, 38, {
      children: args.radius >= 100 ? "Капсула" : `Скругление ${args.radius}`,
      style: {fontSize: 16, color: "text", textAlign: "center"},
    })
    return
  }
  if (options.section === "color") {
    for (const [index, itemTone] of (["cyan", "green", "orange", "red"] as const).entries()) {
      const swatchWidth = (width - 54) / 4
      div(surface, x + index * (swatchWidth + 18), y + 52, swatchWidth, 186, {
        style: {background: palette[itemTone], borderColor: "rgba(255, 255, 255, 0.24)", borderRadius: args.radius, opacity: itemTone === args.tone ? 1 : args.opacity * 0.72},
      })
      span(surface, x + index * (swatchWidth + 18) + 8, y + 126, swatchWidth - 16, 30, {
        children: itemTone,
        style: {fontSize: 11, color: "text", textAlign: "center"},
      })
    }
    return
  }
  h1(surface, x, y + 36, width, 44, {children: "Главный заголовок", style: {fontSize: 26, textAlign: "center"}})
  h2(surface, x, y + 112, width, 36, {children: "Заголовок раздела", style: {fontSize: 19, color: args.tone, textAlign: "center"}})
  p(surface, x, y + 180, width, 42, {children: "Основной текст и приглушённая подпись", style: {fontSize: 13, color: "muted", textAlign: "center"}})
}

function renderTheme(
  surface: Parameters<typeof div>[0],
  args: StyleStoryArgs,
  x: number,
  y: number,
  width: number,
): void {
  const tones = ["cyan", "green", "orange", "red"] as const
  const swatchWidth = (width - 54) / 4
  for (const [index, itemTone] of tones.entries()) {
    const selected = itemTone === args.tone
    const swatchX = x + index * (swatchWidth + 18)
    div(surface, swatchX, y + 44, swatchWidth, 212, {
      style: {
        background: palette[itemTone],
        borderColor: selected ? "text" : "rgba(255, 255, 255, 0.22)",
        borderWidth: selected ? 2 : 1,
        borderRadius: args.radius,
        opacity: selected ? 1 : args.opacity * 0.58,
      },
    })
    span(surface, swatchX + 8, y + 132, swatchWidth - 16, 30, {
      children: itemTone,
      style: {fontSize: 12, color: "text", textAlign: "center"},
    })
  }
}

function styleSource(
  options: Readonly<{component: StyleStoryComponent; section: string; variant: string}>,
  args: StyleStoryArgs,
): string {
  if (options.component === "theme") return [
    'import {div} from "@ui/elements/div"',
    'import {palette} from "@ui/elements/theme"',
    "",
    "div(surface, x, y, w, h, {",
    `  style: {background: palette.${args.tone}, borderRadius: ${args.radius}, opacity: ${args.opacity}},`,
    "})",
  ].join("\n")
  if (options.section === "typography") return [
    'import {h1, h2, p} from "@ui/elements/text"',
    "",
    'h1(surface, x, y, w, 44, {children: "Главный заголовок"})',
    'h2(surface, x, y + 64, w, 36, {children: "Заголовок раздела"})',
    'p(surface, x, y + 116, w, 42, {children: "Основной текст"})',
  ].join("\n")
  if (options.section === "flex") return [
    'import type {StyleProps} from "@ui/elements/style"',
    "",
    "const style: StyleProps = {",
    '  display: "flex",',
    "  gap: 16,",
    '  alignItems: "center",',
    '  justifyContent: "space-between",',
    "}",
  ].join("\n")
  const properties = [
    `  background: ${JSON.stringify(args.tone)},`,
    `  opacity: ${args.opacity},`,
  ]
  if (options.section === "padding") properties.push(`  padding: ${args.padding},`)
  if (options.section === "border") properties.push(
    `  borderRadius: ${args.radius},`,
    `  borderColor: ${JSON.stringify(args.tone)},`,
    "  borderWidth: 2,",
  )
  return [
    'import type {StyleProps} from "@ui/elements/style"',
    "",
    "const style: StyleProps = {",
    ...properties,
    "}",
  ].join("\n")
}

function tone(value: string): StyleStoryArgs["tone"] {
  if (value === "green" || value === "orange" || value === "red") return value
  return "cyan"
}
