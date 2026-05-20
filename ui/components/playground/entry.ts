import {Element, UiCanvas, flexColumn, flexRow, h2, h3, p, palette, span, uiIcons} from "@metafor/elements"
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
type ButtonRouteIcon = "svg"
type ButtonRoute =
  | "button/basic"
  | `button/basic/${ButtonRouteVariant}`
  | "button/sizes"
  | `button/sizes/${ButtonSize}`
  | "button/color"
  | `button/color/${ButtonColor}`
  | "button/icon"
  | `button/icon/${ButtonRouteIcon}`
type ButtonSection = "Basic" | "Sizes" | "Color" | "Icon"

const BASIC_BUTTON_TYPES: readonly BasicButtonType[] = ["Text button", "Contained button", "Outlined button"]
const BUTTON_SECTIONS: readonly ButtonSection[] = ["Basic", "Icon", "Sizes", "Color"]
const BUTTON_COLORS: readonly ButtonColor[] = ["primary", "success", "warning", "error", "neutral"]
const BUTTON_DOC_COLORS: readonly ButtonColor[] = ["primary", "success", "warning", "error"]
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
  "button/color",
  "button/color/primary",
  "button/color/success",
  "button/color/warning",
  "button/color/error",
  "button/color/neutral",
  "button/icon",
  "button/icon/svg",
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
  #customSvgSource: string | null = null
  #customSvgName = "custom.svg"
  #eventCount = 0

  constructor() {
    super({bgColor: null, borderColor: null})
    const initialSize = routeSizeFromRoute(this.#route)
    if (initialSize !== null) this.#size = initialSize
    const initialColor = routeColorFromRoute(this.#route)
    if (initialColor !== null) this.#color = initialColor
    this.#unsubscribe = this.#router.subscribe((route) => {
      this.#route = route
      const routeSize = routeSizeFromRoute(route)
      if (routeSize !== null) this.#size = routeSize
      const routeColor = routeColorFromRoute(route)
      if (routeColor !== null) this.#color = routeColor
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
    if (this.#routeSection() === "Icon") {
      const icon = this.#routeIcon()
      if (icon === "svg") this.#iconSvgDetail(x, y, w, h)
      else this.#iconOverview(x, y, w, h)
    } else if (this.#routeSection() === "Color") {
      const color = this.#routeColor()
      if (color === null) this.#colorOverview(x, y, w, h)
      else this.#colorDetail(x, y, w, h, color)
    } else if (this.#routeSection() === "Sizes") {
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
    Button(this, rowX, rows.demoY, buttonW, buttonH, {
      ...this.#buttonProps(),
      label: primaryLabel,
      children: variant === "text" ? primaryLabel.toUpperCase() : primaryLabel,
    })
    Button(this, rowX + buttonW + rowGap, rows.demoY, buttonW, buttonH, {
      ...this.#buttonProps(),
      label: "Disabled",
      children: variant === "text" ? "DISABLED" : "Disabled",
      disabled: true,
    })
    Button(this, rowX + (buttonW + rowGap) * 2, rows.demoY, buttonW, buttonH, {
      ...this.#buttonProps(),
      label: "Link",
      children: variant === "text" ? "LINK" : "Link",
    })

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
      'Button(host, x, y, size, size, { iconSrc: atomSvg, iconOnly: true, variant: "text", size })',
    ]

    const contentW = w - pad * 2
    const columnW = Math.min(150, Math.max(104, (contentW - 52 * 2) / 3))
    const columnGap = Math.max(28, (contentW - columnW * 3) / 2)
    const startX = x + pad
    const controlRowGap = 18
    const controlRowH = sizeButtonHeight("large")
    const demoH = controlRowH * 4 + controlRowGap * 3
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "Sizes", ["For larger or smaller buttons, use the size prop."])

    const firstRowY = rows.demoY
    const outlinedY = firstRowY + controlRowH + controlRowGap
    const containedY = outlinedY + controlRowH + controlRowGap
    const iconY = containedY + controlRowH + controlRowGap
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
      this.#docIconButton(bx + (columnW - itemH) / 2, itemY(iconY), itemH, size, this.#color, () => this.#goSize(size))
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
      `Button(host, x, y, h, h, { iconSrc: atomSvg, iconOnly: true, variant: "text", size: "${size}" })`,
    ]

    const contentW = w - pad * 2
    const buttonW = Math.min(136, Math.max(96, (contentW - sizeButtonHeight(size) - 22 * 3) / 3))
    const buttonH = sizeButtonHeight(size)
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${title} buttons`, sizeDescriptionLines(size))

    const iconW = buttonH
    const rowGap = Math.max(22, (contentW - buttonW * 3 - iconW) / 3)
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
    this.#docIconButton(rowX + buttonW * 3 + rowGap * 3, rows.demoY, iconW, size, this.#color, () => this.#setSize(size))

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #colorOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const variants: readonly ButtonRouteVariant[] = ["text", "outlined", "contained"]
    const codeLines = BUTTON_DOC_COLORS.flatMap((color) =>
      [
        ...variants.map((variant) => `Button(host, x, y, w, h, { children: "${variantLabel(variant)}", variant: "${variant}", color: "${color}" })`),
        `Button(host, x, y, h, h, { iconSrc: atomSvg, iconOnly: true, variant: "text", color: "${color}" })`,
      ],
    )
    const rowH = 38
    const rowGap = 11
    const demoH = rowH * BUTTON_DOC_COLORS.length + rowGap * (BUTTON_DOC_COLORS.length - 1)
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "Color", ["Use the color prop to apply semantic button tones."])

    const contentW = w - pad * 2
    for (const [i, color] of BUTTON_DOC_COLORS.entries()) {
      this.#colorExampleRow(x + pad, rows.demoY + i * (rowH + rowGap), contentW, rowH, color, variants)
    }

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #colorExampleRow(
    x: number,
    y: number,
    w: number,
    h: number,
    color: ButtonColor,
    variants: readonly ButtonRouteVariant[],
  ): void {
    const labelW = 82
    const gap = 12
    const iconW = h
    const buttonW = Math.min(120, Math.max(84, (w - labelW - iconW - gap * 4) / 3))
    const rowW = labelW + gap + buttonW * variants.length + iconW + gap * variants.length
    const startX = x + (w - rowW) / 2
    span(this, startX, y, labelW, h, {children: colorTitle(color), style: {fontSize: 11, color: colorTextStyle(color)}})
    for (const [i, variant] of variants.entries()) {
      Button(this, startX + labelW + gap + i * (buttonW + gap), y, buttonW, h, {
        children: variantLabel(variant),
        variant,
        color,
        radius: this.#radius,
        fontPx: 10,
        onClick: () => this.#goColor(color),
      })
    }
    this.#docIconButton(startX + labelW + gap + variants.length * (buttonW + gap), y, iconW, this.#size, color, () => this.#goColor(color))
  }

  #colorDetail(x: number, y: number, w: number, h: number, color: ButtonColor): void {
    const pad = 42
    const headerH = 108
    const title = colorTitle(color)
    const codeLines = [
      `Button(host, x, y, w, h, { children: "Text", variant: "text", color: "${color}" })`,
      `Button(host, x, y, w, h, { children: "Outlined", variant: "outlined", color: "${color}" })`,
      `Button(host, x, y, w, h, { children: "Contained", variant: "contained", color: "${color}" })`,
      `Button(host, x, y, h, h, { iconSrc: atomSvg, iconOnly: true, variant: "text", color: "${color}" })`,
    ]

    const contentW = w - pad * 2
    const buttonW = Math.min(136, Math.max(96, (contentW - this.#buttonHeight() - 22 * 3) / 3))
    const buttonH = this.#buttonHeight()
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${title} color`, colorDescriptionLines(color))

    const iconW = buttonH
    const rowGap = Math.max(22, (contentW - buttonW * 3 - iconW) / 3)
    const rowX = x + pad
    Button(this, rowX, rows.demoY, buttonW, buttonH, {
      children: "Text",
      variant: "text",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    Button(this, rowX + buttonW + rowGap, rows.demoY, buttonW, buttonH, {
      children: "Outlined",
      variant: "outlined",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    Button(this, rowX + (buttonW + rowGap) * 2, rows.demoY, buttonW, buttonH, {
      children: "Contained",
      variant: "contained",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    this.#docIconButton(rowX + buttonW * 3 + rowGap * 3, rows.demoY, iconW, this.#size, color, () => this.#setColor(color))

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #iconOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const codeLines = [
      'const atomSvg = svgDataUrl("<svg ... />")',
      'Button(host, x, y, size, size, {',
      '  label: "Atom", iconSrc: atomSvg, iconOnly: true, variant: "text", color, size })',
    ]
    const demoH = iconSvgMatrixHeight()
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "Icon button", [
      "Icon buttons use the same Button API with iconOnly and iconSrc.",
      "The default icon is shown across colors and sizes.",
    ])

    this.#iconSvgMatrix(x + pad, rows.demoY, w - pad * 2, demoH)

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #iconSvgDetail(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const codeLines = [
      'const customSvg = svgDataUrl("<svg ... />")',
      'Button(host, x, y, size, size, {',
      '  label: "Upload SVG", iconSrc: customSvg, iconOnly: true, color, size })',
    ]
    const demoH = iconSvgMatrixHeight()
    const rows = contentRows(y, h, {
      headerH: 108,
      demoH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, "SVG icon button", [
      "Custom SVG sources are passed through iconSrc.",
      "The same icon button is shown across colors and sizes.",
    ])

    this.#iconSvgMatrix(x + pad, rows.demoY, w - pad * 2, demoH)

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #iconSvgMatrix(x: number, y: number, w: number, h: number): void {
    const headerRowH = 18
    const rowH = sizeButtonHeight("large")
    const rowGap = 12
    flexColumn({
      x,
      y,
      w,
      h,
      gap: rowGap,
      justifyContent: "center",
      items: [
        {height: headerRowH, draw: (rowX, rowY, rowW, rowHeight) => this.#iconSizeHeader(rowX, rowY, rowW, rowHeight)},
        ...BUTTON_DOC_COLORS.map((color) => ({
          height: rowH,
          draw: (rowX: number, rowY: number, rowW: number, rowHeight: number) => this.#iconSvgRow(rowX, rowY, rowW, rowHeight, color),
        })),
      ],
    })
  }

  #iconSizeHeader(x: number, y: number, w: number, h: number): void {
    flexRow({
      x,
      y,
      w,
      h,
      gap: 42,
      justifyContent: "center",
      alignItems: "center",
      items: [
        {width: 96, height: h, draw: () => {}},
        ...BUTTON_SIZES.map((size) => ({
          width: sizeButtonHeight(size),
          height: h,
          draw: (itemX: number, itemY: number, itemW: number, itemH: number) => {
            const fontPx = 9
            const textW = Math.ceil(this.measureText(size, fontPx))
            span(this, itemX + (itemW - textW) / 2, itemY, textW, itemH, {children: size, style: {fontSize: fontPx, color: "muted"}})
          },
        })),
      ],
    })
  }

  #iconSvgRow(x: number, y: number, w: number, h: number, color: ButtonColor): void {
    flexRow({
      x,
      y,
      w,
      h,
      gap: 42,
      justifyContent: "center",
      alignItems: "center",
      items: [
        {
          width: 96,
          height: h,
          draw: (itemX, itemY, itemW, itemH) => {
            const label = colorTitle(color)
            const fontPx = 11
            span(this, itemX, itemY, itemW, itemH, {children: label, style: {fontSize: fontPx, color: colorTextStyle(color)}})
          },
        },
        ...BUTTON_SIZES.map((size) => ({
          width: sizeButtonHeight(size),
          height: sizeButtonHeight(size),
          draw: (itemX: number, itemY: number, itemW: number, itemH: number) => {
            Button(this, itemX, itemY, itemW, itemH, {
              label: `${colorTitle(color)} ${sizeTitle(size)} SVG`,
              iconSrc: this.#svgIconSrc(color),
              iconOnly: true,
              variant: "text",
              color,
              size,
              radius: 999,
              iconSizePx: iconSizeForButtonSize(size),
              tooltip: `${color} ${size} ${this.#customSvgName}`,
              onClick: () => this.#record(`icon:svg:${color}:${size}`),
            })
          },
        })),
      ],
    })
  }

  #docIconButton(x: number, y: number, sizePx: number, size: ButtonSize, color: ButtonColor, onClick: () => void): void {
    Button(this, x, y, sizePx, sizePx, {
      label: `${colorTitle(color)} ${sizeTitle(size)} Icon`,
      iconSrc: this.#svgIconSrc(color),
      iconOnly: true,
      variant: "text",
      color,
      size,
      radius: 999,
      iconSizePx: iconSizeForButtonSize(size),
      onClick,
    })
  }

  #dock(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 34, zIndex: LAYOUT_Z},
    })
    if (this.#routeSection() === "Icon") {
      this.#iconDock(x, y, w, h)
      return
    }
    if (this.#routeSection() === "Color") {
      this.#colorDock(x, y, w, h)
      return
    }
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

  #iconDock(x: number, y: number, w: number, h: number): void {
    const itemW = 118
    const active = this.#routeIcon() === "svg"
    Button(this, x + (w - itemW) / 2, y + (h - 42) / 2, itemW, 42, {
      children: "svg",
      variant: active ? "contained" : "outlined",
      color: "primary",
      radius: this.#radius,
      onClick: () => this.#openSvgPicker(),
    })
  }

  #colorDock(x: number, y: number, w: number, h: number): void {
    const itemGap = 10
    const itemW = Math.max(78, Math.min(112, (w - 64 - itemGap * (BUTTON_DOC_COLORS.length - 1)) / BUTTON_DOC_COLORS.length))
    const rowW = itemW * BUTTON_DOC_COLORS.length + itemGap * (BUTTON_DOC_COLORS.length - 1)
    const startX = x + (w - rowW) / 2
    const routeColor = this.#routeColor()
    for (const [i, color] of BUTTON_DOC_COLORS.entries()) {
      const active = routeColor === color
      Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
        children: color,
        variant: active ? "contained" : "outlined",
        color,
        radius: this.#radius,
        fontPx: 10,
        onClick: () => this.#goColor(color),
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
      this.#setColor(value)
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

  #routeColor(): ButtonColor | null {
    return routeColorFromRoute(this.#route)
  }

  #routeIcon(): ButtonRouteIcon | null {
    return routeIconFromRoute(this.#route)
  }

  #routeSection(): ButtonSection {
    if (this.#route.startsWith("button/icon")) return "Icon"
    if (this.#route.startsWith("button/color")) return "Color"
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
    if (section === "Color") {
      this.#router.go("button/color")
      this.#record("route:color")
      return
    }
    if (section === "Icon") {
      this.#router.go("button/icon")
      this.#record("route:icon")
      return
    }
    this.#go(null)
  }

  #goSize(size: ButtonSize): void {
    this.#size = size
    this.#router.go(`button/sizes/${size}`)
    this.#record(`route:sizes:${size}`)
  }

  #goColor(color: ButtonColor): void {
    this.#color = color
    this.#router.go(`button/color/${color}`)
    this.#record(`route:color:${color}`)
  }

  #openSvgPicker(): void {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".svg,image/svg+xml"
    input.style.display = "none"
    input.addEventListener("change", () => {
      const file = input.files?.[0]
      input.remove()
      if (file === undefined) return
      void file.text().then((source) => {
        if (!/<svg[\s>]/i.test(source)) {
          this.#record("icon:svg:invalid")
          return
        }
        this.#customSvgSource = source
        this.#customSvgName = file.name
        this.#router.go("button/icon/svg")
        this.#record(`icon:svg:${file.name}`)
      }).catch(() => {
        this.#record("icon:svg:error")
      })
    }, {once: true})
    document.body.append(input)
    input.click()
    window.setTimeout(() => {
      if (input.isConnected) input.remove()
    }, 60000)
  }

  #svgIconSrc(color: ButtonColor): string {
    if (this.#customSvgSource !== null) return customSvgIconFromSource(this.#customSvgSource, color)
    return customSvgIcon(color)
  }

  #setSize(size: ButtonSize): void {
    if (this.#routeSection() === "Sizes") {
      this.#goSize(size)
      return
    }
    this.#size = size
    this.#record(`size:${size}`)
  }

  #setColor(color: ButtonColor): void {
    if (this.#routeSection() === "Color") {
      this.#goColor(color)
      return
    }
    this.#color = color
    this.#record(`color:${color}`)
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

function routeColorFromRoute(route: ButtonRoute): ButtonColor | null {
  if (!route.startsWith("button/color/")) return null
  const color = route.slice("button/color/".length)
  if (!BUTTON_COLORS.includes(color as ButtonColor)) return null
  return color as ButtonColor
}

function routeIconFromRoute(route: ButtonRoute): ButtonRouteIcon | null {
  if (route === "button/icon/svg") return "svg"
  return null
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

function variantLabel(variant: ButtonRouteVariant): string {
  if (variant === "contained") return "Contained"
  if (variant === "outlined") return "Outlined"
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

function colorTitle(color: ButtonColor): string {
  if (color === "primary") return "Primary"
  if (color === "success") return "Success"
  if (color === "warning") return "Warning"
  if (color === "error") return "Error"
  return "Neutral"
}

function colorTextStyle(color: ButtonColor): "cyan" | "green" | "orange" | "red" | "muted" {
  if (color === "success") return "green"
  if (color === "warning") return "orange"
  if (color === "error") return "red"
  if (color === "neutral") return "muted"
  return "cyan"
}

function colorDescriptionLines(color: ButtonColor): readonly string[] {
  if (color === "success") return ["Success color is used for positive actions", "and confirmation states."]
  if (color === "warning") return ["Warning color marks risky actions", "that need extra attention."]
  if (color === "error") return ["Error color highlights destructive actions", "and failed states."]
  if (color === "neutral") return ["Neutral color keeps controls quiet", "for secondary interface actions."]
  return ["Primary color is the default action tone", "for standard button interactions."]
}

function iconSizeForButtonSize(size: ButtonSize): number {
  return Math.round(sizeButtonHeight(size) * 0.6)
}

function iconSvgMatrixHeight(): number {
  const headerRowH = 18
  const rowH = sizeButtonHeight("large")
  const rowGap = 12
  return headerRowH + rowGap + rowH * BUTTON_DOC_COLORS.length + rowGap * (BUTTON_DOC_COLORS.length - 1)
}

function customSvgIcon(color: ButtonColor): string {
  const stroke = iconStrokeColor(color)
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="3.8" fill="${stroke}"/>
      <ellipse cx="24" cy="24" rx="17" ry="6.5" fill="none" stroke="${stroke}" stroke-width="3"/>
      <ellipse cx="24" cy="24" rx="17" ry="6.5" fill="none" stroke="${stroke}" stroke-width="3" transform="rotate(60 24 24)"/>
      <ellipse cx="24" cy="24" rx="17" ry="6.5" fill="none" stroke="${stroke}" stroke-width="3" transform="rotate(120 24 24)"/>
    </svg>
  `)
}

function customSvgIconFromSource(source: string, color: ButtonColor): string {
  const stroke = iconStrokeColor(color)
  const parser = new DOMParser()
  const doc = parser.parseFromString(source, "image/svg+xml")
  const svg = doc.querySelector("svg")
  if (svg === null) return customSvgIcon(color)

  doc.querySelectorAll("script, foreignObject, style").forEach((node) => node.remove())
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  svg.setAttribute("color", stroke)
  let hasPaintDeclaration = false
  for (const node of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    const style = node.getAttribute("style")
    if (style !== null) {
      const kept: string[] = []
      for (const declaration of style.split(";")) {
        const [rawProp, ...rawValue] = declaration.split(":")
        if (rawProp === undefined) continue
        const prop = rawProp?.trim().toLowerCase()
        const value = rawValue.join(":").trim()
        if (prop === undefined || prop.length === 0 || value.length === 0) continue
        if (prop === "fill" || prop === "stroke") {
          hasPaintDeclaration = true
          node.setAttribute(prop, isNonePaint(value) ? "none" : "currentColor")
        } else kept.push(`${rawProp.trim()}: ${value}`)
      }
      if (kept.length > 0) node.setAttribute("style", kept.join("; "))
      else node.removeAttribute("style")
    }

    const fill = node.getAttribute("fill")
    if (fill !== null) {
      hasPaintDeclaration = true
      if (!isNonePaint(fill)) node.setAttribute("fill", "currentColor")
    }
    const nodeStroke = node.getAttribute("stroke")
    if (nodeStroke !== null) {
      hasPaintDeclaration = true
      if (!isNonePaint(nodeStroke)) node.setAttribute("stroke", "currentColor")
    }
  }
  if (!hasPaintDeclaration) svg.setAttribute("fill", "currentColor")
  const bounds = svgContentBounds(svg)
  if (bounds !== null) {
    const pad = Math.max(bounds.width, bounds.height) * 0.08
    svg.setAttribute("viewBox", `${roundViewBox(bounds.x - pad)} ${roundViewBox(bounds.y - pad)} ${roundViewBox(bounds.width + pad * 2)} ${roundViewBox(bounds.height + pad * 2)}`)
  }

  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style")
  style.textContent = [
    `:root { color: ${stroke}; }`,
    "[fill]:not([fill='none']) { fill: currentColor !important; }",
    "[stroke]:not([stroke='none']) { stroke: currentColor !important; }",
  ].join(" ")
  svg.prepend(style)

  return svgDataUrl(new XMLSerializer().serializeToString(svg))
}

function isNonePaint(value: string): boolean {
  return value.replace(/\s*!important\s*$/i, "").trim().toLowerCase() === "none"
}

type SvgBounds = {x: number; y: number; width: number; height: number}
type SvgPoint = {x: number; y: number}
type SvgMatrix = {a: number; b: number; c: number; d: number; e: number; f: number}

const SVG_IDENTITY: SvgMatrix = {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}

function svgContentBounds(svg: globalThis.SVGSVGElement): SvgBounds | null {
  let bounds: SvgBounds | null = null
  const rootMatrix = parseSvgTransform(svg.getAttribute("transform"))
  const rootStrokeWidth = numericAttr(svg, "stroke-width") ?? 0
  const visit = (node: globalThis.Element, parentMatrix: SvgMatrix, inheritedStrokeWidth: number): void => {
    const matrix = multiplySvgMatrices(parentMatrix, parseSvgTransform(node.getAttribute("transform")))
    const strokeWidth = numericAttr(node, "stroke-width") ?? inheritedStrokeWidth
    const nodeBounds = svgNodeBounds(node, matrix, strokeWidth)
    if (nodeBounds !== null) bounds = mergeSvgBounds(bounds, nodeBounds)
    for (const child of Array.from(node.children)) visit(child, matrix, strokeWidth)
  }
  for (const child of Array.from(svg.children)) visit(child, rootMatrix, rootStrokeWidth)
  return bounds
}

function svgNodeBounds(node: globalThis.Element, matrix: SvgMatrix, strokeWidth: number): SvgBounds | null {
  const tag = node.tagName.toLowerCase()
  const pad = transformedStrokePadding(matrix, strokeWidth)
  if (tag === "circle") {
    const cx = numericAttr(node, "cx")
    const cy = numericAttr(node, "cy")
    const r = numericAttr(node, "r")
    if (cx === null || cy === null || r === null) return null
    return ellipseBounds(cx, cy, r, r, matrix, pad)
  }
  if (tag === "ellipse") {
    const cx = numericAttr(node, "cx")
    const cy = numericAttr(node, "cy")
    const rx = numericAttr(node, "rx")
    const ry = numericAttr(node, "ry")
    if (cx === null || cy === null || rx === null || ry === null) return null
    return ellipseBounds(cx, cy, rx, ry, matrix, pad)
  }
  if (tag === "line") {
    const x1 = numericAttr(node, "x1")
    const y1 = numericAttr(node, "y1")
    const x2 = numericAttr(node, "x2")
    const y2 = numericAttr(node, "y2")
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null
    return boundsFromPoints([{x: x1, y: y1}, {x: x2, y: y2}], matrix, pad)
  }
  if (tag === "rect") {
    const x = numericAttr(node, "x") ?? 0
    const y = numericAttr(node, "y") ?? 0
    const width = numericAttr(node, "width")
    const height = numericAttr(node, "height")
    if (width === null || height === null) return null
    return boundsFromPoints([{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}], matrix, pad)
  }
  if (tag === "polygon" || tag === "polyline") return boundsFromPoints(svgPointList(node.getAttribute("points")), matrix, pad)
  if (tag === "path") return svgPathBounds(node.getAttribute("d"), matrix, pad)
  return null
}

function svgPathBounds(d: string | null, matrix: SvgMatrix, padding: number): SvgBounds | null {
  if (d === null) return null
  const tokens = d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  let i = 0
  let cmd = ""
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let lastC: SvgPoint | null = null
  let lastQ: SvgPoint | null = null
  let bounds: SvgBounds | null = null
  const hasNumber = (): boolean => i < tokens.length && !isSvgPathCommand(tokens[i]!)
  const read = (): number => Number(tokens[i++]!)
  const merge = (next: SvgBounds | null): void => {
    if (next !== null) bounds = mergeSvgBounds(bounds, next)
  }
  while (i < tokens.length) {
    if (isSvgPathCommand(tokens[i]!)) cmd = tokens[i++]!
    if (cmd.length === 0) return bounds
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toLowerCase()) {
      case "m": {
        let first = true
        while (hasNumber()) {
          const nx = rel ? x + read() : read()
          const ny = rel ? y + read() : read()
          if (first) {
            x = nx
            y = ny
            startX = x
            startY = y
            merge(boundsFromPoints([{x, y}], matrix, padding))
            first = false
          } else {
            merge(boundsFromPoints([{x, y}, {x: nx, y: ny}], matrix, padding))
            x = nx
            y = ny
          }
        }
        lastC = null
        lastQ = null
        break
      }
      case "l":
        while (hasNumber()) {
          const nx = rel ? x + read() : read()
          const ny = rel ? y + read() : read()
          merge(boundsFromPoints([{x, y}, {x: nx, y: ny}], matrix, padding))
          x = nx
          y = ny
        }
        lastC = null
        lastQ = null
        break
      case "h":
        while (hasNumber()) {
          const nx = rel ? x + read() : read()
          merge(boundsFromPoints([{x, y}, {x: nx, y}], matrix, padding))
          x = nx
        }
        lastC = null
        lastQ = null
        break
      case "v":
        while (hasNumber()) {
          const ny = rel ? y + read() : read()
          merge(boundsFromPoints([{x, y}, {x, y: ny}], matrix, padding))
          y = ny
        }
        lastC = null
        lastQ = null
        break
      case "c":
        while (hasNumber()) {
          const c1 = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          const c2 = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          const end = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          merge(boundsFromPoints([{x, y}, c1, c2, end], matrix, padding))
          x = end.x
          y = end.y
          lastC = c2
          lastQ = null
        }
        break
      case "s":
        while (hasNumber()) {
          const c1 = lastC === null ? {x, y} : {x: x * 2 - lastC.x, y: y * 2 - lastC.y}
          const c2 = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          const end = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          merge(boundsFromPoints([{x, y}, c1, c2, end], matrix, padding))
          x = end.x
          y = end.y
          lastC = c2
          lastQ = null
        }
        break
      case "q":
        while (hasNumber()) {
          const c = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          const end = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          merge(boundsFromPoints([{x, y}, c, end], matrix, padding))
          x = end.x
          y = end.y
          lastQ = c
          lastC = null
        }
        break
      case "t":
        while (hasNumber()) {
          const c: SvgPoint = lastQ === null ? {x, y} : {x: x * 2 - lastQ.x, y: y * 2 - lastQ.y}
          const end = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          merge(boundsFromPoints([{x, y}, c, end], matrix, padding))
          x = end.x
          y = end.y
          lastQ = c
          lastC = null
        }
        break
      case "a":
        while (hasNumber()) {
          const rx = read()
          const ry = read()
          const angle = read()
          const largeArc = read()
          const sweep = read()
          const end = {x: rel ? x + read() : read(), y: rel ? y + read() : read()}
          merge(svgArcBounds({x, y}, rx, ry, angle, largeArc !== 0, sweep !== 0, end, matrix, padding))
          x = end.x
          y = end.y
        }
        lastC = null
        lastQ = null
        break
      case "z":
        merge(boundsFromPoints([{x, y}, {x: startX, y: startY}], matrix, padding))
        x = startX
        y = startY
        lastC = null
        lastQ = null
        break
      default:
        return bounds
    }
  }
  return bounds
}

function svgArcBounds(start: SvgPoint, rxRaw: number, ryRaw: number, angleDeg: number, largeArc: boolean, sweep: boolean, end: SvgPoint, matrix: SvgMatrix, padding: number): SvgBounds | null {
  let rx = Math.abs(rxRaw)
  let ry = Math.abs(ryRaw)
  if (rx === 0 || ry === 0) return boundsFromPoints([start, end], matrix, padding)
  const phi = angleDeg * Math.PI / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (start.x - end.x) / 2
  const dy = (start.y - end.y) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy
  const lambda = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }
  const sign = largeArc === sweep ? -1 : 1
  const centerNumerator = Math.max(0, (rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2) / (rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2))
  const centerScale = sign * Math.sqrt(centerNumerator)
  const cxp = centerScale * rx * y1p / ry
  const cyp = centerScale * -ry * x1p / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2
  const theta1 = svgVectorAngle({x: 1, y: 0}, {x: (x1p - cxp) / rx, y: (y1p - cyp) / ry})
  let delta = svgVectorAngle({x: (x1p - cxp) / rx, y: (y1p - cyp) / ry}, {x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry})
  if (!sweep && delta > 0) delta -= Math.PI * 2
  if (sweep && delta < 0) delta += Math.PI * 2
  const angles = [theta1, theta1 + delta]
  for (const candidate of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    if (svgAngleInSweep(candidate, theta1, delta)) angles.push(candidate)
  }
  return boundsFromPoints(angles.map((theta) => ({
    x: cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
    y: cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
  })), matrix, padding)
}

function svgVectorAngle(a: SvgPoint, b: SvgPoint): number {
  const sign = a.x * b.y - a.y * b.x < 0 ? -1 : 1
  const dot = a.x * b.x + a.y * b.y
  const len = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  return sign * Math.acos(Math.max(-1, Math.min(1, dot / len)))
}

function svgAngleInSweep(angle: number, start: number, delta: number): boolean {
  let adjusted = angle
  if (delta >= 0) {
    while (adjusted < start) adjusted += Math.PI * 2
    return adjusted <= start + delta + 1e-9
  }
  while (adjusted > start) adjusted -= Math.PI * 2
  return adjusted >= start + delta - 1e-9
}

function svgPointList(points: string | null): SvgPoint[] {
  const values = points?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
  const parsed: SvgPoint[] = []
  for (let i = 0; i + 1 < values.length; i += 2) parsed.push({x: values[i]!, y: values[i + 1]!})
  return parsed
}

function ellipseBounds(cx: number, cy: number, rx: number, ry: number, matrix: SvgMatrix, padding: number): SvgBounds | null {
  const points: SvgPoint[] = []
  for (let i = 0; i < 32; i += 1) {
    const angle = i / 32 * Math.PI * 2
    points.push({x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry})
  }
  return boundsFromPoints(points, matrix, padding)
}

function boundsFromPoints(points: readonly SvgPoint[], matrix: SvgMatrix, padding: number): SvgBounds | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    const transformed = transformSvgPoint(point, matrix)
    minX = Math.min(minX, transformed.x)
    minY = Math.min(minY, transformed.y)
    maxX = Math.max(maxX, transformed.x)
    maxY = Math.max(maxY, transformed.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
  return {x: minX - padding, y: minY - padding, width: Math.max(0, maxX - minX + padding * 2), height: Math.max(0, maxY - minY + padding * 2)}
}

function mergeSvgBounds(a: SvgBounds | null, b: SvgBounds): SvgBounds {
  if (a === null) return b
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return {x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY)}
}

function numericAttr(node: globalThis.Element, attr: string): number | null {
  const value = node.getAttribute(attr)
  if (value === null) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSvgTransform(value: string | null): SvgMatrix {
  if (value === null) return SVG_IDENTITY
  let matrix = SVG_IDENTITY
  for (const match of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const name = match[1]?.toLowerCase()
    const nums = svgTransformNumbers(match[2] ?? "")
    let next = SVG_IDENTITY
    if (name === "matrix" && nums.length >= 6) next = {a: nums[0]!, b: nums[1]!, c: nums[2]!, d: nums[3]!, e: nums[4]!, f: nums[5]!}
    else if (name === "translate") next = {a: 1, b: 0, c: 0, d: 1, e: nums[0] ?? 0, f: nums[1] ?? 0}
    else if (name === "scale") next = {a: nums[0] ?? 1, b: 0, c: 0, d: nums[1] ?? nums[0] ?? 1, e: 0, f: 0}
    else if (name === "rotate") {
      const angle = (nums[0] ?? 0) * Math.PI / 180
      const rotate = {a: Math.cos(angle), b: Math.sin(angle), c: -Math.sin(angle), d: Math.cos(angle), e: 0, f: 0}
      next = nums.length >= 3
        ? multiplySvgMatrices(multiplySvgMatrices({a: 1, b: 0, c: 0, d: 1, e: nums[1]!, f: nums[2]!}, rotate), {a: 1, b: 0, c: 0, d: 1, e: -nums[1]!, f: -nums[2]!})
        : rotate
    } else if (name === "skewx") {
      next = {a: 1, b: 0, c: Math.tan((nums[0] ?? 0) * Math.PI / 180), d: 1, e: 0, f: 0}
    } else if (name === "skewy") {
      next = {a: 1, b: Math.tan((nums[0] ?? 0) * Math.PI / 180), c: 0, d: 1, e: 0, f: 0}
    }
    matrix = multiplySvgMatrices(matrix, next)
  }
  return matrix
}

function svgTransformNumbers(value: string): number[] {
  return value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? []
}

function multiplySvgMatrices(a: SvgMatrix, b: SvgMatrix): SvgMatrix {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  }
}

function transformSvgPoint(point: SvgPoint, matrix: SvgMatrix): SvgPoint {
  return {x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f}
}

function transformedStrokePadding(matrix: SvgMatrix, strokeWidth: number): number {
  return strokeWidth / 2 * Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d), 1)
}

function isSvgPathCommand(token: string): boolean {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token)
}

function roundViewBox(value: number): number {
  return Math.round(value * 100) / 100
}

function iconStrokeColor(color: ButtonColor): string {
  if (color === "success") return "rgba(82,196,123,1)"
  if (color === "warning") return "rgba(255,190,111,1)"
  if (color === "error") return "rgba(255,127,111,1)"
  if (color === "neutral") return "rgba(139,150,166,1)"
  return "rgba(111,211,255,1)"
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`
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
