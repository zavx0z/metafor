import {UiSurface, palette, radii, uiIcons} from "@ui/elements"
import {IconButton} from "@ui/components"
import {t} from "./i18n.ts"
import {withAlpha} from "./geometry.ts"

const HUD_PANEL_BG = withAlpha(palette.bg, 0.68)

export class WorkspaceFilesHeaderPane extends UiSurface {
  #rootLabel: string | null = null
  readonly #onRevealCurrent: () => void
  readonly #onCollapseAll: () => void
  readonly #onExpandAll: () => void

  constructor(onRevealCurrent: () => void, onCollapseAll: () => void, onExpandAll: () => void) {
    super({bgColor: null, borderColor: null})
    this.node.name = "WorkspaceFilesHeaderPane"
    this.#onRevealCurrent = onRevealCurrent
    this.#onCollapseAll = onCollapseAll
    this.#onExpandAll = onExpandAll
  }

  setRootLabel(label: string | null): void {
    if (this.#rootLabel === label) return
    this.#rootLabel = label
    this.requestRender()
  }

  protected render(): void {
    const pad = 8
    const titleX = 16
    const buttonY = 6
    const buttonSize = 24
    const gap = 6
    const revealCurrentLabel = t("sourceRevealCurrent")
    const expandLabel = t("sourceExpandAll")
    const collapseLabel = t("sourceCollapseAll")
    const expandX = Math.max(pad, this.rectW - pad - buttonSize)
    const collapseX = Math.max(pad, expandX - gap - buttonSize)
    const revealCurrentX = Math.max(pad, collapseX - gap - buttonSize)
    const titleW = Math.max(1, revealCurrentX - titleX - 8)

    this.drawText(this.#rootLabel ?? t("sourceFiles"), titleX, 9, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: titleW,
    })
    this.#drawHeaderAction(revealCurrentX, buttonY, buttonSize, revealCurrentLabel, "revealCurrent", this.#onRevealCurrent)
    this.#drawHeaderAction(collapseX, buttonY, buttonSize, collapseLabel, "collapse", this.#onCollapseAll)
    this.#drawHeaderAction(expandX, buttonY, buttonSize, expandLabel, "expand", this.#onExpandAll)
    this.drawRect(pad, Math.max(0, this.rectH - 1), Math.max(1, this.rectW - pad * 2), 1, palette.borderDim)
  }

  #drawHeaderAction(x: number, y: number, size: number, label: string, kind: WorkspaceHeaderActionKind, action: () => void): void {
    IconButton(this, x, y, size, size, {
      label,
      iconSrc: workspaceHeaderIcon(kind),
      action,
    })
  }
}

type WorkspaceHeaderActionKind = "revealCurrent" | "collapse" | "expand"

function workspaceHeaderIcon(kind: WorkspaceHeaderActionKind): string {
  if (kind === "revealCurrent") return uiIcons.executionPoint
  if (kind === "collapse") return uiIcons.collapse
  return uiIcons.expand
}

export class WorkspaceFilesChromePane extends UiSurface {
  constructor() {
    super({bgColor: HUD_PANEL_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "WorkspaceFilesChromePane"
  }

  protected render(): void {}
}
