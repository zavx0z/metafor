/**
 * Welcome pane на Pane-системе: layout из @metafor/elements, controls из
 * @metafor/components.
 *
 * Stack: title + status panel + target/inspector panels.
 * Все координаты — pixel от pane-TL, никаких эстимейтов.
 */

import {Pane, Z, palette, radii, uiIcons} from "@metafor/elements"
import {Button as button, TextField as input} from "@metafor/components"
import type {WelcomeActions, WelcomeState} from "./debug-ui.ts"
import {localizeSystemText, t} from "./i18n.ts"

const PAD = 18
const GAP = 16

export class WelcomePane extends Pane {
  #state: WelcomeState = {
    connectionState: "connecting",
    connectionError: null,
    inspectorUrl: "",
    targetStatus: "target not started",
    defaultCommand: "",
    pauseOnStart: false,
  }
  #url = ""
  #command = ""
  #active: "command" | "url" | null = null
  readonly #actions: WelcomeActions

  constructor(actions: WelcomeActions) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.paneLarge})
    this.#actions = actions
  }

  setState(next: WelcomeState): void {
    const wasEmpty = this.#command.length === 0
    const previousDefault = this.#state.defaultCommand
    this.#state = next
    if (this.#active !== "url") this.#url = next.inspectorUrl
    if (this.#active !== "command" && (wasEmpty || this.#command === previousDefault)) this.#command = next.defaultCommand
    this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    if (this.#active === null) return
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      if (this.#active === "command") this.#actions.onRun(this.#command, this.#state.pauseOnStart)
      else this.#actions.onApplyInspector(this.#url)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      event.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        this.#setActiveValue(this.#active, this.#activeValue() + text)
      })
      return
    }
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#setActiveValue(this.#active, this.#activeValue().slice(0, -1))
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#setActiveValue(this.#active, this.#activeValue() + event.key)
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#active !== null) {
      this.#active = null
      this.requestRender()
    }
  }

  protected render(): void {
    // Title.
    this.drawText(t("interpreter"), PAD, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - PAD * 2,
    })

    // Status panel.
    const statusY = 46
    const statusH = 72
    const contentW = this.rectW - PAD * 2
    const online = this.#state.connectionState === "connected"
    const statusFill = online ? palette.bgPanel : palette.bgElevated
    const statusBorder = online ? palette.green : palette.borderDim
    const statusText = online ? t("inspectorConnected") : t("inspectorOffline")
    const statusDetail = localizeSystemText(this.#state.connectionError)
    this.drawRoundedRect(PAD, statusY, contentW, statusH, {
      radius: 8,
      fill: statusFill,
      border: statusBorder,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.drawRoundedRect(PAD + 14, statusY + 18, 9, 9, {
      radius: 4.5,
      fill: online ? palette.green : palette.orange,
      z: Z.TEXT,
    })
    this.drawText(statusText, PAD + 32, statusY + 12, {
      fontPx: 14,
      material: online ? this.materials.green : this.materials.orange,
      maxWidthPx: contentW - 46,
    })
    this.drawText(statusDetail, PAD + 32, statusY + 38, {
      fontPx: 12,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, contentW - 46),
    })
    this.drawText(`${t("target")}: ${this.#state.targetStatus}`, Math.max(PAD + 32, PAD + contentW - 300), statusY + 54, {
      fontPx: 12,
      material: this.materials.muted,
      maxWidthPx: 280,
    })

    // Target command gets the full row: the default Bun command is long and
    // must remain readable/editable without hiding the important tail.
    const targetY = 132
    const targetH = 122
    this.drawRoundedRect(PAD, targetY, contentW, targetH, {
      radius: 8,
      fill: palette.bgPanel,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    const inspectorY = targetY + targetH + GAP
    const inspectorH = 96
    this.drawRoundedRect(PAD, inspectorY, contentW, inspectorH, {
      radius: 8,
      fill: palette.bgPanel,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })

    // Target panel.
    this.drawText(t("target"), PAD + 14, targetY + 12, {
      fontPx: 13,
      material: this.materials.orange,
      maxWidthPx: contentW - 28,
    })
    input(this, PAD + 14, targetY + 42, contentW - 28, 34, {
      value: this.#command,
      active: this.#active === "command",
      onActivate: () => {
        this.#active = "command"
        this.requestRender()
      },
    })
    button(this, PAD + 14, targetY + 84, 40, 28, {
      label: t("runTarget"), iconSrc: uiIcons.run, iconOnly: true, tooltip: t("runTarget"), tone: "live",
      action: () => this.#actions.onRun(this.#command, this.#state.pauseOnStart),
    })
    button(this, PAD + 62, targetY + 84, 40, 28, {
      label: t("stopTarget"), iconSrc: uiIcons.stop, iconOnly: true, tooltip: t("stopTarget"), tone: "warn", action: () => this.#actions.onStop(),
    })
    const pauseLabel = this.#state.pauseOnStart ? t("pauseOn") : t("pauseOff")
    button(this, PAD + 110, targetY + 84, 40, 28, {
      label: pauseLabel,
      iconSrc: this.#state.pauseOnStart ? uiIcons.pause : uiIcons.run,
      iconOnly: true,
      tooltip: pauseLabel,
      tone: this.#state.pauseOnStart ? "paused" : "neutral",
      action: () => {
        const next = !this.#state.pauseOnStart
        this.#state = {...this.#state, pauseOnStart: next}
        this.#actions.onPauseOnStart(next)
        this.requestRender()
      },
    })
    this.drawText(t("commandExact"), PAD + 164, targetY + 91, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: contentW - 178,
    })

    // Inspector panel.
    this.drawText(t("inspector"), PAD + 14, inspectorY + 12, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: contentW - 28,
    })
    input(this, PAD + 14, inspectorY + 42, contentW - 72, 32, {
      value: this.#url,
      active: this.#active === "url",
      onActivate: () => {
        this.#active = "url"
        this.requestRender()
      },
    })
    button(this, PAD + contentW - 50, inspectorY + 42, 36, 32, {
      label: t("applyInspector"), iconSrc: uiIcons.apply, iconOnly: true, tooltip: t("applyInspector"), tone: "neutral",
      action: () => this.#actions.onApplyInspector(this.#url),
    })
    const mirrorUrl = `https://debug.bun.sh/#${this.#url.replace(/^wss?:\/\//, "")}`
    this.drawText(mirrorUrl, PAD + 14, inspectorY + 80, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: contentW - 28,
    })

  }

  #activeValue(): string {
    return this.#active === "url" ? this.#url : this.#command
  }

  #setActiveValue(active: "command" | "url" | null, value: string): void {
    if (active === "url") this.#url = value
    if (active === "command") {
      this.#command = value
      localStorage.setItem("bd:target:cmd", value)
    }
    this.requestRender()
  }
}
