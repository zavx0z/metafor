import {UiSurface, UiRuntime, flexColumn, flexRow, h2, h3, p, palette, span, type CssColor, type UiSurfaceRect, uiIcons} from "@metafor/elements"
import {
  autoButtonWidth,
  Button,
  type ButtonColor,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  EditorPane,
  listLanguageHighlighters,
  Pane,
} from "@metafor/components"
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
type ButtonRouteIconLabel = "left" | "right"
type IconLabelPlacement = ButtonRouteIconLabel | "mixed"
type PaneVariant = "glass" | "outlined" | "filled"
type PaneRoute = "pane/variants" | `pane/variants/${PaneVariant}`
type EditorLanguageRoute = "typescript" | "javascript" | "html" | "css" | "plaintext"
type EditorSelectionRoute = "menu" | "copied"
type EditorSection = "Highlighting" | "Selection"
type EditorRoute = "editor/highlighting" | `editor/highlighting/${EditorLanguageRoute}` | "editor/selection" | `editor/selection/${EditorSelectionRoute}`
type ComponentsRoute = ButtonRoute | PaneRoute | EditorRoute
type ComponentName = "Button" | "Pane" | "Editor"
type ButtonRoute =
  | "button/basic"
  | `button/basic/${ButtonRouteVariant}`
  | "button/icon-label"
  | `button/icon-label/${ButtonRouteIconLabel}`
  | "button/sizes"
  | `button/sizes/${ButtonSize}`
  | "button/color"
  | `button/color/${ButtonColor}`
  | "button/icon"
  | `button/icon/${ButtonRouteIcon}`
type ButtonSection = "Basic" | "Icon" | "Icon+Label" | "Sizes" | "Color"
type PaneSection = "Variants"

const BASIC_BUTTON_TYPES: readonly BasicButtonType[] = ["Text button", "Contained button", "Outlined button"]
const BUTTON_SECTIONS: readonly ButtonSection[] = ["Basic", "Icon", "Icon+Label", "Sizes", "Color"]
const BUTTON_COLORS: readonly ButtonColor[] = ["primary", "success", "warning", "error", "neutral"]
const BUTTON_DOC_COLORS: readonly ButtonColor[] = ["primary", "success", "warning", "error"]
const BUTTON_SIZES: readonly ButtonSize[] = ["small", "medium", "large"]
const BUTTON_ROUTES: readonly ButtonRoute[] = [
  "button/basic",
  "button/basic/text",
  "button/basic/contained",
  "button/basic/outlined",
  "button/icon-label",
  "button/icon-label/left",
  "button/icon-label/right",
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
const PANE_ROUTES: readonly PaneRoute[] = [
  "pane/variants",
  "pane/variants/glass",
  "pane/variants/outlined",
  "pane/variants/filled",
]
const EDITOR_LANGUAGE_ROUTES: readonly EditorLanguageRoute[] = ["typescript", "javascript", "html", "css", "plaintext"]
const EDITOR_SELECTION_ROUTES: readonly EditorSelectionRoute[] = ["menu", "copied"]
const EDITOR_ROUTES: readonly EditorRoute[] = [
  "editor/highlighting",
  ...EDITOR_LANGUAGE_ROUTES.map((language) => `editor/highlighting/${language}` as const),
  "editor/selection",
  ...EDITOR_SELECTION_ROUTES.map((route) => `editor/selection/${route}` as const),
]
const EDITOR_LANGUAGE_LABELS: Record<EditorLanguageRoute, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  html: "HTML",
  css: "CSS",
  plaintext: "Plaintext",
}
const EDITOR_SECTIONS: readonly EditorSection[] = ["Highlighting", "Selection"]
const PANE_VARIANTS: readonly PaneVariant[] = ["glass", "outlined", "filled"]
const COMPONENT_ROUTES: readonly ComponentsRoute[] = [...BUTTON_ROUTES, ...PANE_ROUTES, ...EDITOR_ROUTES]
const BUTTON_LABELS: readonly ButtonLabel[] = ["Button", "Apply", "Run", "Delete"]
const BUTTON_ICONS: readonly ButtonIcon[] = ["none", "apply", "run", "delete"]
const ICON_PLACEMENTS: readonly IconPlacement[] = ["start", "end", "only"]
const BUTTON_STATES: readonly ButtonState[] = ["enabled", "disabled"]
const BUTTON_WIDTHS: readonly ButtonWidth[] = ["compact", "regular", "wide"]
const BUTTON_HEIGHTS: readonly ButtonHeight[] = ["compact", "regular", "large"]
const COMPONENT_NAV = ["Button", "Pane", "Editor", "Badge", "TextField", "Divider", "Scrollbar", "Scroll List", "Noti Stack"] as const
const BUTTON_RADII = [14, 24, 34, 999] as const
const ICON_SIZES = [16, 20, 24] as const
const LAYOUT_Z = -0.12
const BACKDROP_Z = -0.18
type ComponentsScreenOpts = {
  onRouteChange?: (route: ComponentsRoute) => void
  onEditorCopy?: () => Promise<boolean>
  onEditorCut?: () => Promise<boolean>
  onEditorSelectAll?: () => void
}

class ButtonComponentsScreen extends UiSurface {
  readonly #router = new VirtualRouter<ComponentsRoute>(COMPONENT_ROUTES, "button/basic", {mode: "path"})
  readonly #unsubscribe: () => void
  readonly #onRouteChange: ((route: ComponentsRoute) => void) | undefined
  readonly #onEditorCopy: (() => Promise<boolean>) | undefined
  readonly #onEditorCut: (() => Promise<boolean>) | undefined
  readonly #onEditorSelectAll: (() => void) | undefined
  #route: ComponentsRoute = this.#router.current
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
  #selectionMenuOpen = false
  #selectionBufferState: "idle" | "copied" | "error" = "idle"

  constructor(opts: ComponentsScreenOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.#onRouteChange = opts.onRouteChange
    this.#onEditorCopy = opts.onEditorCopy
    this.#onEditorCut = opts.onEditorCut
    this.#onEditorSelectAll = opts.onEditorSelectAll
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
      if (route.startsWith("editor/selection")) {
        this.#selectionMenuOpen = route === "editor/selection/menu"
        this.#selectionBufferState = route === "editor/selection/copied" ? "copied" : "idle"
      } else {
        this.#selectionMenuOpen = false
        this.#selectionBufferState = "idle"
      }
      this.#onRouteChange?.(route)
      this.requestRender()
    })
  }

  get currentRoute(): ComponentsRoute {
    return this.#route
  }

  override dispose(): void {
    this.#unsubscribe()
    this.#router.dispose()
    super.dispose()
  }

  protected render(): void {
    this.#backdrop()

    const {
      stageX, stageY, stageH,
      catalogW, sectionW, paramsW,
      dockH, previewW, previewH,
      sectionX, previewX, paramsX, gap,
    } = componentsPlaygroundLayout(this.rectW, this.rectH)

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
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(12, 18, 30, 0.78)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 36,
        zIndex: LAYOUT_Z,
      },
    })

    const pad = 22
    h3(this, x, y + 28, w, 24, {children: "Components", style: {fontSize: 15, textAlign: "center"}})
    const top = y + 76
    const gap = 9
    const rowH = 38
    for (const [i, label] of COMPONENT_NAV.entries()) {
      const active = label === this.#currentComponent()
      const enabled = label === "Button" || label === "Pane" || label === "Editor"
      Button(this, x + pad, top + i * (rowH + gap), w - pad * 2, rowH, {
        children: label,
        variant: active ? "contained" : "glass",
        color: "neutral",
        ...activeNavStyle(active),
        disabled: !enabled,
        radius: 999,
        fontPx: 11,
        onClick: () => {
          if (label === "Button") this.#router.go("button/basic")
          else if (label === "Pane") this.#router.go("pane/variants")
          else if (label === "Editor") this.#router.go("editor/highlighting")
          this.#record(`component:${label.toLowerCase()}`)
        },
      })
    }
  }

  #sectionPanel(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(12, 18, 30, 0.78)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 36,
        zIndex: LAYOUT_Z,
      },
    })

    const pad = 18
    if (this.#currentComponent() === "Pane") {
      h3(this, x, y + 28, w, 24, {children: "Pane", style: {fontSize: 15, textAlign: "center"}})
      const active = this.#paneSection() === "Variants"
      Button(this, x + pad, y + 76, w - pad * 2, 38, {
        children: "Variants",
        variant: active ? "contained" : "glass",
        color: "neutral",
        ...activeNavStyle(active),
        radius: 999,
        fontPx: 11,
        onClick: () => this.#goPaneSection("Variants"),
      })
      return
    }
    if (this.#currentComponent() === "Editor") {
      h3(this, x, y + 28, w, 24, {children: "Editor", style: {fontSize: 15, textAlign: "center"}})
      const top = y + 76
      for (const [i, section] of EDITOR_SECTIONS.entries()) {
        const active = this.#editorSection() === section
        Button(this, x + pad, top + i * 47, w - pad * 2, 38, {
          children: section,
          variant: active ? "contained" : "glass",
          color: "neutral",
          ...activeNavStyle(active),
          radius: 999,
          fontPx: 11,
          onClick: () => this.#goEditorSection(section),
        })
      }
      return
    }
    h3(this, x, y + 28, w, 24, {children: "Button", style: {fontSize: 15, textAlign: "center"}})
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
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {
        background: "rgba(8, 13, 22, 0.72)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 38,
        zIndex: LAYOUT_Z,
      },
    })

    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#currentComponent() === "Editor") {
      this.#editorPreview(x, y, w, h)
    } else if (this.#currentComponent() === "Pane") {
      const variant = this.#routePaneVariant()
      if (variant === null) this.#paneOverview(x, y, w, h)
      else this.#paneDetail(x, y, w, h, variant)
    } else if (this.#routeSection() === "Icon") {
      const icon = this.#routeIcon()
      if (icon === "svg") this.#iconSvgDetail(x, y, w, h)
      else this.#iconOverview(x, y, w, h)
    } else if (this.#routeSection() === "Icon+Label") {
      this.#iconLabelOverview(x, y, w, h)
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

  #editorPreview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    if (this.#editorSection() === "Selection") {
      renderHeader(this, x, w, pad, y + 34, "Selection", [
        "Selection actions are exposed from the dock while the editor surface stays focusable.",
        "The menu button opens a compact selection command panel above the source area.",
      ])
    } else {
      renderHeader(this, x, w, pad, y + 34, "Editor pane", [
        "Editable source surface with syntax tokens, cursor routing, undo history, and scroll state.",
        "The live editor below is a separate focusable surface mounted inside this route.",
      ])
    }

    const rect = editorPaneRectForPreview(x, y, w, h)
    Pane(this, rect.x - 14, rect.y - 14, rect.w + 28, rect.h + 28, {
      variant: "outlined",
      sx: {
        background: "rgba(4, 8, 14, 0.24)",
        borderColor: "rgba(111, 211, 255, 0.22)",
        borderRadius: 26,
      },
    })
    if (this.#editorSection() === "Selection" && this.#selectionMenuOpen) {
      this.#selectionMenu(x + pad, y + 92, w - pad * 2, 38)
    }
  }

  #paneOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const cardW = Math.min(208, Math.max(156, (w - pad * 2 - 32) / 3))
    const cardH = Math.min(208, Math.max(156, h * 0.38))
    const gap = Math.max(16, (w - pad * 2 - cardW * 3) / 2)
    const cardsY = y + 168
    const baseX = x + pad

    renderOverviewLayout(this, x, y, w, h, pad, "Pane variants", [""], (_slotX, _slotY, _slotW, slotH) => {
      const centeredY = cardsY + Math.max(0, (slotH - cardH) / 2 - 34)
      const variants: readonly {variant: PaneVariant; label: string}[] = [
      {variant: "glass", label: "glass"},
      {variant: "outlined", label: "outlined"},
      {variant: "filled", label: "filled"},
      ]
      for (const [i, item] of variants.entries()) {
        const cardX = baseX + i * (cardW + gap)
        Pane(this, cardX, centeredY, cardW, cardH, {
          variant: item.variant,
          sx: {
            ...paneVariantSurfaceStyle(item.variant),
            borderRadius: 28,
            padding: 22,
          },
        })
        h3(this, cardX + 20, centeredY + cardH / 2 - 28, cardW - 40, 26, {
          children: item.label,
          style: {fontSize: 18, textAlign: "center"},
        })
        h3(this, cardX + 20, centeredY + cardH / 2 + 10, cardW - 40, 26, {
          children: "variant",
          style: {fontSize: 18, textAlign: "center"},
        })
      }
    })
  }

  #paneDetail(x: number, y: number, w: number, h: number, variant: PaneVariant): void {
    const pad = 42
    const headerH = 108
    const codeLines = [
      `Pane(host, x, y, 240, 188, { variant: "${variant}" })`,
    ] as const
    const rows = contentRows(y, h, {
      headerH,
      demoH: 208,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${paneVariantTitle(variant)} pane`, paneVariantDescriptionLines(variant))

    const paneW = Math.min(260, w - pad * 2)
    const paneH = 188
    const paneX = x + (w - paneW) / 2
    const paneY = rows.demoY + (208 - paneH) / 2
    Pane(this, paneX, paneY, paneW, paneH, {
      variant,
      sx: {
        ...paneVariantSurfaceStyle(variant),
        borderRadius: 30,
        padding: 24,
      },
    })
    h3(this, paneX + 24, paneY + 28, paneW - 48, 24, {
      children: `${paneVariantTitle(variant).toLowerCase()} variant`,
      style: {fontSize: 18, textAlign: "center"},
    })

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #basicOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const textW = Math.max(90, autoButtonWidth(this, "Text", 12, 24))
    const containedW = Math.max(112, autoButtonWidth(this, "Contained", 12, 24))
    const outlinedW = Math.max(108, autoButtonWidth(this, "Outlined", 12, 24))
    const gap = 16
    const rowW = textW + containedW + outlinedW + gap * 2
    renderOverviewLayout(this, x, y, w, h, pad, "Basic button", [
      "The Button comes with three variants: text, contained, and outlined.",
    ], (_slotX, slotY, slotW, slotH) => {
      const startX = x + (w - rowW) / 2
      const buttonY = slotY + (slotH - 46) / 2
      Button(this, startX, buttonY, textW, 46, {children: "Text", variant: "text", color: this.#color, radius: this.#radius, onClick: () => this.#go("text")})
      Button(this, startX + textW + gap, buttonY, containedW, 46, {
        children: "Contained",
        variant: "contained",
        color: this.#color,
        radius: this.#radius,
        onClick: () => this.#go("contained"),
      })
      Button(this, startX + textW + gap + containedW + gap, buttonY, outlinedW, 46, {
        children: "Outlined",
        variant: "outlined",
        color: this.#color,
        radius: this.#radius,
        onClick: () => this.#go("outlined"),
      })
    })
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
    const contentW = w - pad * 2
    const columnW = Math.min(150, Math.max(104, (contentW - 52 * 2) / 3))
    const columnGap = Math.max(28, (contentW - columnW * 3) / 2)
    const startX = x + pad
    const controlRowGap = 18
    const controlRowH = sizeButtonHeight("large")
    renderOverviewLayout(this, x, y, w, h, pad, "Sizes", [
      "For larger or smaller buttons, use the size prop.",
    ], (_slotX, slotY, _slotW, slotH) => {
      const contentH = controlRowH * 5 + controlRowGap * 4
      const baseY = slotY + Math.max(0, (slotH - contentH) / 2)
      const iconY = baseY
      const firstRowY = iconY + controlRowH + controlRowGap
      const outlinedY = firstRowY + controlRowH + controlRowGap
      const containedY = outlinedY + controlRowH + controlRowGap
      const iconLabelY = containedY + controlRowH + controlRowGap
      for (const [i, size] of sizes.entries()) {
        const label = sizeLabel(size)
        const bx = startX + i * (columnW + columnGap)
        const itemH = sizeButtonHeight(size)
        const itemY = (rowY: number) => rowY + (controlRowH - itemH) / 2
        const textW = Math.min(columnW, docButtonWidth(this, label, size))
        const outlinedW = Math.min(columnW, docButtonWidth(this, label, size))
        const containedW = Math.min(columnW, docButtonWidth(this, label, size))
        this.#docIconButton(bx + (columnW - itemH) / 2, itemY(iconY), itemH, size, this.#color, () => this.#goSize(size))
        Button(this, bx + (columnW - textW) / 2, itemY(firstRowY), textW, itemH, {
          children: label,
          label,
          variant: "text",
          color: this.#color,
          size,
          radius: 18,
          fontPx: sizeFont(size),
          onClick: () => this.#goSize(size),
        })
        Button(this, bx + (columnW - outlinedW) / 2, itemY(outlinedY), outlinedW, itemH, {
          children: label,
          variant: "outlined",
          color: this.#color,
          size,
          radius: Math.min(this.#radius, 18),
          onClick: () => this.#goSize(size),
        })
        Button(this, bx + (columnW - containedW) / 2, itemY(containedY), containedW, itemH, {
          children: label,
          variant: "contained",
          color: this.#color,
          size,
          radius: Math.min(this.#radius, 18),
          onClick: () => this.#goSize(size),
        })
        const iconLabelW = Math.min(columnW, Math.max(96, autoButtonWidth(this, "Send", 12, 24, svgIconTint(uiIcons.run, iconStrokeColor(this.#color)))))
        this.#docIconLabelButton(bx + (columnW - iconLabelW) / 2, itemY(iconLabelY), iconLabelW, itemH, size, this.#color, () => this.#goSize(size))
      }
    })
  }

  #sizeDetail(x: number, y: number, w: number, h: number, size: ButtonSize): void {
    const pad = 42
    const headerH = 108
    const title = sizeTitle(size)
    const codeLines = [
      `Button(host, x, y, w, h, { children: "Text", variant: "text", size: "${size}" })`,
      `Button(host, x, y, h, h, { iconSrc: atomSvg, iconOnly: true, variant: "text", size: "${size}" })`,
      `Button(host, x, y, w, h, { children: "Outlined", variant: "outlined", size: "${size}" })`,
      `Button(host, x, y, w, h, { children: "Contained", variant: "contained", size: "${size}" })`,
      `Button(host, x, y, w, h, { children: "Send", variant: "contained", endIcon: uiIcons.run, size: "${size}" })`,
    ]

    const contentW = w - pad * 2
    const iconLabelW = Math.max(112, autoButtonWidth(this, "Send", 12, 24, svgIconTint(uiIcons.run, iconStrokeColor(this.#color))))
    const textW = docButtonWidth(this, "Text", size)
    const outlinedW = docButtonWidth(this, "Outlined", size)
    const containedW = docButtonWidth(this, "Contained", size)
    const buttonH = sizeButtonHeight(size)
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${title} buttons`, sizeDescriptionLines(size))

    const iconW = buttonH
    const rowGap = Math.max(12, (contentW - textW - iconW - outlinedW - containedW - iconLabelW) / 4)
    const rowW = textW + iconW + outlinedW + containedW + iconLabelW + rowGap * 4
    const rowX = x + pad + Math.max(0, (contentW - rowW) / 2)
    Button(this, rowX, rows.demoY, textW, buttonH, {
      children: "Text",
      variant: "text",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })
    this.#docIconButton(rowX + textW + rowGap, rows.demoY, iconW, size, this.#color, () => this.#setSize(size))
    Button(this, rowX + textW + rowGap + iconW + rowGap, rows.demoY, outlinedW, buttonH, {
      children: "Outlined",
      variant: "outlined",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })
    Button(this, rowX + textW + rowGap + iconW + rowGap + outlinedW + rowGap, rows.demoY, containedW, buttonH, {
      children: "Contained",
      variant: "contained",
      color: this.#color,
      size,
      radius: this.#radius,
      onClick: () => this.#setSize(size),
    })
    this.#docIconLabelButton(rowX + textW + rowGap + iconW + rowGap + outlinedW + rowGap + containedW + rowGap, rows.demoY, iconLabelW, buttonH, size, this.#color, () => this.#setSize(size))

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #colorOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const variants: readonly ButtonRouteVariant[] = ["text", "outlined", "contained"]
    const rowH = 38
    const rowGap = 11
    const contentW = w - pad * 2
    renderOverviewLayout(this, x, y, w, h, pad, "Color", [
      "Use the color prop to apply semantic button tones.",
    ], (_slotX, slotY, _slotW, slotH) => {
      const contentH = rowH * BUTTON_DOC_COLORS.length + rowGap * (BUTTON_DOC_COLORS.length - 1)
      const baseY = slotY + Math.max(0, (slotH - contentH) / 2)
      for (const [i, color] of BUTTON_DOC_COLORS.entries()) {
        this.#colorExampleRow(x + pad, baseY + i * (rowH + rowGap), contentW, rowH, color, variants)
      }
    })
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
    const iconLabelW = Math.max(112, autoButtonWidth(this, "Send", 12, 24, svgIconTint(uiIcons.run, iconStrokeColor(color))))
    const textW = docButtonWidth(this, "Text", this.#size)
    const outlinedW = docButtonWidth(this, "Outlined", this.#size)
    const containedW = docButtonWidth(this, "Contained", this.#size)
    const rowW = labelW + gap + textW + gap + iconW + gap + outlinedW + gap + containedW + gap + iconLabelW
    const startX = x + (w - rowW) / 2
    span(this, startX, y, labelW, h, {children: colorTitle(color), style: {fontSize: 11, color: colorTextStyle(color)}})
    Button(this, startX + labelW + gap, y, textW, h, {
      children: variantLabel("text"),
      variant: "text",
      color,
      radius: this.#radius,
      fontPx: 10,
      onClick: () => this.#goColor(color),
    })
    this.#docIconButton(startX + labelW + gap + textW + gap, y, iconW, this.#size, color, () => this.#goColor(color))
    Button(this, startX + labelW + gap + textW + gap + iconW + gap, y, outlinedW, h, {
      children: variantLabel("outlined"),
      variant: "outlined",
      color,
      radius: this.#radius,
      fontPx: 10,
      onClick: () => this.#goColor(color),
    })
    Button(this, startX + labelW + gap + textW + gap + iconW + gap + outlinedW + gap, y, containedW, h, {
      children: variantLabel("contained"),
      variant: "contained",
      color,
      radius: this.#radius,
      fontPx: 10,
      onClick: () => this.#goColor(color),
    })
    this.#docIconLabelButton(startX + labelW + gap + textW + gap + iconW + gap + outlinedW + gap + containedW + gap, y, iconLabelW, h, this.#size, color, () => this.#goColor(color))
  }

  #colorDetail(x: number, y: number, w: number, h: number, color: ButtonColor): void {
    const pad = 42
    const headerH = 108
    const title = colorTitle(color)
    const codeLines = [
      `Button(host, x, y, w, h, { children: "Text", variant: "text", color: "${color}" })`,
      `Button(host, x, y, h, h, { iconSrc: atomSvg, iconOnly: true, variant: "text", color: "${color}" })`,
      `Button(host, x, y, w, h, { children: "Outlined", variant: "outlined", color: "${color}" })`,
      `Button(host, x, y, w, h, { children: "Contained", variant: "contained", color: "${color}" })`,
      `Button(host, x, y, w, h, { children: "Send", variant: "contained", endIcon: uiIcons.run, color: "${color}" })`,
    ]

    const contentW = w - pad * 2
    const iconLabelW = Math.max(112, autoButtonWidth(this, "Send", 12, 24, svgIconTint(uiIcons.run, iconStrokeColor(color))))
    const textW = docButtonWidth(this, "Text", this.#size)
    const outlinedW = docButtonWidth(this, "Outlined", this.#size)
    const containedW = docButtonWidth(this, "Contained", this.#size)
    const buttonH = this.#buttonHeight()
    const rows = contentRows(y, h, {
      headerH,
      demoH: buttonH,
      codeH: codeBlockHeight(codeLines),
    })
    renderHeader(this, x, w, pad, rows.headerY, `${title} color`, colorDescriptionLines(color))

    const iconW = buttonH
    const rowGap = Math.max(12, (contentW - textW - iconW - outlinedW - containedW - iconLabelW) / 4)
    const rowW = textW + iconW + outlinedW + containedW + iconLabelW + rowGap * 4
    const rowX = x + pad + Math.max(0, (contentW - rowW) / 2)
    Button(this, rowX, rows.demoY, textW, buttonH, {
      children: "Text",
      variant: "text",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    this.#docIconButton(rowX + textW + rowGap, rows.demoY, iconW, this.#size, color, () => this.#setColor(color))
    Button(this, rowX + textW + rowGap + iconW + rowGap, rows.demoY, outlinedW, buttonH, {
      children: "Outlined",
      variant: "outlined",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    Button(this, rowX + textW + rowGap + iconW + rowGap + outlinedW + rowGap, rows.demoY, containedW, buttonH, {
      children: "Contained",
      variant: "contained",
      color,
      size: this.#size,
      radius: this.#radius,
      onClick: () => this.#setColor(color),
    })
    this.#docIconLabelButton(rowX + textW + rowGap + iconW + rowGap + outlinedW + rowGap + containedW + rowGap, rows.demoY, iconLabelW, buttonH, this.#size, color, () => this.#setColor(color))

    const codeW = Math.min(520, w - pad * 2)
    const codeX = x + (w - codeW) / 2
    codeBlock(this, codeX, rows.codeY, codeW, codeLines)
  }

  #iconOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const demoH = iconSvgMatrixHeight()
    renderOverviewLayout(this, x, y, w, h, pad, "Icon button", [
      "Icon buttons use the same Button API with iconOnly and iconSrc.",
      "The default icon is shown across colors and sizes.",
    ], (_slotX, slotY, _slotW, slotH) => {
      this.#iconSvgMatrix(x + pad, slotY + Math.max(0, (slotH - demoH) / 2), w - pad * 2, demoH)
    })
  }

  #iconLabelOverview(x: number, y: number, w: number, h: number): void {
    const pad = 42
    const placement = this.#routeIconLabelPlacement()
    const addIconProp = placement === "right" ? "endIcon" : "startIcon"
    const sendIconProp = placement === "left" ? "startIcon" : "endIcon"
    const deleteIconProp = placement === "right" ? "endIcon" : "startIcon"
    renderOverviewLayout(this, x, y, w, h, pad, "Icon+Label button", [
      "Use icons next to button labels when the action benefits from faster recognition.",
      "The same Button API supports both leading and trailing icons.",
    ], (_slotX, slotY, _slotW, slotH) => {
      const buttonY = slotY + (slotH - 38) / 2

      const gap = 22
      const buttonH = 38
      const textIcon = svgIconTint(uiIcons.apply, iconStrokeColor("primary"))
      const outlinedIcon = svgIconTint(uiIcons.clear, iconStrokeColor("primary"))
      const containedIcon = svgIconTint(uiIcons.run, iconStrokeColor("primary"))
      const textW = Math.max(104, autoButtonWidth(this, "Add", 12, 24, textIcon))
      const leftW = Math.max(120, autoButtonWidth(this, "Delete", 12, 24, outlinedIcon))
      const rightW = Math.max(120, autoButtonWidth(this, "Send", 12, 24, containedIcon))
      const rowW = textW + leftW + rightW + gap * 2
      const startX = x + (w - rowW) / 2
      const addProps: ButtonProps = {
        children: "Add",
        label: "Add",
        variant: "text",
        color: "primary",
        size: "medium",
        iconSizePx: 18,
        onClick: () => this.#record("icon-label:add"),
      }
      const sendProps: ButtonProps = {
        children: "Send",
        label: "Send",
        variant: "contained",
        color: "primary",
        size: "medium",
        iconSizePx: 18,
        onClick: () => this.#record("icon-label:send"),
      }
      const deleteProps: ButtonProps = {
        children: "Delete",
        label: "Delete",
        variant: "outlined",
        color: "primary",
        size: "medium",
        iconSizePx: 18,
        onClick: () => this.#record("icon-label:delete"),
      }
      if (placement === "right") {
        addProps.endIcon = textIcon
        sendProps.endIcon = containedIcon
        deleteProps.endIcon = outlinedIcon
      } else if (placement === "left") {
        addProps.startIcon = textIcon
        sendProps.startIcon = containedIcon
        deleteProps.startIcon = outlinedIcon
      } else {
        addProps.startIcon = textIcon
        sendProps.endIcon = containedIcon
        deleteProps.startIcon = outlinedIcon
      }
      Button(this, startX, buttonY, textW, buttonH, addProps)
      Button(this, startX + textW + gap, buttonY, rightW, buttonH, sendProps)
      Button(this, startX + textW + gap + rightW + gap, buttonY, leftW, buttonH, deleteProps)
    })
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

  #docIconLabelButton(x: number, y: number, width: number, height: number, size: ButtonSize, color: ButtonColor, onClick: () => void): void {
    Button(this, x, y, width, height, {
      children: "Send",
      endIcon: svgIconTint(uiIcons.run, iconStrokeColor(color)),
      variant: "contained",
      color,
      size,
      radius: this.#radius,
      iconSizePx: Math.max(16, Math.round(height * 0.44)),
      onClick,
    })
  }

  #dock(x: number, y: number, w: number, h: number): void {
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 34, zIndex: LAYOUT_Z},
    })
    if (this.#currentComponent() === "Editor") {
      if (this.#editorSection() === "Selection") {
        this.#editorSelectionDock(x, y, w, h)
        return
      }
      const itemGap = 12
      const itemW = Math.max(84, Math.min(124, (w - 64 - itemGap * (EDITOR_LANGUAGE_ROUTES.length - 1)) / EDITOR_LANGUAGE_ROUTES.length))
      const rowW = itemW * EDITOR_LANGUAGE_ROUTES.length + itemGap * (EDITOR_LANGUAGE_ROUTES.length - 1)
      const startX = x + (w - rowW) / 2
      const activeLanguage = routeEditorLanguageFromRoute(this.#route)
      for (const [i, language] of EDITOR_LANGUAGE_ROUTES.entries()) {
        const active = activeLanguage === language
        Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
          children: EDITOR_LANGUAGE_LABELS[language],
          variant: active ? "contained" : "glass",
          color: "neutral",
          ...activeNavStyle(active),
          radius: this.#radius,
          fontPx: 10,
          onClick: () => this.#goEditorLanguage(language),
        })
      }
      return
    }
    if (this.#currentComponent() === "Pane") {
      const itemGap = 12
      const itemW = Math.max(94, Math.min(148, (w - 64 - itemGap * (PANE_VARIANTS.length - 1)) / PANE_VARIANTS.length))
      const rowW = itemW * PANE_VARIANTS.length + itemGap * (PANE_VARIANTS.length - 1)
      const startX = x + (w - rowW) / 2
      const routeVariant = this.#routePaneVariant()
      for (const [i, variant] of PANE_VARIANTS.entries()) {
        const active = routeVariant === variant
        Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
          children: paneVariantDockLabel(variant),
          variant: active ? "contained" : "glass",
          color: "neutral",
          ...activeNavStyle(active),
          radius: this.#radius,
          onClick: () => this.#goPaneVariant(variant),
        })
      }
      return
    }
    if (this.#routeSection() === "Icon") {
      this.#iconDock(x, y, w, h)
      return
    }
    if (this.#routeSection() === "Icon+Label") {
      this.#iconLabelDock(x, y, w, h)
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

  #editorSelectionDock(x: number, y: number, w: number, h: number): void {
    const itemGap = 12
    const itemW = 138
    const rowW = itemW * 2 + itemGap
    const startX = x + (w - rowW) / 2
    const bufferLabel = this.#selectionBufferState === "copied"
      ? "Copied"
      : this.#selectionBufferState === "error"
        ? "Copy failed"
        : "To buffer"
    Button(this, startX, y + (h - 42) / 2, itemW, 42, {
      children: bufferLabel,
      variant: this.#selectionBufferState === "copied" ? "contained" : "glass",
      color: this.#selectionBufferState === "error" ? "error" : "neutral",
      ...activeNavStyle(this.#selectionBufferState === "copied"),
      radius: this.#radius,
      fontPx: 10,
      onClick: () => this.#copySelectionToBuffer(),
    })
    Button(this, startX + itemW + itemGap, y + (h - 42) / 2, itemW, 42, {
      children: "Selection menu",
      variant: this.#selectionMenuOpen ? "contained" : "glass",
      color: "neutral",
      ...activeNavStyle(this.#selectionMenuOpen),
      radius: this.#radius,
      fontPx: 10,
      onClick: () => this.#toggleSelectionMenu(),
    })
  }

  #selectionMenu(x: number, y: number, w: number, h: number): void {
    const menuW = Math.min(374, w)
    const menuX = x + w - menuW
    Pane(this, menuX, y, menuW, h, {
      variant: "glass",
      sx: {
        background: "rgba(6, 12, 21, 0.92)",
        borderColor: "rgba(111, 211, 255, 0.28)",
        borderRadius: 19,
      },
    })
    const gap = 8
    const pad = 8
    const itemW = (menuW - pad * 2 - gap * 2) / 3
    const items = ["Copy", "Cut", "Select all"] as const
    for (const [i, item] of items.entries()) {
      Button(this, menuX + pad + i * (itemW + gap), y + 5, itemW, h - 10, {
        children: item,
        variant: item === "Copy" ? "contained" : "glass",
        color: "neutral",
        radius: 999,
        fontPx: 9,
        onClick: () => {
          if (item === "Copy") this.#copySelectionToBuffer()
          else if (item === "Cut") this.#cutSelectionToBuffer()
          else this.#selectAllInEditor()
          this.#record(`selection:${item.toLowerCase().replace(" ", "-")}`)
        },
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

  #iconLabelDock(x: number, y: number, w: number, h: number): void {
    const itemGap = 12
    const items: readonly ButtonRouteIconLabel[] = ["left", "right"]
    const itemW = 112
    const rowW = itemW * items.length + itemGap
    const startX = x + (w - rowW) / 2
    const placement = this.#routeIconLabelPlacement()
    for (const [i, item] of items.entries()) {
      const active = placement === item
      Button(this, startX + i * (itemW + itemGap), y + (h - 42) / 2, itemW, 42, {
        children: item,
        variant: active ? "contained" : "outlined",
        color: active ? this.#color : "neutral",
        radius: this.#radius,
        onClick: () => this.#goIconLabelPlacement(item),
      })
    }
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
    Pane(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    if (this.#currentComponent() === "Editor") {
      const pad = 24
      h3(this, x + pad, y + 30, w - pad * 2, 24, {children: "EditorPane", style: {fontSize: 15}})
      p(this, x + pad, y + 70, w - pad * 2, 22, {children: "Route", style: {fontSize: 11, color: "muted"}})
      codeBlock(this, x + pad, y + 104, w - pad * 2, [
        `new EditorPane({`,
        `  languageId: "${editorLanguageId(this.#editorLanguage())}",`,
        `  fontPx: 12, linePx: 17 })`,
      ])
    }
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

  #routeIconLabelPlacement(): IconLabelPlacement {
    return routeIconLabelPlacementFromRoute(this.#route)
  }

  #routePaneVariant(): PaneVariant | null {
    return routePaneVariantFromRoute(this.#route)
  }

  #currentComponent(): ComponentName {
    if (this.#route.startsWith("editor")) return "Editor"
    return this.#route.startsWith("pane/") ? "Pane" : "Button"
  }

  #editorLanguage(): EditorLanguageRoute {
    return editorLanguageFromRoute(this.#route)
  }

  #editorSection(): EditorSection {
    return this.#route.startsWith("editor/selection") ? "Selection" : "Highlighting"
  }

  #paneSection(): PaneSection {
    return "Variants"
  }

  #routeSection(): ButtonSection {
    if (this.#route.startsWith("button/icon-label")) return "Icon+Label"
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
    if (section === "Icon+Label") {
      this.#router.go("button/icon-label")
      this.#record("route:icon-label")
      return
    }
    this.#go(null)
  }

  #goPaneSection(_section: PaneSection): void {
    this.#router.go("pane/variants")
    this.#record("route:pane:variants")
  }

  #goPaneVariant(variant: PaneVariant): void {
    this.#router.go(`pane/variants/${variant}`)
    this.#record(`route:pane:variants:${variant}`)
  }

  #goEditorLanguage(language: EditorLanguageRoute): void {
    this.#router.go(`editor/highlighting/${language}`)
    this.#record(`route:editor:${language}`)
  }

  #goEditorSection(section: EditorSection): void {
    if (section === "Selection") {
      this.#router.go("editor/selection")
      this.#record("route:editor:selection")
      return
    }
    this.#router.go("editor/highlighting")
    this.#record("route:editor:highlighting")
  }

  #toggleSelectionMenu(): void {
    this.#router.go(this.#route === "editor/selection/menu" ? "editor/selection" : "editor/selection/menu")
    this.#record("selection:menu")
  }

  #copySelectionToBuffer(): void {
    const copy = this.#onEditorCopy
    if (copy === undefined) {
      this.#setSelectionBufferState("error")
      return
    }
    void copy().then((ok) => {
      if (ok) this.#router.go("editor/selection/copied")
      this.#setSelectionBufferState(ok ? "copied" : "error")
    }).catch(() => {
      this.#setSelectionBufferState("error")
    })
  }

  #cutSelectionToBuffer(): void {
    const cut = this.#onEditorCut
    if (cut === undefined) {
      this.#setSelectionBufferState("error")
      return
    }
    void cut().then((ok) => {
      if (ok) this.#router.go("editor/selection/copied")
      this.#setSelectionBufferState(ok ? "copied" : "error")
    }).catch(() => {
      this.#setSelectionBufferState("error")
    })
  }

  #selectAllInEditor(): void {
    this.#onEditorSelectAll?.()
  }

  #setSelectionBufferState(state: "idle" | "copied" | "error"): void {
    this.#selectionBufferState = state
    this.requestRender()
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

  #goIconLabelPlacement(placement: ButtonRouteIconLabel): void {
    this.#router.go(`button/icon-label/${placement}`)
    this.#record(`route:icon-label:${placement}`)
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

function editorLanguageFromRoute(route: ComponentsRoute): EditorLanguageRoute {
  const routeLanguage = routeEditorLanguageFromRoute(route)
  if (routeLanguage !== null) return routeLanguage
  return "typescript"
}

function routeEditorLanguageFromRoute(route: ComponentsRoute): EditorLanguageRoute | null {
  if (route === "editor/highlighting/typescript") return "typescript"
  if (route === "editor/highlighting/javascript") return "javascript"
  if (route === "editor/highlighting/html") return "html"
  if (route === "editor/highlighting/css") return "css"
  if (route === "editor/highlighting/plaintext") return "plaintext"
  return null
}

function editorLanguageId(language: EditorLanguageRoute): string {
  if (language === "typescript") return "typescript"
  if (language === "javascript") return "javascript"
  if (language === "html") return "html"
  if (language === "css") return "css"
  if (language === "plaintext") return "plaintext"
  return language
}

function editorLanguagePath(language: EditorLanguageRoute): string {
  if (language === "javascript") return "playground/demo.js"
  if (language === "html") return "playground/demo.html"
  if (language === "css") return "playground/demo.css"
  if (language === "plaintext") return "playground/demo.txt"
  return "playground/demo.ts"
}

function editorHighlighterName(language: EditorLanguageRoute): string {
  const languageId = editorLanguageId(language).toLowerCase()
  const highlighter = listLanguageHighlighters().find((item) =>
    item.id.toLowerCase() === languageId ||
    (item.aliases ?? []).some((alias) => alias.toLowerCase() === languageId)
  )
  return highlighter?.name ?? EDITOR_LANGUAGE_LABELS[language]
}

function applyEditorLanguage(editor: EditorPane, route: ComponentsRoute): void {
  const language = editorLanguageFromRoute(route)
  editor.setLanguage({languageId: editorLanguageId(language), path: editorLanguagePath(language)})
  editor.setTitle(`${editorHighlighterName(language)} source`)
  editor.setText(editorDemoSource(language))
}

function routeVariantFromRoute(route: ComponentsRoute): ButtonRouteVariant | null {
  if (!route.startsWith("button/basic/")) return null
  return route.slice("button/basic/".length) as ButtonRouteVariant
}

function routeSizeFromRoute(route: ComponentsRoute): ButtonSize | null {
  if (!route.startsWith("button/sizes/")) return null
  return route.slice("button/sizes/".length) as ButtonSize
}

function routeColorFromRoute(route: ComponentsRoute): ButtonColor | null {
  if (!route.startsWith("button/color/")) return null
  const color = route.slice("button/color/".length)
  if (!BUTTON_COLORS.includes(color as ButtonColor)) return null
  return color as ButtonColor
}

function routeIconFromRoute(route: ComponentsRoute): ButtonRouteIcon | null {
  if (route === "button/icon/svg") return "svg"
  return null
}

function routeIconLabelPlacementFromRoute(route: ComponentsRoute): IconLabelPlacement {
  if (route === "button/icon-label/left") return "left"
  if (route === "button/icon-label/right") return "right"
  return "mixed"
}

function routePaneVariantFromRoute(route: ComponentsRoute): PaneVariant | null {
  if (route === "pane/variants/glass") return "glass"
  if (route === "pane/variants/outlined") return "outlined"
  if (route === "pane/variants/filled") return "filled"
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
  return ["Text buttons are typically used for less-pronounced actions,", "including actions in dialogs and panes."]
}

function sizeFont(size: ButtonSize): number {
  if (size === "small") return 12
  if (size === "large") return 16
  return 14
}

function buttonFontPx(size: ButtonSize): number {
  if (size === "small") return 10
  if (size === "large") return 14
  return 12
}

function docButtonWidth(host: UiSurface, label: string, size: ButtonSize, iconSrc?: string): number {
  return autoButtonWidth(host, label, buttonFontPx(size), 24, iconSrc)
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

function paneVariantTitle(variant: PaneVariant): string {
  if (variant === "outlined") return "Outlined"
  if (variant === "filled") return "Filled"
  return "Glass"
}

function paneVariantDockLabel(variant: PaneVariant): string {
  return paneVariantTitle(variant)
}

function paneVariantDescriptionLines(variant: PaneVariant): readonly string[] {
  if (variant === "outlined") {
    return [
      "Outlined panes add separation through a brighter border",
      "without making the background heavier.",
    ]
  }
  if (variant === "filled") {
    return [
      "Filled panes read as heavier surfaces",
      "for sections that need stronger grouping.",
    ]
  }
  return [
    "Glass panes are the quiet default surface",
    "for layered interfaces and neutral grouping.",
  ]
}

function paneVariantSurfaceStyle(variant: PaneVariant): {background: CssColor; borderColor: CssColor} {
  if (variant === "outlined") {
    return {
      background: "rgba(12, 18, 30, 0.72)",
      borderColor: "rgba(111, 211, 255, 0.34)",
    }
  }
  if (variant === "filled") {
    return {
      background: "rgba(24, 32, 46, 0.98)",
      borderColor: "rgba(214, 231, 255, 0.26)",
    }
  }
  return {
    background: "rgba(10, 16, 26, 0.82)",
    borderColor: "rgba(214, 231, 255, 0.18)",
  }
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
  return svgIconTint(source, iconStrokeColor(color))
}

function svgIconTint(source: string, color: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(decodeSvgSource(source), "image/svg+xml")
  const svg = doc.querySelector("svg")
  if (svg === null) return customSvgIcon("primary")

  doc.querySelectorAll("script, foreignObject, style").forEach((node) => node.remove())
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  svg.setAttribute("color", color)
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
    `:root { color: ${color}; }`,
    "[fill]:not([fill='none']) { fill: currentColor !important; }",
    "[stroke]:not([stroke='none']) { stroke: currentColor !important; }",
  ].join(" ")
  svg.prepend(style)

  return svgDataUrl(new XMLSerializer().serializeToString(svg))
}

function decodeSvgSource(source: string): string {
  if (!source.startsWith("data:image/svg+xml")) return source
  const comma = source.indexOf(",")
  if (comma < 0) return source
  return decodeURIComponent(source.slice(comma + 1))
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

function colorToCssRgba(color: {r: number; g: number; b: number; a: number}): string {
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${Math.round(color.a * 1000) / 1000})`
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

function renderHeader(host: UiSurface, x: number, w: number, pad: number, y: number, title: string, lines: readonly string[]): void {
  h2(host, x + pad, y, w - pad * 2, 34, {children: title, style: {fontSize: 24}})
  for (const [i, line] of lines.entries()) {
    p(host, x + pad, y + 48 + i * 24, w - pad * 2, 22, {
      children: line,
      style: {fontSize: 13, color: "muted"},
    })
  }
}

function renderOverviewLayout(
  host: UiSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
  title: string,
  lines: readonly string[],
  drawContent: (x: number, y: number, w: number, h: number) => void,
): void {
  flexColumn({
    x: x + pad,
    y: y + 24,
    w: w - pad * 2,
    h: h - 48,
    gap: 18,
    items: [
      {
        height: "1fr",
        draw: (slotX, slotY, slotW, slotH) => {
          h2(host, slotX, slotY, slotW, slotH, {children: title, style: {fontSize: 24}})
        },
      },
      {
        height: "3fr",
        draw: (slotX, slotY, slotW, slotH) => {
          drawContent(slotX, slotY, slotW, slotH)
        },
      },
      {
        height: "1fr",
        draw: (slotX, slotY, slotW, slotH) => {
          host.drawTextBlock(lines, slotX, slotY, slotW, slotH, {
            fontPx: 13,
            material: host.materials.muted,
            lineHeight: 1.45,
            align: "left",
            vAlign: "middle",
            maxLines: lines.length,
            fit: "shrink",
          })
        },
      },
    ],
  })
}

function codeBlockHeight(lines: readonly string[]): number {
  return 16 + lines.length * 18
}

function codeBlock(host: UiSurface, x: number, y: number, w: number, lines: readonly string[]): void {
  const lineH = 18
  const h = codeBlockHeight(lines)
  Pane(host, x, y, w, h, {
    variant: "glass",
    sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17},
  })
  for (const [i, line] of lines.entries()) {
    span(host, x + 14, y + 7 + i * lineH, w - 28, 16, {children: line, style: {fontSize: 10, color: i === 0 ? "text" : "muted"}})
  }
}

function componentsPlaygroundLayout(rectW: number, rectH: number): {
  stageX: number
  stageY: number
  stageW: number
  stageH: number
  gap: number
  catalogW: number
  sectionW: number
  paramsW: number
  dockH: number
  previewW: number
  previewH: number
  sectionX: number
  previewX: number
  paramsX: number
} {
  const stageW = Math.max(1040, Math.min(1660, rectW - 36))
  const stageH = Math.max(560, Math.min(860, rectH - 36))
  const stageX = (rectW - stageW) / 2
  const stageY = (rectH - stageH) / 2
  const gap = 18
  const catalogW = Math.round(Math.max(184, Math.min(228, stageW * 0.16)))
  const sectionW = Math.round(Math.max(132, Math.min(172, stageW * 0.11)))
  const paramsW = Math.round(Math.max(300, Math.min(372, stageW * 0.23)))
  const dockH = Math.max(86, Math.min(112, stageH * 0.15))
  const previewW = stageW - catalogW - sectionW - paramsW - gap * 3
  const previewH = stageH - dockH - gap
  const sectionX = stageX + catalogW + gap
  const previewX = sectionX + sectionW + gap
  const paramsX = previewX + previewW + gap
  return {stageX, stageY, stageW, stageH, gap, catalogW, sectionW, paramsW, dockH, previewW, previewH, sectionX, previewX, paramsX}
}

function editorPaneRectForPreview(x: number, y: number, w: number, h: number): UiSurfaceRect {
  const top = y + 142
  const inset = 56
  return {
    x: x + inset,
    y: top,
    w: Math.max(260, w - inset * 2),
    h: Math.max(220, h - 190),
  }
}

function editorPaneRectForCanvas(w: number, h: number): UiSurfaceRect {
  const layout = componentsPlaygroundLayout(w, h)
  return editorPaneRectForPreview(layout.previewX, layout.stageY, layout.previewW, layout.previewH)
}

function hiddenRect(): UiSurfaceRect {
  return {x: 0, y: 0, w: 1, h: 1, visible: false}
}

const EDITOR_DEMO_SOURCES: Record<EditorLanguageRoute, string> = {
  typescript: `import {EditorPane} from "@metafor/components"

const editor = new EditorPane({
  title: "Demo source",
  path: "playground/demo.ts",
  fontPx: 12,
  linePx: 17,
})

editor.setText([
  "type Route = \\"button/basic\\" | \\"pane/variants\\" | \\"editor/highlighting\\"",
  "",
  "export function openEditor(route: Route): Route {",
  "  return route === \\"editor/highlighting\\" ? route : \\"editor/highlighting\\"",
  "}",
].join("\\n"))
`,
  javascript: `import {EditorPane} from "@metafor/components"

const routes = ["button/basic", "pane/variants", "editor/highlighting"]

export function openEditor(route) {
  console.log("route", route)
  return routes.includes(route) ? route : "editor/highlighting"
}
`,
  html: `<!doctype html>
<section class="proposal-card">
  <h1>{{title}}</h1>
  <style>
    .proposal-card {
      display: grid;
      gap: 12px;
      color: #f7fbff;
      padding: 18px;
    }
  </style>
  <script>
    const title = formatTitle("Editor")
  </script>
</section>
`,
  css: `.proposal-card {
  display: grid;
  gap: 12px;
  color: #f7fbff;
  padding: 18px;
}

@media (min-width: 720px) {
  .proposal-card {
    grid-template-columns: 1fr auto;
  }
}
`,
  plaintext: `EditorPane

Plain text route keeps tokens disabled.
Use this for logs, notes, and raw source snapshots.
`,
}

function editorDemoSource(language: EditorLanguageRoute): string {
  return EDITOR_DEMO_SOURCES[language]
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiRuntime.create(canvas)
let activeRoute: ComponentsRoute = "button/basic"
const editor = new EditorPane({
  title: "Demo source",
  path: "playground/demo.ts",
  fontPx: 12,
  linePx: 17,
})
let appliedEditorLanguage: EditorLanguageRoute | null = null
const syncEditorRoute = (route: ComponentsRoute): void => {
  if (!route.startsWith("editor") && appliedEditorLanguage !== null) return
  if (route.startsWith("editor/selection") && appliedEditorLanguage !== null) return
  const language = editorLanguageFromRoute(route)
  if (language === appliedEditorLanguage) return
  applyEditorLanguage(editor, route)
  appliedEditorLanguage = language
}
const screen = new ButtonComponentsScreen({
  onRouteChange: (route) => {
    activeRoute = route
    syncEditorRoute(route)
    ui.relayout()
  },
  onEditorCopy: () => editor.copySelectionToClipboard(),
  onEditorCut: () => editor.cutSelectionToClipboard(),
  onEditorSelectAll: () => editor.selectAll(),
})
activeRoute = screen.currentRoute
syncEditorRoute(activeRoute)
ui.addSurface(screen, ({w, h}) => ({x: 0, y: 0, w, h}))
ui.addSurface(editor, ({w, h}) => activeRoute.startsWith("editor") ? editorPaneRectForCanvas(w, h) : hiddenRect())
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
ui.handleResize()
