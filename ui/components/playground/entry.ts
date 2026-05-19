import {Element, UiCanvas, div, h1, p} from "@metafor/elements"
import {Badge, Button, Card, Divider, TextField} from "@metafor/components"

class ComponentsPlayground extends Element {
  #clicks = 0
  #status = "ready"
  #events: string[] = ["ready: hover, press, release, click"]

  constructor() {
    super({bgColor: null, borderColor: null})
  }

  protected render(): void {
    div(this, 0, 0, this.rectW, this.rectH, {sx: {background: "bg", borderColor: null, borderRadius: 0, zIndex: -1}})
    div(this, this.rectW * 0.56, 76, 390, 390, {sx: {background: "rgba(79, 184, 255, 0.24)", borderColor: null, borderRadius: 200, zIndex: -0.5}})
    div(this, this.rectW * 0.12, this.rectH - 250, 460, 210, {sx: {background: "rgba(255, 190, 111, 0.18)", borderColor: null, borderRadius: 120, zIndex: -0.5}})

    const stageW = Math.min(1160, this.rectW - 72)
    const stageH = Math.min(670, this.rectH - 72)
    const stageX = (this.rectW - stageW) / 2
    const stageY = (this.rectH - stageH) / 2

    Card(this, stageX, stageY, stageW, stageH, {variant: "glass", sx: {padding: 28, borderRadius: 38, background: "rgba(24, 32, 48, 0.88)", borderColor: "borderBright", zIndex: 0.00001}})
    h1(this, stageX + 34, stageY + 32, stageW - 68, 40, {children: "Components playground", sx: {fontSize: 28}})
    p(this, stageX + 34, stageY + 78, stageW - 68, 28, {
      children: "MUI-like API over @metafor/elements: variant, color, size, disabled, sx and Vision Pro defaults.",
      sx: {color: "muted", fontSize: 13},
    })

    Card(this, stageX + 34, stageY + 128, stageW - 68, 188, {variant: "glass", sx: {padding: 24, background: "rgba(18, 25, 38, 0.92)", zIndex: 0.00002}})
    p(this, stageX + 64, stageY + 154, 420, 26, {children: "Button variants and states", sx: {color: "cyan", fontSize: 15}})
    Divider(this, stageX + 64, stageY + 194, stageW - 128, {color: "neutral"})
    Button(this, stageX + 64, stageY + 224, 148, 44, {children: "Glass", variant: "glass", color: "primary", onClick: () => this.#record("glass")})
    Button(this, stageX + 228, stageY + 224, 148, 44, {children: "Contained", variant: "contained", color: "success", onClick: () => this.#record("contained")})
    Button(this, stageX + 392, stageY + 224, 148, 44, {children: "Outlined", variant: "outlined", color: "warning", onClick: () => this.#record("outlined")})
    Button(this, stageX + 556, stageY + 224, 148, 44, {children: "Text", variant: "text", color: "primary", onClick: () => this.#record("text")})
    Button(this, stageX + 720, stageY + 224, 148, 44, {children: "Disabled", disabled: true})

    Card(this, stageX + 34, stageY + 346, stageW - 68, 236, {variant: "glass", sx: {padding: 24, background: "rgba(9, 13, 20, 0.88)", zIndex: 0.00002}})
    p(this, stageX + 64, stageY + 372, 420, 26, {children: "Events / Badge / TextField", sx: {color: "cyan", fontSize: 15}})
    Divider(this, stageX + 64, stageY + 412, stageW - 128, {color: "neutral"})
    Button(this, stageX + 64, stageY + 442, 170, 46, {
      children: "Event Button",
      color: "primary",
      onHover: () => this.#record("hover"),
      onLeave: () => this.#record("leave"),
      onPress: () => this.#record("press"),
      onRelease: () => this.#record("release"),
      onClick: () => this.#record("click"),
    })
    Badge(this, stageX + 258, stageY + 450, 118, 30, {children: "glass", color: "primary"})
    Badge(this, stageX + 392, stageY + 450, 132, 30, {children: "running", color: "success"})
    TextField(this, stageX + 548, stageY + 444, 280, 40, {value: `status=${this.#status}`, active: true})
    p(this, stageX + 64, stageY + 516, 280, 24, {children: `clicks=${this.#clicks}`, sx: {color: "orange", fontSize: 13}})
    for (const [i, event] of this.#events.entries()) {
      p(this, stageX + stageW - 396, stageY + 442 + i * 28, 330, 24, {
        children: event,
        sx: {color: i === 0 ? "text" : "muted", fontSize: 12},
      })
    }
  }

  #record(status: string): void {
    this.#clicks += 1
    this.#status = status
    this.#events = [`${status}: ${this.#clicks}`, ...this.#events].slice(0, 5)
    this.requestRender()
  }
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ComponentsPlayground(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
requestAnimationFrame(() => ui.handleResize())
