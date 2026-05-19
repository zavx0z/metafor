import {Element, UiCanvas, button, div, h1, h2, h3, hr, input, p, span} from "@metafor/elements"

class ElementsPlayground extends Element {
  #clicks = 0
  #state = "idle"
  #events: string[] = ["ready: hover, press, release, click"]

  constructor() {
    super({bgColor: null, borderColor: null})
  }

  protected render(): void {
    div(this, 0, 0, this.rectW, this.rectH, {sx: {background: "bg", borderColor: null, borderRadius: 0, zIndex: -1}})
    div(this, this.rectW * 0.58, 84, 360, 360, {sx: {background: "rgba(79, 184, 255, 0.24)", borderColor: null, borderRadius: 180, zIndex: -0.5}})
    div(this, this.rectW * 0.72, this.rectH - 260, 420, 220, {sx: {background: "rgba(91, 255, 174, 0.18)", borderColor: null, borderRadius: 120, zIndex: -0.5}})

    const stageW = Math.min(1160, this.rectW - 72)
    const stageH = Math.min(670, this.rectH - 72)
    const stageX = (this.rectW - stageW) / 2
    const stageY = (this.rectH - stageH) / 2
    const sidebarW = 250
    const contentX = stageX + sidebarW + 28
    const contentW = stageW - sidebarW - 28

    div(this, stageX, stageY, stageW, stageH, {sx: {background: "rgba(24, 32, 48, 0.88)", borderColor: "borderBright", borderRadius: 38, padding: 26, zIndex: 0.00001}})
    div(this, stageX + 22, stageY + 22, sidebarW - 18, stageH - 44, {sx: {background: "rgba(12, 18, 28, 0.82)", borderColor: "borderDim", borderRadius: 30, padding: 20, zIndex: 0.00002}})
    h2(this, stageX + 46, stageY + 48, sidebarW - 66, 28, {children: "@metafor/elements", sx: {fontSize: 17}})
    p(this, stageX + 46, stageY + 84, sidebarW - 66, 48, {children: "HTML-like names, CSS-like props, Vision Pro defaults.", sx: {color: "muted", fontSize: 12}})

    for (const [i, label] of ["div", "span", "button", "input", "img", "hr", "p", "h1-h6"].entries()) {
      button(this, stageX + 46, stageY + 158 + i * 44, sidebarW - 66, 34, {
        children: label,
        onClick: () => {
          this.#state = `selected: ${label}`
          this.#push(`click: ${label}`)
          this.requestRender()
        },
        sx: {fontSize: 12, borderRadius: 18, color: i === 0 ? "cyan" : "text"},
      })
    }

    h1(this, contentX, stageY + 30, contentW, 40, {children: "Elements playground", sx: {fontSize: 28}})
    p(this, contentX, stageY + 74, contentW, 30, {
      children: "Low-level UI uses standard element names and CSS-like values: px, %, fr, tokens and CSS colors.",
      sx: {color: "muted", fontSize: 13},
    })

    div(this, contentX, stageY + 122, contentW, 190, {sx: {background: "rgba(18, 25, 38, 0.92)", borderColor: "borderDim", borderRadius: 34, padding: 24, zIndex: 0.00002}})
    h2(this, contentX + 28, stageY + 148, contentW - 56, 28, {children: "div / span / p / h1", sx: {fontSize: 17}})
    hr(this, contentX + 28, stageY + 188, contentW - 56, {sx: {background: "borderDim"}})
    p(this, contentX + 28, stageY + 210, contentW - 56, 28, {children: "This surface is a div with background=\"glass\", borderRadius=34, padding=24.", sx: {fontSize: 13}})
    span(this, contentX + 28, stageY + 246, contentW - 56, 28, {children: "span: inline text with color/fontSize style", sx: {color: "cyan", fontSize: 13}})
    input(this, contentX + 28, stageY + 272, 330, 36, {value: `state=${this.#state} clicks=${this.#clicks}`, active: true})

    div(this, contentX, stageY + 336, contentW, 250, {sx: {background: "rgba(9, 13, 20, 0.88)", borderColor: "borderDim", borderRadius: 34, padding: 24, zIndex: 0.00002}})
    h3(this, contentX + 28, stageY + 362, 260, 26, {children: "Event visualization", sx: {fontSize: 15}})
    span(this, contentX + contentW - 380, stageY + 362, 340, 26, {children: "ready: hover, press, release, click", sx: {color: "text", fontSize: 12}})
    button(this, contentX + 28, stageY + 408, 178, 46, {
      children: "Click element",
      onPointerEnter: () => {
        this.#state = "hover"
        this.#push("hover: Click element")
        this.requestRender()
      },
      onPointerLeave: () => {
        this.#state = "idle"
        this.#push("leave: Click element")
        this.requestRender()
      },
      onPointerDown: () => {
        this.#state = "active"
        this.#push("press: Click element")
        this.requestRender()
      },
      onPointerUp: () => {
        this.#state = "released"
        this.#push("release: Click element")
        this.requestRender()
      },
      onClick: () => {
        this.#clicks += 1
        this.#state = "clicked"
        this.#push("click: Click element")
        this.requestRender()
      },
    })
    button(this, contentX + 224, stageY + 408, 178, 46, {children: "Disabled", disabled: true})

    for (const [i, label] of ["idle", "hover", "active", "clicked", "disabled"].entries()) {
      span(this, contentX + 28 + i * 126, stageY + 486, 106, 24, {
        children: label,
        sx: {color: this.#state === label ? "cyan" : "muted", fontSize: 12},
      })
    }
    for (const [i, event] of this.#events.entries()) {
      span(this, contentX + contentW - 380, stageY + 408 + i * 28, 340, 24, {
        children: event,
        sx: {color: i === 0 ? "text" : "muted", fontSize: 12},
      })
    }
  }

  #push(event: string): void {
    this.#events = [event, ...this.#events].slice(0, 5)
  }
}

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")
const ui = await UiCanvas.create(canvas)
ui.addCard(new ElementsPlayground(), ({w, h}) => ({x: 0, y: 0, w, h}))
const ro = new ResizeObserver(() => ui.handleResize())
ro.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
requestAnimationFrame(() => ui.handleResize())
