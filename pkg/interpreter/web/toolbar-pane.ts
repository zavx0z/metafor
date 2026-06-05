/**
 * Toolbar — верхняя полоса. UiSurface-system.
 * Низкий слой берётся из @ui/elements, MUI-like контролы — из
 * @ui/components.
 */

import {UiSurface, radii, uiIcons} from "@ui/elements"
import {Button as button, Divider as divider} from "@ui/components"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./interpreter-ui.ts"
import {getUiLocale, t} from "./i18n.ts"

const PAD_X = 8
const GAP = 6
const BTN_H = 30
const BTN_W = 36
const DIVIDER_GAP = 8
const DIVIDER_W = 1

export class ToolbarPane extends UiSurface {
  #state: ToolbarState = {
    runKind: "neutral",
    locale: getUiLocale(),
    verbose: false,
    canPause: false,
    canResume: false,
    canStep: false,
    canRestart: false,
    canStop: false,
    canShowExecutionPoint: false,
  }

  readonly #actions: ToolbarActions

  constructor(actions: ToolbarActions) {
    super({bgColor: null, borderColor: null, borderRadiusPx: radii.pane})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const actionUnavailableTooltip = t("runtimeActionUnavailable")
    const primaryControls: ToolbarButton[] = [
      this.#state.runKind === "live"
        ? {
          label: t("pause"),
          iconSrc: uiIcons.pause,
          tone: pauseButtonTone(this.#state.runKind),
          dividerAfter: true,
          disabled: !this.#state.canPause,
          disabledTooltip: actionUnavailableTooltip,
          action: () => this.#actions.onPause(),
        }
        : {
          label: t("resume"),
          iconSrc: uiIcons.resume,
          tone: resumeButtonTone(this.#state.runKind),
          dividerAfter: true,
          disabled: !this.#state.canResume,
          disabledTooltip: actionUnavailableTooltip,
          action: () => this.#actions.onResume(),
        },
      {
        label: t("stepOver"),
        iconSrc: uiIcons.stepOver,
        tone: stepButtonTone(this.#state.runKind),
        disabled: !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onStep("over"),
      },
      {
        label: t("stepInto"),
        iconSrc: uiIcons.stepInto,
        tone: stepButtonTone(this.#state.runKind),
        disabled: !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onStep("into"),
      },
      {
        label: t("stepOut"),
        iconSrc: uiIcons.stepOut,
        tone: stepButtonTone(this.#state.runKind),
        disabled: !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        dividerAfter: true,
        action: () => this.#actions.onStep("out"),
      },
      {
        label: t("restartTarget"),
        iconSrc: uiIcons.restart,
        tone: "neutral",
        disabled: !this.#state.canRestart,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onRestartTarget(),
      },
      {
        label: t("showExecutionPoint"),
        iconSrc: uiIcons.executionPoint,
        tone: this.#state.canShowExecutionPoint ? "paused" : "neutral",
        disabled: !this.#state.canShowExecutionPoint,
        disabledTooltip: t("waitingFrames"),
        action: () => this.#actions.onShowExecutionPoint(),
      },
      {
        label: t("stopTarget"),
        iconSrc: uiIcons.stop,
        tone: "warn",
        disabled: !this.#state.canStop,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onStopTarget(),
      },
    ]
    const secondaryControls: ToolbarButton[] = [
      {label: this.#state.verbose ? t("hideVerbose") : t("showVerbose"), iconSrc: uiIcons.log, tone: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: languageTooltip(this.#state.locale), iconSrc: uiIcons.language, tone: "neutral", action: () => this.#actions.onToggleLocale()},
    ]

    const primaryW = this.#buttonGroupWidth(primaryControls)
    const primaryX = Math.max(PAD_X, Math.floor((this.rectW - primaryW) / 2))
    this.#drawButtonGroup(primaryControls, primaryX, buttonY)

    const secondaryW = this.#buttonGroupWidth(secondaryControls)
    const secondaryX = Math.max(PAD_X, this.rectW - PAD_X - secondaryW)
    this.#drawButtonGroup(secondaryControls, secondaryX, buttonY)
  }

  #drawButtonGroup(buttons: ToolbarButton[], x: number, y: number): number {
    let cursor = x
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!
      button(this, cursor, y, BTN_W, BTN_H, {
        label: b.label,
        iconSrc: b.iconSrc,
        iconOnly: true,
        iconSizePx: 14,
        size: "small",
        variant: "text",
        radius: 999,
        tooltip: b.disabled === true ? b.disabledTooltip ?? b.label : b.label,
        tooltipDelayMs: 180,
        tone: b.tone,
        ...(b.disabled === undefined ? {} : {disabled: b.disabled}),
        action: b.action,
        onHover: () => this.requestRender(),
        onLeave: () => this.requestRender(),
      })
      cursor += BTN_W + GAP
      if (b.dividerAfter === true && i < buttons.length - 1) {
        cursor += DIVIDER_GAP - GAP
        divider(this, cursor + DIVIDER_W / 2, y + 5, BTN_H - 10, {
          orientation: "vertical",
          thickness: DIVIDER_W,
        })
        cursor += DIVIDER_W + DIVIDER_GAP
      }
    }
    return cursor
  }

  #buttonGroupWidth(buttons: ToolbarButton[]): number {
    if (buttons.length === 0) return 0
    let width = buttons.length * BTN_W + (buttons.length - 1) * GAP
    for (let i = 0; i < buttons.length - 1; i++) {
      if (buttons[i]?.dividerAfter === true) width += DIVIDER_GAP * 2 + DIVIDER_W - GAP
    }
    return width
  }
}

type ToolbarButton = {
  label: string
  iconSrc: string
  tone: BadgeKind
  disabled?: boolean
  disabledTooltip?: string
  dividerAfter?: boolean
  action(): void
}

function pauseButtonTone(runKind: BadgeKind): BadgeKind {
  return runKind === "live" ? "warn" : "neutral"
}

function resumeButtonTone(runKind: BadgeKind): BadgeKind {
  return runKind === "paused" ? "live" : "neutral"
}

function stepButtonTone(runKind: BadgeKind): BadgeKind {
  return "neutral"
}

function languageTooltip(locale: "ru" | "en"): string {
  return locale === "ru" ? "Язык: русский" : "Language: English"
}
