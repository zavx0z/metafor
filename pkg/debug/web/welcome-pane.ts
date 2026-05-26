/**
 * Welcome pane на UiSurface-системе: layout из @metafor/elements, controls из
 * @metafor/components.
 *
 * Stack: title + status panel + target/inspector panels.
 * Все координаты — pixel от pane-TL, никаких эстимейтов.
 */

import {UiSurface, palette, radii, uiIcons} from "@metafor/elements"
import {
  Button as button,
  Pane as pane,
  StatusChip as statusChip,
  Typography as typography,
  TextField as input,
  createTextFieldState,
  type TextFieldEditState,
} from "@metafor/components"
import type {WelcomeActions, WelcomeState} from "./debug-ui.ts"
import {localizeSystemText, t} from "./i18n.ts"

const PAD = 18
const GAP = 16

export class WelcomePane extends UiSurface {
  #state: WelcomeState = {
    connectionState: "connecting",
    connectionError: null,
    inspectorUrl: "",
    targetStatus: "target not started",
    defaultCommand: "",
    pauseOnStart: false,
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
    typography(this, PAD, 14, this.rectW - PAD * 2, 18, {
      children: t("interpreter"),
      variant: "subtitle",
      color: "cyan",
    })

    const statusY = 46
    const statusH = 72
    const contentW = this.rectW - PAD * 2
    const online = this.#state.connectionState === "connected"
    const statusText = online ? t("inspectorConnected") : t("inspectorOffline")
    const statusDetail = localizeSystemText(this.#state.connectionError)
    pane(this, PAD, statusY, contentW, statusH, {
      sx: {
        background: online ? "bgPanel" : "bgElevated",
        borderColor: online ? "green" : "borderDim",
        borderRadius: 8,
        padding: 0,
      },
    })
    statusChip(this, PAD + 14, statusY + 11, Math.min(230, contentW - 28), 26, {
      label: statusText,
      indicator: true,
      variant: "subtle",
      tone: online ? "live" : "paused",
      fontPx: 12,
    })
    typography(this, PAD + 14, statusY + 39, Math.max(1, contentW - 28), 16, {
      children: statusDetail,
      variant: "body",
      color: "muted",
    })
    typography(this, Math.max(PAD + 14, PAD + contentW - 300), statusY + 55, 286, 16, {
      children: `${t("target")}: ${this.#state.targetStatus}`,
      variant: "body",
      color: "muted",
    })

    // Target command gets the full row: the default Bun command is long and
    // must remain readable/editable without hiding the important tail.
    const targetY = 132
    const targetH = 122
    pane(this, PAD, targetY, contentW, targetH, {
      sx: {
        background: "bgPanel",
        borderColor: "borderDim",
        borderRadius: 8,
        padding: 0,
      },
    })
    const inspectorY = targetY + targetH + GAP
    const inspectorH = 96
    pane(this, PAD, inspectorY, contentW, inspectorH, {
      sx: {
        background: "bgPanel",
        borderColor: "borderDim",
        borderRadius: 8,
        padding: 0,
      },
    })

    typography(this, PAD + 14, targetY + 12, contentW - 28, 18, {
      children: t("target"),
      variant: "subtitle",
      color: "orange",
    })
    input(this, PAD + 14, targetY + 42, contentW - 28, 34, {
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
    button(this, PAD + 14, targetY + 84, 40, 28, {
      label: t("runTarget"), iconSrc: uiIcons.run, iconOnly: true, tooltip: t("runTarget"), tone: "live",
      action: () => this.#actions.onRun(this.#command.value, this.#state.pauseOnStart),
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
    typography(this, PAD + 164, targetY + 91, contentW - 178, 14, {
      children: t("commandExact"),
      variant: "caption",
    })

    typography(this, PAD + 14, inspectorY + 12, contentW - 28, 18, {
      children: t("inspector"),
      variant: "subtitle",
      color: "cyan",
    })
    input(this, PAD + 14, inspectorY + 42, contentW - 72, 32, {
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
    button(this, PAD + contentW - 50, inspectorY + 42, 36, 32, {
      label: t("applyInspector"), iconSrc: uiIcons.apply, iconOnly: true, tooltip: t("applyInspector"), tone: "neutral",
      action: () => this.#actions.onApplyInspector(this.#url.value),
    })
    const mirrorUrl = `https://debug.bun.sh/#${this.#url.value.replace(/^wss?:\/\//, "")}`
    typography(this, PAD + 14, inspectorY + 80, contentW - 28, 14, {
      children: mirrorUrl,
      variant: "caption",
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
