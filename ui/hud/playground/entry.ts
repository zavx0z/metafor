import {Color} from "@metafor/engine"
import {UiRuntime, UiSurface, h3, p, span, uiIcons, type CssColor} from "@ui/elements"
import {Badge, Button, Pane, Typography} from "@ui/components"
import {HudCornerButton, HudReturnDock, HudSideTab, HudTargetReticle, type HudQuad, type HudRect, type HudSideTabTone} from "@ui/hud"
import {VirtualRouter} from "../../playground/virtual-router.ts"
import {componentsPlaygroundLayout} from "../../components/playground/layout.ts"

type HudRoute =
  | "target/overview"
  | "target/intensity/idle"
  | "target/intensity/magnetic"
  | "corner/overview"
  | "corner/state/idle"
  | "corner/state/labeled"
  | "side-tab/overview"
  | "side-tab/state/active"
  | "side-tab/state/warning"
  | "side-tab/state/danger"
  | "dock/overview"
  | "dock/state/collapsed"
  | "dock/state/expanded"
type HudComponent = "Target" | "Corner" | "SideTab" | "Dock"
type HudSection = "Overview" | "Intensity" | "State"

const ROUTES: readonly HudRoute[] = [
  "target/overview",
  "target/intensity/idle",
  "target/intensity/magnetic",
  "corner/overview",
  "corner/state/idle",
  "corner/state/labeled",
  "side-tab/overview",
  "side-tab/state/active",
  "side-tab/state/warning",
  "side-tab/state/danger",
  "dock/overview",
  "dock/state/collapsed",
  "dock/state/expanded",
]
const COMPONENTS: readonly HudComponent[] = ["Target", "Corner", "SideTab", "Dock"]
const LAYOUT_Z = -0.12
const BACKDROP_Z = -0.18

class HudPlaygroundScreen extends UiSurface {
  readonly #router = new VirtualRouter<HudRoute>(ROUTES, "target/overview", {mode: "path"})
  readonly #unsubscribe: () => void
  #route: HudRoute = this.#router.current
  #dockExpanded = false

  constructor() {
    super({bgColor: null, borderColor: null})
    this.#unsubscribe = this.#router.subscribe((route) => {
      this.#route = route
      this.#dockExpanded = route === "dock/state/expanded"
      this.requestRender()
    })
  }

  override dispose(): void {
    this.#unsubscribe()
    this.#router.dispose()
    super.dispose()
  }

  protected render(): void {
    this.drawBackdropGradient({
      base: 0x07101b,
      glowA: {color: "rgba(111,211,255,0.17)", cx: 0.30, cy: 0.16, radius: 0.43},
      glowB: {color: "rgba(197,151,255,0.08)", cx: 0.72, cy: 0.78, radius: 0.44},
      z: BACKDROP_Z,
    })

    const layout = componentsPlaygroundLayout(this.rectW, this.rectH)
    this.#catalog(layout.stageX, layout.stageY, layout.catalogW, layout.stageH)
    this.#sectionPanel(layout.sectionX, layout.stageY, layout.sectionW, layout.stageH)
    this.#preview(layout.previewX, layout.stageY, layout.previewW, layout.previewH)
    this.#dock(layout.previewX, layout.stageY + layout.previewH + layout.gap, layout.previewW, layout.dockH)
    this.#params(layout.paramsX, layout.stageY, layout.paramsW, layout.stageH)
  }

  #catalog(x: number, y: number, w: number, h: number): void {
    panel(this, x, y, w, h)
    h3(this, x, y + 28, w, 24, {children: "HUD", style: {fontSize: 15, textAlign: "center"}})
    const rowH = 38
    for (const [i, label] of COMPONENTS.entries()) {
      const active = label === this.#component()
      Button(this, x + 22, y + 76 + i * 47, w - 44, rowH, {
        children: label,
        variant: active ? "contained" : "glass",
        color: "neutral",
        radius: 999,
        fontPx: 11,
        onClick: () => {
          if (label === "Target") this.#router.go("target/overview")
          else if (label === "Corner") this.#router.go("corner/overview")
          else if (label === "SideTab") this.#router.go("side-tab/overview")
          else this.#router.go("dock/overview")
        },
      })
    }
  }

  #sectionPanel(x: number, y: number, w: number, h: number): void {
    panel(this, x, y, w, h)
    const component = this.#component()
    h3(this, x, y + 28, w, 24, {children: component, style: {fontSize: 15, textAlign: "center"}})
    const sections = component === "Target" ? ["Overview", "Intensity"] as const : ["Overview", "State"] as const
    for (const [i, section] of sections.entries()) {
      const active = this.#section() === section
      Button(this, x + 18, y + 76 + i * 47, w - 36, 38, {
        children: section,
        variant: active ? "contained" : "glass",
        color: "neutral",
        radius: 999,
        fontPx: 11,
        onClick: () => this.#goSection(section),
      })
    }
  }

  #preview(x: number, y: number, w: number, h: number): void {
    panel(this, x, y, w, h, 38, "rgba(8, 13, 22, 0.72)")
    this.pushClip(x + 2, y + 2, w - 4, h - 4)
    this.#drawPreviewGrid(x, y, w, h)
    const route = this.#route
    if (route.startsWith("target/")) this.#targetPreview(x, y, w, h)
    else if (route.startsWith("corner/")) this.#cornerPreview(x, y, w, h)
    else if (route.startsWith("side-tab/")) this.#sideTabPreview(x, y, w, h)
    else this.#dockPreview(x, y, w, h)
    this.popClip()
  }

  #dock(x: number, y: number, w: number, h: number): void {
    panel(this, x, y, w, h, 30, "rgba(12, 18, 30, 0.78)")
    Typography(this, x + 26, y + 22, 120, 20, {children: this.#component(), variant: "title"})
    const routes = this.#detailRoutes()
    const buttonW = Math.min(148, Math.max(92, (w - 190) / routes.length - 10))
    for (const [i, route] of routes.entries()) {
      Button(this, x + 148 + i * (buttonW + 10), y + 20, buttonW, 42, {
        children: labelForRoute(route),
        variant: this.#route === route ? "contained" : "glass",
        color: "neutral",
        radius: 999,
        fontPx: 11,
        onClick: () => this.#router.go(route),
      })
    }
  }

  #params(x: number, y: number, w: number, h: number): void {
    panel(this, x, y, w, h)
    h3(this, x, y + 28, w, 24, {children: "API", style: {fontSize: 15, textAlign: "center"}})
    Badge(this, x + 26, y + 78, 112, 24, {children: "@ui/hud", color: "primary"})
    const lines = this.#apiLines()
    for (const [i, line] of lines.entries()) {
      span(this, x + 26, y + 126 + i * 24, w - 52, 18, {
        children: line,
        style: {fontSize: 11, color: i === 0 ? "text" : "muted"},
      })
    }
  }

  #targetPreview(x: number, y: number, w: number, h: number): void {
    previewTitle(this, x, y, w, "Target Reticle", "Projected quad corners with magnetic perimeter marks.")
    const quad = demoQuad(x, y, w, h)
    const magnetic = this.#route === "target/intensity/magnetic"
    HudTargetReticle(this, {
      quad: magnetic ? outsetQuad(quad, 12) : quad,
      strength: magnetic ? 1 : 0.72,
    })
  }

  #cornerPreview(x: number, y: number, w: number, h: number): void {
    previewTitle(this, x, y, w, "Corner Button", "A small flight/action plaque attached to a HUD anchor.")
    const quad = demoQuad(x, y, w, h)
    HudTargetReticle(this, {quad, strength: 0.42})
    HudCornerButton(this, {
      rect: {x: quad.topRight.x + 42, y: quad.topRight.y - 20, w: 44, h: 44},
      anchor: {x: quad.topRight.x + 7, y: quad.topRight.y + 7},
      label: this.#route === "corner/state/labeled" ? "12" : "",
      onClick: () => this.#router.go(this.#route === "corner/state/labeled" ? "corner/state/idle" : "corner/state/labeled"),
    })
  }

  #dockPreview(x: number, y: number, w: number, h: number): void {
    previewTitle(this, x, y, w, "Return Dock", "A low island that expands into a return square on hover or click.")
    const island: HudRect = {x: x + w / 2 - 40, y: y + h - 70, w: 80, h: 18}
    const button: HudRect = {x: x + w / 2 - 19, y: island.y - 49, w: 38, h: 38}
    const expanded = this.#route === "dock/state/expanded" || this.#dockExpanded
    HudReturnDock(this, {
      island,
      button,
      expanded,
      onDockClick: () => {
        this.#dockExpanded = !this.#dockExpanded
        this.requestRender()
      },
      onReturnClick: () => {
        this.#dockExpanded = false
        this.#router.go("dock/state/collapsed")
      },
    })
  }

  #sideTabPreview(x: number, y: number, w: number, h: number): void {
    previewTitle(this, x, y, w, "Side Tab", "An edge-attached HUD tab for minimized panels.")
    const tone = this.#sideTabTone()
    const tab: HudRect = {x, y: y + h / 2 - 64, w: 36, h: 128}
    this.drawRoundedRect(x, tab.y - 18, 2, tab.h + 36, {
      radius: 2,
      fill: new Color(0.82, 0.88, 0.96, 0.16),
      z: -0.03,
    })
    HudSideTab(this, {
      rect: tab,
      edge: "left",
      icon: uiIcons.log,
      label: "Interpreter Terminal",
      tone,
      tooltip: "Side tab",
      onClick: () => {
        const next = tone === "active" ? "side-tab/state/warning" : tone === "warning" ? "side-tab/state/danger" : "side-tab/state/active"
        this.#router.go(next)
      },
    })
  }

  #drawPreviewGrid(x: number, y: number, w: number, h: number): void {
    const baseY = y + h - 86
    for (let i = 0; i < 9; i++) this.drawLine(x + 40 + i * 52, baseY, x + 90 + i * 52, baseY - 120, new Color(0.15, 0.28, 0.42, 0.22), 1, -0.05)
    for (let i = 0; i < 4; i++) this.drawLine(x + 38, baseY - i * 30, x + w - 38, baseY - i * 30, new Color(0.15, 0.28, 0.42, 0.24), 1, -0.05)
  }

  #component(): HudComponent {
    if (this.#route.startsWith("corner/")) return "Corner"
    if (this.#route.startsWith("side-tab/")) return "SideTab"
    if (this.#route.startsWith("dock/")) return "Dock"
    return "Target"
  }

  #section(): HudSection {
    if (this.#route.includes("/intensity")) return "Intensity"
    if (this.#route.includes("/state")) return "State"
    return "Overview"
  }

  #goSection(section: HudSection): void {
    const component = this.#component()
    if (component === "Target") this.#router.go(section === "Intensity" ? "target/intensity/magnetic" : "target/overview")
    else if (component === "Corner") this.#router.go(section === "State" ? "corner/state/labeled" : "corner/overview")
    else if (component === "SideTab") this.#router.go(section === "State" ? "side-tab/state/active" : "side-tab/overview")
    else this.#router.go(section === "State" ? "dock/state/expanded" : "dock/overview")
  }

  #detailRoutes(): readonly HudRoute[] {
    if (this.#component() === "Target") return ["target/overview", "target/intensity/idle", "target/intensity/magnetic"]
    if (this.#component() === "Corner") return ["corner/overview", "corner/state/idle", "corner/state/labeled"]
    if (this.#component() === "SideTab") return ["side-tab/overview", "side-tab/state/active", "side-tab/state/warning", "side-tab/state/danger"]
    return ["dock/overview", "dock/state/collapsed", "dock/state/expanded"]
  }

  #apiLines(): readonly string[] {
    if (this.#component() === "Target") return ["HudTargetReticle(surface, { quad })", "quad: projected display perimeter", "strength: hover / motion intensity"]
    if (this.#component() === "Corner") return ["HudCornerButton(surface, { rect })", "anchor: optional connector point", "label: distance or status value"]
    if (this.#component() === "SideTab") return ["HudSideTab(surface, { rect, edge })", "edge: left | right", "tone: neutral | active | warning | danger"]
    return ["HudReturnDock(surface, props)", "island: always-visible bottom affordance", "button: expanded return control"]
  }

  #sideTabTone(): HudSideTabTone {
    if (this.#route === "side-tab/state/warning") return "warning"
    if (this.#route === "side-tab/state/danger") return "danger"
    if (this.#route === "side-tab/overview") return "neutral"
    return "active"
  }
}

function panel(host: UiSurface, x: number, y: number, w: number, h: number, radius = 36, background: CssColor = "rgba(12, 18, 30, 0.78)"): void {
  Pane(host, x, y, w, h, {
    variant: "glass",
    sx: {
      background,
      borderColor: "rgba(214, 231, 255, 0.22)",
      borderRadius: radius,
      zIndex: LAYOUT_Z,
    },
  })
}

function previewTitle(host: UiSurface, x: number, y: number, w: number, title: string, body: string): void {
  Typography(host, x + 42, y + 34, w - 84, 24, {children: title, variant: "title", fontPx: 15})
  p(host, x + 42, y + 64, w - 84, 40, {children: body, style: {fontSize: 12, color: "muted"}})
}

function demoQuad(x: number, y: number, w: number, h: number): HudQuad {
  const cx = x + w / 2
  const cy = y + h / 2 + 16
  const qw = Math.min(360, w * 0.54)
  const qh = Math.min(230, h * 0.43)
  return {
    topLeft: {x: cx - qw / 2, y: cy - qh / 2},
    topRight: {x: cx + qw / 2, y: cy - qh / 2},
    bottomRight: {x: cx + qw / 2, y: cy + qh / 2},
    bottomLeft: {x: cx - qw / 2, y: cy + qh / 2},
  }
}

function outsetQuad(quad: HudQuad, amount: number): HudQuad {
  const center = {
    x: (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4,
    y: (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4,
  }
  return {
    topLeft: outsetPoint(quad.topLeft, center, amount),
    topRight: outsetPoint(quad.topRight, center, amount),
    bottomRight: outsetPoint(quad.bottomRight, center, amount),
    bottomLeft: outsetPoint(quad.bottomLeft, center, amount),
  }
}

function outsetPoint(point: {x: number; y: number}, center: {x: number; y: number}, amount: number): {x: number; y: number} {
  const dx = point.x - center.x
  const dy = point.y - center.y
  const length = Math.max(0.001, Math.hypot(dx, dy))
  return {x: point.x + dx / length * amount, y: point.y + dy / length * amount}
}

function labelForRoute(route: HudRoute): string {
  const part = route.split("/").at(-1) ?? route
  return part[0]!.toUpperCase() + part.slice(1)
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const runtime = await UiRuntime.create(canvas)
const screen = new HudPlaygroundScreen()
runtime.addSurface(screen, ({w, h}) => ({x: 0, y: 0, w, h}))
runtime.handleResize()
const ro = new ResizeObserver(() => runtime.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => runtime.handleResize())
