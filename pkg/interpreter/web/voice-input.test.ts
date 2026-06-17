import {describe, expect, test} from "bun:test"
import {
  cleanupVoiceText,
  createVoiceInputDeliveryState,
  createWakeRecognitionGrammar,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  isActivationPhrase,
  isDeactivationPhrase,
  isFastActivationPartial,
  prepareVoiceInputChunkForDelivery,
  trimStableVoiceTranscriptPrefix,
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

describe("voice dictation cleanup", () => {
  test("drops subtitle boilerplate from ASR noise", () => {
    expect(cleanupVoiceText("Субтитры сделал DimaTorzok")).toBe("")
    expect(cleanupVoiceText("Текст для агента. Продолжение следует...")).toBe("Текст для агента.")
    expect(cleanupVoiceText("Редактор субтитров: DimaTorzok")).toBe("")
  })

  test("deduplicates adjacent repeated paragraphs", () => {
    expect(cleanupVoiceText("Делай коммит\n\nДелай коммит")).toBe("Делай коммит")
  })

  test("deduplicates adjacent repeated phrases inside realtime text", () => {
    expect(cleanupVoiceText("В реал тайм. В реал тайм ввод")).toBe("В реал тайм ввод")
    expect(cleanupVoiceText("Проверка. Проверка автоматического текста")).toBe("Проверка автоматического текста")
    expect(cleanupVoiceText("Для проверки я прочитаю.Для проверки я прочитаю. твое сообщение."))
      .toBe("Для проверки я прочитаю. твое сообщение.")
    expect(cleanupVoiceText(
      "Пусть текст меняется. Самом начале, когда я разговаривал, такое чувство. Самом начале, когда я разговаривал, такое чувство, что таймаут срабатывает.",
    ))
      .toBe("Пусть текст меняется. Самом начале, когда я разговаривал, такое чувство, что таймаут срабатывает.")
  })

  test("deduplicates a long repeated realtime prefix with continuation", () => {
    expect(cleanupVoiceText(
      "Сейчас я проверяю голосовой ввод в реальном времени. Текст должен появляться постепенно. без повторов и разрывов. После завершения диктовки сообщение должно... автоматически если я сделаю короткую паузу микрофон не должен подключитьсяСейчас я проверяю голосовой ввод в реальном времени. Текст должен появляться постепенно. без повторов и разрывов. После завершения диктовки сообщение должно... автоматически если я сделаю короткую паузу микрофон не должен подключиться слишком рано",
    ))
      .toBe("Сейчас я проверяю голосовой ввод в реальном времени. Текст должен появляться постепенно. без повторов и разрывов. После завершения диктовки сообщение должно... автоматически если я сделаю короткую паузу микрофон не должен подключиться слишком рано")
  })

  test("deduplicates repeated code identifiers separated by operators", () => {
    expect(cleanupVoiceText(
      "const editorH == codexComposerEditorHeight == codexComposerEditorHeight == codexComposerEditorHeight ==",
    ))
      .toBe("const editorH == codexComposerEditorHeight ==")
  })

  test("trims stable transcript prefix from the next ASR chunk", () => {
    const stable = "Давай проверим. Пиши в терминал."
    expect(trimStableVoiceTranscriptPrefix("Пиши в терминал, я проскроллю.", stable)).toBe("я проскроллю.")
  })

  test("does not trim a weak one-word overlap", () => {
    expect(trimStableVoiceTranscriptPrefix("Открой туду", "Открой терминал")).toBe("Открой туду")
  })

  test("delivers a final and committed duplicate only once", () => {
    const state = createVoiceInputDeliveryState()
    const chunk = {text: "Текст не дублировался", messages: [], segments: []}

    expect(prepareVoiceInputChunkForDelivery(chunk, state, 1)?.text).toBe("Текст не дублировался")
    expect(prepareVoiceInputChunkForDelivery(chunk, state, 1)).toBeNull()
  })

  test("suppresses a full repeated chunk from the next commit", () => {
    const state = createVoiceInputDeliveryState()
    const chunk = {text: "Последнее сообщение не должно дублироваться", messages: [], segments: []}

    expect(prepareVoiceInputChunkForDelivery(chunk, state, 1)?.text).toBe("Последнее сообщение не должно дублироваться")
    expect(prepareVoiceInputChunkForDelivery(chunk, state, 2)).toBeNull()
  })

  test("delivers only the new tail when ASR repeats previous text", () => {
    const state = createVoiceInputDeliveryState()

    expect(prepareVoiceInputChunkForDelivery({text: "Текст не рвался", messages: [], segments: []}, state, 1)?.text).toBe("Текст не рвался")
    expect(prepareVoiceInputChunkForDelivery({text: "Текст не рвался и не дублировался", messages: [], segments: []}, state, 2)?.text).toBe("и не дублировался")
  })
})
