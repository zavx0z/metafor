import {Element, UiCanvas, flexColumn, h2, h3, p, palette, span, uiIcons} from "@metafor/elements"
import {Button, type ButtonColor, type ButtonProps, type ButtonSize, type ButtonVariant, Card, Divider} from "@metafor/components"
import {VirtualRouter} from "../../playground/virtual-router.ts"

type ButtonLabel = "Button" | "Apply" | "Run" | "Delete"
type ButtonIcon = "none" | "apply" | "run" | "delete"
type IconPlacement = "start" | "end" | "only"
type ButtonState = "enabled" | "disabled"
type ButtonWidth = "compact" | "regular" | "wide"
type ButtonHeight = "compact" | "regular" | "large"
type BasicButtonType = "Text button" | "Contained button" | "Outlined button"
type ButtonRouteVariant = "text" | "contained" | "outlined"
type ButtonRoute = "button/basic" | `button/basic/${ButtonRouteVariant}` | "button/sizes" | `button/sizes/${ButtonSize}`
type ButtonSection = "Basic" | "Sizes"

const BASIC_BUTTON_TYPES: readonly BasicButtonType[] = ["Text button", "Contained button", "Outlined button"]
const BUTTON_SECTIONS: readonly ButtonSection[] = ["Basic", "Sizes"]
const BUTTON_COLORS: readonly ButtonColor[] = ["primary", "success", "warning", "error", "neutral"]
const BUTTON_SIZES: readonly ButtonSize[] = ["small", "medium", "large"]
const BUTTON_ROUTES: readonly ButtonRoute[] = [
  "button/basic",
  "button/basic/text",
  "button/basic/contained",
  "button/basic/outlined",
  "button/sizes",
  "button/sizes/small",
  "button/sizes/medium",
  "button/sizes/large",
]
const BUTTON_LABELS: readonly ButtonLabel[] = ["Button", "Apply", "Run", "Delete"]
const BUTTON_ICONS: readonly ButtonIcon[] = ["none", "apply", "run", "delete"]
const ICON_PLACEMENTS: readonly IconPlacement[] = ["start", "end", "only"]
const BUTTON_STATES: readonly ButtonState[] = ["enabled", "disabled"]
const BUTTON_WIDTHS: readonly ButtonWidth[] = ["compact", "regular", "wide"]
const BUTTON_HEIGHTS: readonly ButtonHeight[] = ["compact", "regular", "large"]
const COMPONENT_NAV = ["Button", "Card", "Badge", "TextField", "Divider", "Scrollbar", "Scroll List", "Noti Stack"] as const
const BUTTON_RADII = [14, 24, 34, 999] as const
const ICON_SIZES = [16, 20, 24] as const
const LAYOUT_Z = -0.00012
const BACKDROP_Z = -0.00018

class ButtonComponentsScreen extends Element {
  readonly #router = new VirtualRouter<ButtonRoute>(BUTTON_ROUTES, "button/basic", {mode: "path"})
  readonly #unsubscribe: () => void
  #route: ButtonRoute = this.#router.current
  #color: ButtonColor = "primary"
  #size: ButtonSize = "medium"
  #label: ButtonLabel = "Button"
  #icon: ButtonIcon = "none"
  #iconPlacement: IconPlacement = "start"
  #radius = 999
  #iconSize = 20
  #state: ButtonState = "enabled"
  #tooltip = false
  #width: ButtonWidth = "regular"
  #height: ButtonHeight = "regular"
  #eventCount = 0

  constructor() {
    super({bgColor: null, borderColor: null})
    const initialSize = routeSizeFromRoute(this.#route)
    if (initialSize !== null) this.#size = initialSize
    this.#unsubscribe = this.#router.subscribe((route) => {
      this.#route = route
      const routeSize = routeSizeFromRoute(route)
      if (routeSize !== null) this.#size = routeSize
      this.requestRender()
    })
  }

  override dispose(): void {
    this.#unsubscribe()
    this.#router.dispose()
    super.dispose()
  }

  protected render(): void {
    this.#backdrop()

    const stageW = Math.max(1040, Math.min(1540, this.rectW - 48))
    const stageH = Math.max(560, Math.min(860, this.rectH - 36))
    const stageX = (this.rectW - stageW) / 2
    const stageY = (this.rectH - stageH) / 2
    const gap = 18
    const catalogW = Math.round(Math.max(204, Math.min(250, stageW * 0.19)))
    const sectionW = Math.round(Math.max(150, Math.min(190, stageW * 0.13)))
    const paramsW = Math.round(Math.max(340, Math.min(420, stageW * 0.27)))
    const dockH = Math.max(86, Math.min(112, stageH * 0.15))
    const previewW = stageW - catalogW - sectionW - paramsW - gap * 3
    const previewH = stageH - dockH - gap
    const sectionX = stageX + catalogW + gap
    const previewX = sectionX + sectionW + gap
    const paramsX = previewX + previewW + gap

    this.#catalog(stageX, stageY, catalogW, stageH)
    this.#sectionPanel(sectionX, stageY, sectionW, stageH)
    this.#preview(previewX, stageY, previewW, previewH)
    this.#dock(previewX, stageY + previewH + gap, previewW, dockH)
    this.#parameters(paramsX, stageY, paramsW, stageH)
  }

  #backdrop(): void {
    this.drawBackdropGradient({
      base: 0x07101b,
      glowA: {color: "rgba(111,211,255,0.16)", cx: 0.28, cy: 0.18, radius: 0.42},
      glowB: {color: "rgba(82,196,123,0.10)", cx: 0.76, cy: 0.76, radius: 0.42},
      z: BACKDROP_Z,
    })
  }

  #catalog(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(12, 18, 30, 0.78)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 36,
        zIndex: LAYOUT_Z,
      },
    })

    const pad = 22
    h3(this, x + pad, y + 28, w - pad * 2, 24, {children: "Components", style: {fontSize: 15}})
    const top = y + 76
    const gap = 9
    const rowH = 38
    for (const [i, label] of COMPONENT_NAV.entries()) {
      const active = label === "Button"
      Button(this, x + pad, top + i * (rowH + gap), w - pad * 2, rowH, {
        children: label,
        variant: active ? "contained" : "glass",
        color: "neutral",
        ...activeNavStyle(active),
        disabled: !active,
        radius: 999,
        fontPx: 11,
        onClick: () => this.#record("component:button"),
      })
    }
  }

  #sectionPanel(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(12, 18, 30, 0.78)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 36,
        zIndex: LAYOUT_Z,
      },
    })

    const pad = 18
    h3(this, x + pad, y + 28, w - pad * 2, 24, {children: "Button", style: {fontSize: 15}})
    const top = y + 76
    for (const [i, section] of BUTTON_SECTIONS.entries()) {
      const active = this.#routeSection() === section
      Button(this, x + pad, top + i * 47, w - pad * 2, 38, {
        children: section,
        variant: active ? "contained" : "glass",
        color: "neutral",
        ...activeNavStyle(active),
        radius: 999,
        fontPx: 11,
        onClick: () => this.#goSection(section),
      })
    }
  }

  #preview(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(8, 13, 22, 0.72)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 38,
        zIndex: LAYOUT_Z,
      },
    })

    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#routeSection() === "Sizes") {
      const size = this.#routeSize()
      if (size === null) this.#sizesOverview(x, y, w, h)
      else this.#sizeDetail(x, y, w, h, size)
    } else {
      const variant = this.#routeVariant()
      if (variant === null) this.#basicOverview(x, y, w, h)
      else this.#buttonDetail(x, y, w, h, variant)
    }
    this.popClip()
  }

  #basicOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const codeLines = [
      'Button(host, x, y, w, h, { children: "Text", variant: "text" })',
      'Button(host, x, y, w, h, { children: "Contained", variant: "contained" })',
      'Button(host, x, y, w, h, { children: "Outlined", variant: "outlined" })',
    ]
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH: 46,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "Basic button", ["The Button comes with three variants: text, contained, and outlined."])

    const btnW = Math.min(140, Math.max(102, (w - pad * 2 - 32) / 3))
    const rowW = btnW * 3 + 32
    const startX = x + (w - rowW) / 2
    Button(this, startX, rows.demoY, btnW, 46, {children: "Text", variant: "text", color: this.#color, radius: this.#radius, onClick: () => this.#go("text")})
    Button(this, startX + btnW + 16, rows.demoY, btnW, 46, {
      children: "Contained",
      variant: "contained",
      color: this.#color,
      radius: this.#radius,
      onClick: () => this.#go("contained"),
    })
    Button(this, startX + (btnW + 16) * 2, rows.demoY, btnW, 46, {
      children: "Outlined",
      variant: "outlined",
      color: this.#color,
      radius: this.#radius,
      onClick: () => this.#go("outlined"),
    })

    codeBlock(this, x + pad, rows.codeY, w - pad * 2, codeLines)
  }

  #buttonDetail(x: number, y: number, w: number, h: number, variant: ButtonRouteVariant): void {
    const pad = 42
    const headerH = 108
    const codeLines = [
      `Button(host, x, y, w, h, { children: "${this.#label === "Button" ? "Primary" : this.#label}", variant: "${variant}" })`,
      `Button(host, x, y, w, h, { children: "Disabled", variant: "${variant}", disabled: true })`,
      `Button(host, x, y, w, h, { children: "Link", variant: "${variant}" })`,
    ]

    const contentW = w - pad * 2
    const buttonW = Math.min(this.#buttonWidth(Math.min(contentW, 520)), 168)
    const buttonH = this.#buttonHeight()
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, detailTitle(variant), detailDescriptionLines(variant))

    const rowGap = Math.max(22, (contentW - buttonW * 3) / 2)
    const rowX = x + pad
    const primaryLabel = this.#label === "Button" ? "Primary" : this.#label
    if (variant === "text") {
      this.#textButtonExample(rowX, rows.demoY + (buttonH - 22) / 2, buttonW, primaryLabel.toUpperCase(), false)
      this.#textButtonExample(rowX + buttonW + rowGap, rows.demoY + (buttonH - 22) / 2, buttonW, "DISABLED", true)
      this.#textButtonExample(rowX + (buttonW + rowGap) * 2, rows.demoY + (buttonH - 22) / 2, buttonW, "LINK", false)
    } else {
      Button(this, rowX, rows.demoY, buttonW, buttonH, {...this.#buttonProps(), label: primaryLabel, children: primaryLabel})
      Button(this, rowX + buttonW + rowGap, rows.demoY, buttonW, buttonH, {
        ...this.#buttonProps(),
        label: "Disabled",
        children: "Disabled",
        disabled: true,
      })
      Button(this, rowX + (buttonW + rowGap) * 2, rows.demoY, buttonW, buttonH, {
        ...this.#buttonProps(),
        label: "Link",
        children: "Link",
      })
    }

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #sizesOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const sizes: readonly ButtonSize[] = ["small", "medium", "large"]
    const codeLines = [
      'Button(host, x, y, w, h, { children: "Small", size: "small" })',
      'Button(host, x, y, w, h, { children: "Medium", size: "medium" })',
      'Button(host, x, y, w, h, { children: "Large", size: "large" })',
    ]

    const contentW = w - pad * 2
    const columnW = Math.min(150, Math.max(104, (contentW - 52 * 2) / 3))
    const columnGap = Math.max(28, (contentW - columnW * 3) / 2)
    const startX = x + pad
    const controlRowGap = 18
    const controlRowH = sizeButtonHeight("large")
    const demoH = controlRowH * 3 + controlRowGap * 2
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "Sizes", ["For larger or smaller buttons, use the size prop."])

    const firstRowY = rows.demoY
    const outlinedY = firstRowY + controlRowH + controlRowGap
    const containedY = outlinedY + controlRowH + controlRowGap
    for (const [i, size] of sizes.entries()) {
      const label = sizeLabel(size)
      const bx = startX + i * (columnW + columnGap)
      const itemH = sizeButtonHeight(size)
      const itemY = (rowY: number) => rowY + (controlRowH - itemH) / 2
      Button(this, bx, itemY(firstRowY), columnW, itemH, {
        children: label,
        label,
        variant: "text",
        color: this.#color,
        size,
        radius: 18,
        fontPx: sizeFont(size),
        onClick: () => this.#goSize(size),
      })
      Button(this, bx, itemY(outlinedY), columnW, itemH, {
        children: label,
        variant: "outlined",
        color: this.#color,
        size,
        radius: Math.min(this.#radius, 18),
        onClick: () => this.#goSize(size),
      })
      Button(this, bx, itemY(containedY), columnW, itemH, {
        children: label,
        variant: "contained",
        color: this.#color,
        size,
        radius: Math.min(this.#radius, 18),
        onClick: () => this.#goSize(size),
      })
    }

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #sizeDetail(x: number, y: number, w: number, h: number, size: ButtonSize): void {
    const pad = 42
    const headerH = 108
    const title = sizeTitle(size)
    const codeLines = [
      `Button(host, x, y, w, h, { children: "Text", variant: "text", size: "${size}" })`,
      `Button(host, x, y, w, h, { children: "Outlined", variant: "outlined", size: "${size}" })`,
      `Button(host, x, y, w, h, { children: "Contained", variant: "contained", size: "${size}" })`,
    ]

    const contentW = w - pad * 2
    const buttonW = Math.min(this.#buttonWidth(Math.min(contentW, 520)), 168)
    const buttonH = sizeButtonHeight(size)
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${title} buttons`, sizeDescriptionLines(size))

    const rowGap = Math.max(22, (contentW - buttonW * 3) / 2)
    const rowX = x + pad
    Button(this, rowX, rows.demoY, buttonW, buttonH, {
      children: "Text",
      variant: "text",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })
    Button(this, rowX + buttonW + rowGap, rows.demoY, buttonW, buttonH, {
      children: "Outlined",
      variant: "outlined",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })
    Button(this, rowX + (buttonW + rowGap) * 2, rows.demoY, buttonW, buttonH, {
      children: "Contained",
      variant: "contained",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #textButtonExample(x: number, y: number, w: number, label: string, disabled: boolean): void {
    Button(this, x, y - 3, w, 28, {
      children: label,
      label,
      variant: "text",
      color: this.#color,
      disabled,
      radius: 14,
      fontPx: 14,
      onClick: () => this.#record(`click:${label.toLowerCase()}`),
    })
  }

  #dock(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 34, zIndex: LAYOUT_Z},
    })
    if (this.#routeSection() === "Sizes") {
      this.#sizeDock(x, y, w, h)
      return
    }

    const itemGap = 12
    const itemW = Math.max(94, Math.min(148, (w - 64 - itemGap * (BASIC_BUTTON_TYPES.length - 1)) / BASIC_BUTTON_TYPES.length))
    const rowW = itemW * BASIC_BUTTON_TYPES.length + itemGap * (BASIC_BUTTON_TYPES.length - 1)
    const startX = x + (w - rowW) / 2
    for (const [i, type] of BASIC_BUTTON_TYPES.entries()) {
      const variant = routeVariantFromButtonType(type)
      const active = this.#routeVariant() === variant
      Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
        children: dockLabel(type),
        variant: active ? "contained" : "glass",
        color: "neutral",
        ...activeNavStyle(active),
        radius: this.#radius,
        onClick: () => this.#go(variant),
      })
    }
  }

  #sizeDock(x: number, y: number, w: number, h: number): void {
    const itemGap = 12
    const itemW = Math.max(94, Math.min(148, (w - 64 - itemGap * (BUTTON_SIZES.length - 1)) / BUTTON_SIZES.length))
    const rowW = itemW * BUTTON_SIZES.length + itemGap * (BUTTON_SIZES.length - 1)
    const startX = x + (w - rowW) / 2
    const routeSize = this.#routeSize()
    for (const [i, size] of BUTTON_SIZES.entries()) {
      const active = routeSize === size
      Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
        children: size,
        variant: active ? "contained" : "glass",
        color: active ? this.#color : "neutral",
        ...activeNavStyle(active),
        radius: this.#radius,
        onClick: () => this.#goSize(size),
      })
    }
  }

  #parameters(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    this.pushClip(x + 2, y + 2, w - 4, h - 4)

    let cy = y + 22
    h3(this, x + 24, cy, w - 48, 24, {children: "Button props", style: {fontSize: 15}})
    cy += 36
    cy += this.#optionGroup(x + 24, cy, w - 48, "label", BUTTON_LABELS, this.#label, (value) => {
      this.#label = value
      this.#record(`label:${value.toLowerCase()}`)
    }, 62) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "color", BUTTON_COLORS, this.#color, (value) => {
      this.#color = value
      this.#record(`color:${value}`)
    }, 52, {
      color: (value, active) => active ? value : "neutral",
    }) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "size", BUTTON_SIZES, this.#size, (value) => {
      this.#size = value
      this.#record(`size:${value}`)
    }, 62) + 8
    cy += this.#numberGroup(x + 24, cy, w - 48, "radius", BUTTON_RADII, this.#radius, (value) => {
      this.#radius = value
      this.#record(`radius:${value}`)
    }) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "icon", BUTTON_ICONS, this.#icon, (value) => {
      this.#icon = value
      this.#record(`icon:${value}`)
    }, 62, {display: iconDisplay}) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "icon position", ICON_PLACEMENTS, this.#iconPlacement, (value) => {
      this.#iconPlacement = value
      this.#record(`icon:${value}`)
    }, 74) + 8
    cy += this.#numberGroup(x + 24, cy, w - 48, "icon size", ICON_SIZES, this.#iconSize, (value) => {
      this.#iconSize = value
      this.#record(`iconSize:${value}`)
    }) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "state", BUTTON_STATES, this.#state, (value) => {
      this.#state = value
      this.#record(value)
    }, 86) + 10

    Divider(this, x + 24, cy + 5, w - 48, {color: "neutral"})
    cy += 18
    h3(this, x + 24, cy, w - 48, 24, {children: "Layout", style: {fontSize: 15}})
    cy += 30
    cy += this.#optionGroup(x + 24, cy, w - 48, "width", BUTTON_WIDTHS, this.#width, (value) => {
      this.#width = value
      this.#record(`width:${value}`)
    }, 74) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "height", BUTTON_HEIGHTS, this.#height, (value) => {
      this.#height = value
      this.#record(`height:${value}`)
    }, 74) + 8
    cy += this.#optionGroup(x + 24, cy, w - 48, "tooltip", ["off", "on"] as const, this.#tooltip ? "on" : "off", (value) => {
      this.#tooltip = value === "on"
      this.#record(`tooltip:${value}`)
    }, 74)

    this.popClip()
  }

  #optionGroup<T extends string>(
    x: number,
    y: number,
    w: number,
    label: string,
    values: readonly T[],
    activeValue: T,
    onSelect: (value: T) => void,
    minButtonW: number,
    options: {
      color?: (value: T, active: boolean) => ButtonColor
      display?: (value: T) => string
    } = {},
  ): number {
    span(this, x, y, w, 18, {children: label, style: {fontSize: 10, color: "muted"}})
    const gap = 6
    const rowH = 28
    const cols = Math.max(1, Math.min(values.length, Math.floor((w + gap) / (minButtonW + gap))))
    const rows = Math.ceil(values.length / cols)
    const btnW = (w - gap * (cols - 1)) / cols
    for (const [i, value] of values.entries()) {
      const active = activeValue === value
      const col = i % cols
      const row = Math.floor(i / cols)
      Button(this, x + col * (btnW + gap), y + 24 + row * (rowH + gap), btnW, rowH, {
        children: options.display?.(value) ?? value,
        variant: active ? "contained" : "glass",
        color: options.color?.(value, active) ?? (active ? this.#color : "neutral"),
        radius: 999,
        fontPx: 9,
        onClick: () => onSelect(value),
      })
    }
    return 24 + rows * rowH + (rows - 1) * gap
  }

  #numberGroup<T extends number>(
    x: number,
    y: number,
    w: number,
    label: string,
    values: readonly T[],
    activeValue: T,
    onSelect: (value: T) => void,
  ): number {
    span(this, x, y, w, 18, {children: label, style: {fontSize: 10, color: "muted"}})
    const gap = 6
    const rowH = 28
    const btnW = (w - gap * (values.length - 1)) / values.length
    for (const [i, value] of values.entries()) {
      const active = activeValue === value
      Button(this, x + i * (btnW + gap), y + 24, btnW, rowH, {
        children: String(value),
        variant: active ? "contained" : "glass",
        color: active ? this.#color : "neutral",
        radius: 999,
        fontPx: 9,
        onClick: () => onSelect(value),
      })
    }
    return 52
  }

  #buttonProps(): ButtonProps {
    const props: ButtonProps = {
      label: this.#label,
      children: this.#iconPlacement === "only" ? "" : this.#label,
      variant: buttonVariant(this.#currentButtonType()),
      color: this.#color,
      size: this.#size,
      radius: this.#radius,
      disabled: this.#state === "disabled",
      iconSizePx: this.#iconSize,
      onClick: () => this.#record("click"),
      onHover: () => this.#record("hover"),
      onPress: () => this.#record("press"),
      onRelease: () => this.#record("release"),
    }
    const iconSrc = this.#iconSrc()
    if (iconSrc !== undefined) {
      if (this.#iconPlacement === "end") props.endIcon = iconSrc
      else if (this.#iconPlacement === "only") {
        props.iconSrc = iconSrc
        props.iconOnly = true
      } else {
        props.startIcon = iconSrc
      }
    }
    if (this.#tooltip) props.tooltip = this.#label
    return props
  }

  #buttonWidth(maxW: number): number {
    if (this.#width === "compact") return Math.min(maxW, 210)
    if (this.#width === "wide") return Math.min(maxW, 430)
    return Math.min(maxW, 310)
  }

  #buttonHeight(): number {
    const sizeBase = this.#size === "small" ? 40 : this.#size === "large" ? 58 : 48
    if (this.#height === "compact") return Math.max(34, sizeBase - 8)
    if (this.#height === "large") return sizeBase + 8
    return sizeBase
  }

  #iconSrc(): string | undefined {
    if (this.#icon === "apply") return uiIcons.apply
    if (this.#icon === "run") return uiIcons.run
    if (this.#icon === "delete") return uiIcons.clear
    return undefined
  }

  #codePreview(): readonly [string, string] {
    const props = this.#iconPlacement === "only" ? [`label: "${this.#label}"`] : [`children: "${this.#label}"`]
    props.push(`variant: "${buttonVariant(this.#currentButtonType())}"`, `color: "${this.#color}"`, `size: "${this.#size}"`, `radius: ${this.#radius}`)
    if (this.#icon !== "none") props.push(`${this.#iconProp()}: uiIcons.${this.#icon === "delete" ? "clear" : this.#icon}`)
    if (this.#icon !== "none") props.push(`iconSizePx: ${this.#iconSize}`)
    if (this.#iconPlacement === "only") props.push("iconOnly: true")
    if (this.#state === "disabled") props.push("disabled: true")
    if (this.#tooltip) props.push(`tooltip: "${this.#label}"`)
    return ["Button(host, x, y, w, h, {", `  ${props.join(", ")} })`]
  }

  #iconProp(): "startIcon" | "endIcon" | "iconSrc" {
    if (this.#iconPlacement === "end") return "endIcon"
    if (this.#iconPlacement === "only") return "iconSrc"
    return "startIcon"
  }

  #routeVariant(): ButtonRouteVariant | null {
    return routeVariantFromRoute(this.#route)
  }

  #routeSize(): ButtonSize | null {
    return routeSizeFromRoute(this.#route)
  }

  #routeSection(): ButtonSection {
    if (this.#route.startsWith("button/sizes")) return "Sizes"
    return "Basic"
  }

  #currentButtonType(): BasicButtonType {
    return buttonTypeFromRouteVariant(this.#routeVariant() ?? "text")
  }

  #go(variant: ButtonRouteVariant | null): void {
    const route: ButtonRoute = variant === null ? "button/basic" : `button/basic/${variant}`
    this.#router.go(route)
    this.#record(variant === null ? "route:basic" : `route:${variant}`)
  }

  #goSection(section: ButtonSection): void {
    if (section === "Sizes") {
      this.#router.go("button/sizes")
      this.#record("route:sizes")
      return
    }
    this.#go(null)
  }

  #goSize(size: ButtonSize): void {
    this.#size = size
    this.#router.go(`button/sizes/${size}`)
    this.#record(`route:sizes:${size}`)
  }

  #setSize(size: ButtonSize): void {
    if (this.#routeSection() === "Sizes") {
      this.#goSize(size)
      return
    }
    this.#size = size
    this.#record(`size:${size}`)
  }

  #record(_status: string): void {
    this.#eventCount += 1
    this.requestRender()
  }
}

function iconDisplay(value: ButtonIcon): string {
  if (value === "delete") return "delete"
  return value
}

function activeNavStyle(active: boolean): Pick<ButtonProps, "fill" | "border"> {
  if (!active) return {}
  return {fill: palette.bgHot, border: palette.cyan}
}

function routeVariantFromRoute(route: ButtonRoute): ButtonRouteVariant | null {
  if (!route.startsWith("button/basic/")) return null
  return route.slice("button/basic/".length) as ButtonRouteVariant
}

function routeSizeFromRoute(route: ButtonRoute): ButtonSize | null {
  if (!route.startsWith("button/sizes/")) return null
  return route.slice("button/sizes/".length) as ButtonSize
}

function buttonTypeFromRouteVariant(variant: ButtonRouteVariant): BasicButtonType {
  if (variant === "contained") return "Contained button"
  if (variant === "outlined") return "Outlined button"
  return "Text button"
}

function routeVariantFromButtonType(type: BasicButtonType): ButtonRouteVariant {
  if (type === "Contained button") return "contained"
  if (type === "Outlined button") return "outlined"
  return "text"
}

function buttonVariant(type: BasicButtonType): ButtonVariant {
  if (type === "Contained button") return "contained"
  if (type === "Outlined button") return "outlined"
  return "text"
}

function dockLabel(type: BasicButtonType): string {
  if (type === "Contained button") return "Contained"
  if (type === "Outlined button") return "Outlined"
  return "Text"
}

function detailTitle(variant: ButtonRouteVariant): string {
  if (variant === "contained") return "Contained button"
  if (variant === "outlined") return "Outlined button"
  return "Text button"
}

function detailDescriptionLines(variant: ButtonRouteVariant): readonly string[] {
  if (variant === "contained") {
    return ["Contained buttons are used for high-emphasis actions", "and primary decisions."]
  }
  if (variant === "outlined") {
    return ["Outlined buttons are medium-emphasis controls", "that keep the surface quiet."]
  }
  return ["Text buttons are typically used for less-pronounced actions,", "including actions in dialogs and cards."]
}

function sizeFont(size: ButtonSize): number {
  if (size === "small") return 12
  if (size === "large") return 16
  return 14
}

function sizeLabel(size: ButtonSize): string {
  if (size === "small") return "SMALL"
  if (size === "large") return "LARGE"
  return "MEDIUM"
}

function sizeTitle(size: ButtonSize): string {
  if (size === "small") return "Small"
  if (size === "large") return "Large"
  return "Medium"
}

function sizeDescriptionLines(size: ButtonSize): readonly string[] {
  if (size === "small") return ["Small buttons are compact controls", "for dense layouts and secondary actions."]
  if (size === "large") return ["Large buttons give primary actions more weight", "and make touch targets easier to scan."]
  return ["Medium buttons are the default control size", "for common actions across the interface."]
}

function sizeButtonHeight(size: ButtonSize): number {
  if (size === "small") return 36
  if (size === "large") return 52
  return 44
}

function contentRows(
  y: number,
  h: number,
  heights: {
    headerH: number
    demoH: number
    codeH: number
  },
): {headerY: number; demoY: number; codeY: number} {
  const rows = {
    headerY: y + 34,
    demoY: y + 34 + heights.headerH,
    codeY: y + h - 42 - heights.codeH,
  }
  flexColumn({
    x: 0,
    y,
    w: 1,
    h,
    paddingTop: 34,
    paddingBottom: 42,
    justifyContent: "space-between",
    items: [
      {height: heights.headerH, draw: (_x, rowY) => { rows.headerY = rowY }},
      {height: heights.demoH, draw: (_x, rowY) => { rows.demoY = rowY }},
      {height: heights.codeH, draw: (_x, rowY) => { rows.codeY = rowY }},
    ],
  })
  return rows
}

function renderHeader(host: Element, x: number, w: number, pad: number, y: number, title: string, lines: readonly string[]): void {
  h2(host, x + pad, y, w - pad * 2, 34, {children: title, style: {fontSize: 24}})
  for (const [i, line] of lines.entries()) {
    p(host, x + pad, y + 48 + i * 24, w - pad * 2, 22, {
      children: line,
      style: {fontSize: 13, color: "muted"},
    })
  }
}

function codeBlockHeight(lines: readonly string[]): number {
  return 16 + lines.length * 18
}

function codeBlock(host: Element, x: number, y: number, w: number, lines: readonly string[]): void {
  const lineH = 18
  const h = codeBlockHeight(lines)
  Card(host, x, y, w, h, {
    variant: "glass",
    sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17},
  })
  for (const [i, line] of lines.entries()) {
    span(host, x + 14, y + 7 + i * lineH, w - 28, 16, {children: line, style: {fontSize: 10, color: i === 0 ? "text" : "muted"}})
  }
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ButtonComponentsScreen(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
ui.handleResize()
