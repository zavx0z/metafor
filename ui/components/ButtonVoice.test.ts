import {describe, expect, test} from "bun:test"

describe("ButtonVoice source contract", () => {
  test("does not synthesize a microphone tooltip", async () => {
    const source = await Bun.file(new URL("./ButtonVoice.ts", import.meta.url)).text()
    expect(source).not.toContain('props.tooltip ?? "Голосовой ввод"')
    expect(source).not.toContain('tooltip: "Голосовой ввод"')
  })

  test("keeps protocol-dot colors and continuous ring explicit", async () => {
    const source = await Bun.file(new URL("./ButtonVoice.ts", import.meta.url)).text()
    expect(source).toContain('transport === "webrtc"')
    expect(source).toContain('transport === "websocket"')
    expect(source).toContain("drawContinuousReadyRing")
  })
})
