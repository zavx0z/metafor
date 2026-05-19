import {Element, UiCanvas, button, div, h1, h2, h3, hr, input, p, span, type CssColor} from "@metafor/elements"
import {VirtualRouter} from "../../playground/virtual-router.ts"

type ElementRoute = "overview" | "structure" | "css" | "events" | "tokens"
type CssSection = "padding" | "flex" | "border" | "color" | "typography"

type RouteMeta = {
  id: ElementRoute
  label: string
  hint: string
}

const ROUTE_IDS = ["overview", "structure", "css", "events", "tokens"] as const
const ROUTES: readonly RouteMeta[] = [
  {id: "overview", label: "Overview", hint: "HTML names"},
  {id: "structure", label: "Structure", hint: "div / span / input"},
  {id: "css", label: "CSS", hint: "padding / flex / border"},
  {id: "events", label: "Events", hint: "hover / press / click"},
  {id: "tokens", label: "Tokens", hint: "CSS-like values"},
]

const CSS_SECTIONS: readonly CssSection[] = ["padding", "flex", "border", "color", "typography"]

const TRANSITION_MS = 260

class ElementsPlayground extends Element {
  readonly #router = new VirtualRouter<ElementRoute>(ROUTE_IDS, "overview")
  readonly #unsubscribe: () => void
  #route: ElementRoute = this.#router.current
  #previousRoute: ElementRoute = this.#router.current
  #transitionStarted = performance.now() - TRANSITION_MS
  #cssSection: CssSection = "padding"
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

    const stageW = Math.max(980, Math.min(1440, this.rectW - 96))
    const stageH = Math.max(680, Math.min(820, this.rectH - 96))
    const stageX = (this.rectW - stageW) / 2
    const stageY = (this.rectH - stageH) / 2
    const railW = 286
    const gap = 26
    const contentX = stageX + railW + gap + 28
    const contentY = stageY + 166
    const contentW = stageW - railW - gap - 56
    const contentH = stageH - 204

    div(this, stageX, stageY, stageW, stageH, {
      sx: {
        background: "rgba(20, 28, 43, 0.82)",
        borderColor: "rgba(214, 231, 255, 0.42)",
        borderRadius: 44,
        zIndex: 0.00001,
      },
    })
    div(this, stageX + 18, stageY + 18, stageW - 36, stageH - 36, {
      sx: {
        background: "rgba(255, 255, 255, 0.035)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderRadius: 36,
        zIndex: 0.00002,
      },
    })

    this.#header(stageX + 34, stageY + 28, stageW - 68)
    this.#routeRail(stageX + 34, stageY + 166, railW, contentH)
    this.#content(contentX, contentY, contentW, contentH)

    const t = transitionProgress(this.#transitionStarted)
    if (t < 1) requestAnimationFrame(() => this.requestRender())
  }

  #backdrop(): void {
    div(this, 0, 0, this.rectW, this.rectH, {sx: {background: "rgba(3, 8, 15, 1)", borderColor: null, borderRadius: 0, zIndex: -1}})
    div(this, this.rectW * 0.08, this.rectH * 0.12, 560, 560, {
      sx: {background: "rgba(69, 160, 255, 0.16)", borderColor: null, borderRadius: 280, zIndex: -0.95},
    })
    div(this, this.rectW * 0.64, this.rectH * 0.06, 620, 620, {
      sx: {background: "rgba(116, 226, 255, 0.12)", borderColor: null, borderRadius: 310, zIndex: -0.95},
    })
    div(this, this.rectW * 0.58, this.rectH * 0.68, 520, 300, {
      sx: {background: "rgba(96, 255, 188, 0.10)", borderColor: null, borderRadius: 150, zIndex: -0.95},
    })
  }

  #header(x: number, y: number, w: number): void {
    pill(this, x, y, 154, 30, "@metafor/elements", "rgba(111, 211, 255, 0.12)", "cyan")
    pill(this, x + 168, y, 128, 30, "canvas only", "rgba(255, 255, 255, 0.06)", "muted")
    h1(this, x, y + 42, Math.min(620, w - 330), 46, {children: "Vision elements", sx: {fontSize: 30}})
    p(this, x, y + 86, Math.min(720, w - 330), 30, {
      children: "Low-level pseudo HTML: div, span, p, h1-h6, input, button, hr with CSS-like sx props.",
      sx: {fontSize: 13, color: "muted"},
    })

    const route = routeById(this.#route)
    div(this, x + w - 310, y + 18, 310, 82, {
      sx: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.18)", borderRadius: 28},
    })
    span(this, x + w - 282, y + 40, 260, 24, {children: `virtual route  #/${route.id}`, sx: {fontSize: 12, color: "cyan"}})
    span(this, x + w - 282, y + 68, 260, 24, {children: route.hint, sx: {fontSize: 12, color: "muted"}})
  }

  #routeRail(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      sx: {background: "rgba(7, 12, 21, 0.76)", borderColor: "rgba(214, 231, 255, 0.18)", borderRadius: 34},
    })
    h2(this, x + 26, y + 26, w - 52, 28, {children: "Sections", sx: {fontSize: 17}})
    p(this, x + 26, y + 58, w - 52, 44, {children: "Hash router, canvas navigation and route transitions.", sx: {fontSize: 12, color: "muted"}})
    hr(this, x + 26, y + 120, w - 52, {sx: {background: "rgba(214, 231, 255, 0.16)"}})

    for (const [i, route] of ROUTES.entries()) {
      const active = route.id === this.#route
      const by = y + 150 + i * 76
      if (active) {
        div(this, x + 18, by - 8, w - 36, 64, {
          sx: {background: "rgba(111, 211, 255, 0.10)", borderColor: "rgba(111, 211, 255, 0.42)", borderRadius: 24},
        })
      }
      button(this, x + 30, by, w - 60, 42, {
        children: route.label,
        onClick: () => this.#router.go(route.id),
        sx: {
          background: active ? "rgba(62, 92, 122, 0.76)" : "rgba(255, 255, 255, 0.035)",
          borderColor: active ? "cyan" : "rgba(214, 231, 255, 0.18)",
          color: active ? "text" : "muted",
          fontSize: 12,
          borderRadius: 21,
        },
      })
      span(this, x + 48, by + 48, w - 96, 18, {children: route.hint, sx: {fontSize: 10, color: active ? "cyan" : "muted"}})
    }
  }

  #content(x: number, y: number, w: number, h: number): void {
    div(this, x, y, w, h, {
      sx: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 38},
    })
    const progress = easeOutCubic(transitionProgress(this.#transitionStarted))
    const direction = ROUTE_IDS.indexOf(this.#route) >= ROUTE_IDS.indexOf(this.#previousRoute) ? 1 : -1
    const slideX = Math.round((1 - progress) * 30 * direction)
    const shineX = x + 24 + (w - 108) * progress
    div(this, shineX, y + 18, 84, 4, {sx: {background: "rgba(111, 211, 255, 0.58)", borderColor: null, borderRadius: 2}})

    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#route === "overview") this.#overview(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "structure") this.#structure(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "css") this.#css(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "events") this.#eventsRoute(x + 34 + slideX, y + 34, w - 68, h - 68)
    else this.#tokens(x + 34 + slideX, y + 34, w - 68, h - 68)
    this.popClip()
  }

  #overview(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Pseudo HTML, rendered by WebGPU", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "The demo itself is built with @metafor/elements. No DOM buttons, no native forms.", sx: {fontSize: 13, color: "muted"}})

    const cardW = (w - 32) / 3
    featureCard(this, x, y + 92, cardW, 156, "HTML names", "div / span / button / input", "Use familiar element names for the low layer.")
    featureCard(this, x + cardW + 16, y + 92, cardW, 156, "CSS-like sx", "background, borderRadius, color", "Props follow CSS naming and values where practical.")
    featureCard(this, x + (cardW + 16) * 2, y + 92, cardW, 156, "Vision default", "glass / capsule / glow", "Every primitive starts from the same visual language.")

    div(this, x, y + 286, w, 168, {
      sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30},
    })
    h3(this, x + 26, y + 312, w - 52, 24, {children: "Example syntax", sx: {fontSize: 15}})
    codeLine(this, x + 26, y + 354, w - 52, "button(this, x, y, 180, 46, { children: \"Run\", sx: { borderRadius: 999 } })")
    codeLine(this, x + 26, y + 392, w - 52, "div(this, x, y, w, h, { sx: { background: \"glass\", padding: 24 } })")
  }

  #structure(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Elements compose the surface", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "Card is the canvas host; pseudo HTML elements define the visual structure inside it.", sx: {fontSize: 13, color: "muted"}})

    const leftW = Math.floor(w * 0.52)
    div(this, x, y + 92, leftW, 358, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 120, leftW - 56, 24, {children: "Live element stack", sx: {fontSize: 15}})
    div(this, x + 28, y + 164, leftW - 56, 82, {sx: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.36)", borderRadius: 24}})
    h2(this, x + 52, y + 188, leftW - 104, 26, {children: "h2 inside div", sx: {fontSize: 16}})
    p(this, x + 52, y + 218, leftW - 104, 22, {children: "p text is clipped and aligned inside the card.", sx: {fontSize: 11, color: "muted"}})
    input(this, x + 28, y + 274, leftW - 56, 42, {value: "input value: route=structure", active: true})
    button(this, x + 28, y + 338, 168, 44, {children: "button"})
    button(this, x + 212, y + 338, 168, 44, {children: "disabled", disabled: true})

    const rightX = x + leftW + 22
    const rightW = w - leftW - 22
    div(this, rightX, y + 92, rightW, 358, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, rightX + 28, y + 120, rightW - 56, 24, {children: "CSS-like props", sx: {fontSize: 15}})
    propRow(this, rightX + 28, y + 166, rightW - 56, "background", "\"glass\" | rgba(...) | token")
    propRow(this, rightX + 28, y + 212, rightW - 56, "borderRadius", "999 | \"24px\"")
    propRow(this, rightX + 28, y + 258, rightW - 56, "color", "\"cyan\" | \"muted\" | #fff")
    propRow(this, rightX + 28, y + 304, rightW - 56, "paddingX", "number | \"px\"")
    propRow(this, rightX + 28, y + 350, rightW - 56, "zIndex", "small layered offsets")
  }

  #eventsRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "HTML-like events with visible states", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "Hover, press, release, click and disabled state are rendered by the same button primitive.", sx: {fontSize: 13, color: "muted"}})

    div(this, x, y + 92, w, 366, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 120, 260, 24, {children: "Event visualization", sx: {fontSize: 15}})
    pill(this, x + w - 278, y + 116, 250, 30, `state=${this.#state} clicks=${this.#clicks}`, "rgba(111, 211, 255, 0.10)", "cyan")
    button(this, x + 28, y + 174, 190, 50, {
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
    button(this, x + 238, y + 174, 190, 50, {children: "Forbidden", disabled: true})

    for (const [i, label] of ["idle", "hover", "active", "clicked", "disabled"].entries()) {
      const active = this.#state === label
      pill(this, x + 28 + i * 126, y + 264, 106, 32, label, active ? "rgba(111, 211, 255, 0.14)" : "rgba(255, 255, 255, 0.04)", active ? "cyan" : "muted")
    }

    div(this, x + w - 360, y + 166, 332, 216, {sx: {background: "rgba(4, 8, 14, 0.48)", borderColor: "rgba(214, 231, 255, 0.12)", borderRadius: 24}})
    for (const [i, event] of this.#events.entries()) {
      span(this, x + w - 332, y + 192 + i * 34, 276, 24, {children: event, sx: {fontSize: 12, color: i === 0 ? "text" : "muted"}})
    }
  }

  #css(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "CSS-like props and values", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {
      children: "Elements expose a practical CSS subset: padding, flex-like layout values, borders, colors and typography.",
      sx: {fontSize: 13, color: "muted"},
    })

    const tabsY = y + 92
    const tabW = (w - 48) / CSS_SECTIONS.length
    for (const [i, section] of CSS_SECTIONS.entries()) {
      const active = this.#cssSection === section
      button(this, x + i * (tabW + 12), tabsY, tabW, 38, {
        children: section,
        onClick: () => {
          this.#cssSection = section
          this.requestRender()
        },
        sx: {
          background: active ? "rgba(111, 211, 255, 0.14)" : "rgba(255, 255, 255, 0.035)",
          borderColor: active ? "cyan" : "rgba(214, 231, 255, 0.16)",
          color: active ? "text" : "muted",
          fontSize: 11,
          borderRadius: 999,
        },
      })
    }

    div(this, x, y + 154, w, 300, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    if (this.#cssSection === "padding") this.#cssPadding(x + 28, y + 184, w - 56)
    else if (this.#cssSection === "flex") this.#cssFlex(x + 28, y + 184, w - 56)
    else if (this.#cssSection === "border") this.#cssBorder(x + 28, y + 184, w - 56)
    else if (this.#cssSection === "color") this.#cssColor(x + 28, y + 184, w - 56)
    else this.#cssTypography(x + 28, y + 184, w - 56)
  }

  #cssPadding(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "padding / paddingX / paddingY", sx: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(440, w), "padding", "24 | \"24px\"")
    propRow(this, x, y + 92, Math.min(440, w), "paddingX", "horizontal override")
    propRow(this, x, y + 138, Math.min(440, w), "paddingTop", "per-side override")
    const demoX = x + Math.min(490, w * 0.48)
    const demoW = w - (demoX - x)
    div(this, demoX, y + 44, demoW, 156, {sx: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.32)", borderRadius: 28, padding: 28}})
    div(this, demoX + 28, y + 72, demoW - 56, 100, {sx: {background: "rgba(255, 255, 255, 0.07)", borderColor: "rgba(255, 255, 255, 0.18)", borderRadius: 22}})
    span(this, demoX + 52, y + 108, demoW - 104, 24, {children: "content after padding", sx: {fontSize: 12, color: "text"}})
  }

  #cssFlex(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "display / gap / alignItems / justifyContent", sx: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(460, w), "display", "\"flex\"")
    propRow(this, x, y + 92, Math.min(460, w), "gap", "12 | \"12px\"")
    propRow(this, x, y + 138, Math.min(460, w), "justifyContent", "start | center | space-between")
    const demoX = x + Math.min(510, w * 0.50)
    const itemW = Math.max(62, (w - (demoX - x) - 88) / 3)
    div(this, demoX, y + 54, w - (demoX - x), 136, {sx: {background: "rgba(255, 255, 255, 0.045)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 28}})
    for (const [i, color] of (["cyan", "green", "orange"] as const).entries()) {
      div(this, demoX + 28 + i * (itemW + 16), y + 88, itemW, 68, {sx: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 24}})
    }
  }

  #cssBorder(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "borderRadius / borderColor / borderWidth", sx: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "borderRadius", "999 | 32 | \"32px\"")
    propRow(this, x, y + 92, Math.min(450, w), "borderColor", "token | rgba(...) | null")
    propRow(this, x, y + 138, Math.min(450, w), "borderWidth", "1 | 2")
    const demoX = x + Math.min(500, w * 0.50)
    div(this, demoX, y + 52, 120, 120, {sx: {background: "rgba(111, 211, 255, 0.10)", borderColor: "cyan", borderRadius: 28}})
    div(this, demoX + 150, y + 52, 180, 58, {sx: {background: "rgba(82, 196, 123, 0.10)", borderColor: "green", borderRadius: 999}})
    div(this, demoX + 150, y + 130, 180, 58, {sx: {background: "rgba(255, 127, 111, 0.10)", borderColor: "red", borderRadius: 14}})
  }

  #cssColor(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "background / backgroundColor / color", sx: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "background", "\"glass\" | token | rgba(...)")
    propRow(this, x, y + 92, Math.min(450, w), "color", "\"text\" | \"muted\" | \"cyan\"")
    propRow(this, x, y + 138, Math.min(450, w), "opacity", "0..1")
    const demoX = x + Math.min(500, w * 0.50)
    for (const [i, color] of (["cyan", "green", "orange", "red"] as const).entries()) {
      div(this, demoX + i * 78, y + 62, 58, 104, {sx: {background: color, borderColor: "rgba(255, 255, 255, 0.24)", borderRadius: 24, opacity: 0.84}})
    }
  }

  #cssTypography(x: number, y: number, w: number): void {
    h3(this, x, y, w, 24, {children: "fontSize / lineHeight / text color", sx: {fontSize: 15}})
    propRow(this, x, y + 46, Math.min(450, w), "fontSize", "10 | 13 | 22")
    propRow(this, x, y + 92, Math.min(450, w), "lineHeight", "number | px")
    propRow(this, x, y + 138, Math.min(450, w), "maxWidth", "drawText clipping")
    const demoX = x + Math.min(500, w * 0.50)
    h1(this, demoX, y + 50, w - (demoX - x), 36, {children: "h1 title", sx: {fontSize: 24}})
    h2(this, demoX, y + 96, w - (demoX - x), 28, {children: "h2 section", sx: {fontSize: 17}})
    p(this, demoX, y + 134, w - (demoX - x), 28, {children: "p text with muted tone and clipping", sx: {fontSize: 12, color: "muted"}})
  }

  #tokens(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Vision tokens, CSS values", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "The low layer accepts palette tokens and CSS colors. Defaults stay glass-first.", sx: {fontSize: 13, color: "muted"}})

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
      const cy = y + 100 + Math.floor(i / 3) * 126
      div(this, cx, cy, swatchW, 96, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 28}})
      div(this, cx + 22, cy + 24, 52, 52, {sx: {background: color, borderColor: "rgba(255, 255, 255, 0.22)", borderRadius: 18}})
      span(this, cx + 92, cy + 30, swatchW - 112, 24, {children: label, sx: {fontSize: 13, color: label === "glass" ? "text" : color}})
      span(this, cx + 92, cy + 58, swatchW - 112, 20, {children: `sx={{ color: "${label}" }}`, sx: {fontSize: 10, color: "muted"}})
    }

    div(this, x, y + 374, w, 78, {sx: {background: "rgba(111, 211, 255, 0.08)", borderColor: "rgba(111, 211, 255, 0.28)", borderRadius: 28}})
    span(this, x + 28, y + 404, w - 56, 24, {children: "borderRadius=999 creates the Vision-style capsule control without another component.", sx: {fontSize: 12, color: "text"}})
  }

  #record(state: string, event: string): void {
    this.#state = state
    this.#events = [event, ...this.#events].slice(0, 5)
    this.requestRender()
  }
}

function routeById(id: ElementRoute): RouteMeta {
  return ROUTES.find((route) => route.id === id) ?? ROUTES[0]!
}

function transitionProgress(started: number): number {
  return Math.min(1, Math.max(0, (performance.now() - started) / TRANSITION_MS))
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function pill(host: Element, x: number, y: number, w: number, h: number, label: string, background: CssColor | "glass", color: CssColor): void {
  div(host, x, y, w, h, {sx: {background, borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 999}})
  span(host, x + 12, y, w - 24, h, {children: label, sx: {fontSize: 11, color}})
}

function featureCard(host: Element, x: number, y: number, w: number, h: number, title: string, value: string, text: string): void {
  div(host, x, y, w, h, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
  h3(host, x + 24, y + 24, w - 48, 24, {children: title, sx: {fontSize: 15}})
  span(host, x + 24, y + 62, w - 48, 24, {children: value, sx: {fontSize: 12, color: "text"}})
  p(host, x + 24, y + 98, w - 48, 38, {children: text, sx: {fontSize: 11, color: "muted"}})
}

function propRow(host: Element, x: number, y: number, w: number, name: string, value: string): void {
  div(host, x, y, w, 34, {sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 17}})
  span(host, x + 16, y, 130, 34, {children: name, sx: {fontSize: 11, color: "cyan"}})
  span(host, x + 152, y, w - 168, 34, {children: value, sx: {fontSize: 11, color: "muted"}})
}

function codeLine(host: Element, x: number, y: number, w: number, text: string): void {
  div(host, x, y, w, 28, {sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 14}})
  span(host, x + 14, y, w - 28, 28, {children: text, sx: {fontSize: 10, color: "text"}})
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ElementsPlayground(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
requestAnimationFrame(() => ui.handleResize())
