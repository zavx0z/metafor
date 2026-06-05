import {describe, expect, test} from "bun:test"
import {
  createWakeRecognitionGrammar,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  isActivationPhrase,
  isDeactivationPhrase,
  isFastActivationPartial,
} from "./voice-input.ts"

describe("voice activation matching", () => {
  test("does not activate agent two from agent alone with zero tolerance", () => {
    expect(isActivationPhrase("агент 2", ["агент 2"], 0)).toBe(true)
    expect(isActivationPhrase("агент", ["агент 2"], 0)).toBe(false)
    expect(isFastActivationPartial("агент", ["агент 2"])).toBe(false)
    expect(isActivationPhrase("о агент", ["агент 2"], 0)).toBe(false)
  })

  test("does not fuzzy activate a different numbered agent", () => {
    expect(isActivationPhrase("агент 2", ["агент 2"], 0.25)).toBe(true)
    expect(isActivationPhrase("агент 1", ["агент 2"], 0.25)).toBe(false)
    expect(isActivationPhrase("агент один", ["агент 2"], 0.25)).toBe(false)
    expect(isActivationPhrase("агент 2", ["агент 1"], 0.25)).toBe(false)
    expect(isActivationPhrase("агент два", ["агент 1"], 0.25)).toBe(false)
    expect(isActivationPhrase("агент", ["агент 2"], 0.25)).toBe(false)
  })

  test("requires wake phrases to start the utterance", () => {
    expect(isActivationPhrase("агент открой терминал", ["агент"], 0)).toBe(true)
    expect(isActivationPhrase("о агент", ["агент"], 0)).toBe(false)
    expect(isFastActivationPartial("о агент", ["агент"])).toBe(false)
  })

  test("keeps fuzzy activation anchored at the first word", () => {
    expect(isActivationPhrase("аген открой терминал", ["агент"], 0.25)).toBe(true)
    expect(isActivationPhrase("о аген", ["агент"], 0.25)).toBe(false)
  })

  test("builds Vosk grammar from prefixes and number variants", () => {
    const grammar = createWakeRecognitionGrammar({
      activation: ["агент 2"],
      deactivation: ["выключи микрофон"],
      stop: ["полная остановка"],
    })

    expect(grammar).toContain("агент")
    expect(grammar).toContain("агент один")
    expect(grammar).toContain("агент два")
    expect(grammar).not.toContain("агент 1")
    expect(grammar).not.toContain("агент 2")
    expect(grammar).toContain("выключи")
    expect(grammar).toContain("выключи микрофон")
    expect(grammar).toContain("выключим микрофон")
    expect(grammar).toContain("выключу микрофон")
    expect(grammar).toContain("выключить микрофон")
    expect(grammar).toContain("[unk]")
  })

  test("keeps unsupported Vosk vocabulary out of generated grammar", () => {
    const grammar = createWakeRecognitionGrammar({
      activation: ["агент 2"],
      deactivation: ["выруби микрофон"],
      stop: ["не подслушивай"],
    })

    expect(grammar.some((phrase) => /(^| )\d+( |$)/.test(phrase))).toBe(false)
    expect(grammar).not.toContain("вырубим")
    expect(grammar).not.toContain("вырубим микрофон")
    expect(grammar).not.toContain("не подслушивай")
    expect(grammar).toContain("выруби микрофон")
    expect(grammar).toContain("вырублю микрофон")
    expect(grammar).toContain("вырубить микрофон")
    expect(grammar).toContain("не подслушивать")
    expect(grammar).toContain("не слушай")
  })

  test("matches common deactivation phrase variants", () => {
    expect(isDeactivationPhrase("выключи микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("выключим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("выключу микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("отключим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("отключу микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("вырубим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
    expect(isDeactivationPhrase("вырублю микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES, 0)).toBe(true)
  })

  test("matches deactivation variants from stored base phrases", () => {
    expect(isDeactivationPhrase("выключим микрофон", ["выключи микрофон"], 0)).toBe(true)
    expect(isDeactivationPhrase("выключу микрофон", ["выключи микрофон"], 0)).toBe(true)
    expect(isDeactivationPhrase("отключить микрофон", ["отключи микрофон"], 0)).toBe(true)
    expect(isDeactivationPhrase("отключу микрофон", ["отключи микрофон"], 0)).toBe(true)
    expect(isDeactivationPhrase("вырубить микрофон", ["выруби микрофон"], 0)).toBe(true)
    expect(isDeactivationPhrase("вырублю микрофон", ["выруби микрофон"], 0)).toBe(true)
  })
})
