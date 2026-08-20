import {div} from "@ui/elements/div"
import {flexColumn, flexRow} from "@ui/elements/flex"
import {flexColumnCss, flexRowCss, type UiSize} from "@ui/elements/flex-css"
import {span} from "@ui/elements/span"
import type {CssColor} from "@ui/elements/style"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {LayoutStoryComponent} from "../stories.ts"

type LayoutStoryArgs = PlaygroundStoryArgs & Readonly<{
  gap: number
  padding: number
  align: "start" | "center" | "end" | "stretch"
  state: string
}>

export function createLayoutStory(options: Readonly<{
  component: LayoutStoryComponent
  section: string
  variant: string
}>): PlaygroundStoryModule {
  return definePlaygroundStoryModule<LayoutStoryArgs>({
    defaultArgs: {
      gap: 14,
      padding: 18,
      align: "center",
      state: options.variant,
    },
    controls: [
      {key: "gap", label: "Промежуток", group: "Раскладка", kind: "number"},
      {key: "padding", label: "Отступ", group: "Раскладка", kind: "number"},
      {
        key: "align",
        label: "Выравнивание",
        group: "Раскладка",
        kind: "select",
        options: [
          {value: "start", label: "Начало"},
          {value: "center", label: "Центр"},
          {value: "end", label: "Конец"},
          {value: "stretch", label: "Растянуть"},
        ],
      },
    ],
    render(surface, args, frame) {
      renderLayoutStory(surface, args, frame, options)
    },
    source(args) {
      return layoutSource(options, args)
    },
  })
}

function renderLayoutStory(
  surface: Parameters<typeof div>[0],
  args: LayoutStoryArgs,
  frame: Readonly<{x: number; y: number; w: number; h: number}>,
  options: Readonly<{component: LayoutStoryComponent; section: string; variant: string}>,
): void {
  const width = Math.min(720, Math.max(360, frame.w * 0.72))
  const height = 300
  const x = frame.x + (frame.w - width) / 2
  const y = frame.y + frame.h * 0.57 - height / 2
  div(surface, x, y, width, height, {
    style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32},
  })
  if (options.component === "flex") {
    if (options.variant === "column") {
      flexColumn({
        x,
        y,
        w: width,
        h: height,
        paddingX: args.padding,
        paddingY: args.padding,
        gap: args.gap,
        alignItems: args.align,
        items: [
          {height: 58, width: 220, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "header", "cyan")},
          {height: "grow", width: 320, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "grow", "green")},
          {height: 48, width: 260, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "footer", "orange")},
        ],
      })
      return
    }
    flexRow({
      x,
      y,
      w: width,
      h: height,
      paddingX: args.padding,
      paddingY: args.padding,
      gap: args.gap,
      alignItems: args.align,
      items: [
        {width: 108, height: 112, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "108", "cyan")},
        {width: "grow", height: 160, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "grow", "green")},
        {width: 144, height: 84, draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, "144", "orange")},
      ],
    })
    return
  }
  const sizes = cssSizes(options.variant)
  if (args.align === "stretch") {
    flexColumnCss({
      x,
      y,
      w: width,
      h: height,
      paddingX: args.padding,
      paddingY: args.padding,
      gap: args.gap,
      alignItems: args.align,
      items: sizes.map((item) => ({
        height: item.size,
        draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, item.label, item.color),
      })),
    })
    return
  }
  flexRowCss({
    x,
    y,
    w: width,
    h: height,
    paddingX: args.padding,
    paddingY: args.padding,
    gap: args.gap,
    alignItems: args.align,
    items: sizes.map((item) => ({
      width: item.size,
      height: 124,
      draw: (cx, cy, cw, ch) => cell(surface, cx, cy, cw, ch, item.label, item.color),
    })),
  })
}

function cssSizes(variant: string): readonly Readonly<{label: string; size: UiSize; color: CssColor}>[] {
  if (variant === "pixels") return [
    {label: "120px", size: 120, color: "cyan"},
    {label: "180px", size: 180, color: "green"},
    {label: "220px", size: 220, color: "orange"},
  ]
  if (variant === "percent") return [
    {label: "24%", size: "24%", color: "cyan"},
    {label: "32%", size: "32%", color: "green"},
    {label: "44%", size: "44%", color: "orange"},
  ]
  return [
    {label: "1fr", size: "1fr", color: "cyan"},
    {label: "2fr", size: "2fr", color: "green"},
    {label: "1fr", size: "1fr", color: "orange"},
  ]
}

function cell(
  surface: Parameters<typeof div>[0],
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  color: CssColor,
): void {
  div(surface, x, y, width, height, {
    style: {background: color, borderColor: "rgba(255, 255, 255, 0.24)", borderRadius: 22, opacity: 0.72},
  })
  span(surface, x + 12, y + height / 2 - 12, Math.max(1, width - 24), 24, {
    children: label,
    style: {fontSize: 12, color: "text", textAlign: "center"},
  })
}

function layoutSource(
  options: Readonly<{component: LayoutStoryComponent; section: string; variant: string}>,
  args: LayoutStoryArgs,
): string {
  if (options.component === "flex") {
    const fn = options.variant === "column" ? "flexColumn" : "flexRow"
    return [
      `import {${fn}} from "@ui/elements/flex"`,
      "",
      `${fn}({`,
      "  x, y, w, h,",
      `  gap: ${args.gap},`,
      `  paddingX: ${args.padding},`,
      `  alignItems: ${JSON.stringify(args.align)},`,
      "  items,",
      "})",
    ].join("\n")
  }
  const fn = args.align === "stretch" ? "flexColumnCss" : "flexRowCss"
  const prop = fn === "flexRowCss" ? "width" : "height"
  const sizes = cssSizes(options.variant).map(({label}) => label)
  return [
    `import {${fn}} from "@ui/elements/flex-css"`,
    "",
    `${fn}({`,
    "  x, y, w, h,",
    `  gap: ${args.gap},`,
    `  paddingX: ${args.padding},`,
    `  alignItems: ${JSON.stringify(args.align)},`,
    `  items: ${JSON.stringify(sizes)}.map(size => ({${prop}: size, draw})),`,
    "})",
  ].join("\n")
}
