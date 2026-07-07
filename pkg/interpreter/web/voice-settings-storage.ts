import {type VoiceInputHudDeactivationMode, type VoiceInputHudPhraseGroupId} from "@ui/components"
import {
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  DEFAULT_VOICE_STOP_PHRASES,
  normalizeVoicePhrases,
  type VoiceDeactivationMode,
} from "./voice-input.ts"

const VOICE_INPUT_URL_STORAGE_KEY = "metafor.interpreter.voice.url"
const VOICE_WAKE_URL_STORAGE_KEY = "metafor.interpreter.voice.wakeUrl"
const VOICE_INPUT_CONTEXT_STORAGE_KEY = "metafor.interpreter.voice.context"
const VOICE_WAKE_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.wakePhrases:v1"
const VOICE_ACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.activationPhrases:v1"
const VOICE_DEACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.deactivationPhrases:v1"
const VOICE_STOP_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.stopPhrases:v1"
const VOICE_ACTIVATION_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.activationFuzzy:v1"
const VOICE_DEACTIVATION_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.deactivationFuzzy:v1"
const VOICE_STOP_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.stopFuzzy:v1"
const VOICE_DEACTIVATION_MODE_STORAGE_KEY = "metafor.interpreter.voice.deactivationMode:v1"
const VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY = "metafor.interpreter.voice.recognitionTimeoutSeconds:v1"
const VOICE_AUTO_SEND_STORAGE_KEY = "metafor.interpreter.voice.autoSend:v1"
const VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v1"
const VOICE_SIGNAL_VOLUME_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v2"

const DEFAULT_VOICE_INPUT_URL = "/hud/voice/asr/ws"
const DEFAULT_VOICE_WAKE_URL = "/hud/voice/wake/ws"
const DEFAULT_VOICE_SIGNAL_VOLUME = 0.2
const DEFAULT_VOICE_DEACTIVATION_MODE: VoiceDeactivationMode = "phrase-timeout"
const DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS = 2
const DEFAULT_VOICE_AUTO_SEND_ENABLED = true
const DEFAULT_VOICE_ACTIVATION_FUZZY = 0.12
const DEFAULT_VOICE_DEACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_STOP_FUZZY = 0.06

export const MAX_VOICE_SIGNAL_VOLUME = 1
export const MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS = 0.5
export const MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS = 60

export function readVoiceInputUrl(): string {
  try {
    return readVoiceEndpointUrl(VOICE_INPUT_URL_STORAGE_KEY, DEFAULT_VOICE_INPUT_URL, "8787")
  } catch {
    return DEFAULT_VOICE_INPUT_URL
  }
}

export function readVoiceWakeUrl(): string {
  try {
    return readVoiceEndpointUrl(VOICE_WAKE_URL_STORAGE_KEY, DEFAULT_VOICE_WAKE_URL, "4765")
  } catch {
    return DEFAULT_VOICE_WAKE_URL
  }
}

function readVoiceEndpointUrl(key: string, fallback: string, legacyLoopbackPort: string): string {
  const stored = localStorage.getItem(key)
  if (stored === null || stored.trim().length === 0) return fallback
  return isLegacyLoopbackVoiceUrl(stored, legacyLoopbackPort) ? fallback : stored
}

function isLegacyLoopbackVoiceUrl(raw: string, port: string): boolean {
  try {
    const url = new URL(raw, location.href)
    return (url.protocol === "ws:" || url.protocol === "wss:")
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]")
      && url.port === port
      && url.pathname === "/ws"
  } catch {
    return false
  }
}

export function readVoiceInputContext(): string {
  try {
    return localStorage.getItem(VOICE_INPUT_CONTEXT_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

export function readVoiceSignalVolume(): number {
  try {
    const raw = localStorage.getItem(VOICE_SIGNAL_VOLUME_STORAGE_KEY)
    if (raw === null) {
      const legacy = readLegacyVoiceSignalVolume()
      return legacy === null ? DEFAULT_VOICE_SIGNAL_VOLUME : clampVoiceSignalVolume(legacy * MAX_VOICE_SIGNAL_VOLUME)
    }
    const value = Number(raw)
    return Number.isFinite(value) ? clampVoiceSignalVolume(value) : DEFAULT_VOICE_SIGNAL_VOLUME
  } catch {
    return DEFAULT_VOICE_SIGNAL_VOLUME
  }
}

function readLegacyVoiceSignalVolume(): number | null {
  try {
    const raw = localStorage.getItem(VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
  } catch {
    return null
  }
}

export function writeVoiceSignalVolume(value: number): number {
  const next = clampVoiceSignalVolume(value)
  try {
    localStorage.setItem(VOICE_SIGNAL_VOLUME_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  return next
}

export function readVoiceAutoSendEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_AUTO_SEND_STORAGE_KEY)
    if (raw === null) return DEFAULT_VOICE_AUTO_SEND_ENABLED
    return raw !== "0"
  } catch {
    return DEFAULT_VOICE_AUTO_SEND_ENABLED
  }
}

export function writeVoiceAutoSendEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_AUTO_SEND_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function clampVoiceSignalVolume(value: number): number {
  return Math.min(MAX_VOICE_SIGNAL_VOLUME, Math.max(0, value))
}

export function readVoiceDeactivationMode(): VoiceDeactivationMode {
  try {
    const raw = localStorage.getItem(VOICE_DEACTIVATION_MODE_STORAGE_KEY)
    if (raw === "timeout" || raw === "phrase-timeout" || raw === "phrase") return raw
    return DEFAULT_VOICE_DEACTIVATION_MODE
  } catch {
    return DEFAULT_VOICE_DEACTIVATION_MODE
  }
}

export function writeVoiceDeactivationMode(value: VoiceInputHudDeactivationMode): void {
  try {
    localStorage.setItem(VOICE_DEACTIVATION_MODE_STORAGE_KEY, value)
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readVoiceRecognitionTimeoutSeconds(): number {
  try {
    const raw = localStorage.getItem(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY)
    if (raw === null) return DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
    const value = Number(raw)
    return Number.isFinite(value) ? clampVoiceRecognitionTimeoutSeconds(value) : DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
  } catch {
    return DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
  }
}

export function writeVoiceRecognitionTimeoutSeconds(value: number): number {
  const next = clampVoiceRecognitionTimeoutSeconds(value)
  try {
    localStorage.setItem(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  return next
}

export function clampVoiceRecognitionTimeoutSeconds(value: number): number {
  const clamped = Math.min(MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS, Math.max(MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS, value))
  return Math.round(clamped * 2) / 2
}

export function readVoicePhrases(groupId: VoiceInputHudPhraseGroupId): string[] {
  try {
    const raw = readVoicePhraseStorage(groupId)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const phrases = normalizeVoicePhrases(parsed.map((item) => String(item)))
        if (phrases.length > 0) return phrases
      }
    }
  } catch {
    // Storage can be disabled or manually edited.
  }
  return [...defaultVoicePhrases(groupId)]
}

function readVoicePhraseStorage(groupId: VoiceInputHudPhraseGroupId): string | null {
  const raw = localStorage.getItem(voicePhraseStorageKey(groupId))
  if (raw !== null || groupId !== "activation") return raw
  return localStorage.getItem(VOICE_WAKE_PHRASES_STORAGE_KEY)
}

export function writeVoicePhrases(groupId: VoiceInputHudPhraseGroupId, phrases: readonly string[]): void {
  const normalized = normalizeVoicePhrases(phrases)
  const next = normalized.length > 0 ? normalized : [...defaultVoicePhrases(groupId)]
  try {
    localStorage.setItem(voicePhraseStorageKey(groupId), JSON.stringify(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId): number {
  try {
    const raw = localStorage.getItem(voiceFuzzyStorageKey(groupId))
    if (raw === null) return defaultVoiceFuzzyTolerance(groupId)
    const value = Number(raw)
    return Number.isFinite(value) ? clampVoiceFuzzyTolerance(value) : defaultVoiceFuzzyTolerance(groupId)
  } catch {
    return defaultVoiceFuzzyTolerance(groupId)
  }
}

export function writeVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId, value: number): number {
  const next = clampVoiceFuzzyTolerance(value)
  try {
    localStorage.setItem(voiceFuzzyStorageKey(groupId), String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  return next
}

export function voicePhraseKey(phrase: string): string | undefined {
  const normalized = normalizeVoicePhrases([phrase])[0]
  if (normalized === undefined) return undefined
  return normalized.toLocaleLowerCase("ru-RU").replace(/ё/g, "е")
}

export function defaultVoicePhrases(groupId: VoiceInputHudPhraseGroupId): readonly string[] {
  if (groupId === "activation") return DEFAULT_VOICE_ACTIVATION_PHRASES
  if (groupId === "deactivation") return DEFAULT_VOICE_DEACTIVATION_PHRASES
  return DEFAULT_VOICE_STOP_PHRASES
}

function voicePhraseStorageKey(groupId: VoiceInputHudPhraseGroupId): string {
  if (groupId === "activation") return VOICE_ACTIVATION_PHRASES_STORAGE_KEY
  if (groupId === "deactivation") return VOICE_DEACTIVATION_PHRASES_STORAGE_KEY
  return VOICE_STOP_PHRASES_STORAGE_KEY
}

function voiceFuzzyStorageKey(groupId: VoiceInputHudPhraseGroupId): string {
  if (groupId === "activation") return VOICE_ACTIVATION_FUZZY_STORAGE_KEY
  if (groupId === "deactivation") return VOICE_DEACTIVATION_FUZZY_STORAGE_KEY
  return VOICE_STOP_FUZZY_STORAGE_KEY
}

function defaultVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId): number {
  if (groupId === "activation") return DEFAULT_VOICE_ACTIVATION_FUZZY
  if (groupId === "deactivation") return DEFAULT_VOICE_DEACTIVATION_FUZZY
  return DEFAULT_VOICE_STOP_FUZZY
}

function clampVoiceFuzzyTolerance(value: number): number {
  return Math.min(0.5, Math.max(0, value))
}
