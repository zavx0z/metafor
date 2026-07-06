const HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundEnabled:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundVolume:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.agentReadyVolume:v1"
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
export const MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1

export function readHostTerminalAgentSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY)
    if (raw === null) return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
    return raw !== "0"
  } catch {
    return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
  }
}

export function writeHostTerminalAgentSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function readHostTerminalAgentSoundVolume(): number {
  try {
    const raw = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY)
    if (raw === null) {
      const legacy = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY)
      if (legacy === null) return DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
      const legacyValue = Number(legacy)
      return Number.isFinite(legacyValue) ? clampHostTerminalAgentSoundVolume(legacyValue) : DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
    }
    const value = Number(raw)
    return Number.isFinite(value) ? clampHostTerminalAgentSoundVolume(value) : DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
  } catch {
    return DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
  }
}

export function writeHostTerminalAgentSoundVolume(value: number): void {
  const next = clampHostTerminalAgentSoundVolume(value)
  try {
    localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

export function clampHostTerminalAgentSoundVolume(value: number): number {
  return Math.min(MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME, Math.max(0, value))
}
