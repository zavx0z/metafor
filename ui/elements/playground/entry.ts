import {
  Element,
  UiCanvas,
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
  type CssColor,
  type UiSize,
} from "@metafor/elements"
import {VirtualRouter} from "../../playground/virtual-router.ts"

type ElementRoute =
  | "overview"
  | "card"
  | "padding"
  | "flex"
  | "flexCss"
  | "grid"
  | "textBlock"
  | "image"
  | "css"
  | "events"
  | "theme"
type CssSection = "padding" | "flex" | "border" | "color" | "typography"
type ElementTone = "cyan" | "green" | "orange" | "red"
type ElementDensity = "compact" | "regular" | "air"

type RouteMeta = {
  id: ElementRoute
  label: string
}

const ROUTE_IDS = ["overview", "card", "padding", "flex", "flexCss", "grid", "textBlock", "image", "css", "events", "theme"] as const
const ROUTES: readonly RouteMeta[] = [
  {id: "overview", label: "Overview"},
  {id: "card", label: "Card"},
  {id: "padding", label: "Padding"},
  {id: "flex", label: "Flex"},
  {id: "flexCss", label: "Flex CSS"},
  {id: "grid", label: "Grid"},
  {id: "textBlock", label: "Text Block"},
  {id: "image", label: "Image"},
  {id: "css", label: "CSS"},
  {id: "events", label: "Events"},
  {id: "theme", label: "Theme"},
]

const CSS_SECTIONS: readonly CssSection[] = ["padding", "flex", "border", "color", "typography"]
const ELEMENT_TONES: readonly ElementTone[] = ["cyan", "green", "orange", "red"]
const ELEMENT_DENSITIES: readonly ElementDensity[] = ["compact", "regular", "air"]

const TRANSITION_MS = 260
const LAYOUT_Z = -0.00012
const BACKDROP_Z = -0.00018
const ELEMENTS_BACKDROP = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="none">
    <defs>
      <radialGradient id="cyan" cx="25%" cy="20%" r="31%">
        <stop offset="0%" stop-color="rgb(111,211,255)" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="rgb(111,211,255)" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="green" cx="76%" cy="70%" r="33%">
        <stop offset="0%" stop-color="rgb(82,196,123)" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="rgb(82,196,123)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="#07101b"/>
    <rect width="1920" height="1080" fill="url(#cyan)"/>
    <rect width="1920" height="1080" fill="url(#green)"/>
  </svg>
`)

class ElementsPlayground extends Element {
  readonly #router = new VirtualRouter<ElementRoute>(ROUTE_IDS, "overview")
  readonly #unsubscribe: () => void
  #route: ElementRoute = this.#router.current
  #previousRoute: ElementRoute = this.#router.current
  #transitionStarted = performance.now() - TRANSITION_MS
  #cssSection: CssSection = "padding"
  #tone: ElementTone = "cyan"
  #radius = 34
  #density: ElementDensity = "regular"
  #dockSelection = "div"
  #clicks = 0
  #state = "idle"
  #events: string[] = ["ready: hover, press, release, click"]

  constructor() {
    super({bgColor: null, borderColor: null})
    this.#unsubscribe = this.#router.subscribe((route, previous) => {
      this.#previousRoute = previous
      this.#route = route
      this.#transitionStarted = performance.now()
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
    const paramsW = Math.round(Math.max(246, Math.min(310, stageW * 0.23)))
    const dockH = Math.max(86, Math.min(112, stageH * 0.15))
    const playW = stageW - catalogW - paramsW - gap * 2
    const playH = stageH - dockH - gap
    const playX = stageX + catalogW + gap
    const paramsX = playX + playW + gap

    this.#catalog(stageX, stageY, catalogW, stageH)
    this.#playground(playX, stageY, playW, playH)
    this.#dock(playX, stageY + playH + gap, playW, dockH)
    this.#parameters(paramsX, stageY, paramsW, stageH)

    const t = transitionProgress(this.#transitionStarted)
    if (t < 1) requestAnimationFrame(() => this.requestRender())
  }

  #backdrop(): void {
    this.drawImage(ELEMENTS_BACKDROP, 0, 0, this.rectW, this.rectH, {fit: "cover", z: BACKDROP_Z})
  }

  #catalog(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      style: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })

    const top = y + 24
    const gap = 8
    const rowH = Math.max(28, Math.min(38, (h - 48 - gap * (ROUTES.length - 1)) / ROUTES.length))
    for (const [i, route] of ROUTES.entries()) {
      const active = route.id === this.#route
      const by = top + i * (rowH + gap)
      button(this, x + 18, by, w - 36, rowH, {
        children: route.label,
        onClick: () => this.#router.go(route.id),
        style: {
          background: active ? "rgba(111, 211, 255, 0.14)" : "rgba(255, 255, 255, 0.035)",
          borderColor: active ? this.#tone : "rgba(214, 231, 255, 0.16)",
          color: active ? "text" : "muted",
          fontSize: 11,
          borderRadius: 999,
        },
      })
    }
  }

  #playground(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      style: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: this.#radius, zIndex: LAYOUT_Z},
    })
    const progress = easeOutCubic(transitionProgress(this.#transitionStarted))
    const direction = ROUTE_IDS.indexOf(this.#route) >= ROUTE_IDS.indexOf(this.#previousRoute) ? 1 : -1
    const slideX = Math.round((1 - progress) * 30 * direction)
    const pad = this.#contentPad()

    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#route === "overview") this.#overview(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "card") this.#cardRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "padding") this.#paddingRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "flex") this.#flexRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "flexCss") this.#flexCssRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "grid") this.#gridRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "textBlock") this.#textBlockRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "image") this.#imageRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "css") this.#css(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else if (this.#route === "events") this.#eventsRoute(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    else this.#theme(x + pad + slideX, y + pad, w - pad * 2, h - pad * 2)
    this.popClip()
  }

  #dock(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      style: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 34, zIndex: LAYOUT_Z},
    })
    const items = this.#dockItems()
    const itemGap = 10
    const itemW = Math.max(82, Math.min(148, (w - 48 - itemGap * (items.length - 1)) / items.length))
    const rowW = itemW * items.length + itemGap * (items.length - 1)
    const startX = x + (w - rowW) / 2
    for (const [i, item] of items.entries()) {
      const active = item.active ?? this.#dockSelection === item.label
      button(this, startX + i * (itemW + itemGap), y + (h - 38) / 2, itemW, 38, {
        children: item.label,
        onClick: item.onClick,
        style: {
          background: active ? "rgba(111, 211, 255, 0.13)" : "rgba(255, 255, 255, 0.035)",
          borderColor: active ? this.#tone : "rgba(214, 231, 255, 0.16)",
          color: active ? "text" : "muted",
          fontSize: 11,
          borderRadius: 999,
        },
      })
    }
  }

  #parameters(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      style: {background: "rgba(12, 18, 30, 0.78)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 36, zIndex: LAYOUT_Z},
    })
    this.#segmentedNumber(x + 24, y + 34, w - 48, "radius", [
      ["24", 24],
      ["34", 34],
      ["999", 999],
    ])
    this.#toneGroup(x + 24, y + 132, w - 48)
    this.#densityGroup(x + 24, y + 230, w - 48)

    div(this, x + 24, y + h - 148, w - 48, 104, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.12)", borderRadius: this.#radius},
    })
    button(this, x + 48, y + h - 112, w - 96, 42, {
      children: `${this.#dockSelection} preview`,
      style: {borderRadius: this.#radius, borderColor: this.#tone, fontSize: 11},
    })
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
          this.requestRender()
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
          this.requestRender()
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
          this.requestRender()
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

  #dockItems(): Array<{label: string; active?: boolean; onClick: () => void}> {
    if (this.#route === "css") {
      return CSS_SECTIONS.map((section) => ({
        label: section,
        active: this.#cssSection === section,
        onClick: () => {
          this.#cssSection = section
          this.#dockSelection = section
          this.requestRender()
        },
      }))
    }
    if (this.#route === "theme") {
      return ELEMENT_TONES.map((tone) => ({
        label: tone,
        active: this.#tone === tone,
        onClick: () => {
          this.#tone = tone
          this.#dockSelection = tone
          this.requestRender()
        },
      }))
    }
    if (this.#route === "events") {
      return ["hover", "press", "release", "click", "disabled"].map((label) => ({
        label,
        active: this.#state === (label === "press" ? "active" : label === "release" ? "released" : label),
        onClick: () => {
          if (label === "click") this.#clicks += 1
          const state = label === "press" ? "active" : label === "release" ? "released" : label
          this.#record(state, `dock:${label}`)
          this.#dockSelection = label
        },
      }))
    }
    return labelsForRoute(this.#route).map((label) => ({
      label,
      onClick: () => {
        this.#dockSelection = label
        this.requestRender()
      },
    }))
  }

  #overview(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Elements", style: {fontSize: 22}})

    const cardW = (w - 32) / 3
    featureCard(this, x, y + 58, cardW, 118, "HTML names", "div / span / button / input / img")
    featureCard(this, x + cardW + 16, y + 58, cardW, 118, "CSS props", "style.background / padding / flex")
    featureCard(this, x + (cardW + 16) * 2, y + 58, cardW, 118, "Old coverage", "Card / Flex / Image / Theme")

    div(this, x, y + 214, w, 168, {
      style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30},
    })
    h3(this, x + 26, y + 240, w - 52, 24, {children: "API", style: {fontSize: 15}})
    codeLine(this, x + 26, y + 282, w - 52, "button(this, x, y, 180, 46, { children: \"Run\", style: { borderRadius: 999 } })")
    codeLine(this, x + 26, y + 320, w - 52, "div(this, x, y, w, h, { style: { background: \"glass\", padding: 24 } })")
  }

  #cardRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Card", style: {fontSize: 22}})

    const leftW = Math.floor(w * 0.52)
    div(this, x, y + 58, leftW, 358, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, leftW - 56, 24, {children: "Card basics", style: {fontSize: 15}})
    div(this, x + 28, y + 130, leftW - 56, 82, {style: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.36)", borderRadius: 24}})
    h2(this, x + 52, y + 154, leftW - 104, 26, {children: "h2 inside div", style: {fontSize: 16}})
    p(this, x + 52, y + 184, leftW - 104, 22, {children: "p text clipped inside the card", style: {fontSize: 11, color: "muted"}})
    input(this, x + 28, y + 240, leftW - 56, 42, {value: "input value", active: true})
    button(this, x + 28, y + 304, 168, 44, {children: "button"})
    button(this, x + 212, y + 304, 168, 44, {children: "disabled", disabled: true})

    const rightX = x + leftW + 22
    const rightW = w - leftW - 22
    div(this, rightX, y + 58, rightW, 358, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, rightX + 28, y + 86, rightW - 56, 24, {children: "Props", style: {fontSize: 15}})
    propRow(this, rightX + 28, y + 132, rightW - 56, "background", "\"glass\" | rgba(...) | token")
    propRow(this, rightX + 28, y + 178, rightW - 56, "borderRadius", "999 | \"24px\"")
    propRow(this, rightX + 28, y + 224, rightW - 56, "color", "\"cyan\" | \"muted\" | #fff")
    propRow(this, rightX + 28, y + 270, rightW - 56, "paddingX", "number | \"px\"")
    propRow(this, rightX + 28, y + 316, rightW - 56, "zIndex", "small layered offsets")
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
    h2(this, x, y, w, 34, {children: "Multi-Card Grid", style: {fontSize: 22}})

    const gap = 20
    const cardW = (w - gap) / 2
    const cardH = 166
    const cards = [
      ["Layout", "outer card + inner glass panes", "cyan"],
      ["State", "one canvas tree, many hit regions", "green"],
      ["Text", "clipped and measured text", "orange"],
      ["Theme", "shared Vision tokens", "red"],
    ] as const
    for (const [i, [title, body, color]] of cards.entries()) {
      const cx = x + (i % 2) * (cardW + gap)
      const cy = y + 58 + Math.floor(i / 2) * (cardH + gap)
      div(this, cx + 22, cy + 26, 14, 52, {style: {background: color, borderColor: null, borderRadius: 999, opacity: 0.72, zIndex: 0.00002}})
      h3(this, cx + 58, cy + 26, cardW - 84, 24, {children: title, style: {fontSize: 15}})
      p(this, cx + 58, cy + 62, cardW - 84, 26, {children: body, style: {fontSize: 12, color: "muted"}})
      button(this, cx + 22, cy + 104, 148, 40, {children: "Select", style: {fontSize: 11}})
    }
  }

  #textBlockRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Text Block", style: {fontSize: 22}})

    h3(this, x + 28, y + 86, 280, 24, {children: "Measured multiline text", style: {fontSize: 15}})
    const copy =
      "Card.drawTextBlock keeps long content inside a fixed visual box. It wraps, shrinks when needed and clips with predictable canvas metrics."
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
          this.requestRender()
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
    this.requestRender()
  }
}

function transitionProgress(started: number): number {
  return Math.min(1, Math.max(0, (performance.now() - started) / TRANSITION_MS))
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function pill(host: Element, x: number, y: number, w: number, h: number, label: string, background: CssColor | "glass", color: CssColor): void {
  div(host, x, y, w, h, {style: {background, borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 999}})
  span(host, x + 12, y, w - 24, h, {children: label, style: {fontSize: 11, color}})
}

function featureCard(host: Element, x: number, y: number, w: number, h: number, title: string, value: string): void {
  div(host, x, y, w, h, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
  h3(host, x + 24, y + 24, w - 48, 24, {children: title, style: {fontSize: 15}})
  span(host, x + 24, y + 68, w - 48, 24, {children: value, style: {fontSize: 12, color: "text"}})
}

function propRow(host: Element, x: number, y: number, w: number, name: string, value: string): void {
  div(host, x, y, w, 34, {style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17}})
  span(host, x + 16, y, 130, 34, {children: name, style: {fontSize: 11, color: "cyan"}})
  span(host, x + 152, y, w - 168, 34, {children: value, style: {fontSize: 11, color: "muted"}})
}

function codeLine(host: Element, x: number, y: number, w: number, text: string): void {
  div(host, x, y, w, 28, {style: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 14}})
  span(host, x + 14, y, w - 28, 28, {children: text, style: {fontSize: 10, color: "text"}})
}

function demoCell(host: Element, x: number, y: number, w: number, h: number, label: string, color: CssColor): void {
  div(host, x, y, w, h, {style: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 24, opacity: 0.74, zIndex: 0.00005}})
  span(host, x + 14, y, Math.max(1, w - 28), h, {children: label, style: {fontSize: 11, color: "text"}})
}

function labelsForRoute(route: ElementRoute): readonly string[] {
  if (route === "overview") return ["div", "span", "button", "input", "img"]
  if (route === "card") return ["container", "nested", "input", "button"]
  if (route === "padding") return ["padding", "paddingX", "paddingTop", "content"]
  if (route === "flex") return ["flexRow", "flexColumn", "grow", "stretch"]
  if (route === "flexCss") return ["px", "percent", "fr", "grow"]
  if (route === "grid") return ["layout", "state", "text", "theme"]
  if (route === "textBlock") return ["wrap", "shrink", "clip", "maxLines"]
  if (route === "image") return ["cover", "contain", "opacity", "src"]
  return ["style", "tokens", "radius", "glass"]
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg.trim())))}`
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ElementsPlayground(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
requestAnimationFrame(() => ui.handleResize())
