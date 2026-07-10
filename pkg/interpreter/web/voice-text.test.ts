import {describe, expect, test} from "bun:test"
import {cleanupVoiceInputText, mergeVoiceInputText, voiceMessagesFromChunk} from "./voice-text.ts"

describe("voice composer text", () => {
  test("preserves paragraph boundaries", () => {
    expect(cleanupVoiceInputText("Первый абзац.\n\nВторой абзац.")).toBe("Первый абзац.\n\nВторой абзац.")
    expect(mergeVoiceInputText("Первый абзац.", "Второй абзац.", "\n\n"))
      .toBe("Первый абзац.\n\nВторой абзац.")
  })

  test("keeps ASR message groups as paragraphs", () => {
    expect(voiceMessagesFromChunk({
      text: "",
      messages: ["Первый абзац.", "Второй абзац."],
      segments: [],
    })).toEqual(["Первый абзац.", "Второй абзац."])
  })

  test("does not duplicate an already merged voice suffix", () => {
    expect(mergeVoiceInputText("Ручной текст. Голосовой текст.", "Голосовой текст."))
      .toBe("Ручной текст. Голосовой текст.")
  })
})
