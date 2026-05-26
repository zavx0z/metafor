/**
 * Welcome pane на UiSurface-системе: layout из @metafor/elements, controls из
 * @metafor/components.
 *
 * Stack: title + status panel + target/inspector panels.
 * Все координаты — pixel от pane-TL, никаких эстимейтов.
 */

import {Color} from "@metafor/engine"
import {UiSurface, Z, palette, radii, uiIcons} from "@metafor/elements"
import {
  Button as button,
  StatusChip as statusChip,
  Typography as typography,
  TextField as input,
  createTextFieldState,
  type TextFieldEditState,
} from "@metafor/components"
import type {WelcomeActions, WelcomeState} from "./debug-ui.ts"
import {localizeSystemText, t} from "./i18n.ts"

const PAD = 18
const SECTION_PAD = 14
const GAP = 12
const SUMMARY_H = 58
const PROCESS_H = 112
const FIELD_H = 32
const BUTTON = 32
const PANEL_RADIUS = 8

export class WelcomePane extends UiSurface {
  #state: WelcomeState = {
    connectionState: "connecting",
    connectionError: null,
    inspectorUrl: "",
    targetStatus: "target not started",
    defaultCommand: "",
    pauseOnStart: false,
    locale: "ru",
  }
  #url: TextFieldEditState = createTextFieldState("")
  #command: TextFieldEditState = createTextFieldState("")
  #active: "command" | "url" | null = null
  readonly #actions: WelcomeActions

  constructor(actions: WelcomeActions) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.paneLarge})
    this.#actions = actions
  }

  setState(next: WelcomeState): void {
    const wasEmpty = this.#command.value.length === 0
    const previousDefault = this.#state.defaultCommand
    this.#state = next
    if (this.#active !== "url") this.#url = keepInputText(this.#url, next.inspectorUrl)
    if (this.#active !== "command" && (wasEmpty || this.#command.value === previousDefault)) this.#command = keepInputText(this.#command, next.defaultCommand)
    this.requestRender()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#active !== null) {
      this.#active = null
      this.requestRender()
    }
  }

  protected render(): void {
    const contentW = this.rectW - PAD * 2
    const online = this.#state.connectionState === "connected"
    const statusText = online ? t("inspectorConnected") : t("inspectorOffline")
    const statusDetail = localizeSystemText(this.#state.connectionError)

    typography(this, PAD, 14, this.rectW - PAD * 2, 18, {
      children: t("interpreter"),
      variant: "subtitle",
      color: "cyan",
    })
    const langW = 38
    button(this, this.rectW - PAD - langW, 8, langW, 28, {
      label: t("langToggle"),
      iconSrc: uiIcons.language,
      iconOnly: true,
      tooltip: t("langToggle"),
      tone: "neutral",
      action: () => this.#actions.onToggleLocale(),
    })
    typography(this, this.rectW - PAD - langW - 32, 16, 26, 12, {
      children: this.#state.locale.toUpperCase(),
      variant: "caption",
      sx: {textAlign: "right"},
    })

    const statusY = 42
    this.#drawPanel(PAD, statusY, contentW, SUMMARY_H, online ? "live" : "neutral")
    const chipW = clamp(Math.floor(contentW * 0.26), 170, 220)
    statusChip(this, PAD + SECTION_PAD, statusY + 16, Math.min(chipW, contentW - SECTION_PAD * 2), 26, {
      label: statusText,
      indicator: true,
      variant: "subtle",
      tone: online ? "live" : "paused",
      fontPx: 12,
    })
    const targetW = contentW >= 740 ? clamp(Math.floor(contentW * 0.32), 230, 310) : 0
    const detailX = PAD + SECTION_PAD + chipW + 12
    const detailW = Math.max(1, contentW - SECTION_PAD * 2 - chipW - 12 - (targetW > 0 ? targetW + 14 : 0))
    typography(this, detailX, statusY + 16, detailW, 16, {
      children: statusDetail,
      variant: "body",
      color: "muted",
    })
    const targetText = `${t("target")}: ${this.#state.targetStatus}`
    if (targetW > 0) {
      typography(this, PAD + contentW - SECTION_PAD - targetW, statusY + 34, targetW, 14, {
        children: targetText,
        variant: "caption",
        sx: {textAlign: "right"},
      })
    } else {
      typography(this, detailX, statusY + 36, Math.max(1, contentW - detailX + PAD - SECTION_PAD), 14, {
        children: targetText,
        variant: "caption",
      })
    }

    const targetY = statusY + SUMMARY_H + GAP
    this.#drawPanel(PAD, targetY, contentW, PROCESS_H)
    typography(this, PAD + SECTION_PAD, targetY + 12, contentW - SECTION_PAD * 2, 18, {
      children: `${t("target")}: ${this.#state.targetStatus}`,
      variant: "subtitle",
      color: "orange",
    })
    input(this, PAD + SECTION_PAD, targetY + 40, contentW - SECTION_PAD * 2, FIELD_H, {
      value: this.#command.value,
      active: this.#active === "command",
      cursor: this.#command.cursor,
      selectionAnchor: this.#command.selectionAnchor,
      submitOnEnter: true,
      onChange: (_value, state) => this.#setActiveState("command", state),
      onSubmit: () => this.#actions.onRun(this.#command.value, this.#state.pauseOnStart),
      onActivate: () => {
        this.#active = "command"
        this.#command = createTextFieldState(this.#command.value, this.#command.value.length)
        this.requestRender()
      },
    })
    const actionY = targetY + PROCESS_H - SECTION_PAD - BUTTON
    button(this, PAD + SECTION_PAD, actionY, BUTTON, BUTTON, {
      label: t("runTarget"), iconSrc: uiIcons.run, iconOnly: true, tooltip: t("runTarget"), tone: "live",
      action: () => this.#actions.onRun(this.#command.value, this.#state.pauseOnStart),
    })
    button(this, PAD + SECTION_PAD + BUTTON + 8, actionY, BUTTON, BUTTON, {
      label: t("stopTarget"), iconSrc: uiIcons.stop, iconOnly: true, tooltip: t("stopTarget"), tone: "warn", action: () => this.#actions.onStop(),
    })
    const pauseLabel = this.#state.pauseOnStart ? t("pauseOn") : t("pauseOff")
    button(this, PAD + SECTION_PAD + (BUTTON + 8) * 2, actionY, BUTTON, BUTTON, {
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
    typography(this, PAD + SECTION_PAD + (BUTTON + 8) * 3 + 8, actionY + 9, contentW - SECTION_PAD * 2 - (BUTTON + 8) * 3 - 8, 14, {
      children: t("commandExact"),
      variant: "caption",
    })

    const inspectorY = targetY + PROCESS_H + GAP
    const inspectorH = Math.max(88, this.rectH - inspectorY - PAD)
    this.#drawPanel(PAD, inspectorY, contentW, inspectorH)
    typography(this, PAD + SECTION_PAD, inspectorY + 12, contentW - SECTION_PAD * 2, 18, {
      children: t("inspector"),
      variant: "subtitle",
      color: "cyan",
    })
    const applyW = 38
    const inspectorInputW = Math.max(1, contentW - SECTION_PAD * 2 - applyW - 10)
    input(this, PAD + SECTION_PAD, inspectorY + 40, inspectorInputW, FIELD_H, {
      value: this.#url.value,
      active: this.#active === "url",
      cursor: this.#url.cursor,
      selectionAnchor: this.#url.selectionAnchor,
      submitOnEnter: true,
      onChange: (_value, state) => this.#setActiveState("url", state),
      onSubmit: () => this.#actions.onApplyInspector(this.#url.value),
      onActivate: () => {
        this.#active = "url"
        this.#url = createTextFieldState(this.#url.value, this.#url.value.length)
        this.requestRender()
      },
    })
    button(this, PAD + contentW - SECTION_PAD - applyW, inspectorY + 40, applyW, FIELD_H, {
      label: t("applyInspector"), iconSrc: uiIcons.apply, iconOnly: true, tooltip: t("applyInspector"), tone: "neutral",
      action: () => this.#actions.onApplyInspector(this.#url.value),
    })
    const mirrorUrl = `https://debug.bun.sh/#${this.#url.value.replace(/^wss?:\/\//, "")}`
    typography(this, PAD + SECTION_PAD, inspectorY + inspectorH - 22, contentW - SECTION_PAD * 2, 14, {
      children: mirrorUrl,
      variant: "caption",
    })

  }

  #drawPanel(x: number, y: number, w: number, h: number, tone: "neutral" | "live" = "neutral"): void {
    const border = tone === "live" ? withAlpha(palette.green, 0.52) : withAlpha(palette.borderDim, 0.82)
    const fill = tone === "live" ? withAlpha(palette.bgPanel, 0.92) : withAlpha(palette.bgPanel, 0.86)
    this.drawRoundedRect(x, y, w, h, {
      radius: PANEL_RADIUS,
      fill,
      border,
      borderWidth: 1,
      z: Z.CONTAINER + 0.02,
    })
  }

  #setActiveState(active: "command" | "url" | null, state: TextFieldEditState): void {
    if (active === "url") this.#url = state
    if (active === "command") {
      this.#command = state
      localStorage.setItem("bd:target:cmd", state.value)
    }
    this.requestRender()
  }
}

function keepInputText(prev: TextFieldEditState, value: string): TextFieldEditState {
  if (prev.value === value) return prev
  return createTextFieldState(value, value.length)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
