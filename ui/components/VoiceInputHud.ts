import {UiSurface, button, input, palette, type UiSurfaceRect} from "@ui/elements"
import {Color} from "@metafor/engine"
import {ButtonVoice} from "./ButtonVoice.ts"
import {SliderControl} from "./SliderControl.ts"
import {Switcher} from "./Switcher.ts"

export type VoiceInputHudStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "error"
export type VoiceInputHudServiceState = "unknown" | "ok" | "down"

export type VoiceInputHudSnapshot = {
  status: VoiceInputHudStatus
  statusLine: string
  targetLine: string
  autoEnterLine: string
  detailLine: string
  serviceLine: string
  serviceState: VoiceInputHudServiceState
  level: number
}

export type VoiceInputHudPhraseGroupId = "activation" | "deactivation" | "stop"
export type VoiceInputHudDeactivationMode = "phrase" | "timeout" | "phrase-timeout"

export type VoiceInputHudPhraseGroup = {
  id: VoiceInputHudPhraseGroupId
  title: string
  description: string
  whenLine: string
  effectLine: string
  phrases: string[]
  addLabel: string
  placeholder: string
  resetLabel: string
  fuzzyLabel: string
  fuzzyValue: number
  receivedLabel?: string
  receivedLines?: string[]
}

export type VoiceInputHudSettings = {
  title: string
  generalTabLabel: string
  debugTabLabel: string
  fullStopLabel: string
  fullStopHint: string
  phraseGroups: VoiceInputHudPhraseGroup[]
  deactivationModeLabel: string
  deactivationModeValue: VoiceInputHudDeactivationMode
  deactivationModeOptions: Array<{value: VoiceInputHudDeactivationMode; label: string}>
  recognitionTimeoutLabel: string
  recognitionTimeoutValue: number
  recognitionTimeoutMinValue: number
  recognitionTimeoutMaxValue: number
  recognitionTimeoutUnitLabel: string
  recognitionTimeoutDownLabel: string
  recognitionTimeoutUpLabel: string
  autoSendLabel: string
  autoSendHint: string
  autoSendValue: boolean
  signalVolumeLabel: string
  signalVolumeValue: number
  signalVolumeMaxValue: number
  signalVolumeDownLabel: string
  signalVolumeUpLabel: string
  fuzzyDownLabel: string
  fuzzyUpLabel: string
  fuzzyHintLabel: string
  fuzzyStrictLabel: string
  fuzzyLooseLabel: string
  wakeEndpoint: string
  inputEndpoint: string
  serviceLine: string
  liveLine: string
  debugLines: string[]
}

export type VoiceInputHudOptions = {
  onToggle(): void
  onMove?(rect: UiSurfaceRect): void
  buttonSize?: number
  onPulseFrame?(): void
  settings(): VoiceInputHudSettings
  onFullStop(): void
  onAddPhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onRemovePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onResetPhrases(groupId: VoiceInputHudPhraseGroupId): void
  onSignalVolumeChange(value: number): void
  onAutoSendChange(value: boolean): void
  onDeactivationModeChange(value: VoiceInputHudDeactivationMode): void
  onRecognitionTimeoutChange(value: number): void
  onPhraseFuzzyChange(groupId: VoiceInputHudPhraseGroupId, value: number): void
}

const VOICE_HUD_LONG_PRESS_MS = 450
const SOUND_PULSE_MS = 680
const COMPACT_W = 128
const COMPACT_H = 128
const DEFAULT_BUTTON_SIZE = 58
const SETTINGS_W = 460
const SETTINGS_H = 760
type VoiceInputHudTab = "general" | VoiceInputHudPhraseGroupId | "debug"

export class VoiceInputHud extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    offsetX: number
    offsetY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
  } | null = null
  #suppressToggleClick = false
  #settingsOpen = false
  #compactRectBeforeSettings: UiSurfaceRect | null = null
  #settingsContextToggleAt = 0
  #settingsTab: VoiceInputHudTab = "general"
  #phraseDrafts = new Map<VoiceInputHudPhraseGroupId, string>()
  #soundPulseStartedAt = 0
  #soundPulseRaf: number | null = null
  #snapshot: VoiceInputHudSnapshot = {
    status: "idle",
    statusLine: "",
    targetLine: "",
    autoEnterLine: "",
    detailLine: "",
    serviceLine: "",
    serviceState: "unknown",
    level: 0,
  }

  constructor(private readonly options: VoiceInputHudOptions) {
    super({bgColor: null, borderColor: null})
  }

  setSnapshot(snapshot: VoiceInputHudSnapshot): void {
    this.#snapshot = snapshot
    this.requestRender()
  }

  flashSoundIndicator(): void {
    this.#soundPulseStartedAt = performance.now()
    this.#scheduleSoundPulseFrame()
    this.options.onPulseFrame?.()
    this.requestRender()
  }

  soundPulseAmount(): number {
    return this.#soundPulseAmount()
  }

  protected render(): void {
    const buttonSize = this.#buttonSize()
    const buttonRect = this.#buttonRect()
    if (this.#settingsOpen) this.#drawSettingsMenu()
    ButtonVoice(this, buttonRect.x, buttonRect.y, buttonSize, {
      key: "voice-input-hud-toggle",
      snapshot: this.#snapshot,
      soundPulse: this.#soundPulseAmount(),
      onClick: () => this.#toggleFromClick(),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    if (event.button === 2) {
      event.preventDefault()
      event.stopPropagation()
      this.#cancelPress()
      this.#openSettingsFromContext()
      return
    }
    if (this.#settingsOpen && event.button === 0) {
      const buttonRect = this.#buttonRect()
      const menuRect = this.#settingsMenuRect()
      if (pointInRect(localX, localY, menuRect)) {
        event.preventDefault()
        super.onPointerDown(event, localX, localY)
        return
      }
      if (!pointInRect(localX, localY, buttonRect)) {
        event.preventDefault()
        return
      }
    }
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    if (this.options.onMove === undefined) return
    const point = this.#canvasPoint(event)
    const frame = this.canvas?.surfaceFrame(this)
    if (point === null || frame === undefined || frame === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      offsetX: point.x - frame.rect.x,
      offsetY: point.y - frame.rect.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    }
    press.timer = setTimeout(() => {
      if (this.#press !== press) return
      press.dragging = true
      this.#moveToCanvasPoint(press)
    }, VOICE_HUD_LONG_PRESS_MS)
    this.#press = press
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    if (press === null) {
      super.onPointerMove(event, localX, localY)
      return
    }

    const point = this.#canvasPoint(event)
    if (point !== null) {
      press.lastX = point.x
      press.lastY = point.y
    }

    if (!press.dragging) {
      super.onPointerMove(event, localX, localY)
      return
    }

    event.preventDefault()
    this.#moveToCanvasPoint(press)
    if (this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "grabbing"
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
    const wasDragging = press?.dragging === true
    if (wasDragging) this.#suppressToggleClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressToggleClick = false
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    this.#cancelPress()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#cancelPress()
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    event.preventDefault()
    event.stopPropagation()
    if (performance.now() - this.#settingsContextToggleAt < 350) return
    this.#cancelPress()
    if (localX < 0 || localY < 0 || localX > this.rectW || localY > this.rectH) return
    this.#openSettingsFromContext()
  }

  override dispose(): void {
    this.#cancelPress()
    if (this.#soundPulseRaf !== null) cancelAnimationFrame(this.#soundPulseRaf)
    this.#soundPulseRaf = null
    super.dispose()
  }

  #toggleFromClick(): void {
    if (this.#suppressToggleClick) return
    this.options.onToggle()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #setSettingsOpen(open: boolean): void {
    if (this.#settingsOpen === open) return
    if (open) {
      this.#openSettings()
      return
    }
    this.#closeSettings()
  }

  #openSettingsFromContext(): void {
    this.#settingsContextToggleAt = performance.now()
    this.#setSettingsOpen(true)
  }

  #openSettings(): void {
    const frame = this.canvas?.surfaceFrame(this)
    this.#settingsOpen = true
    this.#settingsTab = "general"
    if (frame !== undefined && frame !== null) {
      this.#compactRectBeforeSettings = {...frame.rect}
      const center = this.#buttonCenterForRect(frame.rect.w, frame.rect.h, false)
      const canvasCenter = {x: frame.rect.x + center.x, y: frame.rect.y + center.y}
      const expandedCenter = this.#buttonCenterForRect(SETTINGS_W, SETTINGS_H, true)
      this.canvas?.setSurfaceRect(this, {
        x: canvasCenter.x - expandedCenter.x,
        y: canvasCenter.y - expandedCenter.y,
        w: SETTINGS_W,
        h: SETTINGS_H,
      })
    }
    this.requestRender()
  }

  #closeSettings(): void {
    this.#settingsOpen = false
    const compact = this.#compactRectBeforeSettings
    this.#compactRectBeforeSettings = null
    if (compact !== null) {
      if (this.options.onMove === undefined) this.canvas?.clearSurfaceRect(this)
      else this.canvas?.setSurfaceRect(this, compact)
    }
    this.requestRender()
  }

  #buttonRect(): UiSurfaceRect {
    const buttonSize = this.#buttonSize()
    const center = this.#buttonCenterForRect(this.rectW, this.rectH, this.#settingsOpen)
    return {
      x: clampNumber(center.x - buttonSize / 2, 0, Math.max(0, this.rectW - buttonSize)),
      y: clampNumber(center.y - buttonSize / 2, 0, Math.max(0, this.rectH - buttonSize)),
      w: buttonSize,
      h: buttonSize,
    }
  }

  #buttonCenterForRect(w: number, h: number, settingsOpen: boolean): {x: number; y: number} {
    const buttonSize = this.#buttonSize()
    if (!settingsOpen) return {x: Math.max(buttonSize / 2, w / 2), y: Math.max(buttonSize / 2, h / 2)}
    return {
      x: Math.max(buttonSize / 2, w - COMPACT_W / 2),
      y: Math.max(buttonSize / 2, h - COMPACT_H / 2),
    }
  }

  #buttonSize(): number {
    return clampNumber(this.options.buttonSize ?? DEFAULT_BUTTON_SIZE, 28, 72)
  }

  #settingsMenuRect(): UiSurfaceRect {
    const pad = 12
    const bottomLimit = Math.max(pad, this.rectH - COMPACT_H - 10)
    return {
      x: pad,
      y: pad,
      w: Math.max(1, this.rectW - pad * 2),
      h: Math.max(1, bottomLimit - pad),
    }
  }

  #drawSettingsMenu(): void {
    const settings = this.options.settings()
    const rect = this.#settingsMenuRect()
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: 8,
      fill: fade(palette.bgPanel, 0.96),
      border: fade(palette.border, 0.54),
      borderWidth: 1,
      z: 0.12,
    })

    const left = rect.x + 12
    const right = rect.x + rect.w - 12
    let y = rect.y + 11
    button(this, right - 22, rect.y + 8, 22, 22, {
      key: "voice-settings-close",
      children: "x",
      onClick: () => this.#setSettingsOpen(false),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 10,
      },
    })
    this.drawText(settings.title, left, y, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: Math.max(1, right - left - 32),
      z: 0.46,
    })
    y += 20
    this.drawText(settings.serviceLine, left, y, {
      fontPx: 10,
      material: this.#snapshot.serviceState === "down" ? this.materials.red : this.materials.muted,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    y += 20

    y = this.#drawSettingsTabs(settings, left, y, Math.max(1, right - left)) + 12
    if (this.#settingsTab === "general") {
      this.#drawGeneralSettings(settings, left, right, y, rect.y + rect.h - 47)
    } else if (this.#settingsTab === "debug") {
      this.#drawDebugTab(settings.debugLines, left, y, Math.max(1, right - left), rect.y + rect.h - 47)
    } else {
      const group = this.#activePhraseGroup(settings.phraseGroups)
      if (group !== null) this.#drawPhraseGroup(settings, group, left, right, y, rect.y + rect.h - 47)
    }

    this.drawText(settings.liveLine, left, rect.y + rect.h - 39, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    this.drawText(`wake · ${settings.wakeEndpoint}   asr · ${settings.inputEndpoint}`, left, rect.y + rect.h - 22, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
  }

  #drawSettingsTabs(settings: VoiceInputHudSettings, x: number, y: number, w: number): number {
    const gap = 6
    const tabs: Array<{id: VoiceInputHudTab; label: string}> = [
      {id: "general", label: settings.generalTabLabel},
      ...settings.phraseGroups.map((group) => ({id: group.id, label: group.title})),
      {id: "debug", label: settings.debugTabLabel},
    ]
    const tabW = Math.max(1, (w - gap * Math.max(0, tabs.length - 1)) / Math.max(1, tabs.length))
    let cx = x
    for (const tab of tabs) {
      this.#drawSettingsTabButton(tab.id, tab.label, cx, y, tabW, 24)
      cx += tabW + gap
    }
    return y + 24
  }

  #drawSettingsTabButton(tab: VoiceInputHudTab, label: string, x: number, y: number, w: number, h: number): void {
    const active = this.#settingsTab === tab
    button(this, x, y, w, h, {
      key: `voice-settings-tab:${tab}`,
      children: label,
      onClick: () => {
        this.#settingsTab = tab
        this.requestRender()
      },
      style: {
        background: active ? "rgba(111, 211, 255, 0.12)" : "rgba(38, 49, 66, 0.36)",
        borderColor: active ? "cyan" : "borderDim",
        borderRadius: 6,
        color: active ? "text" : "muted",
        fontSize: 10,
      },
    })
  }

  #drawGeneralSettings(settings: VoiceInputHudSettings, left: number, right: number, y: number, maxY: number): number {
    const w = Math.max(1, right - left)
    if (y + 48 <= maxY) {
      button(this, left, y, w, 34, {
        key: "voice-full-stop",
        children: settings.fullStopLabel,
        tooltip: settings.fullStopHint,
        onClick: () => this.options.onFullStop(),
        style: {
          background: "rgba(96, 32, 38, 0.54)",
          borderColor: "rgba(255, 112, 112, 0.58)",
          borderRadius: 7,
          color: "text",
          fontSize: 10,
        },
      })
      this.drawText(settings.fullStopHint, left, y + 41, {
        fontPx: 8,
        material: this.materials.muted,
        maxWidthPx: w,
        z: 0.46,
      })
      y += 62
    }

    y = this.#drawAutoSendControl(settings, left, y, w) + 12
    y = this.#drawSignalVolumeControl(settings, left, y, w) + 14
    return y
  }

  #drawSignalVolumeControl(settings: VoiceInputHudSettings, x: number, y: number, w: number): number {
    return SliderControl(this, x, y, w, {
      key: "voice-signal-volume",
      label: settings.signalVolumeLabel,
      value: settings.signalVolumeValue,
      downLabel: settings.signalVolumeDownLabel,
      upLabel: settings.signalVolumeUpLabel,
      step: 0.1,
      max: settings.signalVolumeMaxValue,
      layout: "track",
      format: (value) => `${Math.round(value * 100)}%`,
      onChange: (value) => this.options.onSignalVolumeChange(Math.round(value * 20) / 20),
    })
  }

  #drawAutoSendControl(settings: VoiceInputHudSettings, x: number, y: number, w: number): number {
    const switchW = 44
    const switchH = 22
    this.drawText(settings.autoSendLabel, x, y, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: Math.max(1, w - switchW - 12),
      z: 0.46,
    })
    this.drawText(settings.autoSendHint, x, y + 14, {
      fontPx: 8,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, w - switchW - 12),
      z: 0.46,
    })
    Switcher(this, x + w - switchW, y + 3, switchW, switchH, {
      key: "voice-auto-send",
      checked: settings.autoSendValue,
      color: "primary",
      tooltip: settings.autoSendHint,
      onChange: (checked) => this.options.onAutoSendChange(checked),
    })
    return y + 34
  }

  #activePhraseGroup(groups: readonly VoiceInputHudPhraseGroup[]): VoiceInputHudPhraseGroup | null {
    const selected = groups.find((group) => group.id === this.#settingsTab)
    if (selected !== undefined) return selected
    return groups[0] ?? null
  }

  #drawPhraseGroup(settings: VoiceInputHudSettings, group: VoiceInputHudPhraseGroup, left: number, right: number, y: number, maxY: number): number {
    const actionY = y - 5
    button(this, right - 60, actionY, 60, 20, {
      key: `voice-phrases-reset:${group.id}`,
      children: group.resetLabel,
      onClick: () => this.options.onResetPhrases(group.id),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 9,
      },
    })
    this.drawText(group.title, left, y, {
      fontPx: 10,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, right - left - 68),
      z: 0.46,
    })
    y += 16
    this.drawText(group.description, left, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    y += 18
    this.drawText(group.whenLine, left, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    y += 16
    this.drawText(group.effectLine, left, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    y += 18
    if (group.id === "deactivation") {
      y = this.#drawDeactivationControls(settings, left, right, y, maxY) + 10
    }
    y = this.#drawReceivedLines(group, left, right, y, maxY)
    y = SliderControl(this, left, y, Math.max(1, right - left), {
      key: `voice-fuzzy:${group.id}`,
      label: group.fuzzyLabel,
      value: group.fuzzyValue,
      downLabel: settings.fuzzyDownLabel,
      upLabel: settings.fuzzyUpLabel,
      hintLabel: settings.fuzzyHintLabel,
      rangeStartLabel: settings.fuzzyStrictLabel,
      rangeEndLabel: settings.fuzzyLooseLabel,
      step: 0.05,
      max: 0.5,
      layout: "track",
      format: (value) => `${Math.round(value * 100)}%`,
      onChange: (value) => this.options.onPhraseFuzzyChange(group.id, Math.round(value * 20) / 20),
    }) + 10
    const inputW = Math.max(1, right - left - 66)
    input(this, left, y, inputW, 22, {
      key: `voice-phrase-input:${group.id}`,
      value: this.#phraseDraft(group.id),
      placeholder: group.placeholder,
      submitOnEnter: true,
      fontPx: 10,
      onChange: (value) => {
        this.#phraseDrafts.set(group.id, value)
      },
      onSubmit: () => this.#submitPhraseDraft(group.id),
      style: {
        background: "rgba(10, 14, 21, 0.88)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "text",
        paddingX: 8,
      },
    })
    button(this, right - 60, y, 60, 22, {
      key: `voice-phrases-add:${group.id}`,
      children: group.addLabel,
      onClick: () => this.#submitPhraseDraft(group.id),
      style: {
        background: "rgba(38, 49, 66, 0.58)",
        borderColor: "borderDim",
        borderRadius: 6,
        fontSize: 9,
      },
    })
    y += 30
    return this.#drawPhraseChips(group, left, y, Math.max(1, right - left), maxY)
  }

  #drawDeactivationControls(settings: VoiceInputHudSettings, left: number, right: number, y: number, maxY: number): number {
    const w = Math.max(1, right - left)
    if (y + 70 > maxY) return y
    this.drawText(settings.deactivationModeLabel, left, y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: w,
      z: 0.46,
    })
    const gap = 6
    const rowY = y + 15
    const buttonH = 22
    const options = settings.deactivationModeOptions
    const buttonW = Math.max(1, (w - gap * Math.max(0, options.length - 1)) / Math.max(1, options.length))
    let cx = left
    for (const option of options) {
      const active = settings.deactivationModeValue === option.value
      button(this, cx, rowY, buttonW, buttonH, {
        key: `voice-deactivation-mode:${option.value}`,
        children: option.label,
        onClick: () => this.options.onDeactivationModeChange(option.value),
        style: {
          background: active ? "rgba(111, 211, 255, 0.12)" : "rgba(38, 49, 66, 0.36)",
          borderColor: active ? "cyan" : "borderDim",
          borderRadius: 6,
          color: active ? "text" : "muted",
          fontSize: 9,
        },
      })
      cx += buttonW + gap
    }
    return SliderControl(this, left, rowY + buttonH + 10, w, {
      key: "voice-recognition-timeout",
      label: settings.recognitionTimeoutLabel,
      value: settings.recognitionTimeoutValue,
      min: settings.recognitionTimeoutMinValue,
      max: settings.recognitionTimeoutMaxValue,
      downLabel: settings.recognitionTimeoutDownLabel,
      upLabel: settings.recognitionTimeoutUpLabel,
      step: 1,
      layout: "track",
      format: (value) => `${Math.round(value)} ${settings.recognitionTimeoutUnitLabel}`,
      onChange: (value) => this.options.onRecognitionTimeoutChange(Math.round(value)),
    })
  }

  #drawReceivedLines(group: VoiceInputHudPhraseGroup, left: number, right: number, y: number, maxY: number): number {
    const lines = group.receivedLines ?? []
    if (lines.length === 0) return y + 2
    if (y + 15 > maxY) return y
    this.drawText(group.receivedLabel ?? "", left, y, {
      fontPx: 9,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, right - left),
      z: 0.46,
    })
    y += 14
    for (const line of lines.slice(0, 3)) {
      if (y + 14 > maxY) break
      this.drawText(line, left, y, {
        fontPx: 9,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, right - left),
        z: 0.46,
      })
      y += 14
    }
    return y + 6
  }

  #drawDebugTab(lines: readonly string[], x: number, y: number, w: number, maxY: number): void {
    const lineH = 16
    let cy = y
    for (const line of lines) {
      if (cy + lineH > maxY) break
      const warn = /error|ошибка|ASR недоступен|unavailable|closed|failed/i.test(line)
      this.drawText(line, x, cy + 2, {
        fontPx: 9,
        material: warn ? this.materials.orange : this.materials.muted,
        maxWidthPx: w,
        z: 0.46,
      })
      cy += lineH
    }
  }

  #phraseDraft(groupId: VoiceInputHudPhraseGroupId): string {
    return this.#phraseDrafts.get(groupId) ?? ""
  }

  #submitPhraseDraft(groupId: VoiceInputHudPhraseGroupId): void {
    const phrase = this.#phraseDraft(groupId).replace(/\s+/g, " ").trim()
    if (!phrase) return
    this.options.onAddPhrase(groupId, phrase)
    this.#phraseDrafts.set(groupId, "")
    this.requestRender()
  }

  #drawPhraseChips(group: VoiceInputHudPhraseGroup, x: number, y: number, w: number, maxY: number): number {
    let cx = x
    let cy = y
    const gap = 5
    const chipH = 18
    for (const phrase of group.phrases) {
      if (cy + chipH > maxY) break
      const chipW = Math.min(w, Math.ceil(this.measureText(phrase, 9)) + 25)
      if (cx > x && cx + chipW > x + w) {
        cx = x
        cy += chipH + gap
        if (cy + chipH > maxY) break
      }
      this.drawRoundedRect(cx, cy, chipW, chipH, {
        radius: 6,
        fill: fade(palette.bgHot, 0.58),
        border: fade(palette.borderDim, 0.8),
        borderWidth: 1,
        z: 0.16,
      })
      this.drawText(phrase, cx + 8, cy + 4, {
        fontPx: 9,
        material: this.materials.text,
        maxWidthPx: Math.max(1, chipW - 25),
        z: 0.46,
      })
      this.drawText("x", cx + chipW - 13, cy + 4, {
        fontPx: 9,
        material: this.materials.muted,
        maxWidthPx: 8,
        z: 0.46,
      })
      this.hit(cx, cy, chipW, chipH, () => this.options.onRemovePhrase(group.id, phrase), {
        cursor: "pointer",
        key: `voice-phrase-remove:${group.id}:${phrase}`,
      })
      cx += chipW + gap
    }
    return cy + chipH
  }

  #moveToCanvasPoint(press: {lastX: number; lastY: number; offsetX: number; offsetY: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    const applied = this.canvas?.setSurfaceRect(this, {
      x: press.lastX - press.offsetX,
      y: press.lastY - press.offsetY,
      w: frame.rect.w,
      h: frame.rect.h,
    })
    if (applied !== undefined && applied !== null) this.options.onMove?.(applied)
  }

  #soundPulseAmount(): number {
    if (this.#soundPulseStartedAt <= 0) return 0
    const elapsed = performance.now() - this.#soundPulseStartedAt
    if (elapsed >= SOUND_PULSE_MS) return 0
    const progress = elapsed / SOUND_PULSE_MS
    return 1 - progress
  }

  #scheduleSoundPulseFrame(): void {
    if (this.#soundPulseRaf !== null) return
    this.#soundPulseRaf = requestAnimationFrame(() => {
      this.#soundPulseRaf = null
      if (this.#soundPulseAmount() <= 0) {
        this.#soundPulseStartedAt = 0
        this.options.onPulseFrame?.()
        this.requestRender()
        return
      }
      this.options.onPulseFrame?.()
      this.requestRender()
      this.#scheduleSoundPulseFrame()
    })
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * opacity)))
}

function pointInRect(x: number, y: number, rect: UiSurfaceRect): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
