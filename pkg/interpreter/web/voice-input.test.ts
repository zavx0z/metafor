import {describe, expect, test} from "bun:test"
import {
  cleanupVoiceText,
  createVoiceInputDeliveryState,
  createWakeRecognitionGrammar,
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  isActivationPhrase,
  isActivationRecognitionMessage,
  isDeactivationPhrase,
  isFastActivationPartial,
  prepareVoiceInputChunkForDelivery,
  trimStableVoiceTranscriptPrefix,
} from "./voice-input.ts"
import {VoiceSessionManager} from "./voice-session-manager.ts"

describe("voice activation matching", () => {
  test("uses metafor default activation phrases", () => {
    expect(DEFAULT_VOICE_ACTIVATION_PHRASES).toEqual(["завхоз", "запхоз", "метафор", "метафора", "квин", "куэн", "qwen", "дипсик", "дип сик", "deepseek", "deep seek"])
    expect(isActivationPhrase("завхоз", [], 0)).toBe(true)
    expect(isActivationPhrase("запхоз", [], 0)).toBe(true)
    expect(isActivationPhrase("метафор", [], 0)).toBe(true)
    expect(isActivationPhrase("метафора", [], 0)).toBe(true)
    expect(isActivationPhrase("квин", [], 0)).toBe(true)
    expect(isActivationPhrase("дипсик", [], 0)).toBe(true)
    expect(isActivationPhrase("агент", [], 0)).toBe(false)
  })

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

  test("activates only from final wake recognition messages", () => {
    expect(isActivationRecognitionMessage({type: "partial", text: "завхоз"}, ["завхоз"], 0)).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "завхоз"}, ["завхоз"], 0)).toBe(true)
    expect(isActivationRecognitionMessage({type: "final", json: {text: "завхоз"}}, ["завхоз"], 0)).toBe(true)
    expect(isActivationRecognitionMessage({type: "result", text: "зав"}, ["завхоз"], 0)).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "завтра"}, ["завхоз"], 0)).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "за вход"}, ["завхоз"], 0)).toBe(false)
  })

  test("does not activate from fast partial candidates", () => {
    expect(isFastActivationPartial("завхоз", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз открой терминал", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завхоз открой терминал", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завтра", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завтрак", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("за вход", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завуси", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завася", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("заваня", ["завхоз"])).toBe(false)
  })

  test("keeps wake confusers blocked when activation fuzzy tolerance is enabled manually", () => {
    const activationFuzzy = 0.12
    expect(isActivationPhrase("зав хоз", ["завхоз"], activationFuzzy)).toBe(true)
    expect(isActivationPhrase("за вход", ["завхоз"], activationFuzzy)).toBe(false)
    expect(isActivationPhrase("завтра", ["завхоз"], activationFuzzy)).toBe(false)
    expect(isActivationPhrase("завтрак", ["завхоз"], activationFuzzy)).toBe(false)
    expect(isActivationPhrase("завуси", ["завхоз"], activationFuzzy)).toBe(false)
    expect(isActivationPhrase("завася", ["завхоз"], activationFuzzy)).toBe(false)
    expect(isActivationPhrase("заваня", ["завхоз"], activationFuzzy)).toBe(false)
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

  test("keeps common wake confusers in Vosk grammar without activating from them", () => {
    const grammar = createWakeRecognitionGrammar({
      activation: ["завхоз"],
      deactivation: [],
      stop: [],
    })

    expect(grammar).toContain("завхоз")
    expect(grammar).toContain("зав")
    expect(grammar).toContain("завтра")
    expect(grammar).toContain("завтрак")
    expect(grammar).toContain("за вход")
    expect(grammar).toContain("завуси")
    expect(grammar).toContain("завася")
    expect(grammar).toContain("заваня")
    expect(isActivationPhrase("зав", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("завтра", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("завтрак", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("за вход", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("завуси", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("завася", ["завхоз"], 0)).toBe(false)
    expect(isActivationPhrase("заваня", ["завхоз"], 0)).toBe(false)
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

describe("voice session manager", () => {
  test("tracks adaptive VAD without treating steady low noise as speech", () => {
    const session = new VoiceSessionManager()
    session.startRecording()

    for (let index = 0; index < 24; index += 1) {
      const frame = session.acceptVadFrame({rms: 0.003, peak: 0.007, now: index * 20})
      expect(frame.speaking).toBe(false)
    }

    const speech = session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 600})
    expect(speech.speaking).toBe(true)
    expect(speech.source).toBe("energy")
    expect(session.debugSnapshot().phase).toBe("speaking")
  })

  test("uses fresh Silero probability ahead of energy threshold", () => {
    const session = new VoiceSessionManager()
    session.startRecording()

    const speech = session.acceptVadFrame({
      rms: 0.006,
      peak: 0.018,
      now: 1000,
      speechProbability: 0.82,
      speechProbabilityAt: 980,
    })

    expect(speech.speaking).toBe(true)
    expect(speech.source).toBe("silero")
    expect(session.debugSnapshot().speechProbability).toBe(0.82)
  })

  test("keeps ASR PCM queued under a byte limit", () => {
    const session = new VoiceSessionManager(1000)
    session.queueAsrPcm(new ArrayBuffer(640))
    session.queueAsrPcm(new ArrayBuffer(640))

    const snapshot = session.debugSnapshot()
    expect(snapshot.queuedPcmBytes).toBeLessThanOrEqual(1000)
    expect(snapshot.queuedPcmChunks).toBe(1)
    expect(session.takeQueuedPcm()).toHaveLength(1)
    expect(session.debugSnapshot().queuedPcmBytes).toBe(0)
  })
})

describe("voice dictation cleanup", () => {
  test("drops subtitle boilerplate from ASR noise", () => {
    expect(cleanupVoiceText("Субтитры сделал DimaTorzok")).toBe("")
    expect(cleanupVoiceText("Текст для агента. Продолжение следует...")).toBe("Текст для агента.")
    expect(cleanupVoiceText("Редактор субтитров: DimaTorzok")).toBe("")
  })

  test("drops terminal line art hallucinated by ASR", () => {
    expect(cleanupVoiceText("────────────────────────────────────────")).toBe("")
    expect(cleanupVoiceText("──── проверка диктовки ────")).toBe("проверка диктовки")
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
