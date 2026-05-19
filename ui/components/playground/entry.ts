import {Element, UiCanvas, div, h2, h3, p, span, type CssColor} from "@metafor/elements"
import {
  Badge,
  Button,
  Card,
  Divider,
  ScrollListState,
  Scrollbar,
  StatusChip,
  TextField,
  scrollList,
} from "@metafor/components"
import {VirtualRouter} from "../../playground/virtual-router.ts"

type ComponentRoute = "overview" | "buttons" | "badge" | "forms" | "divider" | "scrollbar" | "scrollList" | "notiStack" | "feedback"

type RouteMeta = {
  id: ComponentRoute
  label: string
  color: "primary" | "success" | "warning" | "error" | "neutral"
}

const ROUTE_IDS = ["overview", "buttons", "badge", "forms", "divider", "scrollbar", "scrollList", "notiStack", "feedback"] as const
const ROUTES: readonly RouteMeta[] = [
  {id: "overview", label: "Overview", color: "primary"},
  {id: "buttons", label: "Buttons", color: "success"},
  {id: "badge", label: "Badge", color: "primary"},
  {id: "forms", label: "Forms", color: "warning"},
  {id: "divider", label: "Divider", color: "neutral"},
  {id: "scrollbar", label: "Scrollbar", color: "primary"},
  {id: "scrollList", label: "Scroll List", color: "success"},
  {id: "notiStack", label: "Noti Stack", color: "warning"},
  {id: "feedback", label: "Feedback", color: "error"},
]

const TRANSITION_MS = 260
const SCROLL_ROW_H = 46
const SCROLL_ROW_GAP = 8
const SCROLL_ITEMS = Array.from({length: 64}, (_, i) => ({
  title: `Item #${i + 1}`,
  subtitle: `scrollList row ${i + 1} with clipped subtitle`,
}))

class ComponentsPlayground extends Element {
  readonly #router = new VirtualRouter<ComponentRoute>(ROUTE_IDS, "overview")
  readonly #unsubscribe: () => void
  readonly #scrollState = new ScrollListState({onChange: () => this.requestRender()})
  #route: ComponentRoute = this.#router.current
  #previousRoute: ComponentRoute = this.#router.current
  #transitionStarted = performance.now() - TRANSITION_MS
  #events = ["ready: hover, press, release, click"]
  #eventCount = 0
  #status = "ready"
  #activePlan = "Vision Pro"
  #scrollVisible = 1

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

  onWheel(event: WheelEvent): void {
    if (this.#route !== "scrollList") return
    this.#scrollState.applyWheel(event, SCROLL_ROW_H + SCROLL_ROW_GAP, SCROLL_ITEMS.length, this.#scrollVisible, {
      speed: 1.35,
      startBoostPx: 14,
    })
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

    this.#routeTabs(stageX + 36, stageY + 34, stageW - 72)
    this.#content(stageX + 36, stageY + 116, stageW - 72, stageH - 152)

    const t = transitionProgress(this.#transitionStarted)
    if (t < 1) requestAnimationFrame(() => this.requestRender())
  }

  #backdrop(): void {
    div(this, 0, 0, this.rectW, this.rectH, {style: {background: "rgba(3, 7, 13, 1)", borderColor: null, borderRadius: 0, zIndex: -1}})
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
        sx: {borderRadius: 999, fontSize: 10},
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
    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    if (this.#route === "overview") this.#overview(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "buttons") this.#buttons(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "badge") this.#badge(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "forms") this.#forms(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "divider") this.#dividerRoute(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "scrollbar") this.#scrollbarRoute(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "scrollList") this.#scrollListRoute(x + 34 + slideX, y + 34, w - 68, h - 68)
    else if (this.#route === "notiStack") this.#notiStackRoute(x + 34 + slideX, y + 34, w - 68, h - 68)
    else this.#feedback(x + 34 + slideX, y + 34, w - 68, h - 68)
    this.popClip()
  }

  #overview(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Components", style: {fontSize: 22}})

    const cardW = (w - 36) / 3
    metricCard(this, x, y + 58, cardW, 142, "Card", "variant", "glass / outlined / filled")
    metricCard(this, x + cardW + 18, y + 58, cardW, 142, "Button", "variant + color", "text / outlined / contained")
    metricCard(this, x + (cardW + 18) * 2, y + 58, cardW, 142, "Full set", "controls", "Badge / TextField / Scroll / Noti")

    Card(this, x, y + 238, w, 150, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
    h3(this, x + 26, y + 264, w - 52, 24, {children: "API", style: {fontSize: 15}})
    codeLine(this, x + 26, y + 304, w - 52, "Button(host, x, y, w, h, { variant: \"contained\", color: \"success\", size: \"medium\" })")
    codeLine(this, x + 26, y + 342, w - 52, "Card(host, x, y, w, h, { variant: \"glass\", sx: { borderRadius: 38 } })")
  }

  #buttons(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Buttons", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    Divider(this, x + 28, y + 110, w - 56, {color: "neutral"})
    h3(this, x + 28, y + 82, 260, 24, {children: "Variants", style: {fontSize: 15}})
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
      const by = y + 150 + Math.floor(i / 3) * 82
      Button(this, bx, by, 166, 48, {
        children: label,
        variant,
        color,
        disabled: label === "Disabled",
        onClick: () => this.#record(`button:${label.toLowerCase()}`),
      })
    }
    TextField(this, x + w - 368, y + 150, 320, 44, {value: `last=${this.#status}`, active: true})
    Badge(this, x + w - 368, y + 222, 130, 32, {children: "hover ready", color: "primary"})
    Badge(this, x + w - 222, y + 222, 130, 32, {children: "disabled safe", color: "neutral"})
  }

  #badge(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Badge", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 260, 24, {children: "Variants", style: {fontSize: 15}})
    const badges = [
      ["Primary", "primary"],
      ["Neutral", "neutral"],
      ["Success", "success"],
      ["Warning", "warning"],
      ["Error", "error"],
    ] as const
    for (const [i, [label, color]] of badges.entries()) {
      Badge(this, x + 28 + i * 148, y + 142, 124, 34, {children: label, color})
    }
    StatusChip(this, x + 28, y + 220, 152, 34, {label: "status chip", tone: "live", indicator: true})
    StatusChip(this, x + 198, y + 220, 162, 34, {label: "with tooltip", tone: "paused", tooltip: "StatusChip tooltip"})
    codeLine(this, x + 28, y + 306, w - 56, "Badge(host, x, y, w, h, { color: \"success\", children: \"Ready\" })")
  }

  #forms(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Forms", style: {fontSize: 22}})

    const leftW = Math.floor(w * 0.48)
    Card(this, x, y + 58, leftW, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, leftW - 56, 24, {children: "Project form", style: {fontSize: 15}})
    TextField(this, x + 28, y + 138, leftW - 56, 44, {value: "name=Spatial debug UI", active: true})
    TextField(this, x + 28, y + 204, leftW - 56, 44, {value: `theme=${this.#activePlan}`, active: false, onClick: () => this.#record("field:theme")})
    Button(this, x + 28, y + 282, 154, 46, {children: "Save", variant: "contained", color: "success", onClick: () => this.#record("save")})
    Button(this, x + 198, y + 282, 154, 46, {children: "Cancel", variant: "outlined", color: "neutral", onClick: () => this.#record("cancel")})

    const rightX = x + leftW + 24
    const rightW = w - leftW - 24
    Card(this, rightX, y + 58, rightW, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, rightX + 28, y + 86, rightW - 56, 24, {children: "Component props", style: {fontSize: 15}})
    propRow(this, rightX + 28, y + 138, rightW - 56, "variant", "\"glass\" | \"outlined\" | \"contained\"")
    propRow(this, rightX + 28, y + 186, rightW - 56, "color", "\"primary\" | \"success\" | \"warning\" | \"error\"")
    propRow(this, rightX + 28, y + 234, rightW - 56, "size", "\"small\" | \"medium\" | \"large\"")
    propRow(this, rightX + 28, y + 282, rightW - 56, "sx", "CSS-like style override")
  }

  #dividerRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Divider", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 260, 24, {children: "Separators", style: {fontSize: 15}})
    const rows = [
      ["neutral", "neutral"],
      ["primary", "primary"],
      ["success", "success"],
      ["warning", "warning"],
      ["error", "error"],
    ] as const
    for (const [i, [label, color]] of rows.entries()) {
      span(this, x + 28, y + 138 + i * 44, 120, 24, {children: label, style: {fontSize: 12, color: "muted"}})
      Divider(this, x + 164, y + 150 + i * 44, w - 220, {color})
    }
    codeLine(this, x + 28, y + 326, w - 56, "Divider(host, x, y, width, { color: \"primary\", thickness: 1 })")
  }

  #scrollbarRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Scrollbar", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 260, 24, {children: "Offsets", style: {fontSize: 15}})
    for (let i = 0; i < 4; i++) {
      const bx = x + 42 + i * 150
      const offset = i * 5.5
      Card(this, bx, y + 138, 96, 180, {variant: "glass", sx: {background: "rgba(4, 8, 14, 0.42)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 26}})
      Scrollbar(this, bx + 72, y + 158, 140, {offset, visible: 6, total: 24, trackWidth: 5, minThumbHeight: 24})
      Badge(this, bx + 14, y + 330, 70, 28, {children: `${Math.round(offset)}`, color: i === 0 ? "neutral" : "primary"})
    }
    codeLine(this, x + w - 492, y + 326, 464, "Scrollbar(host, x, y, height, { offset, visible, total })")
  }

  #scrollListRoute(x: number, y: number, w: number, h: number): void {
    h2(this, x, y, w, 34, {children: "Scroll List", style: {fontSize: 22}})

    const panelH = Math.min(430, h - 58)
    Card(this, x, y + 58, w, panelH, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 260, 24, {children: "Virtual rows", style: {fontSize: 15}})
    Badge(this, x + w - 180, y + 82, 152, 32, {children: `${SCROLL_ITEMS.length} items`, color: "primary"})

    const listX = x + 28
    const listY = y + 132
    const listW = w - 56
    const listH = panelH - 164
    const metrics = scrollList(this, {
      state: this.#scrollState,
      items: SCROLL_ITEMS,
      rowH: SCROLL_ROW_H,
      rowGap: SCROLL_ROW_GAP,
      x: listX,
      y: listY,
      w: listW,
      h: listH,
      scrollbarWidth: 5,
      scrollbarGap: 10,
      drawRow: (item, idx, rx, ry, rw, rh) => {
        Card(this, rx, ry, rw, rh, {
          variant: "glass",
          sx: {
            background: idx % 2 === 0 ? "rgba(111, 211, 255, 0.06)" : "rgba(255, 255, 255, 0.035)",
            borderColor: idx === 0 ? "rgba(111, 211, 255, 0.22)" : "rgba(214, 231, 255, 0.10)",
            borderRadius: 18,
          },
        })
        span(this, rx + 16, ry + 6, rw - 32, 18, {children: item.title, style: {fontSize: 12, color: "text"}})
        span(this, rx + 16, ry + 25, rw - 32, 18, {children: item.subtitle, style: {fontSize: 10, color: "muted"}})
      },
    })
    this.#scrollVisible = metrics.visible
  }

  #notiStackRoute(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Noti Stack", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 300, 24, {children: "Toast layout", style: {fontSize: 15}})
    const toastW = Math.min(420, w - 56)
    for (let i = 0; i < 3; i++) {
      const ty = y + 132 + i * 78
      const tone: CssColor = i === 0 ? "cyan" : i === 1 ? "green" : "orange"
      Card(this, x + w - toastW - 28, ty, toastW, 62, {
        variant: "glass",
        sx: {background: "rgba(4, 8, 14, 0.58)", borderColor: tone, borderRadius: 24},
      })
      span(this, x + w - toastW, ty + 10, toastW - 56, 18, {children: `Notification ${i + 1}`, style: {fontSize: 12, color: tone}})
      span(this, x + w - toastW, ty + 34, toastW - 56, 18, {children: "separate UiCanvas card in production", style: {fontSize: 10, color: "muted"}})
    }
    Button(this, x + 28, y + 142, 152, 44, {children: "Push", variant: "contained", color: "success", onClick: () => this.#record("toast:push")})
    Button(this, x + 196, y + 142, 152, 44, {children: "Clear", variant: "outlined", color: "neutral", onClick: () => this.#record("toast:clear")})
    codeLine(this, x + 28, y + 250, Math.min(520, w - 56), "new NotiStack(ui, { theme }).push({ title, body, primary })")
  }

  #feedback(x: number, y: number, w: number, _h: number): void {
    h2(this, x, y, w, 34, {children: "Feedback", style: {fontSize: 22}})

    Card(this, x, y + 58, w, 358, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32}})
    h3(this, x + 28, y + 86, 280, 24, {children: "Interactive event stream", style: {fontSize: 15}})
    Badge(this, x + w - 282, y + 82, 124, 32, {children: `events ${this.#eventCount}`, color: "primary"})
    Badge(this, x + w - 144, y + 82, 116, 32, {children: this.#status, color: colorForStatus(this.#status)})

    Button(this, x + 28, y + 148, 184, 50, {
      children: "Event Button",
      variant: "contained",
      color: "primary",
      onHover: () => this.#record("hover"),
      onLeave: () => this.#record("leave"),
      onPress: () => this.#record("press"),
      onRelease: () => this.#record("release"),
      onClick: () => this.#record("click"),
    })
    Button(this, x + 230, y + 148, 184, 50, {children: "Forbidden", disabled: true})
    TextField(this, x + 28, y + 230, 386, 44, {value: `status=${this.#status}`, active: true})

    Card(this, x + w - 376, y + 140, 348, 222, {variant: "glass", sx: {background: "rgba(4, 8, 14, 0.46)", borderColor: "rgba(214, 231, 255, 0.12)", borderRadius: 26}})
    for (const [i, event] of this.#events.entries()) {
      p(this, x + w - 344, y + 170 + i * 36, 284, 24, {children: event, style: {fontSize: 12, color: i === 0 ? "text" : "muted"}})
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

function transitionProgress(started: number): number {
  return Math.min(1, Math.max(0, (performance.now() - started) / TRANSITION_MS))
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function metricCard(host: Element, x: number, y: number, w: number, h: number, title: string, prop: string, value: string): void {
  Card(host, x, y, w, h, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 30}})
  h3(host, x + 24, y + 24, w - 48, 24, {children: title, style: {fontSize: 15}})
  Badge(host, x + 24, y + 64, 118, 30, {children: prop, color: "primary"})
  p(host, x + 24, y + 108, w - 48, 28, {children: value, style: {fontSize: 12, color: "muted"}})
}

function propRow(host: Element, x: number, y: number, w: number, name: string, value: string): void {
  Card(host, x, y, w, 36, {variant: "glass", sx: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 18}})
  span(host, x + 16, y, 124, 36, {children: name, style: {fontSize: 11, color: "cyan"}})
  span(host, x + 148, y, w - 164, 36, {children: value, style: {fontSize: 11, color: "muted"}})
}

function codeLine(host: Element, x: number, y: number, w: number, text: string): void {
  Card(host, x, y, w, 28, {variant: "glass", sx: {background: "rgba(4, 8, 14, 0.50)", borderColor: "rgba(214, 231, 255, 0.10)", borderRadius: 14}})
  span(host, x + 14, y, w - 28, 28, {children: text, style: {fontSize: 10, color: "text"}})
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
