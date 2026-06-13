import {UiSurface, button, drawIconCentered, input, palette, type UiSurfaceRect} from "@ui/elements"
import {Color} from "@metafor/engine"

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
  debugTabLabel: string
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
  settings(): VoiceInputHudSettings
  onAddPhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onRemovePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onResetPhrases(groupId: VoiceInputHudPhraseGroupId): void
  onSignalVolumeChange(value: number): void
  onDeactivationModeChange(value: VoiceInputHudDeactivationMode): void
  onRecognitionTimeoutChange(value: number): void
  onPhraseFuzzyChange(groupId: VoiceInputHudPhraseGroupId, value: number): void
}

const VOICE_HUD_LONG_PRESS_MS = 450
const SOUND_PULSE_MS = 680
const COMPACT_W = 128
const COMPACT_H = 128
const BUTTON_SIZE = 58
const SETTINGS_W = 460
const SETTINGS_H = 760
type VoiceInputHudTab = VoiceInputHudPhraseGroupId | "debug"

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
  #settingsTab: VoiceInputHudTab = "activation"
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
    this.requestRender()
  }

  protected render(): void {
    const status = this.#snapshot.status
    const error = status === "error" || this.#snapshot.serviceState === "down"
    const buttonRect = this.#buttonRect()
    const buttonX = buttonRect.x
    const buttonY = buttonRect.y
    const centerX = buttonX + buttonRect.w / 2
    const centerY = buttonY + buttonRect.h / 2
    const active = status === "listening" || status === "committing"
    const waiting = status === "waitingWake"
    const connecting = status === "connecting" || status === "committing"
    const soundPulse = this.#soundPulseAmount()
    const iconColor = error
      ? palette.red
      : connecting
        ? palette.orange
        : active
          ? palette.cyan
          : soundPulse > 0
            ? mixColor(palette.cyan, palette.text, 0.28)
            : waiting
              ? fade(palette.cyan, 0.68)
              : palette.muted
    if (this.#settingsOpen) this.#drawSettingsMenu()

    if (active || waiting) {
      this.#drawRadialMeter(
        centerX,
        centerY,
        waiting ? BUTTON_SIZE / 2 - 11 : BUTTON_SIZE / 2 + 7,
        active ? 18 : 0,
      )
    }
    if (soundPulse > 0) this.#drawSoundPulse(centerX, centerY, BUTTON_SIZE, soundPulse)

    button(this, buttonX, buttonY, buttonRect.w, buttonRect.h, {
      key: "voice-input-hud-toggle",
      onClick: () => this.#toggleFromClick(),
      style: (state) => ({
        background: state === "hover" ? "rgba(18, 28, 42, 0.82)" : "rgba(10, 16, 24, 0.72)",
        borderColor: error ? "red" : connecting ? "orange" : active ? "cyan" : waiting ? "border" : "borderDim",
        borderRadius: BUTTON_SIZE / 2,
        borderWidth: active || connecting || error ? 1.2 : 1,
        glassTint: active || soundPulse > 0 ? "cyan" : null,
        glassTintOpacity: active ? 0.08 : soundPulse > 0 ? 0.06 * soundPulse : 0,
        zIndex: 0.3,
      }),
      children: (state) => drawIconCentered(this, micIcon(iconColor), centerX, centerY, 22, {
        opacity: state === "hover" || active || soundPulse > 0 ? 0.96 : waiting || connecting ? 0.84 : 0.72,
        z: 0.55,
      }),
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
    const center = this.#buttonCenterForRect(this.rectW, this.rectH, this.#settingsOpen)
    return {
      x: clampNumber(center.x - BUTTON_SIZE / 2, 0, Math.max(0, this.rectW - BUTTON_SIZE)),
      y: clampNumber(center.y - BUTTON_SIZE / 2, 0, Math.max(0, this.rectH - BUTTON_SIZE)),
      w: BUTTON_SIZE,
      h: BUTTON_SIZE,
    }
  }

  #buttonCenterForRect(w: number, h: number, settingsOpen: boolean): {x: number; y: number} {
    if (!settingsOpen) return {x: Math.max(BUTTON_SIZE / 2, w / 2), y: Math.max(BUTTON_SIZE / 2, h / 2)}
    return {
      x: Math.max(BUTTON_SIZE / 2, w - COMPACT_W / 2),
      y: Math.max(BUTTON_SIZE / 2, h - COMPACT_H / 2),
    }
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
    y = this.#drawSignalVolumeControl(settings, left, y, Math.max(1, right - left)) + 12
    this.drawRect(left, y, Math.max(1, right - left), 1, fade(palette.borderDim, 0.72), 0.2)
    y += 10

    y = this.#drawSettingsTabs(settings, left, y, Math.max(1, right - left)) + 12
    if (this.#settingsTab === "debug") {
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

  #drawSignalVolumeControl(settings: VoiceInputHudSettings, x: number, y: number, w: number): number {
    return this.#drawPercentControl({
      key: "voice-signal-volume",
      label: settings.signalVolumeLabel,
      value: settings.signalVolumeValue,
      downLabel: settings.signalVolumeDownLabel,
      upLabel: settings.signalVolumeUpLabel,
      step: 0.1,
      maxValue: settings.signalVolumeMaxValue,
      x,
      y,
      w,
      onChange: (value) => this.options.onSignalVolumeChange(value),
    })
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
    y = this.#drawPercentControl({
      key: `voice-fuzzy:${group.id}`,
      label: group.fuzzyLabel,
      value: group.fuzzyValue,
      downLabel: settings.fuzzyDownLabel,
      upLabel: settings.fuzzyUpLabel,
      hintLabel: settings.fuzzyHintLabel,
      rangeStartLabel: settings.fuzzyStrictLabel,
      rangeEndLabel: settings.fuzzyLooseLabel,
      step: 0.05,
      maxValue: 0.5,
      x: left,
      y,
      w: Math.max(1, right - left),
      onChange: (value) => this.options.onPhraseFuzzyChange(group.id, value),
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
    return this.#drawSecondsControl({
      key: "voice-recognition-timeout",
      label: settings.recognitionTimeoutLabel,
      value: settings.recognitionTimeoutValue,
      minValue: settings.recognitionTimeoutMinValue,
      maxValue: settings.recognitionTimeoutMaxValue,
      unitLabel: settings.recognitionTimeoutUnitLabel,
      downLabel: settings.recognitionTimeoutDownLabel,
      upLabel: settings.recognitionTimeoutUpLabel,
      step: 1,
      x: left,
      y: rowY + buttonH + 10,
      w,
      onChange: (value) => this.options.onRecognitionTimeoutChange(value),
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

  #drawPercentControl(opts: {
    key: string
    label: string
    value: number
    downLabel: string
    upLabel: string
    hintLabel?: string
    rangeStartLabel?: string
    rangeEndLabel?: string
    step: number
    maxValue?: number
    x: number
    y: number
    w: number
    onChange(value: number): void
  }): number {
    const maxValue = Math.max(0.01, opts.maxValue ?? 1)
    const value = clampNumber(opts.value, 0, maxValue)
    const ratio = value / maxValue
    const percent = Math.round(value * 100)
    this.drawText(opts.label, opts.x, opts.y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, opts.w - 52),
      z: 0.46,
    })
    this.drawText(`${percent}%`, opts.x + opts.w - 45, opts.y, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: 45,
      z: 0.46,
    })

    const rowY = opts.y + (opts.hintLabel === undefined ? 16 : 30)
    if (opts.hintLabel !== undefined) {
      this.drawText(opts.hintLabel, opts.x, opts.y + 14, {
        fontPx: 8,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, opts.w),
        z: 0.46,
      })
    }
    const buttonW = 28
    button(this, opts.x, rowY, buttonW, 22, {
      key: `${opts.key}:down`,
      children: "-",
      tooltip: opts.downLabel,
      onClick: () => this.#setPercentValue(value - opts.step, maxValue, opts.onChange),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 12,
      },
    })
    button(this, opts.x + opts.w - buttonW, rowY, buttonW, 22, {
      key: `${opts.key}:up`,
      children: "+",
      tooltip: opts.upLabel,
      onClick: () => this.#setPercentValue(value + opts.step, maxValue, opts.onChange),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 12,
      },
    })

    const trackX = opts.x + buttonW + 10
    const trackW = Math.max(1, opts.w - buttonW * 2 - 20)
    const trackY = rowY + 8
    this.drawRoundedRect(trackX, trackY, trackW, 6, {
      radius: 3,
      fill: fade(palette.borderDim, 0.44),
      border: null,
      z: 0.16,
    })
    this.drawRoundedRect(trackX, trackY, Math.max(3, trackW * ratio), 6, {
      radius: 3,
      fill: fade(palette.cyan, 0.64),
      border: null,
      z: 0.18,
    })
    const knobX = trackX + trackW * ratio
    this.drawRoundedRect(knobX - 5, trackY - 4, 10, 14, {
      radius: 5,
      fill: fade(palette.cyan, 0.82),
      border: fade(palette.text, 0.24),
      borderWidth: 1,
      z: 0.22,
    })
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
      const tx = trackX + trackW * tick
      this.drawRect(tx, trackY + 10, 1, 3, fade(palette.borderDim, 0.68), 0.18)
    }
    if (opts.rangeStartLabel !== undefined || opts.rangeEndLabel !== undefined) {
      const labelY = rowY + 27
      if (opts.rangeStartLabel !== undefined) {
        this.drawText(opts.rangeStartLabel, trackX, labelY, {
          fontPx: 8,
          material: this.materials.muted,
          maxWidthPx: Math.max(1, trackW / 2 - 4),
          z: 0.46,
        })
      }
      if (opts.rangeEndLabel !== undefined) {
        const endW = Math.max(1, trackW / 2 - 4)
        this.drawText(opts.rangeEndLabel, trackX + trackW - endW, labelY, {
          fontPx: 8,
          material: this.materials.muted,
          maxWidthPx: endW,
          z: 0.46,
        })
      }
    }
    const setFromPointer = (localX: number): void => this.#setPercentValue(((localX - trackX) / trackW) * maxValue, maxValue, opts.onChange)
    this.hit(trackX - 4, rowY, trackW + 8, 22, () => undefined, {
      key: `${opts.key}:track`,
      cursor: "pointer",
      onPointerDown: (localX) => setFromPointer(localX),
      onPointerMove: (localX) => setFromPointer(localX),
    })
    return rowY + (opts.rangeStartLabel === undefined && opts.rangeEndLabel === undefined ? 22 : 39)
  }

  #drawSecondsControl(opts: {
    key: string
    label: string
    value: number
    minValue: number
    maxValue: number
    unitLabel: string
    downLabel: string
    upLabel: string
    step: number
    x: number
    y: number
    w: number
    onChange(value: number): void
  }): number {
    const minValue = Math.min(opts.minValue, opts.maxValue)
    const maxValue = Math.max(opts.minValue, opts.maxValue)
    const value = clampNumber(opts.value, minValue, maxValue)
    const range = Math.max(1, maxValue - minValue)
    const ratio = (value - minValue) / range
    this.drawText(opts.label, opts.x, opts.y, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, opts.w - 52),
      z: 0.46,
    })
    this.drawText(`${Math.round(value)} ${opts.unitLabel}`, opts.x + opts.w - 45, opts.y, {
      fontPx: 9,
      material: this.materials.text,
      maxWidthPx: 45,
      z: 0.46,
    })

    const rowY = opts.y + 16
    const buttonW = 28
    button(this, opts.x, rowY, buttonW, 22, {
      key: `${opts.key}:down`,
      children: "-",
      tooltip: opts.downLabel,
      onClick: () => this.#setNumberValue(value - opts.step, minValue, maxValue, opts.onChange),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 12,
      },
    })
    button(this, opts.x + opts.w - buttonW, rowY, buttonW, 22, {
      key: `${opts.key}:up`,
      children: "+",
      tooltip: opts.upLabel,
      onClick: () => this.#setNumberValue(value + opts.step, minValue, maxValue, opts.onChange),
      style: {
        background: "rgba(38, 49, 66, 0.42)",
        borderColor: "borderDim",
        borderRadius: 6,
        color: "muted",
        fontSize: 12,
      },
    })

    const trackX = opts.x + buttonW + 10
    const trackW = Math.max(1, opts.w - buttonW * 2 - 20)
    const trackY = rowY + 8
    this.drawRoundedRect(trackX, trackY, trackW, 6, {
      radius: 3,
      fill: fade(palette.borderDim, 0.44),
      border: null,
      z: 0.16,
    })
    this.drawRoundedRect(trackX, trackY, Math.max(3, trackW * ratio), 6, {
      radius: 3,
      fill: fade(palette.cyan, 0.64),
      border: null,
      z: 0.18,
    })
    const knobX = trackX + trackW * ratio
    this.drawRoundedRect(knobX - 5, trackY - 4, 10, 14, {
      radius: 5,
      fill: fade(palette.cyan, 0.82),
      border: fade(palette.text, 0.24),
      borderWidth: 1,
      z: 0.22,
    })
    const setFromPointer = (localX: number): void => this.#setNumberValue(minValue + ((localX - trackX) / trackW) * range, minValue, maxValue, opts.onChange)
    this.hit(trackX - 4, rowY, trackW + 8, 22, () => undefined, {
      key: `${opts.key}:track`,
      cursor: "pointer",
      onPointerDown: (localX) => setFromPointer(localX),
      onPointerMove: (localX) => setFromPointer(localX),
    })
    return rowY + 22
  }

  #setPercentValue(value: number, maxValue: number, onChange: (value: number) => void): void {
    const stepped = Math.round(clampNumber(value, 0, maxValue) * 20) / 20
    onChange(stepped)
    this.requestRender()
  }

  #setNumberValue(value: number, minValue: number, maxValue: number, onChange: (value: number) => void): void {
    onChange(Math.round(clampNumber(value, minValue, maxValue)))
    this.requestRender()
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
        this.requestRender()
        return
      }
      this.requestRender()
      this.#scheduleSoundPulseFrame()
    })
  }

  #drawSoundPulse(cx: number, cy: number, buttonSize: number, amount: number): void {
    const progress = 1 - amount
    const ringSize = buttonSize + 8 + progress * 20
    const alpha = amount * amount
    this.drawRoundedRect(cx - ringSize / 2, cy - ringSize / 2, ringSize, ringSize, {
      radius: ringSize / 2,
      fill: fade(palette.cyan, 0.045 * alpha),
      border: fade(palette.cyan, 0.58 * alpha),
      borderWidth: 1.4,
      opacity: 1,
      z: 0.24,
    })
    const innerSize = buttonSize - 6
    this.drawRoundedRect(cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, {
      radius: innerSize / 2,
      fill: fade(palette.cyan, 0.065 * alpha),
      border: null,
      z: 0.26,
    })
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }

  #drawRadialMeter(cx: number, cy: number, radius: number, maxBar: number): void {
    const count = 24
    const level = Math.max(0, Math.min(1, this.#snapshot.level))
    for (let index = 0; index < count; index += 1) {
      const threshold = (index + 1) / count
      const phase = (index / count) * Math.PI * 2
      const peak = 0.55 + 0.45 * Math.sin(phase * 3 + level * Math.PI)
      const amount = Math.max(0.16, Math.min(1, level * (0.55 + peak * 0.65)))
      const inner = radius
      const outer = radius + 5 + amount * maxBar
      const x0 = cx + Math.cos(phase) * inner
      const y0 = cy + Math.sin(phase) * inner
      const x1 = cx + Math.cos(phase) * outer
      const y1 = cy + Math.sin(phase) * outer
      const color = level >= threshold * 0.78 ? fade(palette.cyan, 0.82) : fade(palette.borderDim, 0.72)
      this.drawRoundedLine(x0, y0, x1, y1, color, 3, 0.2)
    }
  }
}

const micIconCache = new Map<string, string>()

function micIcon(color: Color): string {
  const key = `${color.r}:${color.g}:${color.b}:${color.a}`
  const cached = micIconCache.get(key)
  if (cached !== undefined) return cached
  const source = `<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${svgHex(color)}" stroke-opacity="${roundAlpha(color.a)}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"><rect x="430" y="135" width="340" height="560" rx="170"/><path d="M260 520c0 188 152 340 340 340s340-152 340-340"/><path d="M600 860v205"/><path d="M430 1065h340"/></g></svg>`
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  micIconCache.set(key, icon)
  return icon
}

function svgHex(color: Color): string {
  const channel = (value: number): string => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function roundAlpha(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * opacity)))
}

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.max(0, Math.min(1, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}

function pointInRect(x: number, y: number, rect: UiSurfaceRect): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
