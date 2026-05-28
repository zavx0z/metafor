/**
 * Toolbar — верхняя полоса. UiSurface-system.
 * Низкий слой берётся из @metafor/elements, MUI-like контролы — из
 * @metafor/components.
 */

import {UiSurface, palette, radii, uiIcons} from "@metafor/elements"
import {Button as button, Divider as divider, StatusChip as statusChip} from "@metafor/components"
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
const INSPECTOR_W = 102
const RUN_W = 86
const DRAFT_W = 118

export class ToolbarPane extends UiSurface {
  #state: ToolbarState = {
    ws: "connecting",
    wsKind: "neutral",
    connection: "inspector: connecting",
    connectionKind: "neutral",
    run: "waiting",
    runKind: "neutral",
    commandBusy: false,
    commandCmd: "",
    commandLabel: "",
    draftVisible: false,
    draftStatus: "clean",
    draftKind: "neutral",
    locale: getUiLocale(),
    inspectorUrl: "",
    verbose: false,
    engine: "engine: init",
    welcomeVisible: false,
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
    const primaryControls: ToolbarButton[] = [
      this.#state.runKind === "live"
        ? {label: t("pause"), iconSrc: uiIcons.pause, tone: pauseButtonTone(this.#state.runKind), variant: "contained", dividerAfter: true, action: () => this.#actions.onPause()}
        : {label: t("resume"), iconSrc: uiIcons.resume, tone: resumeButtonTone(this.#state.runKind), variant: "contained", dividerAfter: true, action: () => this.#actions.onResume()},
      {label: t("stepOver"), iconSrc: uiIcons.stepOver, tone: stepButtonTone(this.#state.runKind), action: () => this.#actions.onStep("over")},
      {label: t("stepInto"), iconSrc: uiIcons.stepInto, tone: stepButtonTone(this.#state.runKind), action: () => this.#actions.onStep("into")},
      {label: t("stepOut"), iconSrc: uiIcons.stepOut, tone: stepButtonTone(this.#state.runKind), dividerAfter: true, action: () => this.#actions.onStep("out")},
      {label: t("restartTarget"), iconSrc: uiIcons.restart, tone: "neutral", action: () => this.#actions.onRestartTarget()},
      {
        label: t("showExecutionPoint"),
        iconSrc: uiIcons.executionPoint,
        tone: this.#state.canShowExecutionPoint ? "paused" : "neutral",
        disabled: !this.#state.canShowExecutionPoint,
        disabledTooltip: t("waitingFrames"),
        action: () => this.#actions.onShowExecutionPoint(),
      },
      {label: t("stopTarget"), iconSrc: uiIcons.stop, tone: "warn", variant: "contained", action: () => this.#actions.onStopTarget()},
    ]
    const secondaryControls: ToolbarButton[] = [
      {label: this.#state.verbose ? t("hideVerbose") : t("showVerbose"), iconSrc: uiIcons.log, tone: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: this.#state.draftVisible ? t("showSource") : t("editDraft"), iconSrc: uiIcons.manual, tone: this.#state.draftVisible ? "paused" : "neutral", action: () => this.#actions.onToggleDraft()},
      {label: t("saveDraft"), iconSrc: uiIcons.apply, tone: this.#state.draftKind, variant: this.#state.draftKind === "warn" ? "contained" : "outlined", action: () => this.#actions.onSaveDraft()},
      {label: languageTooltip(this.#state.locale), iconSrc: uiIcons.language, tone: "neutral", action: () => this.#actions.onToggleLocale()},
    ]

    const primaryW = this.#buttonGroupWidth(primaryControls)
    const primaryX = Math.max(PAD_X, Math.floor((this.rectW - primaryW) / 2))
    if (!this.#state.welcomeVisible) this.#drawButtonGroup(primaryControls, primaryX, buttonY, lockedTooltip)

    const secondaryW = this.#buttonGroupWidth(secondaryControls)
    const secondaryX = Math.max(PAD_X, this.rectW - PAD_X - secondaryW)
    if (!this.#state.welcomeVisible) this.#drawButtonGroup(secondaryControls, secondaryX, buttonY, lockedTooltip)

    // Левая часть: compact operational state only. Подробности вроде
    // inspector URL/engine лежат в tooltip, а не съедают toolbar.
    const statusY = (this.rectH - STATUS_H) / 2
    const statusRightLimit = Math.max(PAD_X, Math.min(primaryX - CONTROL_GROUP_GAP, secondaryX - CONTROL_GROUP_GAP))
    let x = PAD_X
    x = this.#fixedStatus(socketLabel(), this.#state.wsKind, socketTooltip(this.#state.wsKind, this.#state.ws), x, statusY, statusRightLimit, SOCKET_W)
    x = this.#fixedStatus(inspectorLabel(), this.#state.connectionKind, inspectorTooltip(this.#state.connection, this.#state.inspectorUrl), x, statusY, statusRightLimit, INSPECTOR_W)
    const runTone = this.#state.commandBusy ? "paused" : this.#state.runKind
    const runText = this.#state.commandBusy ? t("commandExecuting") : runLabel(this.#state.run, this.#state.runKind)
    const runTooltip = this.#state.commandBusy && this.#state.commandLabel.length > 0
      ? `${t("commandExecuting")}: ${this.#state.commandLabel}`
      : `${t("runStatus")}: ${compactRunStatus(this.#state.run)}`
    x = this.#fixedStatus(runText, runTone, runTooltip, x, statusY, statusRightLimit, RUN_W)
    if (this.#state.draftVisible || this.#state.draftKind !== "neutral") {
      x = this.#fixedStatus(draftLabel(this.#state.draftStatus, this.#state.draftKind), this.#state.draftKind, `${t("draft")}: ${draftStatusText(this.#state.draftStatus)}`, x, statusY, statusRightLimit, DRAFT_W)
    }
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
  if (value === "target starting") return getUiLocale() === "ru" ? "процесс стартует" : "process starting"
  if (value === "pause requested") return getUiLocale() === "ru" ? "пауза запрошена" : "pause requested"
  if (value === "pause pending") return getUiLocale() === "ru" ? "пауза ожидается" : "pause pending"
  return value
}

function socketLabel(): string {
  return t("socket")
}

function socketTooltip(kind: BadgeKind, value: string): string {
  if (kind === "warn" || value.includes("disconnected")) return t("socketDisconnected")
  if (kind === "live" || value.includes("connected")) return t("socketConnected")
  return t("socketConnecting")
}

function inspectorLabel(): string {
  return t("inspector")
}

function runLabel(value: string, kind: BadgeKind): string {
  if (kind === "paused") return t("targetPaused")
  if (kind === "live") return t("targetRunning")
  if (kind === "warn") return value.startsWith("exited") ? t("targetExited") : t("target")
  return t("targetIdle")
}

function draftLabel(value: string, kind: BadgeKind): string {
  if (kind === "warn") return t("draftDirty")
  if (value === "no source") return t("draft")
  return t("draft")
}

function draftStatusText(value: string): string {
  if (value === "dirty") return t("dirty")
  if (value === "saved in memory") return t("savedInMemory")
  if (value === "no source") return t("draftNoSource")
  if (value === "clean") return t("clean")
  return value
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

function inspectorTooltip(connection: string, url: string): string {
  const localized = connection.includes("disconnected")
    ? t("inspectorOffline")
    : connection.includes("connected")
      ? t("inspectorConnected")
      : getUiLocale() === "ru" ? "Inspector подключается" : "Inspector connecting"
  if (url.length === 0) return localized
  return `${localized} · ${url}`
}

function languageTooltip(locale: "ru" | "en"): string {
  return locale === "ru" ? "Язык: русский" : "Language: English"
}
