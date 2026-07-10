import {describe, expect, test} from "bun:test"
import {
  readVoiceRuntimeState,
  setVoiceContinuousSuspended,
  subscribeVoiceRuntimeState,
  updateVoiceRuntimeState,
  voiceRuntimeTransportFromInput,
  writeVoiceContinuousModeEnabled,
} from "./voice-runtime-state.ts"

describe("voice runtime state", () => {
  test("maps the active transport for the protocol dot", () => {
    expect(voiceRuntimeTransportFromInput("p2p")).toBe("webrtc")
    expect(voiceRuntimeTransportFromInput("ws")).toBe("websocket")
    expect(voiceRuntimeTransportFromInput("connecting")).toBe("connecting")
    expect(voiceRuntimeTransportFromInput("idle")).toBe("off")
  })

  test("keeps continuous suspension separate from the saved mode", () => {
    writeVoiceContinuousModeEnabled(true)
    setVoiceContinuousSuspended(true)
    expect(readVoiceRuntimeState()).toMatchObject({mode: "continuous", continuousSuspended: true})
    setVoiceContinuousSuspended(false)
    writeVoiceContinuousModeEnabled(false)
    expect(readVoiceRuntimeState()).toMatchObject({mode: "activation", continuousSuspended: false})
  })

  test("notifies listeners only for actual state changes", () => {
    let calls = 0
    const unsubscribe = subscribeVoiceRuntimeState(() => { calls += 1 })
    const state = readVoiceRuntimeState()
    updateVoiceRuntimeState({detail: `${state.detail} updated`})
    const afterChange = calls
    updateVoiceRuntimeState({detail: readVoiceRuntimeState().detail})
    unsubscribe()
    expect(afterChange).toBeGreaterThan(0)
    expect(calls).toBe(afterChange)
  })
})