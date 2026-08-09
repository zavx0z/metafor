import {Button, Checkbox, Typography, uiIcons} from "@ui/components"
import {UiSurface, type UiSurfaceOpts} from "@ui/elements"
import {HUD_WINDOW_TITLE_HEIGHT, HudSideTab, HudWindow, type HudPaneFrameChange} from "@ui/hud"
import {HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT} from "./workspace.ts"

export const HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT = HUD_WINDOW_TITLE_HEIGHT
export const HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP = 10
export const HAMILTONIAN_CANVAS_VIEW_BODY_BOTTOM_INSET = 14
export const HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT = 28
export const HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP = 10
export const HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT = 30

export function planHamiltonianCanvasViewControls(body: Readonly<{x: number; y: number; w: number; h: number}>): {
  toggleLabel: {x: number; y: number; w: number; h: number}
  toggle: {x: number; y: number; w: number; h: number}
  fit: {x: number; y: number; w: number; h: number}
} {
  const toggleWidth = 34
  return {
    toggleLabel: {
      x: body.x,
      y: body.y,
      w: Math.max(1, body.w - 42),
      h: HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT,
    },
    toggle: {
      x: body.x + Math.max(0, body.w - toggleWidth),
      y: body.y,
      w: toggleWidth,
      h: HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT,
    },
    fit: {
      x: body.x,
      y: body.y + HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT + HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP,
      w: body.w,
      h: HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT,
    },
  }
}

export type HamiltonianCanvasViewSurfaceOptions = UiSurfaceOpts & Readonly<{
  onFit: () => void
  onAutoFitChange: (enabled: boolean) => void
  onOpenChange?: (open: boolean) => void
  onFrameRectChange?: (change: HudPaneFrameChange) => void
}>

/** Infinite graph-canvas controls; this never moves the Space ViewPoint. */
export class HamiltonianCanvasViewSurface extends UiSurface {
  readonly #onFit: () => void
  readonly #onAutoFitChange: (enabled: boolean) => void
  readonly #onOpenChange: ((open: boolean) => void) | undefined
  readonly #onFrameRectChange: ((change: HudPaneFrameChange) => void) | undefined
  #open = false
  #autoFitEnabled = true

  constructor(options: HamiltonianCanvasViewSurfaceOptions) {
    super({
      bgColor: options.bgColor ?? null,
      borderColor: options.borderColor ?? null,
    })
    this.#onFit = options.onFit
    this.#onAutoFitChange = options.onAutoFitChange
    this.#onOpenChange = options.onOpenChange
    this.#onFrameRectChange = options.onFrameRectChange
    this.node.name = "HamiltonianCanvasViewSurface"
  }

  get isOpen(): boolean {
    return this.#open
  }

  get autoFitEnabled(): boolean {
    return this.#autoFitEnabled
  }

  setOpen(open: boolean): boolean {
    if (this.#open === open) return false
    this.#open = open
    this.#onOpenChange?.(open)
    this.requestRender()
    return true
  }

  setAutoFitEnabled(enabled: boolean): boolean {
    if (this.#autoFitEnabled === enabled) return false
    this.#autoFitEnabled = enabled
    this.requestRender()
    return true
  }

  protected override render(): void {
    if (this.#open) {
      const body = HudWindow(this, 0, 0, this.rectW, this.rectH, {
        title: "Вид холста",
        subtitle: "Положение и масштаб",
        active: true,
        movable: true,
        resizable: true,
        minWidth: 240,
        minHeight: HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT,
        height: HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT,
        bodyInsetX: 16,
        bodyTopGap: HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP,
        bodyBottomInset: HAMILTONIAN_CANVAS_VIEW_BODY_BOTTOM_INSET,
        onMinimize: () => this.setOpen(false),
        minimizeLabel: "Свернуть управление холстом",
        ...(this.#onFrameRectChange === undefined ? {} : {onFrameRectChange: this.#onFrameRectChange}),
      })
      const controls = planHamiltonianCanvasViewControls(body)
      Typography(this, controls.toggleLabel.x, controls.toggleLabel.y, controls.toggleLabel.w, controls.toggleLabel.h, {
        children: "Авто-вписывание",
        variant: "body",
        color: this.#autoFitEnabled ? "cyan" : "muted",
      })
      Checkbox(this, controls.toggle.x, controls.toggle.y, controls.toggle.w, controls.toggle.h, {
        checked: this.#autoFitEnabled,
        tooltip: "Автоматически вписывать растущий граф до первого ручного движения холста",
        onChange: (enabled) => {
          this.#autoFitEnabled = enabled
          this.#onAutoFitChange(enabled)
          this.requestRender()
        },
      })
      Button(this, controls.fit.x, controls.fit.y, controls.fit.w, controls.fit.h, {
        label: "Показать весь граф",
        iconSrc: uiIcons.collapse,
        variant: "outlined",
        action: this.#onFit,
      })
      return
    }
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: "hamiltonian:canvas-view",
      edge: "left",
      icon: uiIcons.collapse,
      label: "Холст",
      tooltip: "Открыть управление бесконечным холстом графа",
      tone: "neutral",
      onClick: () => this.setOpen(true),
    })
  }
}
