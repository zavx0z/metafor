import {type Object3D} from "@metafor/engine"
import {
  UiSurface,
  UiRuntime,
  button,
  div,
  flexColumn,
  flexRow,
  flexRowCss,
  h1,
  h2,
  h3,
  img,
  input,
  p,
  span,
  li,
  liY,
  type LiElementProps,
  type CssColor,
  type UiSize,
  ul,
  ulContentHeight,
} from "@ui/elements"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundInfoSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  planPlaygroundShell,
  type PlaygroundInfoOptions,
  type PlaygroundNavigationItem,
} from "@ui/playground"

export type ElementRoute =
  | "div"
  | "div/scroll"
  | "span"
  | "button"
  | "input"
  | "img"
  | "ul"
  | "layout/flex"
  | "layout/flex-css"
  | "style/css"
  | "style/theme"
  | "events"
type CssSection = "padding" | "flex" | "border" | "color" | "typography"
type DivDetail = "background" | "border" | "padding" | "zIndex" | "scroll"
type DivRoute = "div" | "div/scroll"
type ElementTone = "cyan" | "green" | "orange" | "red"
type ElementDensity = "compact" | "regular" | "air"
type ElementGroup = "Primitives" | "Layout" | "Style" | "Events"
type UlMode = "regular" | "dense" | "interactive" | "scroll"

type SectionLink = {
  label: string
  route: ElementRoute
}

export const ELEMENT_PLAYGROUND_ROUTES = ["div", "div/scroll", "span", "button", "input", "img", "ul", "layout/flex", "layout/flex-css", "style/css", "style/theme", "events"] as const
const DIV_DETAILS: readonly DivDetail[] = ["background", "border", "padding", "zIndex", "scroll"]
const UL_MODES: readonly UlMode[] = ["regular", "dense", "interactive", "scroll"]
const ELEMENT_GROUPS: readonly ElementGroup[] = ["Primitives", "Layout", "Style", "Events"]
const SECTION_LINKS: Record<ElementGroup, readonly SectionLink[]> = {
  Primitives: [
    {label: "div", route: "div"},
    {label: "span", route: "span"},
    {label: "button", route: "button"},
    {label: "input", route: "input"},
    {label: "img", route: "img"},
    {label: "ul / li", route: "ul"},
  ],
  Layout: [
    {label: "Flex", route: "layout/flex"},
    {label: "Flex CSS", route: "layout/flex-css"},
  ],
  Style: [
    {label: "CSS", route: "style/css"},
    {label: "Theme", route: "style/theme"},
  ],
  Events: [{label: "Pointer", route: "events"}],
}
const GROUP_DEFAULT_ROUTE: Record<ElementGroup, ElementRoute> = {
  Primitives: "div",
  Layout: "layout/flex",
  Style: "style/css",
  Events: "events",
}

const CSS_SECTIONS: readonly CssSection[] = ["padding", "flex", "border", "color", "typography"]
const ELEMENT_TONES: readonly ElementTone[] = ["cyan", "green", "orange", "red"]
const ELEMENT_DENSITIES: readonly ElementDensity[] = ["compact", "regular", "air"]

const LAYOUT_Z = -0.12
const DOCK_SEPARATOR = "|"

export type ElementDockAction = `${ElementRoute}|${string}`

export type ElementsPreviewDiagnostics = Readonly<{
  route: ElementRoute
  parentObjectId: string
  childObjectIds: readonly string[]
  layoutPlans: number
  materializations: number
}>

export class ElementsPreviewSurface extends UiSurface {
  readonly #retainedRoot: Object3D
  readonly #previewParent: Object3D
  readonly #objectIds = new WeakMap<object, string>()
  readonly #onNavigate: (route: ElementRoute) => void
  #nextObjectId = 1
  #route: ElementRoute
  #materialized: Readonly<{route: ElementRoute; w: number; h: number; pixelScale: number; font: unknown}> | null = null
  #dirtyPreview = true
  #layoutPlans = 0
  #materializations = 0
  #cssSection: CssSection = "padding"
  #tone: ElementTone = "cyan"
  #radius = 34
  #density: ElementDensity = "regular"
  #dockSelection: string
  #clicks = 0
  #state = "idle"
  #events: string[] = ["ready: hover, press, release, click"]
  readonly #scrollLines = [
    "div owns overflow and scrollbar.",
    "Wheel inside this box.",
    "The component layer only sets CSS-like style.",
    "Scrollbar geometry, clipping and wheel input live in elements.",
    "content line 05",
    "content line 06",
    "content line 07",
    "content line 08",
    "content line 09",
    "content line 10",
    "content line 11",
    "content line 12",
    "content line 13",
    "content line 14",
    "content line 15",
    "content line 16",
    "content line 17",
    "content line 18",
    "content line 19",
    "content line 20",
    "content line 21",
    "content line 22",
    "content line 23",
    "content line 24",
  ].join("\n")
  readonly #horizontalScrollLine = [
    "horizontal div content 01",
    "horizontal div content 02",
    "horizontal div content 03",
    "horizontal div content 04",
    "horizontal div content 05",
  ].join("    ")

  constructor(route: ElementRoute, onNavigate: (route: ElementRoute) => void) {
    super({bgColor: null, borderColor: null})
    this.node.name = "ElementsPreviewSurface"
    this.#route = route
    this.#onNavigate = onNavigate
    this.#dockSelection = defaultDockLabel(route)
    this.#retainedRoot = this.createRetainedParent()
    this.#retainedRoot.name = "ElementsPreviewSurface.retainedRoot"
    this.#previewParent = this.createRetainedParent(this.#retainedRoot)
    this.#previewParent.name = "ElementsPreviewSurface.preview"
  }

  get diagnostics(): ElementsPreviewDiagnostics {
    return Object.freeze({
      route: this.#route,
      parentObjectId: this.#objectId(this.#previewParent),
      childObjectIds: Object.freeze(this.#previewParent.children.slice(0, 128).map((child) => this.#objectId(child))),
      layoutPlans: this.#layoutPlans,
      materializations: this.#materializations,
    })
  }

  get dockAction(): ElementDockAction {
    return dockAction(this.#route, this.#dockSelection)
  }

  setRoute(route: ElementRoute): void {
    if (route === this.#route) return
    this.#route = route
    this.#dockSelection = defaultDockLabel(route)
    this.#invalidatePreview()
  }

  applyDockAction(action: ElementDockAction): void {
    const separator = action.indexOf(DOCK_SEPARATOR)
    const target = action.slice(0, separator)
    const label = action.slice(separator + 1)
    if (!isElementRoute(target)) return
    this.#dockSelection = label
    if (target === "style/css" && CSS_SECTIONS.includes(label as CssSection)) this.#cssSection = label as CssSection
    if (target === "style/theme" && ELEMENT_TONES.includes(label as ElementTone)) this.#tone = label as ElementTone
    if (target === "events") {
      if (label === "click") this.#clicks += 1
      const state = label === "press" ? "active" : label === "release" ? "released" : label
      this.#record(state, `dock:${label}`)
    } else {
      this.#invalidatePreview()
    }
    if (target !== this.#route) this.#onNavigate(target)
  }

  transformPreview(transform: Readonly<{x: number; y: number; scale: number}>): void {
    this.updateRetainedTransform(this.#retainedRoot, (parent) => {
      parent.position.set(transform.x * this.pixelScale, -transform.y * this.pixelScale, 0)
      parent.scale.set(transform.scale, transform.scale, 1)
    })
  }

  protected override onRetainedInteractionChange(parent: Object3D): void {
    if (parent === this.#previewParent) this.#invalidatePreview()
  }

  protected override render(): void {
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    const routeChanged = previous?.route !== this.#route
    if (geometryChanged || routeChanged) this.#dirtyPreview = true
    this.updateRetainedViewportClip(this.#retainedRoot, {x: 2, y: 2, w: Math.max(0, this.rectW - 4), h: Math.max(0, this.rectH - 4)})
    if (!this.#dirtyPreview) return
    this.#dirtyPreview = false
    try {
      this.materializeRetainedParent(this.#previewParent, () => this.#drawPreview(0, 0, this.rectW, this.rectH))
    } catch (error) {
      this.#dirtyPreview = true
      throw error
    }
    this.#layoutPlans += 1
    this.#materializations += 1
    this.#materialized = {
      route: this.#route,
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
    }
  }

  #drawPreview(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      style: {
        background: "rgba(8, 13, 22, 0.72)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: this.#radius,
        zIndex: LAYOUT_Z,
      },
    })
    const pad = this.#contentPad()
    this.pushClip(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4))
    if (this.#route === "div" || this.#route === "div/scroll") this.#divRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "span") this.#spanRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "button") this.#buttonRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "input") this.#inputRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "img") this.#imageRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "ul") this.#ulRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "layout/flex") this.#flexRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "layout/flex-css") this.#flexCssRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "style/css") this.#css(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "style/theme") this.#theme(x + pad, y + pad, w - pad * 2, h - pad * 2)
    else this.#eventsRoute(x + pad, y + pad, w - pad * 2, h - pad * 2)
    this.popClip()
  }

  #invalidatePreview(): void {
    this.#dirtyPreview = true
    this.requestRender()
  }

  #objectId(value: object): string {
    const current = this.#objectIds.get(value)
    if (current !== undefined) return current
    const next = `object-${this.#nextObjectId++}`
    this.#objectIds.set(value, next)
    return next
  }

  #segmentedNumber(x: number, y: number, w: number, label: string, values: readonly (readonly [string, number])[]): void {
    span(this, x, y, w, 22, {children: label, style: {fontSize: 11, color: "muted"}})
    const gap = 8
    const btnW = (w - gap * (values.length - 1)) / values.length
    for (const [i, [title, value]] of values.entries()) {
      const active = this.#radius === value
      button(this, x + i * (btnW + gap), y + 32, btnW, 34, {
        children: title,
        onClick: () => {
          this.#radius = value
          this.#invalidatePreview()
        },
        style: {background: active ? "rgba(111, 211, 255, 0.13)" : "rgba(255,255,255,0.035)", borderColor: active ? this.#tone : "rgba(214,231,255,0.14)", fontSize: 10},
      })
    }
  }

  #toneGroup(x: number, y: number, w: number): void {
    span(this, x, y, w, 22, {children: "tone", style: {fontSize: 11, color: "muted"}})
    const gap = 8
    const btnW = (w - gap * (ELEMENT_TONES.length - 1)) / ELEMENT_TONES.length
    for (const [i, tone] of ELEMENT_TONES.entries()) {
      button(this, x + i * (btnW + gap), y + 32, btnW, 34, {
        children: tone,
        onClick: () => {
          this.#tone = tone
          this.#invalidatePreview()
        },
        style: {background: this.#tone === tone ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)", borderColor: tone, color: this.#tone === tone ? "text" : "muted", fontSize: 10},
      })
    }
  }

  #densityGroup(x: number, y: number, w: number): void {
    span(this, x, y, w, 22, {children: "density", style: {fontSize: 11, color: "muted"}})
    const gap = 8
    const btnW = (w - gap * (ELEMENT_DENSITIES.length - 1)) / ELEMENT_DENSITIES.length
    for (const [i, density] of ELEMENT_DENSITIES.entries()) {
      const active = this.#density === density
      button(this, x + i * (btnW + gap), y + 32, btnW, 34, {
        children: density,
        onClick: () => {
          this.#density = density
          this.#invalidatePreview()
        },
        style: {background: active ? "rgba(111,211,255,0.13)" : "rgba(255,255,255,0.035)", borderColor: active ? this.#tone : "rgba(214,231,255,0.14)", fontSize: 10},
      })
    }
  }

  #contentPad(): number {
    if (this.#density === "compact") return 24
    if (this.#density === "air") return 40
    return 32
  }

  #overview(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Elements", style: {fontSize: 22}})

    const paneW = (w - 32) / 3
    featurePane(this, x, y + 58, paneW, 118, "HTML names", "div / span / button / input / img")
    featurePane(this, x + paneW + 16, y + 58, paneW, 118, "CSS props", "style.background / padding / flex")
    featurePane(this, x + (paneW + 16) * 2, y + 58, paneW, 118, "Surface", "UiSurface / UiRuntime")

    div(this, x, y + 214, w, 168, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30},
    })
    h3(this, x + 26, y + 240, w - 52, 24, {children: "API", style: {fontSize: 15}})
    codeLine(this, x + 26, y + 282, w - 52, "button(this, x, y, 180, 46, { children: \"Run\", style: { borderRadius: 999 } })")
    codeLine(this, x + 26, y + 320, w - 52, "div(this, x, y, w, h, { style: { background: \"glass\", padding: 24 } })")
  }

  #divRoute(x: number, y: number, w: number, h: number): void {
    h2(this, x, y, w, 34, {children: "div", style: {fontSize: 22}})
    const detail = this.#divDetail()
    if (detail === "scroll") {
      pill(this, x + w - 176, y + 2, 176, 30, detail, "rgba(111, 211, 255, 0.10)", "cyan")
      this.#divScrollDetail(x, y + 58, w, h - 58)
      return
    }

    const cardH = 358
    const innerX = x + 28
    const innerW = w - 56
    div(this, x, y + 58, w, cardH, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, innerX, y + 86, innerW, 24, {children: "Box surface", style: {fontSize: 15}})
    div(this, innerX, y + 130, innerW, 82, {style: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.36)", borderRadius: 24}})
    h2(this, x + 52, y + 154, Math.max(1, w - 104), 26, {children: "h2 inside div", style: {fontSize: 16}})
    p(this, x + 52, y + 184, Math.max(1, w - 104), 22, {children: "p text clipped inside the div", style: {fontSize: 11, color: "muted"}})
    input(this, innerX, y + 240, innerW, 42, {value: "input value", active: true})
    const buttonGap = 16
    const buttonW = Math.min(168, Math.max(1, (innerW - buttonGap) / 2))
    button(this, innerX, y + 304, buttonW, 44, {children: "button"})
    button(this, innerX + buttonW + buttonGap, y + 304, buttonW, 44, {children: "disabled", disabled: true})
  }

  #divDetail(): DivDetail | null {
    if (this.#route === "div/scroll") return "scroll"
    return null
  }

  #goDivDetail(detail: DivDetail): void {
    this.#onNavigate(divRouteFromDetail(detail))
  }

  #ulMode(): UlMode {
    return UL_MODES.includes(this.#dockSelection as UlMode) ? this.#dockSelection as UlMode : "regular"
  }

  #divScrollDetail(x: number, y: number, w: number, _h: number): void {
    const gap = 22
    const cardW = Math.max(1, (w - gap) / 2)
    const cardH = 288
    const cardY = y + 28
    const innerPad = 24

    div(this, x, cardY, cardW, cardH, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + innerPad, cardY + 24, cardW - innerPad * 2, 24, {children: "Vertical scroll", style: {fontSize: 15}})
    div(this, x + innerPad, cardY + 72, cardW - innerPad * 2, 160, {
      key: "div-playground-scrollbar-detail",
      children: this.#scrollLines,
      style: {
        overflowY: "auto",
        background: "rgba(111, 211, 255, 0.045)",
        borderColor: "rgba(111, 211, 255, 0.92)",
        borderWidth: 1,
        borderRadius: 0,
        color: "muted",
        fontSize: 12,
        lineHeight: 1.55,
      },
    })
    codeLine(this, x + innerPad, cardY + 246, cardW - innerPad * 2, "div(..., { style: { overflowY: \"auto\" } })")

    const rightX = x + cardW + gap
    div(this, rightX, cardY, cardW, cardH, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, rightX + innerPad, cardY + 24, cardW - innerPad * 2, 24, {children: "Horizontal scroll", style: {fontSize: 15}})
    div(this, rightX + innerPad, cardY + 104, cardW - innerPad * 2, 98, {
      key: "div-playground-horizontal-scrollbar-detail",
      children: this.#horizontalScrollLine,
      style: {
        overflowX: "auto",
        overflowY: "hidden",
        background: "rgba(111, 211, 255, 0.045)",
        borderColor: "rgba(111, 211, 255, 0.92)",
        borderWidth: 1,
        borderRadius: 0,
        color: "muted",
        fontSize: 12,
        lineHeight: 1.55,
      },
    })
    codeLine(this, rightX + innerPad, cardY + 246, cardW - innerPad * 2, "div(..., { style: { overflowX: \"auto\" } })")

  }

  #spanRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "span", style: {fontSize: 22}})
    h3(this, x + 28, y + 86, w - 56, 24, {children: "Text primitive", style: {fontSize: 15}})
    span(this, x + 28, y + 132, w - 56, 36, {children: "left aligned text", style: {fontSize: 18, color: "text"}})
    span(this, x + 28, y + 184, w - 56, 36, {children: "center aligned text", style: {fontSize: 18, color: "cyan", textAlign: "center"}})
    span(this, x + 28, y + 236, w - 56, 36, {children: "right aligned text", style: {fontSize: 18, color: "muted", textAlign: "right"}})
    codeLine(this, x + 28, y + 318, Math.min(620, w - 56), "span(surface, x, y, w, h, { children: \"text\", style: { textAlign: \"center\" } })")
  }

  #buttonRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "button", style: {fontSize: 22}})
    h3(this, x + 28, y + 86, w - 56, 24, {children: "Primitive states", style: {fontSize: 15}})
    button(this, x + 28, y + 132, 172, 48, {children: "default"})
    button(this, x + 224, y + 132, 172, 48, {children: "disabled", disabled: true})
    button(this, x + 420, y + 132, 172, 48, {
      children: `clicks ${this.#clicks}`,
      onClick: () => {
        this.#clicks += 1
        this.#invalidatePreview()
      },
    })
    div(this, x + 28, y + 234, Math.min(520, w - 56), 118, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.14)", borderRadius: 28}})
    span(this, x + 54, y + 282, Math.min(468, w - 108), 24, {children: "button owns disabled, hit state and press visual hold", style: {fontSize: 12, color: "muted"}})
  }

  #inputRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "input", style: {fontSize: 22}})
    h3(this, x + 28, y + 86, w - 56, 24, {children: "Input surface", style: {fontSize: 15}})
    input(this, x + 28, y + 132, Math.min(420, w - 56), 44, {value: "inactive value", active: false})
    input(this, x + 28, y + 204, Math.min(420, w - 56), 44, {value: "active value", active: true})
    codeLine(this, x + 28, y + 302, Math.min(620, w - 56), "input(surface, x, y, w, h, { value: \"active value\", active: true })")
  }

  #ulRoute(x: number, y: number, w: number, h: number): void {
    h2(this, x, y, w, 34, {children: "ul / li", style: {fontSize: 22}})
    const mode = this.#ulMode()
    h3(this, x + 28, y + 86, w - 56, 24, {children: "Primitive rows", style: {fontSize: 15}})
    const rows = [
      ["MetaFor runtime", "surface tree"],
      ["WebGPU renderer", "draw pass"],
      ["Input router", "hit state"],
      ["Virtual ul", "scroll geometry"],
      ["li row", "pointer state"],
      ["Click target", "hit zone"],
      ["Overflow", "div scrollbar"],
      ["Shared primitive", "component base"],
      ["Line 09", "scrollback"],
      ["Line 10", "scrollback"],
      ["Line 11", "scrollback"],
      ["Line 12", "scrollback"],
    ] as const
    const dense = mode === "dense"
    const itemHeight = dense ? 38 : 48
    const itemGap = dense ? 2 : 4
    const count = mode === "scroll" ? rows.length : 5
    const panelW = Math.min(560, w - 56)
    const panelH = mode === "scroll" ? Math.min(278, h - 142) : 296
    const panelX = x + (w - panelW) / 2
    const panelY = y + 132

    div(this, panelX - 16, panelY - 16, panelW + 32, panelH + 32, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 28},
    })
    ul(this, panelX, panelY, panelW, panelH, {
      key: "elements:ul:preview",
      dense,
      itemHeight,
      itemGap,
      scrollContentHeight: mode === "scroll"
        ? ulContentHeight(count, {itemHeight, itemGap, paddingTop: 8, paddingBottom: 8})
        : panelH,
      style: {
        background: "rgba(4, 8, 14, 0.28)",
        borderColor: "rgba(111, 211, 255, 0.22)",
        borderRadius: 18,
        overflowY: mode === "scroll" ? "auto" : "hidden",
      },
      children: (ctx) => {
        for (let i = 0; i < count; i += 1) {
          const rowY = liY(i, {startY: ctx.itemY, itemHeight, itemGap})
          if (rowY + itemHeight < panelY || rowY > panelY + panelH) continue
          const row = rows[i] ?? [`Line ${String(i + 1).padStart(2, "0")}`, "virtual row"]
          const liProps: LiElementProps = {
            key: `elements:li:row:${i}`,
            style: (state) => ({
              background: state.hovered && mode === "interactive" ? "rgba(111, 211, 255, 0.08)" : null,
              borderColor: state.pressed && mode === "interactive" ? "rgba(111, 211, 255, 0.34)" : null,
              borderRadius: 14,
            }),
            children: () => {
              span(this, ctx.itemX + 16, rowY + 5, ctx.itemWidth - 32, 18, {
                children: row[0],
                style: {fontSize: dense ? 10 : 11, color: "text"},
              })
              span(this, ctx.itemX + 16, rowY + (dense ? 21 : 25), ctx.itemWidth - 32, 16, {
                children: row[1],
                style: {fontSize: 9, color: "muted"},
              })
            },
          }
          if (mode === "interactive") liProps.onClick = () => this.#record("click", `li:${row[0]}`)
          li(this, ctx.itemX, rowY, ctx.itemWidth, itemHeight, liProps)
        }
      },
    })

    codeLine(this, x + 28, y + h - 54, Math.min(650, w - 56), "ul(surface, x, y, w, h, { children: ctx => li(...) })")
  }

  #paddingRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Padding", style: {fontSize: 22}})

    h3(this, x + 28, y + 86, 320, 24, {children: "CSS box spacing", style: {fontSize: 15}})
    codeLine(this, x + 28, y + 126, Math.min(520, w - 56), "div(..., { style: { padding: 28, paddingX: 36 } })")
    propRow(this, x + 28, y + 174, Math.min(420, w - 56), "padding", "all sides")
    propRow(this, x + 28, y + 220, Math.min(420, w - 56), "paddingX/Y", "axis override")
    propRow(this, x + 28, y + 266, Math.min(420, w - 56), "paddingTop", "per-side override")

    const demoX = x + Math.min(500, w * 0.48)
    const demoW = w - (demoX - x) - 28
    div(this, demoX, y + 116, demoW, 210, {
      style: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.34)", borderRadius: 34},
    })
    div(this, demoX + 36, y + 150, demoW - 72, 142, {
      style: {background: "rgba(255, 255, 255, 0.07)", borderColor: "rgba(255, 255, 255, 0.18)", borderRadius: 26},
    })
    span(this, demoX + 64, y + 210, demoW - 128, 24, {children: "content area", style: {fontSize: 12, color: "text"}})
  }

  #flexRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Flex", style: {fontSize: 22}})

    const panelW = (w - 24) / 2
    h3(this, x + 28, y + 86, panelW - 56, 24, {children: "flexRow", style: {fontSize: 15}})
    flexRow({
      x: x + 28,
      y: y + 138,
      w: panelW - 56,
      h: 110,
      gap: 14,
      alignItems: "center",
      items: [
        {width: 86, height: 72, draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "86", "cyan")},
        {width: "grow", height: 72, draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "grow", "green")},
        {width: 112, height: 72, draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "112", "orange")},
      ],
    })
    codeLine(this, x + 28, y + 292, panelW - 56, "flexRow({ gap: 14, alignItems: \"center\", items })")

    const rightX = x + panelW + 24
    h3(this, rightX + 28, y + 86, panelW - 56, 24, {children: "flexColumn", style: {fontSize: 15}})
    flexColumn({
      x: rightX + 28,
      y: y + 132,
      w: panelW - 56,
      h: 186,
      gap: 12,
      alignItems: "stretch",
      items: [
        {height: 48, draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "header", "cyan")},
        {height: "grow", draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "grow content", "green")},
        {height: 44, draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, "footer", "orange")},
      ],
    })
  }

  #flexCssRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Flex CSS", style: {fontSize: 22}})

    h3(this, x + 28, y + 86, w - 56, 24, {children: "px / percent / fr / grow", style: {fontSize: 15}})
    const items: Array<{label: string; width: UiSize; color: CssColor}> = [
      {label: "120px", width: 120, color: "cyan"},
      {label: "24%", width: "24%", color: "green"},
      {label: "1fr", width: "1fr", color: "orange"},
      {label: "2fr", width: "2fr", color: "red"},
    ]
    flexRowCss({
      x: x + 28,
      y: y + 138,
      w: w - 56,
      h: 112,
      gap: 14,
      alignItems: "stretch",
      items: items.map((item) => ({
        width: item.width,
        draw: (cx, cy, cw, ch) => demoCell(this, cx, cy, cw, ch, item.label, item.color),
      })),
    })
    codeLine(this, x + 28, y + 292, w - 56, "flexRowCss({ items: [{ width: 120 }, { width: \"24%\" }, { width: \"1fr\" }] })")
    propRow(this, x + 28, y + 338, Math.min(480, w - 56), "UiSize", "number | \"42%\" | \"1fr\" | \"grow\"")
  }

  #gridRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Multi-Surface Grid", style: {fontSize: 22}})

    const gap = 20
    const paneW = (w - gap) / 2
    const paneH = 166
    const panes = [
      ["Layout", "outer div + inner glass boxes", "cyan"],
      ["State", "one canvas tree, many hit regions", "green"],
      ["Text", "clipped and measured text", "orange"],
      ["Theme", "shared Vision tokens", "red"],
    ] as const
    for (const [i, [title, body, color]] of panes.entries()) {
      const cx = x + (i % 2) * (paneW + gap)
      const cy = y + 58 + Math.floor(i / 2) * (paneH + gap)
      div(this, cx + 22, cy + 26, 14, 52, {style: {background: color, borderColor: null, borderRadius: 999, opacity: 0.72, zIndex: 0.02}})
      h3(this, cx + 58, cy + 26, paneW - 84, 24, {children: title, style: {fontSize: 15}})
      p(this, cx + 58, cy + 62, paneW - 84, 26, {children: body, style: {fontSize: 12, color: "muted"}})
      button(this, cx + 22, cy + 104, 148, 40, {children: "Select", style: {fontSize: 11}})
    }
  }

  #textBlockRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Text Block", style: {fontSize: 22}})

    h3(this, x + 28, y + 86, 280, 24, {children: "Measured multiline text", style: {fontSize: 15}})
    const copy =
      "UiSurface.drawTextBlock keeps long content inside a fixed visual box. It wraps, shrinks when needed and clips with predictable canvas metrics."
    this.drawTextBlock(copy, x + 28, y + 134, Math.min(520, w - 56), 156, {
      fontPx: 14,
      lineHeight: 21,
      material: this.materials.text,
      wrap: true,
      fit: "shrink",
      maxLines: 5,
      padX: 22,
      padY: 18,
    })
    codeLine(this, x + 28, y + 322, w - 56, "drawTextBlock(text, x, y, w, h, { wrap: true, fit: \"shrink\", maxLines: 5 })")
  }

  #imageRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Image", style: {fontSize: 22}})

    const artwork = svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop stop-color="#6fd3ff" offset="0"/>
            <stop stop-color="#52c47b" offset="0.52"/>
            <stop stop-color="#ffbe6f" offset="1"/>
          </linearGradient>
          <filter id="b"><feGaussianBlur stdDeviation="24"/></filter>
        </defs>
        <rect width="640" height="360" fill="#07101c"/>
        <circle cx="180" cy="154" r="120" fill="#6fd3ff" opacity="0.55" filter="url(#b)"/>
        <circle cx="440" cy="190" r="142" fill="#52c47b" opacity="0.45" filter="url(#b)"/>
        <rect x="96" y="78" width="448" height="204" rx="54" fill="url(#g)" opacity="0.72"/>
      </svg>
    `)
    div(this, x + 28, y + 110, Math.min(520, w - 56), 230, {
      style: {background: "rgba(4, 8, 14, 0.52)", borderColor: "rgba(214, 231, 255, 0.14)", borderRadius: 34},
    })
    img(this, x + 42, y + 124, Math.min(492, w - 84), 202, {src: artwork, fit: "cover", style: {opacity: 0.94}})
    propRow(this, x + Math.min(590, w * 0.56), y + 126, w - Math.min(590, w * 0.56), "fit", "\"cover\" | \"contain\"")
    propRow(this, x + Math.min(590, w * 0.56), y + 174, w - Math.min(590, w * 0.56), "opacity", "0..1")
    codeLine(this, x + Math.min(590, w * 0.56), y + 238, w - Math.min(590, w * 0.56), "img(this, x, y, w, h, { src, fit: \"cover\" })")
  }

  #eventsRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Events", style: {fontSize: 22}})

    h3(this, x + 28, y + 86, 260, 24, {children: "State", style: {fontSize: 15}})
    pill(this, x + w - 278, y + 82, 250, 30, `state=${this.#state} clicks=${this.#clicks}`, "rgba(111, 211, 255, 0.10)", "cyan")
    button(this, x + 28, y + 140, 190, 50, {
      children: "Click element",
      onPointerEnter: () => this.#record("hover", "hover: Click element"),
      onPointerLeave: () => this.#record("idle", "leave: Click element"),
      onPointerDown: () => this.#record("active", "press: Click element"),
      onPointerUp: () => this.#record("released", "release: Click element"),
      onClick: () => {
        this.#clicks += 1
        this.#record("clicked", "click: Click element")
      },
    })
    button(this, x + 238, y + 140, 190, 50, {children: "Forbidden", disabled: true})

    for (const [i, label] of ["idle", "hover", "active", "clicked", "disabled"].entries()) {
      const active = this.#state === label
      pill(this, x + 28 + i * 126, y + 230, 106, 32, label, active ? "rgba(111, 211, 255, 0.14)" : "rgba(255, 255, 255, 0.04)", active ? "cyan" : "muted")
    }

    div(this, x + w - 360, y + 132, 332, 216, {style: {background: "rgba(4, 8, 14, 0.48)", borderColor: "rgba(214, 231, 255, 0.12)", borderRadius: 24}})
    for (const [i, event] of this.#events.entries()) {
      span(this, x + w - 332, y + 158 + i * 34, 276, 24, {children: event, style: {fontSize: 12, color: i === 0 ? "text" : "muted"}})
    }
  }

  #css(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "CSS", style: {fontSize: 22}})

    const tabsY = y + 58
    const tabW = (w - 48) / CSS_SECTIONS.length
    for (const [i, section] of CSS_SECTIONS.entries()) {
      const active = this.#cssSection === section
      button(this, x + i * (tabW + 12), tabsY, tabW, 38, {
        children: section,
        onClick: () => {
          this.#cssSection = section
          this.#invalidatePreview()
        },
        style: {
          background: active ? "rgba(111, 211, 255, 0.14)" : "rgba(255, 255, 255, 0.035)",
          borderColor: active ? "cyan" : "rgba(214, 231, 255, 0.16)",
          color: active ? "text" : "muted",
          fontSize: 11,
          borderRadius: 999,
        },
      })
    }

    if (this.#cssSection === "padding") this.#cssPadding(x + 28, y + 150, w - 56)
    else if (this.#cssSection === "flex") this.#cssFlex(x + 28, y + 150, w - 56)
    else if (this.#cssSection === "border") this.#cssBorder(x + 28, y + 150, w - 56)
    else if (this.#cssSection === "color") this.#cssColor(x + 28, y + 150, w - 56)
    else this.#cssTypography(x + 28, y + 150, w - 56)
  }

  #cssPadding(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "padding / paddingX / paddingY", style: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(440, w), "padding", "24 | \"24px\"")
    propRow(this, x, y + 92, Math.min(440, w), "paddingX", "horizontal override")
    propRow(this, x, y + 138, Math.min(440, w), "paddingTop", "per-side override")
    const demoX = x + Math.min(490, w * 0.48)
    const demoW = w - (demoX - x)
    div(this, demoX, y + 44, demoW, 156, {style: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.32)", borderRadius: 28, padding: 28}})
    div(this, demoX + 28, y + 72, demoW - 56, 100, {style: {background: "rgba(255, 255, 255, 0.07)", borderColor: "rgba(255, 255, 255, 0.18)", borderRadius: 22}})
    span(this, demoX + 52, y + 108, demoW - 104, 24, {children: "content after padding", style: {fontSize: 12, color: "text"}})
  }

  #cssFlex(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "display / gap / alignItems / justifyContent", style: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(460, w), "display", "\"flex\"")
    propRow(this, x, y + 92, Math.min(460, w), "gap", "12 | \"12px\"")
    propRow(this, x, y + 138, Math.min(460, w), "justifyContent", "start | center | space-between")
    const demoX = x + Math.min(510, w * 0.50)
    const itemW = Math.max(62, (w - (demoX - x) - 88) / 3)
    div(this, demoX, y + 54, w - (demoX - x), 136, {style: {background: "rgba(255, 255, 255, 0.045)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 28}})
    for (const [i, color] of (["cyan", "green", "orange"] as const).entries()) {
      div(this, demoX + 28 + i * (itemW + 16), y + 88, itemW, 68, {style: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 24}})
    }
  }

  #cssBorder(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "borderRadius / borderColor / borderWidth", style: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "borderRadius", "999 | 32 | \"32px\"")
    propRow(this, x, y + 92, Math.min(450, w), "borderColor", "token | rgba(...) | null")
    propRow(this, x, y + 138, Math.min(450, w), "borderWidth", "1 | 2")
    const demoX = x + Math.min(500, w * 0.50)
    div(this, demoX, y + 52, 120, 120, {style: {background: "rgba(111, 211, 255, 0.10)", borderColor: "cyan", borderRadius: 28}})
    div(this, demoX + 150, y + 52, 180, 58, {style: {background: "rgba(82, 196, 123, 0.10)", borderColor: "green", borderRadius: 999}})
    div(this, demoX + 150, y + 130, 180, 58, {style: {background: "rgba(255, 127, 111, 0.10)", borderColor: "red", borderRadius: 14}})
  }

  #cssColor(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "background / backgroundColor / color", style: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "background", "\"glass\" | token | rgba(...)")
    propRow(this, x, y + 92, Math.min(450, w), "color", "\"text\" | \"muted\" | \"cyan\"")
    propRow(this, x, y + 138, Math.min(450, w), "opacity", "0..1")
    const demoX = x + Math.min(500, w * 0.50)
    for (const [i, color] of (["cyan", "green", "orange", "red"] as const).entries()) {
      div(this, demoX + i * 78, y + 62, 58, 104, {style: {background: color, borderColor: "rgba(255, 255, 255, 0.24)", borderRadius: 24, opacity: 0.84}})
    }
  }

  #cssTypography(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "fontSize / lineHeight / text color", style: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "fontSize", "10 | 13 | 22")
    propRow(this, x, y + 92, Math.min(450, w), "lineHeight", "number | px")
    propRow(this, x, y + 138, Math.min(450, w), "maxWidth", "drawText clipping")
    const demoX = x + Math.min(500, w * 0.50)
    h1(this, demoX, y + 50, w - (demoX - x), 36, {children: "h1 title", style: {fontSize: 24}})
    h2(this, demoX, y + 96, w - (demoX - x), 28, {children: "h2 section", style: {fontSize: 17}})
    p(this, demoX, y + 134, w - (demoX - x), 28, {children: "p text with muted tone and clipping", style: {fontSize: 12, color: "muted"}})
  }

  #theme(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Theme & Palette", style: {fontSize: 22}})

    const colors = [
      ["cyan", "cyan"],
      ["green", "green"],
      ["orange", "orange"],
      ["red", "red"],
      ["muted", "muted"],
      ["glass", "rgba(255, 255, 255, 0.07)"],
    ] as const

    const swatchW = (w - 48) / 3
    for (const [i, [label, color]] of colors.entries()) {
      const cx = x + (i % 3) * (swatchW + 24)
      const cy = y + 64 + Math.floor(i / 3) * 126
      div(this, cx, cy, swatchW, 96, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 28}})
      div(this, cx + 22, cy + 24, 52, 52, {style: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 18}})
      span(this, cx + 92, cy + 30, swatchW - 112, 24, {children: label, style: {fontSize: 13, color: label === "glass" ? "text" : color}})
      span(this, cx + 92, cy + 58, swatchW - 112, 20, {children: `style={{ color: "${label}" }}`, style: {fontSize: 10, color: "muted"}})
    }

    div(this, x, y + 338, w, 78, {style: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.28)", borderRadius: 28}})
    span(this, x + 28, y + 368, w - 56, 24, {children: "borderRadius=999 creates the Vision-style capsule control.", style: {fontSize: 12, color: "text"}})
  }

  #record(state: string, event: string): void {
    this.#state = state
    this.#events = [event, ...this.#events].slice(0, 5)
    this.#invalidatePreview()
  }
}

function pill(host: UiSurface, x: number, y: number, w: number, h: number, label: string, background: CssColor | "glass", color: CssColor): void {
  div(host, x, y, w, h, {style: {background, borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 999}})
  span(host, x + 12, y, w - 24, h, {children: label, style: {fontSize: 11, color}})
}

function featurePane(host: UiSurface, x: number, y: number, w: number, h: number, title: string, value: string): void {
  div(host, x, y, w, h, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
  h3(host, x + 24, y + 24, w - 48, 24, {children: title, style: {fontSize: 15}})
  span(host, x + 24, y + 68, w - 48, 24, {children: value, style: {fontSize: 12, color: "text"}})
}

function propRow(host: UiSurface, x: number, y: number, w: number, name: string, value: string): void {
  div(host, x, y, w, 34, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17}})
  span(host, x + 16, y, 130, 34, {children: name, style: {fontSize: 11, color: "cyan"}})
  span(host, x + 152, y, w - 168, 34, {children: value, style: {fontSize: 11, color: "muted"}})
}

function paramRow(host: UiSurface, x: number, y: number, w: number, name: string, value: string): void {
  div(host, x, y, w, 46, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 18}})
  span(host, x + 16, y + 6, w - 32, 16, {children: name, style: {fontSize: 10, color: "cyan"}})
  span(host, x + 16, y + 24, w - 32, 16, {children: value, style: {fontSize: 10, color: "muted"}})
}

function codeLine(host: UiSurface, x: number, y: number, w: number, text: string): void {
  div(host, x, y, w, 28, {style: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 14}})
  span(host, x + 14, y, w - 28, 28, {children: text, style: {fontSize: 10, color: "text"}})
}

function demoCell(host: UiSurface, x: number, y: number, w: number, h: number, label: string, color: CssColor): void {
  div(host, x, y, w, h, {style: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 24, opacity: 0.74, zIndex: 0.05}})
  span(host, x + 14, y, Math.max(1, w - 28), h, {children: label, style: {fontSize: 11, color: "text"}})
}

function labelsForRoute(route: ElementRoute): readonly string[] {
  if (route === "div" || route === "div/scroll") return DIV_DETAILS
  if (route === "span") return ["left", "center", "right", "color"]
  if (route === "button") return ["default", "disabled", "click", "press"]
  if (route === "input") return ["inactive", "active", "value", "style"]
  if (route === "img") return ["cover", "contain", "opacity", "src"]
  if (route === "ul") return UL_MODES
  if (route === "layout/flex") return ["flexRow", "flexColumn", "grow", "stretch"]
  if (route === "layout/flex-css") return ["px", "percent", "fr", "grow"]
  if (route === "events") return ["hover", "press", "release", "click"]
  return ["style", "tokens", "radius", "glass"]
}

function divRouteFromDetail(detail: DivDetail): DivRoute {
  return detail === "scroll" ? "div/scroll" : "div"
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg.trim())))}`
}


export const ELEMENT_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<ElementRoute>[] = ELEMENT_GROUPS.map((group) => ({
  id: group.toLowerCase(),
  label: group,
  route: GROUP_DEFAULT_ROUTE[group],
}))

export function isElementRoute(route: string): route is ElementRoute {
  return (ELEMENT_PLAYGROUND_ROUTES as readonly string[]).includes(route)
}

export function elementsPlaygroundGroup(route: ElementRoute): ElementGroup {
  if (route.startsWith("layout/")) return "Layout"
  if (route.startsWith("style/")) return "Style"
  if (route === "events") return "Events"
  return "Primitives"
}

export function elementsPlaygroundSections(route: ElementRoute): readonly PlaygroundNavigationItem<ElementRoute>[] {
  return SECTION_LINKS[elementsPlaygroundGroup(route)].map(({label, route: target}) => ({
    id: target.replaceAll("/", "-"),
    label,
    route: target,
  }))
}

export function elementsPlaygroundSectionRoute(route: ElementRoute): ElementRoute {
  return route === "div/scroll" ? "div" : route
}

export function elementsPlaygroundDock(route: ElementRoute): readonly PlaygroundNavigationItem<ElementDockAction>[] {
  return labelsForRoute(route).map((label) => {
    const target = (route === "div" || route === "div/scroll")
      ? divRouteFromDetail(label as DivDetail)
      : route
    return {id: label, label, route: dockAction(target, label)}
  })
}

export function elementsPlaygroundInfo(route: ElementRoute): PlaygroundInfoOptions {
  const group = elementsPlaygroundGroup(route)
  return {
    title: `${group} contract`,
    lines: [
      {id: "owner", label: "Owner: @ui/elements"},
      {id: "route", label: `Route: ${route}`},
      {id: "layout", label: "FlexBox local layout"},
      {id: "retained", label: "Engine retained preview parent"},
    ],
    status: route,
  }
}

function dockAction(route: ElementRoute, label: string): ElementDockAction {
  return `${route}${DOCK_SEPARATOR}${label}`
}

function defaultDockLabel(route: ElementRoute): string {
  if (route === "div/scroll") return "scroll"
  return labelsForRoute(route)[0] ?? route
}

export type ElementsPlaygroundObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  selectDock(action: ElementDockAction): Readonly<Record<string, unknown>>
  transformPreview(transform: Readonly<{x: number; y: number; scale: number}>): Readonly<Record<string, unknown>>
}>

declare global {
  var __elementsPlaygroundObserver: ElementsPlaygroundObserver | undefined
}

async function startElementsPlayground(): Promise<void> {
  const canvas = document.getElementById("stage-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("stage-canvas not found")
  document.documentElement.dataset.elementsPlayground = "starting"
  try {
    const runtime = await UiRuntime.create(canvas, {
      fontUrl: "/JetBrainsMono-Bold.ttf",
      virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
    })
    const router = new PlaygroundRouter<ElementRoute>(ELEMENT_PLAYGROUND_ROUTES, "div", {mode: "path"})
    const navigate = (route: ElementRoute): void => router.go(route)
    const catalogNavigate = (route: ElementRoute): void => navigate(route)
    const route = router.current
    const backdrop = new PlaygroundBackdropSurface()
    const catalog = new PlaygroundNavigationSurface<ElementRoute>({
      title: "Elements",
      items: ELEMENT_PLAYGROUND_CATALOG,
      route: GROUP_DEFAULT_ROUTE[elementsPlaygroundGroup(route)],
      onNavigate: catalogNavigate,
    })
    const sections = new PlaygroundNavigationSurface<ElementRoute>({
      title: elementsPlaygroundGroup(route),
      items: elementsPlaygroundSections(route),
      route: elementsPlaygroundSectionRoute(route),
      onNavigate: navigate,
    })
    let preview: ElementsPreviewSurface
    let dock: PlaygroundDockSurface<ElementDockAction>
    let publish = (): Readonly<Record<string, unknown>> => Object.freeze({})
    const selectDock = (action: ElementDockAction): void => {
      preview.applyDockAction(action)
      dock.setOptions({
        title: "Examples",
        items: elementsPlaygroundDock(router.current),
        route: preview.dockAction,
        onNavigate: selectDock,
      })
      runtime.handleResize()
      publish()
    }
    dock = new PlaygroundDockSurface<ElementDockAction>({
      title: "Examples",
      items: elementsPlaygroundDock(route),
      route: dockAction(route, defaultDockLabel(route)),
      onNavigate: selectDock,
    })
    const info = new PlaygroundInfoSurface(elementsPlaygroundInfo(route))
    preview = new ElementsPreviewSurface(route, navigate)
    const frames = (w: number, h: number) => planPlaygroundShell(w, h)

    runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
    runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
    runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
    runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
    runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
    runtime.addSurface(info, ({w, h}) => frames(w, h).info)

    const snapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
      route: router.current,
      catalog: catalog.diagnostics,
      sections: sections.diagnostics,
      dock: dock.diagnostics,
      info: info.diagnostics,
      preview: preview.diagnostics,
    })
    publish = (): Readonly<Record<string, unknown>> => {
      for (const surface of [catalog, sections, dock, info, preview]) surface.flushPendingRender()
      const current = snapshot()
      document.documentElement.dataset.elementsPlaygroundRoute = router.current
      document.documentElement.dataset.elementsPlaygroundRetained = JSON.stringify(current)
      return current
    }
    const applyRoute = (next: ElementRoute): void => {
      catalog.setOptions({
        title: "Elements",
        items: ELEMENT_PLAYGROUND_CATALOG,
        route: GROUP_DEFAULT_ROUTE[elementsPlaygroundGroup(next)],
        onNavigate: catalogNavigate,
      })
      sections.setOptions({
        title: elementsPlaygroundGroup(next),
        items: elementsPlaygroundSections(next),
        route: elementsPlaygroundSectionRoute(next),
        onNavigate: navigate,
      })
      preview.setRoute(next)
      dock.setOptions({
        title: "Examples",
        items: elementsPlaygroundDock(next),
        route: preview.dockAction,
        onNavigate: selectDock,
      })
      info.setOptions(elementsPlaygroundInfo(next))
      runtime.handleResize()
      publish()
    }

    router.subscribe(applyRoute)
    globalThis.__elementsPlaygroundObserver = Object.freeze({
      snapshot: publish,
      selectDock(action) {
        selectDock(action)
        return publish()
      },
      transformPreview(transform) {
        preview.transformPreview(transform)
        return publish()
      },
    })
    new ResizeObserver(() => {
      runtime.handleResize()
      publish()
    }).observe(canvas)
    runtime.handleResize()
    publish()
    document.documentElement.dataset.elementsPlayground = "ready"
  } catch (error) {
    document.documentElement.dataset.elementsPlayground = "error"
    document.documentElement.dataset.elementsPlaygroundError = error instanceof Error ? error.message : String(error)
    throw error
  }
}

if (typeof document !== "undefined") await startElementsPlayground()
