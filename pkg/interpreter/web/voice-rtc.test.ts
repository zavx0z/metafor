import {describe, expect, test} from "bun:test"
import {voiceRtcAsrWebSocketUrl} from "./voice-rtc.ts"

describe("voice WebRTC transport", () => {
  test("routes the interpreter mux URL to the ASR fallback endpoint", () => {
    expect(voiceRtcAsrWebSocketUrl("https://dev.example/hud/voice/ws"))
      .toBe("wss://dev.example/hud/voice/asr/ws")
  })

  test("keeps a direct ASR websocket URL intact", () => {
    expect(voiceRtcAsrWebSocketUrl("ws://127.0.0.1:8787/ws"))
      .toBe("ws://127.0.0.1:8787/ws")
  })
})
