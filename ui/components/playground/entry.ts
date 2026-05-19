import {Element, UiCanvas, div, h1, h2, h3, p, span, type CssColor} from "@metafor/elements"
import {Badge, Button, Card, Divider, TextField} from "@metafor/components"
import {VirtualRouter} from "../../playground/virtual-router.ts"

type ComponentRoute = "overview" | "buttons" | "forms" | "feedback"

type RouteMeta = {
  id: ComponentRoute
  label: string
  hint: string
  color: "primary" | "success" | "warning" | "error" | "neutral"
}

const ROUTE_IDS = ["overview", "buttons", "forms", "feedback"] as const
const ROUTES: readonly RouteMeta[] = [
  {id: "overview", label: "Overview", hint: "MUI-like API", color: "primary"},
  {id: "buttons", label: "Buttons", hint: "variant / color / size", color: "success"},
  {id: "forms", label: "Forms", hint: "TextField / layout", color: "warning"},
  {id: "feedback", label: "Feedback", hint: "Badge / events", color: "error"},
]

const TRANSITION_MS = 260

class ComponentsPlayground extends Element {
  readonly #router = new VirtualRouter<ComponentRoute>(ROUTE_IDS, "overview")
  readonly #unsubscribe: () => void
  #route: ComponentRoute = this.#router.current
  #previousRoute: ComponentRoute = this.#router.current
  #transitionStarted = performance.now() - TRANSITION_MS
  #events = ["ready: hover, press, release, click"]
  #eventCount = 0
  #status = "ready"
  #activePlan = "Vision Pro"

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

    const stageW = Math.max(1000, Math.min(1460, this.rectW - 96))
    const stageH = Math.max(690, Math.min(830, this.rectH - 96))
    const stageX = (this.rectW - stageW) / 2
    const stageY = (this.rectH - stageH) / 2

    Card(this, stageX, stageY, stageW, stageH, {
      variant: "glass",
      sx: {
        background: "rgba(20, 27, 42, 0.84)",
        borderColor: "rgba(226, 240, 255, 0.40)",
        borderRadius: 44,
        zIndex: 0.00001,
      },
    })
    Card(this, stageX + 18, stageY + 18, stageW - 36, stageH - 36, {
      variant: "glass",
      sx: {
        background: "rgba(255, 255, 255, 0.035)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderRadius: 36,
        zIndex: 0.00002,
      },
    })

    this.#header(stageX + 36, stageY + 30, stageW - 72)
    this.#routeTabs(stageX + 36, stageY + 166, stageW - 72)
    this.#content(stageX + 36, stageY + 248, stageW - 72, stageH - 284)

    const t = transitionProgress(this.#transitionStarted)
    if (t < 1) requestAnimationFrame(() => this.requestRender())
  }

  #backdrop(): void {
    div(this, 0, 0, this.rectW, this.rectH, {sx: {background: "rgba(3, 7, 13, 1)", borderColor: null, borderRadius: 0, zIndex: -1}})
    div(this, this.rectW * 0.10, this.rectH * 0.13, 560, 560, {
      sx: {background: "rgba(255, 190, 111, 0.12)", borderColor: null, borderRadius: 280, zIndex: -0.95},
    })
    div(this, this.rectW * 0.58, this.rectH * 0.04, 650, 650, {
      sx: {background: "rgba(111, 211, 255, 0.15)", borderColor: null, borderRadius: 325, zIndex: -0.95},
    })
    div(this, this.rectW * 0.64, this.rectH * 0.70, 480, 260, {
      sx: {background: "rgba(82, 196, 123, 0.11)", borderColor: null, borderRadius: 130, zIndex: -0.95},
    })
  }

  #header(x: number, y: number, w: number): void {
    Badge(this, x, y, 170, 30, {children: "@metafor/components", color: "primary"})
    Badge(this, x + 186, y, 146, 30, {children: "MUI-inspired", color: "neutral"})
    h1(this, x, y + 42, Math.min(680, w - 350), 48, {children: "Vision components", sx: {fontSize: 30}})
    p(this, x, y + 88, Math.min(760, w - 350), 28, {
      children: "High-level controls built on @metafor/elements: Card, Button, Badge, TextField, Divider.",
      sx: {fontSize: 13, color: "muted"},
    })

    Card(this, x + w - 330, y + 14, 330, 88, {
      variant: "glass",
      sx: {background: "rgba(8, 13, 22, 0.70)", borderColor: "rgba(214, 231, 255, 0.18)", borderRadius: 30},
    })
    span(this, x + w - 300, y + 38, 270, 24, {children: `virtual route  #/${this.#route}`, sx: {fontSize: 12, color: "cyan"}})
    span(this, x + w - 300, y + 68, 270, 24, {children: routeById(this.#route).hint, sx: {fontSize: 12, color: "muted"}})
  }

  #routeTabs(x: number, y: number, w: number): void {
    Card(this, x, y, w, 62, {
      variant: "glass",
      sx: {background: "rgba(7, 12, 21, 0.68)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 31},
    })
    const tabW = (w - 32) / ROUTES.length
    for (const [i, route] of ROUTES.entries()) {
      const active = route.id === this.#route
      const tx = x + 16 + i * tabW
      Button(this, tx, y + 11, tabW - 12, 40, {
        children: route.label,
        variant: active ? "contained" : "glass",
        color: active ? route.color : "neutral",
        onClick: () => this.#router.go(route.id),
        sx: {borderRadius: 999, fontSize: 12},
      })
    }
  }

  #content(x: number, y: number, w: number, h: number): void {
    Card(this, x, y, w, h, {
      variant: "glass",
      sx: {background: "rgba(8, 13, 22, 0.70)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 38},
    })
    const progress = easeOutCubic(transitionProgress(this.#transitionStarted))
    const direction = ROUTE_IDS.indexOf(this.#route) >= ROUTE_IDS.indexOf(this.#previousRoute) ? 1 : -1
    const slideX = Math.round((1 - progress) * 32 * direction)
    div(this, x + 28 + (w - 114) * progress, y + 18, 86, 4, {sx: {background: "rgba(111, 211, 255, 0.58)", borderColor: null, borderRadius: 2}})

    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#route === "overview") this.#overview(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "buttons") this.#buttons(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "forms") this.#forms(x + 34 + slideX, y + 34, w - 68, h - 68)
    else this.#feedback(x + 34 + slideX, y + 34, w - 68, h - 68)
    this.popClip()
  }

  #overview(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Components use MUI-like props", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {
      children: "The playground is a real consumer: navigation, cards, buttons, badges and fields are rendered through the UI packages.",
      sx: {fontSize: 13, color: "muted"},
    })

    const cardW = (w - 36) / 3
    metricCard(this, x, y + 94, cardW, 164, "Card", "variant", "glass / outlined / filled")
    metricCard(this, x + cardW + 18, y + 94, cardW, 164, "Button", "variant + color", "text / outlined / contained")
    metricCard(this, x + (cardW + 18) * 2, y + 94, cardW, 164, "TextField", "active state", "input-like canvas control")

    Card(this, x, y + 300, w, 150, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
    h3(this, x + 26, y + 326, w - 52, 24, {children: "API shape", sx: {fontSize: 15}})
    codeLine(this, x + 26, y + 366, w - 52, "Button(host, x, y, w, h, { variant: \"contained\", color: \"success\", size: \"medium\" })")
    codeLine(this, x + 26, y + 404, w - 52, "Card(host, x, y, w, h, { variant: \"glass\", sx: { borderRadius: 38 } })")
  }

  #buttons(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Button variants and states", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "Capsule geometry, hover/press feedback and disabled state are shared by all variants.", sx: {fontSize: 13, color: "muted"}})

    Card(this, x, y + 92, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    Divider(this, x + 28, y + 144, w - 56, {color: "neutral"})
    h3(this, x + 28, y + 116, 260, 24, {children: "Variants", sx: {fontSize: 15}})
    const buttons = [
      ["Glass", "glass", "primary"],
      ["Contained", "contained", "success"],
      ["Outlined", "outlined", "warning"],
      ["Text", "text", "primary"],
      ["Error", "contained", "error"],
      ["Disabled", "glass", "neutral"],
    ] as const
    for (const [i, [label, variant, color]] of buttons.entries()) {
      const bx = x + 28 + (i % 3) * 190
      const by = y + 184 + Math.floor(i / 3) * 82
      Button(this, bx, by, 166, 48, {
        children: label,
        variant,
        color,
        disabled: label === "Disabled",
        onClick: () => this.#record(`button:${label.toLowerCase()}`),
      })
    }
    TextField(this, x + w - 368, y + 184, 320, 44, {value: `last=${this.#status}`, active: true})
    Badge(this, x + w - 368, y + 256, 130, 32, {children: "hover ready", color: "primary"})
    Badge(this, x + w - 222, y + 256, 130, 32, {children: "disabled safe", color: "neutral"})
  }

  #forms(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Form-like composition", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "High-level components keep MUI-like prop names, while elements keep CSS-like sx names.", sx: {fontSize: 13, color: "muted"}})

    const leftW = Math.floor(w * 0.48)
    Card(this, x, y + 92, leftW, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 120, leftW - 56, 24, {children: "Project form", sx: {fontSize: 15}})
    TextField(this, x + 28, y + 172, leftW - 56, 44, {value: "name=Spatial debug UI", active: true})
    TextField(this, x + 28, y + 238, leftW - 56, 44, {value: `theme=${this.#activePlan}`, active: false, onClick: () => this.#record("field:theme")})
    Button(this, x + 28, y + 316, 154, 46, {children: "Save", variant: "contained", color: "success", onClick: () => this.#record("save")})
    Button(this, x + 198, y + 316, 154, 46, {children: "Cancel", variant: "outlined", color: "neutral", onClick: () => this.#record("cancel")})

    const rightX = x + leftW + 24
    const rightW = w - leftW - 24
    Card(this, rightX, y + 92, rightW, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, rightX + 28, y + 120, rightW - 56, 24, {children: "Component props", sx: {fontSize: 15}})
    propRow(this, rightX + 28, y + 172, rightW - 56, "variant", "\"glass\" | \"outlined\" | \"contained\"")
    propRow(this, rightX + 28, y + 220, rightW - 56, "color", "\"primary\" | \"success\" | \"warning\" | \"error\"")
    propRow(this, rightX + 28, y + 268, rightW - 56, "size", "\"small\" | \"medium\" | \"large\"")
    propRow(this, rightX + 28, y + 316, rightW - 56, "sx", "CSS-like style override")
  }

  #feedback(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Feedback is visible by default", sx: {fontSize: 22}})
    p(this, x, y + 42, w, 28, {children: "Events update state in-canvas; badges and fields show the current route state without DOM.", sx: {fontSize: 13, color: "muted"}})

    Card(this, x, y + 92, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 120, 280, 24, {children: "Interactive event stream", sx: {fontSize: 15}})
    Badge(this, x + w - 282, y + 116, 124, 32, {children: `events ${this.#eventCount}`, color: "primary"})
    Badge(this, x + w - 144, y + 116, 116, 32, {children: this.#status, color: colorForStatus(this.#status)})

    Button(this, x + 28, y + 182, 184, 50, {
      children: "Event Button",
      variant: "contained",
      color: "primary",
      onHover: () => this.#record("hover"),
      onLeave: () => this.#record("leave"),
      onPress: () => this.#record("press"),
      onRelease: () => this.#record("release"),
      onClick: () => this.#record("click"),
    })
    Button(this, x + 230, y + 182, 184, 50, {children: "Forbidden", disabled: true})
    TextField(this, x + 28, y + 264, 386, 44, {value: `status=${this.#status}`, active: true})

    Card(this, x + w - 376, y + 174, 348, 222, {variant: "glass", sx: {background: "rgba(4, 8, 14, 0.46)", borderColor: "rgba(214, 231, 255, 0.12)", borderRadius: 26}})
    for (const [i, event] of this.#events.entries()) {
      p(this, x + w - 344, y + 204 + i * 36, 284, 24, {children: event, sx: {fontSize: 12, color: i === 0 ? "text" : "muted"}})
    }
  }

  #record(status: string): void {
    this.#eventCount += 1
    this.#status = status
    this.#events = [`${status}: ${this.#eventCount}`, ...this.#events].slice(0, 5)
    if (status === "save") this.#activePlan = "Saved"
    this.requestRender()
  }
}

function routeById(id: ComponentRoute): RouteMeta {
  return ROUTES.find((route) => route.id === id) ?? ROUTES[0]!
}

function transitionProgress(started: number): number {
  return Math.min(1, Math.max(0, (performance.now() - started) / TRANSITION_MS))
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function metricCard(host: Element, x: number, y: number, w: number, h: number, title: string, prop: string, value: string): void {
  Card(host, x, y, w, h, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
  h3(host, x + 24, y + 24, w - 48, 24, {children: title, sx: {fontSize: 15}})
  Badge(host, x + 24, y + 64, 118, 30, {children: prop, color: "primary"})
  p(host, x + 24, y + 108, w - 48, 28, {children: value, sx: {fontSize: 12, color: "muted"}})
}

function propRow(host: Element, x: number, y: number, w: number, name: string, value: string): void {
  Card(host, x, y, w, 36, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 18}})
  span(host, x + 16, y, 124, 36, {children: name, sx: {fontSize: 11, color: "cyan"}})
  span(host, x + 148, y, w - 164, 36, {children: value, sx: {fontSize: 11, color: "muted"}})
}

function codeLine(host: Element, x: number, y: number, w: number, text: string): void {
  Card(host, x, y, w, 28, {variant: "glass", sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 14}})
  span(host, x + 14, y, w - 28, 28, {children: text, sx: {fontSize: 10, color: "text"}})
}

function colorForStatus(status: string): "primary" | "success" | "warning" | "error" | "neutral" {
  if (status === "click" || status === "save") return "success"
  if (status === "press" || status.startsWith("button")) return "warning"
  if (status === "leave" || status === "cancel") return "neutral"
  if (status === "release") return "primary"
  return "primary"
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ComponentsPlayground(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
requestAnimationFrame(() => ui.handleResize())
