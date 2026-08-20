import {button} from "@ui/elements/button"
import {div} from "@ui/elements/div"
import {img} from "@ui/elements/img"
import {input} from "@ui/elements/input"
import {select} from "@ui/elements/select"
import {li, liY, ul, ulContentHeight, type LiElementProps} from "@ui/elements/list"
import {span} from "@ui/elements/span"
import type {CssColor, CssTextAlign} from "@ui/elements/style"
import {uiShapeMetrics} from "../../shape.ts"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryControl,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import type {PrimitiveStoryComponent} from "../stories.ts"

type PrimitiveStoryArgs = PlaygroundStoryArgs & Readonly<{
  label: string
  tone: "cyan" | "green" | "orange" | "red"
  density: "regular" | "compact"
  radius: number
  disabled: boolean
  active: boolean
  open: boolean
  fit: "cover" | "contain"
  mode: "regular" | "dense" | "interactive" | "scroll"
  align: CssTextAlign
  state: string
  clicks: number
}>

declare global {
  var __elementsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createPrimitiveStory(options: Readonly<{
  component: PrimitiveStoryComponent
  section: string
  variant: string
}>): PlaygroundStoryModule {
  const initial = primitiveArgs(options)
  return definePlaygroundStoryModule<PrimitiveStoryArgs>({
    defaultArgs: initial,
    controls: primitiveControls(options.component),
    render(surface, args, frame) {
      renderPrimitiveStory(surface, args, frame, options)
    },
    source(args) {
      return primitiveSource(options, args)
    },
  })
}

function renderPrimitiveStory(
  surface: Parameters<typeof div>[0],
  args: PrimitiveStoryArgs,
  frame: Readonly<{x: number; y: number; w: number; h: number}>,
  options: Readonly<{component: PrimitiveStoryComponent; section: string; variant: string}>,
): void {
  const width = Math.min(620, Math.max(320, frame.w * 0.62))
  const x = frame.x + (frame.w - width) / 2
  const centerY = frame.y + frame.h * 0.57
  if (options.component === "div") {
    if (options.section === "scroll") {
      renderScrollDiv(surface, args, x, centerY - 120, width, options.variant)
      return
    }
    const radius = options.variant === "z-index" ? 18 : args.radius
    const border = options.variant === "border" ? args.tone : "rgba(214, 231, 255, 0.18)"
    div(surface, x, centerY - 100, width, 200, {
      style: {
        background: toneFill(args.tone, options.variant === "background" ? 0.18 : 0.08),
        borderColor: border,
        borderWidth: options.variant === "border" ? 2 : 1,
        borderRadius: radius,
        padding: options.variant === "padding" ? (args.density === "compact" ? 18 : 34) : 18,
        zIndex: options.variant === "z-index" ? 0.08 : 0,
      },
    })
    div(surface, x + 34, centerY - 66, width - 68, 132, {
      style: {background: "rgba(255, 255, 255, 0.055)", borderColor: args.tone, borderRadius: Math.max(8, radius - 8)},
    })
    span(surface, x + 58, centerY - 12, width - 116, 28, {
      children: args.label,
      style: {fontSize: 14, color: "text", textAlign: "center"},
    })
    return
  }
  if (options.component === "span") {
    div(surface, x, centerY - 68, width, 136, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: args.radius},
    })
    span(surface, x + 30, centerY - 20, width - 60, 40, {
      children: args.label,
      style: {fontSize: 20, color: args.tone, textAlign: args.align},
    })
    return
  }
  if (options.component === "button") {
    const clicks = options.variant === "clickable" ? ` · ${args.clicks}` : ""
    const controlWidth = 146
    button(surface, frame.x + (frame.w - controlWidth) / 2, centerY - uiShapeMetrics.controlHeight / 2, controlWidth, uiShapeMetrics.controlHeight, {
      key: "elements-story-button",
      children: `${args.label}${clicks}`,
      disabled: args.disabled,
      onClick: () => {
        globalThis.__elementsStoryControlBridge?.("clicks", args.clicks + 1)
        globalThis.__elementsStoryControlBridge?.("state", "click")
      },
      style: {borderRadius: args.radius},
    })
    return
  }
  if (options.component === "input") {
    const controlWidth = 146
    input(surface, frame.x + (frame.w - controlWidth) / 2, centerY - uiShapeMetrics.controlHeight / 2, controlWidth, uiShapeMetrics.controlHeight, {
      key: "elements-story-input",
      value: args.label,
      placeholder: "Введите значение",
      active: args.active,
      disabled: args.disabled,
      onChange: (value) => globalThis.__elementsStoryControlBridge?.("label", value),
      style: {borderRadius: args.radius},
    })
    return
  }
  if (options.component === "select") {
    const controlWidth = 146
    select(surface, frame.x + (frame.w - controlWidth) / 2, centerY - uiShapeMetrics.controlHeight / 2, controlWidth, uiShapeMetrics.controlHeight, {
      key: "elements-story-select",
      value: args.label,
      options: [
        {value: "Сложение", label: "Сложение"},
        {value: "Умножение", label: "Умножение"},
        {value: "Вычитание", label: "Вычитание"},
        {value: "Деление", label: "Деление", disabled: true},
      ],
      open: args.open,
      active: args.active,
      disabled: args.disabled,
      onChange: (value) => {
        globalThis.__elementsStoryControlBridge?.("label", value)
        globalThis.__elementsStoryControlBridge?.("state", `choice:${value}`)
      },
      onOpenChange: (open) => globalThis.__elementsStoryControlBridge?.("open", open),
      onClick: () => {
        globalThis.__elementsStoryControlBridge?.("clicks", args.clicks + 1)
        globalThis.__elementsStoryControlBridge?.("state", "click")
      },
      style: {borderRadius: args.radius},
    })
    return
  }
  if (options.component === "img") {
    div(surface, x, centerY - 150, width, 300, {
      style: {background: "rgba(4, 8, 14, 0.52)", borderColor: "rgba(214, 231, 255, 0.14)", borderRadius: args.radius},
    })
    img(surface, x + 18, centerY - 132, width - 36, 264, {
      src: artworkUrl(),
      fit: args.fit,
      style: {opacity: 0.94},
    })
    return
  }
  renderList(surface, args, x, centerY - 155, width, 310)
}

function renderScrollDiv(
  surface: Parameters<typeof div>[0],
  args: PrimitiveStoryArgs,
  x: number,
  y: number,
  width: number,
  variant: string,
): void {
  const horizontal = variant === "horizontal"
  const content = horizontal
    ? Array.from({length: 8}, (_, index) => `сегмент-${index + 1}`).join("     ")
    : Array.from({length: 18}, (_, index) => `Строка ${String(index + 1).padStart(2, "0")} · сохранённое содержимое`).join("\n")
  div(surface, x, y, width, 240, {
    key: `elements-story-div-scroll-${variant}`,
    children: content,
    style: {
      overflowX: horizontal ? "auto" : "hidden",
      overflowY: horizontal ? "hidden" : "auto",
      background: toneFill(args.tone, 0.06),
      borderColor: args.tone,
      borderRadius: args.radius,
      padding: args.density === "compact" ? 16 : 24,
      color: "muted",
      fontSize: 12,
      lineHeight: 1.55,
    },
  })
}

function renderList(
  surface: Parameters<typeof div>[0],
  args: PrimitiveStoryArgs,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const rows = [
    ["UiRuntime", "Одна среда выполнения на продукт"],
    ["UiSurface", "Стабильный родитель"],
    ["FlexBox", "Общая раскладка"],
    ["Ввод", "Попадание и состояние клавиатуры"],
    ["Тема", "Общие токены"],
    ["Прокрутка", "Виртуальная область"],
    ["Рендерер", "Проход отрисовки WebGPU"],
    ["Сценарий", "Ленивая загрузка рабочего модуля"],
  ] as const
  const dense = args.mode === "dense"
  const itemHeight = dense ? 38 : 50
  const itemGap = dense ? 2 : 4
  const count = args.mode === "scroll" ? rows.length : 5
  ul(surface, x, y, width, height, {
    key: "elements-story-list",
    dense,
    itemHeight,
    itemGap,
    scrollContentHeight: args.mode === "scroll"
      ? ulContentHeight(count, {itemHeight, itemGap, paddingTop: 8, paddingBottom: 8})
      : height,
    style: {
      background: "rgba(4, 8, 14, 0.38)",
      borderColor: args.tone,
      borderRadius: args.radius,
      overflowY: args.mode === "scroll" ? "auto" : "hidden",
    },
    children: (context) => {
      for (let index = 0; index < count; index += 1) {
        const row = rows[index]!
        const rowY = liY(index, {startY: context.itemY, itemHeight, itemGap})
        const props: LiElementProps = {
          key: `elements-story-list-row-${index}`,
          style: (state) => ({
            background: state.hovered && args.mode === "interactive" ? toneFill(args.tone, 0.1) : null,
            borderColor: state.pressed && args.mode === "interactive" ? args.tone : null,
            borderRadius: 12,
          }),
          children: () => {
            span(surface, context.itemX + 16, rowY + 4, context.itemWidth - 32, 20, {
              children: row[0],
              style: {fontSize: dense ? 10 : 11, color: "text"},
            })
            span(surface, context.itemX + 16, rowY + (dense ? 20 : 26), context.itemWidth - 32, 16, {
              children: row[1],
              style: {fontSize: 9, color: "muted"},
            })
          },
        }
        if (args.mode === "interactive") {
          props.onClick = () => {
            globalThis.__elementsStoryControlBridge?.("label", row[0])
            globalThis.__elementsStoryControlBridge?.("state", `click:${row[0]}`)
          }
        }
        li(surface, context.itemX, rowY, context.itemWidth, itemHeight, props)
      }
    },
  })
}

function primitiveControls(
  component: PrimitiveStoryComponent,
): readonly PlaygroundStoryControl<keyof PrimitiveStoryArgs & string>[] {
  const common: PlaygroundStoryControl<keyof PrimitiveStoryArgs & string>[] = [
    {
      key: "tone",
      label: "Акцент",
      group: "Внешний вид",
      kind: "select",
      options: [
        {value: "cyan", label: "Голубой"},
        {value: "green", label: "Зелёный"},
        {value: "orange", label: "Оранжевый"},
        {value: "red", label: "Красный"},
      ],
    },
    {key: "radius", label: "Скругление", group: "Внешний вид", kind: "number"},
  ]
  if (component === "div") return [
    ...common,
    {
      key: "density",
      label: "Плотность",
      group: "Внешний вид",
      kind: "select",
      options: [{value: "regular", label: "Обычная"}, {value: "compact", label: "Компактная"}],
    },
  ]
  if (component === "span") return [{key: "label", label: "Текст", group: "Содержимое", kind: "text"}, ...common]
  if (component === "button" || component === "input" || component === "select") return [
    {key: "label", label: component === "button" ? "Подпись" : "Значение", group: "Содержимое", kind: "text"},
    {key: "disabled", label: "Недоступно", group: "Состояние", kind: "boolean"},
    ...(component === "select" ? [{key: "open", label: "Раскрыто", group: "Состояние", kind: "boolean"} as const] : []),
    ...common,
  ]
  if (component === "img") return [
    {
      key: "fit",
      label: "Вписывание",
      group: "Изображение",
      kind: "select",
      options: [{value: "cover", label: "Заполнение"}, {value: "contain", label: "Целиком"}],
    },
    {key: "radius", label: "Скругление", group: "Внешний вид", kind: "number"},
  ]
  return [
    {
      key: "mode",
      label: "Режим",
      group: "Список",
      kind: "select",
      options: [
        {value: "regular", label: "Обычный"},
        {value: "dense", label: "Плотный"},
        {value: "interactive", label: "Интерактивный"},
        {value: "scroll", label: "Прокрутка"},
      ],
    },
    ...common,
  ]
}

function primitiveArgs(options: Readonly<{
  component: PrimitiveStoryComponent
  section: string
  variant: string
}>): PrimitiveStoryArgs {
  const args: PrimitiveStoryArgs = {
    label: options.component === "span" ? "Текстовый элемент" : options.component === "input" ? "Значение" : options.component === "select" ? "Умножение" : "Элемент UI",
    tone: "cyan",
    density: "regular",
    radius: options.component === "button" || options.component === "input" || options.component === "select" ? uiShapeMetrics.lowRadius : 28,
    disabled: options.variant === "disabled",
    active: options.variant === "active",
    open: options.variant === "open",
    fit: options.variant === "contain" ? "contain" : "cover",
    mode: options.component === "list" ? options.variant as PrimitiveStoryArgs["mode"] : "regular",
    align: options.component === "span" ? options.variant as CssTextAlign : "center",
    state: options.variant,
    clicks: 0,
  }
  return args
}

function primitiveSource(
  options: Readonly<{component: PrimitiveStoryComponent; section: string; variant: string}>,
  args: PrimitiveStoryArgs,
): string {
  if (options.component === "div") {
    if (options.section === "scroll") return [
      'import {div} from "@ui/elements/div"',
      "",
      "div(surface, x, y, w, h, {",
      '  key: "content",',
      "  children: content,",
      `  style: {overflow${options.variant === "horizontal" ? "X" : "Y"}: "auto", borderRadius: ${args.radius}},`,
      "})",
    ].join("\n")
    const properties = [
      `    background: ${JSON.stringify(toneFill(args.tone, options.variant === "background" ? 0.18 : 0.08))},`,
      `    borderRadius: ${options.variant === "z-index" ? 18 : args.radius},`,
    ]
    if (options.variant === "border") properties.push(`    borderColor: ${JSON.stringify(args.tone)},`, "    borderWidth: 2,")
    if (options.variant === "padding") properties.push(`    padding: ${args.density === "compact" ? 18 : 34},`)
    if (options.variant === "z-index") properties.push("    zIndex: 0.08,")
    return [
      'import {div} from "@ui/elements/div"',
      "",
      "div(surface, x, y, w, h, {",
      "  style: {",
      ...properties,
      "  },",
      "})",
    ].join("\n")
  }
  if (options.component === "span") return `import {span} from "@ui/elements/span"\n\nspan(surface, x, y, w, h, {children: ${JSON.stringify(args.label)}, style: {textAlign: ${JSON.stringify(args.align)}, color: ${JSON.stringify(args.tone)}}})`
  if (options.component === "button") return `import {button} from "@ui/elements/button"\n\nbutton(surface, x, y, w, h, {children: ${JSON.stringify(args.label)}, disabled: ${args.disabled}, onClick})`
  if (options.component === "input") return `import {input} from "@ui/elements/input"\n\ninput(surface, x, y, w, h, {key: "value", value: ${JSON.stringify(args.label)}, active: ${args.active}, disabled: ${args.disabled}, onChange: setValue})`
  if (options.component === "select") return [
    'import {select, type SelectElementOption} from "@ui/elements/select"',
    "",
    'const options: readonly SelectElementOption<string>[] = [',
    '  {value: "Сложение", label: "Сложение"},',
    '  {value: "Умножение", label: "Умножение"},',
    '  {value: "Вычитание", label: "Вычитание"},',
    '  {value: "Деление", label: "Деление", disabled: true},',
    "]",
    "",
    `select(surface, x, y, w, h, {key: "value", value: ${JSON.stringify(args.label)}, options, open: ${args.open}, active: ${args.active}, disabled: ${args.disabled}, onChange: setValue, onOpenChange: setOpen})`,
  ].join("\n")
  if (options.component === "img") return `import {img} from "@ui/elements/img"\n\nimg(surface, x, y, w, h, {src: artworkUrl, fit: ${JSON.stringify(args.fit)}})`
  const listOptions = [
    `  dense: ${args.mode === "dense"},`,
    ...(args.mode === "scroll" ? ['  style: {overflowY: "auto"},'] : []),
  ]
  return [
    'import {li, liY, ul} from "@ui/elements/list"',
    'import {span} from "@ui/elements/span"',
    "",
    "ul(surface, x, y, w, h, {",
    ...listOptions,
    "  children: context => {",
    "  rows.forEach((row, index) => {",
    "    const y = liY(index, {startY: context.itemY})",
    `    li(surface, context.itemX, y, context.itemWidth, 48, {${args.mode === "interactive" ? "onClick: selectRow, " : ""}children: () => span(surface, context.itemX, y, context.itemWidth, 48, {children: row})})`,
    "  })",
    "  },",
    "})",
  ].join("\n")
}

function toneFill(tone: PrimitiveStoryArgs["tone"], alpha: number): CssColor {
  if (tone === "green") return `rgba(82, 196, 123, ${alpha})`
  if (tone === "orange") return `rgba(255, 190, 111, ${alpha})`
  if (tone === "red") return `rgba(255, 127, 111, ${alpha})`
  return `rgba(111, 211, 255, ${alpha})`
}

function artworkUrl(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6fd3ff"/><stop stop-color="#52c47b" offset=".52"/><stop stop-color="#ffbe6f" offset="1"/></linearGradient></defs>',
    '<rect width="640" height="360" fill="#07101c"/><rect x="96" y="78" width="448" height="204" rx="54" fill="url(#g)" opacity=".78"/>',
    "</svg>",
  ].join("")
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
