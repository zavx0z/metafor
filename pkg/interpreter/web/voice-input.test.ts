import {describe, expect, test} from "bun:test"
import {
  cleanupVoiceText,
  createVoiceInputDeliveryState,
  createWakeRecognitionGrammar,
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  analyzeWakeAudioGain,
  applyWakeAudioGain,
  isActivationPhrase,
  isActivationRecognitionMessage,
  isDeactivationPhrase,
  isFastActivationPartial,
  prepareVoiceLivePreviewText,
  prepareVoiceInputChunkForDelivery,
  trimStableVoiceTranscriptPrefix,
  voiceDynamicRecognitionTimeoutMs,
  wakeAudioCutoffFromRecognitionMessage,
} from "./voice-input.ts"
import {VoiceSileroVad} from "./voice-silero-vad.ts"
import {DEFAULT_VOICE_SESSION_TIMINGS, VoiceSessionManager} from "./voice-session-manager.ts"

describe("voice activation matching", () => {
  test("uses metafor default activation phrases", () => {
    expect(DEFAULT_VOICE_ACTIVATION_PHRASES).toEqual(["завхоз", "зав хоз", "запхоз", "зап хоз", "метафор", "метафора", "квин", "куэн", "qwen", "дипсик", "дип сик", "deepseek", "deep seek"])
    expect(isActivationPhrase("завхоз", [])).toBe(true)
    expect(isActivationPhrase("зав хоз", [])).toBe(true)
    expect(isActivationPhrase("запхоз", [])).toBe(true)
    expect(isActivationPhrase("зап хоз", [])).toBe(true)
    expect(isActivationPhrase("метафор", [])).toBe(true)
    expect(isActivationPhrase("метафора", [])).toBe(true)
    expect(isActivationPhrase("квин", [])).toBe(true)
    expect(isActivationPhrase("дипсик", [])).toBe(true)
    expect(isActivationPhrase("агент", [])).toBe(false)
  })

  test("does not activate agent two from agent alone", () => {
    expect(isActivationPhrase("агент 2", ["агент 2"])).toBe(true)
    expect(isActivationPhrase("агент", ["агент 2"])).toBe(false)
    expect(isFastActivationPartial("агент", ["агент 2"])).toBe(false)
    expect(isActivationPhrase("о агент", ["агент 2"])).toBe(false)
  })

  test("matches numbered wake phrases exactly", () => {
    expect(isActivationPhrase("агент 2", ["агент 2"])).toBe(true)
    expect(isActivationPhrase("агент 1", ["агент 2"])).toBe(false)
    expect(isActivationPhrase("агент один", ["агент 2"])).toBe(false)
    expect(isActivationPhrase("агент 2", ["агент 1"])).toBe(false)
    expect(isActivationPhrase("агент два", ["агент 1"])).toBe(false)
    expect(isActivationPhrase("агент", ["агент 2"])).toBe(false)
  })

  test("requires wake phrases to start the utterance", () => {
    expect(isActivationPhrase("агент открой терминал", ["агент"])).toBe(true)
    expect(isActivationPhrase("о агент", ["агент"])).toBe(false)
    expect(isFastActivationPartial("о агент", ["агент"])).toBe(false)
  })

  test("does not activate misspelled wake", () => {
    expect(isActivationPhrase("аген открой терминал", ["агент"])).toBe(false)
    expect(isActivationPhrase("о аген", ["агент"])).toBe(false)
  })

  test("activates only from final wake recognition messages", () => {
    expect(isActivationRecognitionMessage({type: "partial", text: "завхоз"}, ["завхоз"])).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "завхоз"}, ["завхоз"])).toBe(true)
    expect(isActivationRecognitionMessage({type: "final", json: {text: "завхоз"}}, ["завхоз"])).toBe(true)
    expect(isActivationRecognitionMessage({type: "result", text: "зав"}, ["завхоз"])).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "завтра"}, ["завхоз"])).toBe(false)
    expect(isActivationRecognitionMessage({type: "result", text: "за вход"}, ["завхоз"])).toBe(false)
  })

  test("uses wake word timestamps to cut first Whisper preroll after the wake phrase", () => {
    const cutoff = wakeAudioCutoffFromRecognitionMessage({
      type: "result",
      text: "завхоз первое слово",
      json: {
        result: [
          {word: "завхоз", start: 2.1, end: 2.56},
          {word: "первое", start: 2.72, end: 3.1},
          {word: "слово", start: 3.15, end: 3.42},
        ],
      },
    }, ["завхоз"], 1_000, 4_000)

    expect(cutoff).toMatchObject({source: "absoluteWords", phrase: "завхоз", wordEndMs: 2_560})
    expect(cutoff?.at).toBe(3_680)
  })

  test("uses relative wake word timestamps without cutting dictated tail words", () => {
    const cutoff = wakeAudioCutoffFromRecognitionMessage({
      type: "result",
      text: "завхоз первое",
      json: {
        result: [
          {word: "завхоз", start: 0.1, end: 0.6},
          {word: "первое", start: 0.75, end: 1.1},
        ],
      },
    }, ["завхоз"], 1_000, 50_000)

    expect(cutoff).toMatchObject({source: "relativeWords", phrase: "завхоз", wordEndMs: 600})
    expect(cutoff?.at).toBe(49_360)
  })

  test("falls back to final wake receive time when wake words are unavailable", () => {
    const cutoff = wakeAudioCutoffFromRecognitionMessage({type: "result", text: "завхоз"}, ["завхоз"], 1_000, 5_000)

    expect(cutoff).toMatchObject({source: "fallback", phrase: "завхоз", wordEndMs: null})
    expect(cutoff?.at).toBe(4_740)
  })

  test("does not activate from fast partial candidates", () => {
    expect(isFastActivationPartial("завхоз", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завхоз открой терминал", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз", ["зав хоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз открой терминал", ["зав хоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав хоз открой терминал", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("зав", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завтра", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завтрак", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("за вход", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завуси", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("завася", ["завхоз"])).toBe(false)
    expect(isFastActivationPartial("заваня", ["завхоз"])).toBe(false)
  })

  test("requires explicit wake variants", () => {
    expect(isActivationPhrase("зав хоз", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("зав хоз", ["зав хоз"])).toBe(true)
    expect(isActivationPhrase("за вход", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завтра", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завтрак", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завуси", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завася", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("заваня", ["завхоз"])).toBe(false)
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
    expect(isActivationPhrase("зав", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завтра", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завтрак", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("за вход", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завуси", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("завася", ["завхоз"])).toBe(false)
    expect(isActivationPhrase("заваня", ["завхоз"])).toBe(false)
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
    expect(isDeactivationPhrase("выключи микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("выключим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("выключу микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("отключим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("отключу микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("вырубим микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
    expect(isDeactivationPhrase("вырублю микрофон", DEFAULT_VOICE_DEACTIVATION_PHRASES)).toBe(true)
  })

  test("matches deactivation variants from stored base phrases", () => {
    expect(isDeactivationPhrase("выключим микрофон", ["выключи микрофон"])).toBe(true)
    expect(isDeactivationPhrase("выключу микрофон", ["выключи микрофон"])).toBe(true)
    expect(isDeactivationPhrase("отключить микрофон", ["отключи микрофон"])).toBe(true)
    expect(isDeactivationPhrase("отключу микрофон", ["отключи микрофон"])).toBe(true)
    expect(isDeactivationPhrase("вырубить микрофон", ["выруби микрофон"])).toBe(true)
    expect(isDeactivationPhrase("вырублю микрофон", ["выруби микрофон"])).toBe(true)
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

    expect(session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 600}).speaking).toBe(false)
    const speech = session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 700})
    expect(speech.speaking).toBe(true)
    expect(speech.started).toBe(true)
    expect(speech.source).toBe("energy")
    expect(session.snapshot().phase).toBe("speaking")
  })

  test("uses fresh Silero probability ahead of energy threshold", () => {
    const session = new VoiceSessionManager()
    session.startRecording()

    expect(session.acceptVadFrame({
      rms: 0.006,
      peak: 0.018,
      now: 1000,
      speechProbability: 0.82,
      speechProbabilityAt: 980,
    }).speaking).toBe(false)
    const speech = session.acceptVadFrame({
      rms: 0.006,
      peak: 0.018,
      now: 1100,
      speechProbability: 0.82,
      speechProbabilityAt: 1080,
    })

    expect(speech.speaking).toBe(true)
    expect(speech.source).toBe("silero")
    expect(session.snapshot().speechProbability).toBe(0.82)
  })

  test("does not finish dictation from silence before any speech chunk exists", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    const silence = session.acceptVadFrame({rms: 0.003, peak: 0.007, now: 4_000})

    expect(silence.speaking).toBe(false)
    expect(silence.finalSilence).toBe(false)
    expect(session.hasVoiceActivity()).toBe(false)
    expect(session.snapshot().chunks.total).toBe(0)
  })

  test("lets strong near-voice energy start speech when Silero is unavailable", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    expect(session.acceptVadFrame({
      rms: 0.032,
      peak: 0.052,
      now: 1_020,
    }).speaking).toBe(false)
    const speech = session.acceptVadFrame({
      rms: 0.032,
      peak: 0.052,
      now: 1_130,
    })

    expect(speech.speaking).toBe(true)
    expect(speech.started).toBe(true)
    expect(speech.source).toBe("energy")
    expect(session.hasVoiceActivity()).toBe(true)
  })

  test("does not start speech from low noise when fresh Silero rejects it", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    expect(session.acceptVadFrame({
      rms: 0.006,
      peak: 0.012,
      now: 1_020,
      speechProbability: 0.001,
      speechProbabilityAt: 1_020,
    }).speaking).toBe(false)
    const rejected = session.acceptVadFrame({
      rms: 0.006,
      peak: 0.012,
      now: 1_130,
      speechProbability: 0.001,
      speechProbabilityAt: 1_130,
    })

    expect(rejected.started).toBe(false)
    expect(rejected.speaking).toBe(false)
    expect(rejected.potentialVoice).toBe(false)
    expect(rejected.source).toBe("silero")
    expect(session.snapshot().chunks.recording).toBe(0)
  })

  test("does not let delayed low Silero probability close active voice-like speech", () => {
    const session = new VoiceSessionManager({...DEFAULT_VOICE_SESSION_TIMINGS, speechEndMs: 120})
    session.startRecording(true, 1_000)

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_020, speechProbability: 0.82, speechProbabilityAt: 1_020})
    expect(session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_130, speechProbability: 0.82, speechProbabilityAt: 1_130}).started).toBe(true)
    session.appendCurrentChunkPcm(new ArrayBuffer(320))

    expect(session.acceptVadFrame({rms: 0.08, peak: 0.22, now: 1_260, speechProbability: 0.001, speechProbabilityAt: 1_260}).stopped).toBe(false)
    const stopped = session.acceptVadFrame({rms: 0.08, peak: 0.22, now: 1_400, speechProbability: 0.001, speechProbabilityAt: 1_180})

    expect(stopped.stopped).toBe(false)
    expect(stopped.speaking).toBe(true)
    expect(stopped.closedChunkIds).toHaveLength(0)
    expect(session.snapshot().chunks.recording).toBe(1)
  })

  test("keeps quiet continuation speech from closing an active dictation chunk", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_020})
    expect(session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_130}).started).toBe(true)

    const quietContinuation = session.acceptVadFrame({
      rms: 0.007,
      peak: 0.010,
      now: 1_850,
      speechProbability: 0.36,
      speechProbabilityAt: 1_850,
    })

    expect(quietContinuation.speaking).toBe(true)
    expect(quietContinuation.stopped).toBe(false)
    expect(session.snapshot().chunks.recording).toBe(1)
  })

  test("tracks potential voice without extending final silence", () => {
    const session = new VoiceSessionManager({...DEFAULT_VOICE_SESSION_TIMINGS, finalSilenceMs: 380})
    session.startRecording(true, 1_000)

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_020})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_130})
    session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_760})
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 2_400}).stopped).toBe(true)

    const potential = session.acceptVadFrame({rms: 0.005, peak: 0.007, now: 2_740})
    expect(potential.potentialVoice).toBe(true)
    expect(potential.finalSilence).toBe(false)
    expect(session.snapshot().lastPotentialVoiceAt).toBe(2_740)

    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 3_000}).finalSilence).toBe(true)
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 3_200}).finalSilence).toBe(true)
  })

  test("opens a new chunk for quiet continuation after a short pause", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_020})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_130})
    session.appendCurrentChunkPcm(new ArrayBuffer(320))
    session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_760})
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 2_400}).stopped).toBe(true)
    expect(session.snapshot().chunks.queued).toBe(1)

    session.acceptVadFrame({rms: 0.005, peak: 0.010, now: 2_740, speechProbability: 0.36, speechProbabilityAt: 2_740})
    const quietRestart = session.acceptVadFrame({rms: 0.005, peak: 0.010, now: 2_850, speechProbability: 0.36, speechProbabilityAt: 2_850})

    expect(quietRestart.started).toBe(true)
    expect(quietRestart.speaking).toBe(true)
    expect(session.snapshot().chunks.recording).toBe(1)
    expect(session.snapshot().chunks.queued).toBe(1)
  })

  test("does not open a new chunk from weak energy-only potential voice", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_020})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 1_130})
    session.appendCurrentChunkPcm(new ArrayBuffer(320))
    session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_760})
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 2_400}).stopped).toBe(true)

    session.acceptVadFrame({rms: 0.005, peak: 0.007, now: 2_740})
    const weakNoise = session.acceptVadFrame({rms: 0.005, peak: 0.007, now: 2_850})

    expect(weakNoise.potentialVoice).toBe(true)
    expect(weakNoise.started).toBe(false)
    expect(weakNoise.speaking).toBe(false)
    expect(session.snapshot().chunks.recording).toBe(0)
  })

  test("does not let loud voice-like input poison the adaptive noise floor", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    for (let index = 0; index < 8; index += 1) {
      session.acceptVadFrame({
        rms: 0.064,
        peak: 0.18,
        now: 1_020 + index * 20,
        speechProbability: 0.0005,
        speechProbabilityAt: 1_020 + index * 20,
      })
    }

    expect(session.snapshot().noiseFloor).toBeLessThan(0.01)
    expect(session.snapshot().chunks.recording).toBe(0)

    session.startRecording(true, 5_000)
    const snapshot = session.snapshot()
    expect(snapshot.noiseFloor).toBeLessThan(0.002)
    expect(snapshot.speechThreshold).toBe(0.012)
  })

  test("creates and closes speech chunks locally while ASR is offline", () => {
    const session = new VoiceSessionManager()
    session.startRecording()

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 100})
    const started = session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 210})
    expect(started.started).toBe(true)
    expect(session.snapshot().chunks.recording).toBe(1)
    session.appendCurrentChunkPcm(new ArrayBuffer(640))

    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 500}).stopped).toBe(false)
    const stopped = session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_200})
    expect(stopped.stopped).toBe(true)
    expect(stopped.closedChunkIds).toHaveLength(1)
    expect(session.snapshot().lastSpeechEndedAt).toBe(1_200)

    const snapshot = session.snapshot()
    expect(snapshot.chunks.recording).toBe(0)
    expect(snapshot.chunks.queued).toBe(1)
    expect(snapshot.queuedChunkBytes).toBe(640)
    expect(session.nextQueuedChunk()?.state).toBe("queued")
  })

  test("keeps closed chunks queued until recognized and merged", () => {
    const session = new VoiceSessionManager()
    session.startRecording()
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 100})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 210})
    session.appendCurrentChunkPcm(new ArrayBuffer(320))
    session.closeCurrentChunk(300)

    const queued = session.nextQueuedChunk()
    expect(queued?.state).toBe("queued")
    expect(queued).not.toBeNull()
    const id = queued!.id
    expect(session.snapshot().autoSendState).toBe("waitingChunks")

    session.markChunkProcessing(id)
    expect(session.snapshot().chunks.processing).toBe(1)
    session.requeueProcessingChunks("socket closed")
    expect(session.nextQueuedChunk()?.state).toBe("retrying")
    expect(session.snapshot().retryCount).toBe(0)
    session.markChunkProcessing(id)
    expect(session.snapshot().retryCount).toBe(1)
    session.markChunkRecognized(id, "готовый текст")
    expect(session.snapshot().chunks.recognized).toBe(1)
    session.markChunkMerged(id)
    expect(session.snapshot().chunks.merged).toBe(1)
    expect(session.snapshot().autoSendState).toBe("readyToSend")
    expect(session.hasPendingChunks()).toBe(false)
    session.startRecording(false, 420)
    expect(session.snapshot().autoSendState).toBe("readyToSend")
    session.markChunkFailed(id, "late timeout", true)
    expect(session.snapshot().chunks.merged).toBe(1)
    expect(session.nextQueuedChunk()).toBeNull()
  })

  test("honors custom final silence timing after a speech chunk closes", () => {
    const session = new VoiceSessionManager({...DEFAULT_VOICE_SESSION_TIMINGS, finalSilenceMs: 380})
    session.startRecording()

    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 100})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 210})
    session.appendCurrentChunkPcm(new ArrayBuffer(640))
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 500}).finalSilence).toBe(false)
    expect(session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_120}).stopped).toBe(true)

    const final = session.acceptVadFrame({rms: 0.002, peak: 0.004, now: 1_500})

    expect(final.finalSilence).toBe(true)
    expect(session.snapshot().timings.finalSilenceMs).toBe(380)
  })

  test("repeat mic click draft mode closes current chunk and cancels auto-send without discarding audio", () => {
    const session = new VoiceSessionManager()
    session.startRecording()
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 100})
    session.acceptVadFrame({rms: 0.05, peak: 0.11, now: 210})
    session.appendCurrentChunkPcm(new ArrayBuffer(480))

    session.enterDraftMode()
    session.cancelAutoSend()
    session.closeCurrentChunk(260)

    const snapshot = session.snapshot()
    expect(snapshot.phase).toBe("draft")
    expect(snapshot.autoSendState).toBe("cancelled")
    expect(snapshot.chunks.queued).toBe(1)
    expect(snapshot.queuedChunkBytes).toBe(480)
  })

  test("can seed a local chunk from buffered activation audio before ASR is ready", () => {
    const session = new VoiceSessionManager()
    session.startRecording(true, 1_000)

    const chunk = session.startBufferedChunk([new ArrayBuffer(320), new ArrayBuffer(320)], 1_120, 1_260)

    expect(chunk).not.toBeNull()
    expect(session.snapshot().phase).toBe("speaking")
    expect(session.snapshot().chunks.recording).toBe(1)
    expect(session.snapshot().chunkPcmBytes).toBe(640)

    session.closeCurrentChunk(1_900, "activation preroll")

    const snapshot = session.snapshot()
    expect(snapshot.chunks.recording).toBe(0)
    expect(snapshot.chunks.queued).toBe(1)
    expect(snapshot.queuedChunkBytes).toBe(640)
  })

  test("explicit dictation start exits draft mode", () => {
    const session = new VoiceSessionManager()
    session.enterDraftMode()
    expect(session.snapshot().phase).toBe("draft")

    session.startRecording(true)
    const snapshot = session.snapshot()
    expect(snapshot.phase).toBe("recording")
    expect(snapshot.autoSendState).toBe("armed")
  })

})

describe("voice wake gain", () => {
  test("does not amplify already loud or peak-heavy wake audio", () => {
    const loud = new Float32Array([0.2, -0.2, 0.24, -0.24])
    expect(analyzeWakeAudioGain(loud).gain).toBe(1)
    expect(Array.from(applyWakeAudioGain(loud))).toEqual(Array.from(loud))

    const peakHeavy = new Float32Array([0.001, -0.002, 0.7, -0.001])
    expect(analyzeWakeAudioGain(peakHeavy).gain).toBe(1)
  })

  test("amplifies only quiet wake audio within peak headroom", () => {
    const quiet = new Float32Array([0.004, -0.005, 0.006, -0.004])
    const gain = analyzeWakeAudioGain(quiet).gain
    expect(gain).toBeGreaterThan(1)
    expect(gain).toBeLessThanOrEqual(6)
    expect(Math.max(...Array.from(applyWakeAudioGain(quiet)).map(Math.abs))).toBeLessThanOrEqual(0.86)
  })
})

describe("voice Silero VAD", () => {
  test("resamples browser 48 kHz audio to 16 kHz Silero chunks", () => {
    const vad = new VoiceSileroVad()

    vad.acceptFrame(new Float32Array(1_536), 48_000, 2_000)

    const snapshot = vad.snapshot()
    expect(snapshot.inputSampleRate).toBe(48_000)
    expect(snapshot.pendingChunks).toBe(1)
    expect(snapshot.pendingSamples).toBe(0)
    vad.stop()
  })
})

describe("voice auto-send timing", () => {
  test("keeps configured timeout for short commands", () => {
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 42, 1)).toBe(1_000)
  })

  test("extends final pause window for long dictation", () => {
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 120, 1)).toBe(2_800)
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 180, 1)).toBe(3_500)
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 300, 1)).toBe(4_000)
  })

  test("extends timeout as dictation spans multiple chunks", () => {
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 60, 2)).toBe(3_500)
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 60, 3)).toBe(4_000)
  })

  test("caps dynamic timeout at configured maximum", () => {
    expect(voiceDynamicRecognitionTimeoutMs(1_500, 300, 3, 18_100, 2_400)).toBe(2_400)
    expect(voiceDynamicRecognitionTimeoutMs(1_500, 300, 3, 18_100, 4_000)).toBe(4_000)
  })

  test("extends timeout from local audio before ASR text arrives", () => {
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 0, 1, 6_600)).toBe(2_800)
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 0, 1, 10_100)).toBe(3_500)
    expect(voiceDynamicRecognitionTimeoutMs(1_000, 0, 1, 18_100)).toBe(4_000)
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

  test("builds ASR partial preview without using commands as dictation text", () => {
    const groups = {
      activation: ["завхоз", "запхоз"],
      deactivation: ["выключи микрофон"],
      stop: ["полная остановка"],
    }
    expect(prepareVoiceLivePreviewText("завхоз первое слово не потерялось", groups)).toBe("первое слово не потерялось")
    expect(prepareVoiceLivePreviewText("Текст не рвался и не дублировался", groups, "Текст не рвался")).toBe("и не дублировался")
    expect(prepareVoiceLivePreviewText("выключи микрофон", groups)).toBe("")
    expect(prepareVoiceLivePreviewText("запхоз и все", groups)).toBe("")
    expect(prepareVoiceLivePreviewText("завхоз открой терминал", groups)).toBe("открой терминал")
  })
})
