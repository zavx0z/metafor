import {Button, Checkbox, Typography, uiIcons} from "@ui/components"
import {UiSurface, type UiSurfaceOpts} from "@ui/elements"
import {HUD_WINDOW_TITLE_HEIGHT, HudSideTab, HudWindow, type HudPaneFrameChange} from "@ui/hud"
import {HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT} from "./workspace.ts"
import {hamiltonianConnectionColor} from "./connection-color.ts"

export const HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT = HUD_WINDOW_TITLE_HEIGHT
export const HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP = 10
export const HAMILTONIAN_CANVAS_VIEW_BODY_BOTTOM_INSET = 14
export const HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT = 28
export const HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP = 10
export const HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT = 30
export const HAMILTONIAN_CANVAS_VIEW_LEGEND_GAP = 12
export const HAMILTONIAN_CANVAS_VIEW_LEGEND_TITLE_HEIGHT = 20
export const HAMILTONIAN_CANVAS_VIEW_LEGEND_ROW_HEIGHT = 20

export type HamiltonianConnectionLegendEntry = Readonly<{
  connectionType: string
  label: string
}>

export function planHamiltonianCanvasViewControls(body: Readonly<{x: number; y: number; w: number; h: number}>): {
  toggleLabel: {x: number; y: number; w: number; h: number}
  toggle: {x: number; y: number; w: number; h: number}
  fit: {x: number; y: number; w: number; h: number}
  legend: {x: number; y: number; w: number; h: number}
} {
  const toggleWidth = 34
  const fitY = body.y + HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT + HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP
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
      y: fitY,
      w: body.w,
      h: HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT,
    },
    legend: {
      x: body.x,
      y: fitY + HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT + HAMILTONIAN_CANVAS_VIEW_LEGEND_GAP,
      w: body.w,
      h: Math.max(0, body.y + body.h - fitY - HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT - HAMILTONIAN_CANVAS_VIEW_LEGEND_GAP),
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
  #connectionLegend: readonly HamiltonianConnectionLegendEntry[] = []

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

  setConnectionLegend(entries: readonly HamiltonianConnectionLegendEntry[]): boolean {
    const next = [...entries]
      .filter((entry, index) => entries.findIndex((candidate) => candidate.connectionType === entry.connectionType) === index)
      .sort((left, right) => left.label.localeCompare(right.label, "ru"))
    if (
      next.length === this.#connectionLegend.length &&
      next.every((entry, index) => {
        const current = this.#connectionLegend[index]
        return current?.connectionType === entry.connectionType && current.label === entry.label
      })
    ) return false
    this.#connectionLegend = next
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
      if (this.#connectionLegend.length > 0 && controls.legend.h >= HAMILTONIAN_CANVAS_VIEW_LEGEND_TITLE_HEIGHT) {
        Typography(this, controls.legend.x, controls.legend.y, controls.legend.w, HAMILTONIAN_CANVAS_VIEW_LEGEND_TITLE_HEIGHT, {
          children: "Типы соединений",
          variant: "body",
          color: "muted",
        })
        const availableRows = Math.floor(
          (controls.legend.h - HAMILTONIAN_CANVAS_VIEW_LEGEND_TITLE_HEIGHT) / HAMILTONIAN_CANVAS_VIEW_LEGEND_ROW_HEIGHT,
        )
        for (const [index, entry] of this.#connectionLegend.slice(0, availableRows).entries()) {
          const y = controls.legend.y + HAMILTONIAN_CANVAS_VIEW_LEGEND_TITLE_HEIGHT + index * HAMILTONIAN_CANVAS_VIEW_LEGEND_ROW_HEIGHT
          this.drawRoundedRect(controls.legend.x, y + 5, 10, 10, {
            radius: 5,
            fill: hamiltonianConnectionColor(entry.connectionType),
            border: null,
          })
          Typography(this, controls.legend.x + 18, y, Math.max(1, controls.legend.w - 18), HAMILTONIAN_CANVAS_VIEW_LEGEND_ROW_HEIGHT, {
            children: entry.label,
            variant: "body",
            color: "text",
          })
        }
      }
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
