import {describe, expect, test} from "bun:test"
import {VoiceChunkJournal, voiceChunkFromJournal} from "./voice-chunk-journal.ts"
import type {VoiceChunk} from "./voice-session-manager.ts"

function chunk(id: string): VoiceChunk {
  return {
    sessionId: "session-test",
    turnId: "turn-test",
    id,
    index: 0,
    state: "queued",
    startedAt: 1,
    endedAt: 2,
    pcm: [new ArrayBuffer(320)],
    pcmBytes: 320,
    text: "",
    error: null,
    attempts: 0,
    captureEpoch: "capture-test",
    sequenceStart: 0,
    sequenceEnd: 0,
    acknowledgedSequence: null,
    paragraphIndex: 0,
    audioHash: "",
  }
}

describe("voice chunk journal", () => {
  test("persists, restores and deletes a pending chunk", async () => {
    const journal = new VoiceChunkJournal()
    const source = chunk(`chunk-${crypto.randomUUID()}`)
    await journal.saveChunk(source)
    const record = (await journal.loadPending()).find((item) => item.id === source.id)
    expect(record).toBeDefined()
    expect(record === undefined ? null : voiceChunkFromJournal(record)).toMatchObject({id: source.id, pcmBytes: 320})
    await journal.deleteChunk(source.sessionId, source.id)
    expect((await journal.loadPending()).some((item) => item.id === source.id)).toBe(false)
  })

  test("snapshots PCM before an asynchronous session reset", async () => {
    const journal = new VoiceChunkJournal()
    const source = chunk(`chunk-${crypto.randomUUID()}`)
    const saving = journal.saveChunk(source)
    source.pcm = []
    source.pcmBytes = 0
    await saving
    const record = (await journal.loadPending()).find((item) => item.id === source.id)
    expect(record?.pcmBytes).toBe(320)
    expect(record?.pcm[0]?.byteLength).toBe(320)
    await journal.deleteChunk(source.sessionId, source.id)
  })
})
