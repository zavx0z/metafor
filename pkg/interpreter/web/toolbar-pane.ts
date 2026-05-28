/**
 * Toolbar — верхняя полоса. UiSurface-system.
 * Низкий слой берётся из @ui/elements, MUI-like контролы — из
 * @ui/components.
 */

import {UiSurface, palette, radii, uiIcons} from "@ui/elements"
import {Button as button, Divider as divider, StatusChip as statusChip} from "@ui/components"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./interpreter-ui.ts"
import {getUiLocale, t} from "./i18n.ts"

const PAD_X = 8
const GAP = 6
const STATUS_H = 24
const BTN_H = 30
const BTN_W = 36
const STATUS_FONT = 10
const CONTROL_GROUP_GAP = 10
const DIVIDER_GAP = 8
const DIVIDER_W = 1
const SOCKET_W = 78
const CONTEXT_W = 102
const RUN_W = 86

export class ToolbarPane extends UiSurface {
  #state: ToolbarState = {
    ws: "connecting",
    wsKind: "neutral",
    connection: "context: connecting",
    connectionKind: "neutral",
    run: "waiting",
    runKind: "neutral",
    commandBusy: false,
    commandCmd: "",
    commandLabel: "",
    locale: getUiLocale(),
    protocolUrl: "",
    verbose: false,
    engine: "engine: init",
    canPause: false,
    canResume: false,
    canStep: false,
    canRestart: false,
    canStop: false,
    canShowExecutionPoint: false,
  }

  readonly #actions: ToolbarActions

  constructor(actions: ToolbarActions) {
    super({bgColor: palette.bgToolbar, borderColor: null, borderRadiusPx: radii.pane})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const controlsLocked = this.#state.commandBusy
    const lockedTooltip = controlsLocked && this.#state.commandLabel.length > 0
      ? `${t("commandAlreadyRunning")}: ${this.#state.commandLabel}`
      : t("commandAlreadyRunning")
    const actionUnavailableTooltip = controlsLocked ? lockedTooltip : t("runtimeActionUnavailable")
    const primaryControls: ToolbarButton[] = [
      this.#state.runKind === "live"
        ? {
          label: t("pause"),
          iconSrc: uiIcons.pause,
          tone: pauseButtonTone(this.#state.runKind),
          variant: "contained",
          dividerAfter: true,
          disabled: controlsLocked || !this.#state.canPause,
          disabledTooltip: actionUnavailableTooltip,
          action: () => this.#actions.onPause(),
        }
        : {
          label: t("resume"),
          iconSrc: uiIcons.resume,
          tone: resumeButtonTone(this.#state.runKind),
          variant: "contained",
          dividerAfter: true,
          disabled: controlsLocked || !this.#state.canResume,
          disabledTooltip: actionUnavailableTooltip,
          action: () => this.#actions.onResume(),
        },
      {
        label: t("stepOver"),
        iconSrc: uiIcons.stepOver,
        tone: stepButtonTone(this.#state.runKind),
        disabled: controlsLocked || !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onStep("over"),
      },
      {
        label: t("stepInto"),
        iconSrc: uiIcons.stepInto,
        tone: stepButtonTone(this.#state.runKind),
        disabled: controlsLocked || !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onStep("into"),
      },
      {
        label: t("stepOut"),
        iconSrc: uiIcons.stepOut,
        tone: stepButtonTone(this.#state.runKind),
        disabled: controlsLocked || !this.#state.canStep,
        disabledTooltip: actionUnavailableTooltip,
        dividerAfter: true,
        action: () => this.#actions.onStep("out"),
      },
      {
        label: t("restartTarget"),
        iconSrc: uiIcons.restart,
        tone: "neutral",
        disabled: controlsLocked || !this.#state.canRestart,
        disabledTooltip: actionUnavailableTooltip,
        action: () => this.#actions.onRestartTarget(),
      },
      {
        label: t("showExecutionPoint"),
        iconSrc: uiIcons.executionPoint,
        tone: this.#state.canShowExecutionPoint ? "paused" : "neutral",
        disabled: controlsLocked || !this.#state.canShowExecutionPoint,
        disabledTooltip: controlsLocked ? lockedTooltip : t("waitingFrames"),
        action: () => this.#actions.onShowExecutionPoint(),
      },
      {
        label: t("stopTarget"),
        iconSrc: uiIcons.stop,
        tone: "warn",
        variant: "contained",
        disabled: controlsLocked || !this.#state.canStop,
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
    this.#drawButtonGroup(primaryControls, primaryX, buttonY, lockedTooltip)

    const secondaryW = this.#buttonGroupWidth(secondaryControls)
    const secondaryX = Math.max(PAD_X, this.rectW - PAD_X - secondaryW)
    this.#drawButtonGroup(secondaryControls, secondaryX, buttonY, lockedTooltip)

    // Левая часть: compact operational state only. Подробности URL/engine
    // лежат в tooltip, а не съедают toolbar.
    const statusY = (this.rectH - STATUS_H) / 2
    const statusRightLimit = Math.max(PAD_X, Math.min(primaryX - CONTROL_GROUP_GAP, secondaryX - CONTROL_GROUP_GAP))
    let x = PAD_X
    x = this.#fixedStatus(socketLabel(), this.#state.wsKind, socketTooltip(this.#state.wsKind, this.#state.ws), x, statusY, statusRightLimit, SOCKET_W)
    x = this.#fixedStatus(contextLabel(), this.#state.connectionKind, contextTooltip(this.#state.connection, this.#state.protocolUrl), x, statusY, statusRightLimit, CONTEXT_W)
    const runTone = this.#state.commandBusy ? "paused" : this.#state.runKind
    const runText = this.#state.commandBusy ? t("commandExecuting") : runLabel(this.#state.run, this.#state.runKind)
    const runTooltip = this.#state.commandBusy && this.#state.commandLabel.length > 0
      ? `${t("commandExecuting")}: ${this.#state.commandLabel}`
      : `${t("runStatus")}: ${compactRunStatus(this.#state.run)}`
    x = this.#fixedStatus(runText, runTone, runTooltip, x, statusY, statusRightLimit, RUN_W)
  }

  #fixedStatus(label: string, tone: BadgeKind, tooltip: string, x: number, y: number, rightLimit: number, w: number, action?: () => void, indicator = true): number {
    // Slot widths are stable per status type. If the toolbar is too narrow,
    // drop low-priority chips instead of squeezing text and shifting layout.
    if (x + w > rightLimit) return x
    statusChip(this, x, y, w, STATUS_H, {
      label,
      tone,
      variant: "subtle",
      indicator,
      fontPx: STATUS_FONT,
      iconSizePx: 8,
      tooltip,
      ...(action === undefined ? {} : {action}),
    })
    return x + w + GAP
  }

  #drawButtonGroup(buttons: ToolbarButton[], x: number, y: number, lockedTooltip: string): number {
    let cursor = x
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!
      button(this, cursor, y, BTN_W, BTN_H, {
        label: b.label,
        iconSrc: b.iconSrc,
        iconOnly: true,
        iconSizePx: 14,
        size: "small",
        variant: b.variant ?? "outlined",
        radius: 7,
        tooltip: b.disabled === true ? b.disabledTooltip ?? lockedTooltip : b.label,
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
  variant?: "outlined" | "contained"
  disabled?: boolean
  disabledTooltip?: string
  dividerAfter?: boolean
  action(): void
}

function compactRunStatus(value: string): string {
  if (value === "paused (PauseOnNextStatement)") return getUiLocale() === "ru" ? "пауза: следующий JS" : "paused: next JS"
  if (value === "running (pause pending)") return getUiLocale() === "ru" ? "пауза ожидается" : "pause pending"
  if (value === "running") return getUiLocale() === "ru" ? "идёт" : "running"
  if (value === "paused") return getUiLocale() === "ru" ? "пауза" : "paused"
  if (value === "waiting") return getUiLocale() === "ru" ? "ожидание" : "waiting"
  if (value === "reconnecting") return t("reconnecting")
  if (value === "target starting" || value === "module starting") return getUiLocale() === "ru" ? "модуль стартует" : "module starting"
  if (value === "pause requested") return getUiLocale() === "ru" ? "пауза запрошена" : "pause requested"
  if (value === "pause pending") return getUiLocale() === "ru" ? "пауза ожидается" : "pause pending"
  return value
}

function socketLabel(): string {
  return t("socket")
}

function socketTooltip(kind: BadgeKind, value: string): string {
  if (value.includes("closed") || value.includes("finished")) return t("socketClosed")
  if (kind === "warn" || value.includes("disconnected")) return t("socketDisconnected")
  if (kind === "live" || value.includes("connected")) return t("socketConnected")
  return t("socketConnecting")
}

function contextLabel(): string {
  return t("context")
}

function runLabel(value: string, kind: BadgeKind): string {
  if (kind === "paused") return t("targetPaused")
  if (kind === "live") return t("targetRunning")
  if (kind === "warn") return value.startsWith("exited") ? t("targetExited") : t("target")
  return t("targetIdle")
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

function contextTooltip(connection: string, url: string): string {
  const localized = connection.includes("disconnected")
    ? t("contextOffline")
    : connection.includes("finished") || connection.includes("closed")
      ? t("contextFinished")
    : connection.includes("connected")
      ? t("contextConnected")
      : getUiLocale() === "ru" ? "Контекст подключается" : "Context connecting"
  if (url.length === 0) return localized
  return `${localized} · ${url}`
}

function languageTooltip(locale: "ru" | "en"): string {
  return locale === "ru" ? "Язык: русский" : "Language: English"
}
