/**
 * Toolbar — верхняя полоса. Card-system.
 * Кнопки и бейджи через widget-функции из @metafor/ui (одинаковый
 * look-and-feel с playground-демо).
 */

import {Card, palette, radii, uiIcons, button, statusChip} from "@metafor/ui"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./debug-ui.ts"
import {getUiLocale, t} from "./i18n.ts"

const PAD_X = 8
const GAP = 6
const STATUS_H = 30
const BTN_H = 30
const BTN_W = 36
const STATUS_FONT = 11
const LANG_W = 76
const SOCKET_W = 108
const INSPECTOR_W = 132
const RUN_W = 128
const DRAFT_W = 118

export class ToolbarCard extends Card {
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
  }

  readonly #actions: ToolbarActions

  constructor(actions: ToolbarActions) {
    super({bgColor: palette.bgToolbar, borderColor: null, borderRadiusPx: radii.card})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const controlsLocked = this.#state.commandBusy
    const pauseLocked = controlsLocked && this.#state.commandCmd !== "resume"
    const lockedTooltip = controlsLocked && this.#state.commandLabel.length > 0
      ? `${t("commandAlreadyRunning")}: ${this.#state.commandLabel}`
      : t("commandAlreadyRunning")
    const buttons: Array<{label: string; iconSrc: string; tone: BadgeKind; disabled?: boolean; action(): void}> = [
      {label: this.#state.verbose ? t("hideVerbose") : t("showVerbose"), iconSrc: uiIcons.log, tone: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: this.#state.draftVisible ? t("showSource") : t("editDraft"), iconSrc: uiIcons.manual, tone: this.#state.draftVisible ? "paused" : "neutral", action: () => this.#actions.onToggleDraft()},
      {label: t("saveDraft"), iconSrc: uiIcons.apply, tone: this.#state.draftKind, action: () => this.#actions.onSaveDraft()},
      {label: t("restartTarget"), iconSrc: uiIcons.restart, tone: "neutral", action: () => this.#actions.onRestartTarget()},
      {label: t("pause"), iconSrc: uiIcons.pause, tone: pauseButtonTone(this.#state.runKind), disabled: pauseLocked, action: () => this.#actions.onPause()},
      {label: t("resume"), iconSrc: uiIcons.resume, tone: resumeButtonTone(this.#state.runKind), disabled: controlsLocked, action: () => this.#actions.onResume()},
      {label: t("stepOver"), iconSrc: uiIcons.stepOver, tone: stepButtonTone(this.#state.runKind), disabled: controlsLocked, action: () => this.#actions.onStep("over")},
      {label: t("stepInto"), iconSrc: uiIcons.stepInto, tone: stepButtonTone(this.#state.runKind), disabled: controlsLocked, action: () => this.#actions.onStep("into")},
      {label: t("stepOut"), iconSrc: uiIcons.stepOut, tone: stepButtonTone(this.#state.runKind), disabled: controlsLocked, action: () => this.#actions.onStep("out")},
    ]

    let right = this.rectW - PAD_X
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i]!
      const w = BTN_W
      right -= w
      button(this, right, buttonY, w, BTN_H, {
        label: b.label,
        iconSrc: b.iconSrc,
        iconOnly: true,
        iconSizePx: 16,
        tooltip: b.disabled === true ? lockedTooltip : b.label,
        tone: b.tone,
        ...(b.disabled === undefined ? {} : {disabled: b.disabled}),
        action: b.action,
      })
      right -= GAP
    }
    const rightLimit = Math.max(PAD_X, right)

    // Левая часть: compact operational state only. Подробности вроде
    // inspector URL/engine лежат в tooltip, а не съедают toolbar.
    const statusY = (this.rectH - STATUS_H) / 2
    let x = PAD_X
    x = this.#fixedStatus(this.#state.locale.toUpperCase(), "neutral", uiIcons.language, t("langToggle"), x, statusY, rightLimit, LANG_W, () => this.#actions.onToggleLocale(), false)
    x = this.#fixedStatus(socketLabel(), this.#state.wsKind, statusIcon(this.#state.wsKind), socketTooltip(this.#state.wsKind, this.#state.ws), x, statusY, rightLimit, SOCKET_W)
    x = this.#fixedStatus(inspectorLabel(), this.#state.connectionKind, statusIcon(this.#state.connectionKind), inspectorTooltip(this.#state.connection, this.#state.inspectorUrl), x, statusY, rightLimit, INSPECTOR_W)
    const runTone = this.#state.commandBusy ? "paused" : this.#state.runKind
    const runText = this.#state.commandBusy ? t("commandExecuting") : runLabel(this.#state.run, this.#state.runKind)
    const runIcon = this.#state.commandBusy ? uiIcons.autoscroll : runStatusIcon(this.#state.runKind)
    const runTooltip = this.#state.commandBusy && this.#state.commandLabel.length > 0
      ? `${t("commandExecuting")}: ${this.#state.commandLabel}`
      : `${t("runStatus")}: ${compactRunStatus(this.#state.run)}`
    x = this.#fixedStatus(runText, runTone, runIcon, runTooltip, x, statusY, rightLimit, RUN_W)
    if (this.#state.draftVisible || this.#state.draftKind !== "neutral") {
      x = this.#fixedStatus(draftLabel(this.#state.draftStatus, this.#state.draftKind), this.#state.draftKind, statusIcon(this.#state.draftKind), `${t("draft")}: ${draftStatusText(this.#state.draftStatus)}`, x, statusY, rightLimit, DRAFT_W)
    }
  }

  #fixedStatus(label: string, tone: BadgeKind, iconSrc: string | null, tooltip: string, x: number, y: number, rightLimit: number, w: number, action?: () => void, indicator = true): number {
    // Slot widths are stable per status type. If the toolbar is too narrow,
    // drop low-priority chips instead of squeezing text and shifting layout.
    if (x + w > rightLimit) return x
    statusChip(this, x, y, w, STATUS_H, {
      label,
      tone,
      indicator,
      ...(iconSrc === null ? {} : {iconSrc}),
      fontPx: STATUS_FONT,
      tooltip,
      ...(action === undefined ? {} : {action}),
    })
    return x + w + GAP
  }
}

function compactRunStatus(value: string): string {
  if (value === "paused (PauseOnNextStatement)") return getUiLocale() === "ru" ? "пауза: следующий JS" : "paused: next JS"
  if (value === "running (pause pending)") return getUiLocale() === "ru" ? "пауза ожидается" : "pause pending"
  if (value === "running") return getUiLocale() === "ru" ? "идёт" : "running"
  if (value === "paused") return getUiLocale() === "ru" ? "пауза" : "paused"
  if (value === "waiting") return getUiLocale() === "ru" ? "ожидание" : "waiting"
  if (value === "reconnecting") return t("reconnecting")
  if (value === "target starting") return getUiLocale() === "ru" ? "target стартует" : "target starting"
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

function statusIcon(kind: BadgeKind): string | null {
  if (kind === "live") return uiIcons.apply
  if (kind === "paused") return uiIcons.pause
  if (kind === "warn") return uiIcons.stop
  return null
}

function runStatusIcon(kind: BadgeKind): string | null {
  if (kind === "live") return uiIcons.resume
  if (kind === "paused") return uiIcons.pause
  if (kind === "warn") return uiIcons.stop
  return null
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
