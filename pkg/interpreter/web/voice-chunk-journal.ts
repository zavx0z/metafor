import type {VoiceChunk, VoiceChunkState} from "./voice-session-manager.ts"

export type VoiceJournalChunkRecord = {
  key: string
  sessionId: string
  turnId: string
  id: string
  index: number
  state: VoiceChunkState
  startedAt: number
  endedAt: number | null
  pcm: ArrayBuffer[]
  pcmBytes: number
  text: string
  error: string | null
  attempts: number
  captureEpoch: string
  sequenceStart: number | null
  sequenceEnd: number | null
  acknowledgedSequence: number | null
  paragraphIndex: number
  audioHash: string
  updatedAt: number
}

export type VoiceChunkJournalSnapshot = {
  backend: "indexeddb" | "memory"
  pendingWrites: number
  lastError: string | null
}

const VOICE_CHUNK_DB_NAME = "metafor-voice-chunks-v2"
const VOICE_CHUNK_DB_VERSION = 1
const VOICE_CHUNK_STORE = "chunks"
const MEMORY_JOURNAL_KEY = "__metaforVoiceChunkJournalMemoryV2"

type MemoryJournalGlobal = typeof globalThis & {
  [MEMORY_JOURNAL_KEY]?: Map<string, VoiceJournalChunkRecord>
}

export class VoiceChunkJournal {
  #dbPromise: Promise<IDBDatabase | null> | null = null
  #writeTail: Promise<void> = Promise.resolve()
  #pendingWrites = 0
  #lastError: string | null = null

  snapshot(): VoiceChunkJournalSnapshot {
    return {
      backend: typeof indexedDB === "undefined" ? "memory" : "indexeddb",
      pendingWrites: this.#pendingWrites,
      lastError: this.#lastError,
    }
  }

  saveChunk(chunk: VoiceChunk): Promise<void> {
    return this.#enqueue(async () => {
      const record = await chunkRecord(chunk)
      const db = await this.#database()
      if (db === null) {
        memoryJournal().set(record.key, cloneRecord(record))
        return
      }
      await idbRequest<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readwrite")
        tx.objectStore(VOICE_CHUNK_STORE).put(record)
        tx.addEventListener("complete", () => resolve(), {once: true})
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("voice chunk journal transaction aborted")), {once: true})
        tx.addEventListener("error", () => reject(tx.error ?? new Error("voice chunk journal transaction failed")), {once: true})
      })
    })
  }

  saveChunks(chunks: readonly VoiceChunk[]): Promise<void> {
    return this.#enqueue(async () => {
      if (chunks.length === 0) return
      const records = await Promise.all(chunks.map(chunkRecord))
      const db = await this.#database()
      if (db === null) {
        const memory = memoryJournal()
        for (const record of records) memory.set(record.key, cloneRecord(record))
        return
      }
      await idbRequest<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readwrite")
        const store = tx.objectStore(VOICE_CHUNK_STORE)
        for (const record of records) store.put(record)
        tx.addEventListener("complete", () => resolve(), {once: true})
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("voice chunk journal transaction aborted")), {once: true})
        tx.addEventListener("error", () => reject(tx.error ?? new Error("voice chunk journal transaction failed")), {once: true})
      })
    })
  }

  async loadPending(): Promise<VoiceJournalChunkRecord[]> {
    await this.#writeTail.catch(() => undefined)
    const db = await this.#database()
    if (db === null) {
      return [...memoryJournal().values()]
        .filter((record) => record.state !== "merged")
        .sort(compareRecords)
        .map(cloneRecord)
    }
    try {
      const records = await idbRequest<VoiceJournalChunkRecord[]>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readonly")
        const request = tx.objectStore(VOICE_CHUNK_STORE).getAll()
        request.addEventListener("success", () => resolve((request.result as VoiceJournalChunkRecord[]) ?? []), {once: true})
        request.addEventListener("error", () => reject(request.error ?? new Error("voice chunk journal read failed")), {once: true})
      })
      return records.filter((record) => record.state !== "merged").sort(compareRecords).map(cloneRecord)
    } catch (error) {
      this.#rememberError(error)
      return [...memoryJournal().values()]
        .filter((record) => record.state !== "merged")
        .sort(compareRecords)
        .map(cloneRecord)
    }
  }

  deleteChunk(sessionId: string, chunkId: string): Promise<void> {
    return this.#enqueue(async () => {
      const key = recordKey(sessionId, chunkId)
      memoryJournal().delete(key)
      const db = await this.#database()
      if (db === null) return
      await idbRequest<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readwrite")
        tx.objectStore(VOICE_CHUNK_STORE).delete(key)
        tx.addEventListener("complete", () => resolve(), {once: true})
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("voice chunk delete aborted")), {once: true})
        tx.addEventListener("error", () => reject(tx.error ?? new Error("voice chunk delete failed")), {once: true})
      })
    })
  }

  discardSession(sessionId: string): Promise<void> {
    return this.#enqueue(async () => {
      const memory = memoryJournal()
      for (const [key, record] of memory) {
        if (record.sessionId === sessionId) memory.delete(key)
      }
      const db = await this.#database()
      if (db === null) return
      const records = await idbRequest<VoiceJournalChunkRecord[]>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readonly")
        const request = tx.objectStore(VOICE_CHUNK_STORE).getAll()
        request.addEventListener("success", () => resolve((request.result as VoiceJournalChunkRecord[]) ?? []), {once: true})
        request.addEventListener("error", () => reject(request.error ?? new Error("voice chunk journal read failed")), {once: true})
      })
      await idbRequest<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readwrite")
        const store = tx.objectStore(VOICE_CHUNK_STORE)
        for (const record of records) {
          if (record.sessionId === sessionId) store.delete(record.key)
        }
        tx.addEventListener("complete", () => resolve(), {once: true})
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("voice session discard aborted")), {once: true})
        tx.addEventListener("error", () => reject(tx.error ?? new Error("voice session discard failed")), {once: true})
      })
    })
  }

  collectMerged(olderThanMs = 60_000): Promise<void> {
    return this.#enqueue(async () => {
      const cutoff = Date.now() - Math.max(0, olderThanMs)
      const memory = memoryJournal()
      for (const [key, record] of memory) {
        if (record.state === "merged" && record.updatedAt <= cutoff) memory.delete(key)
      }
      const db = await this.#database()
      if (db === null) return
      const records = await idbRequest<VoiceJournalChunkRecord[]>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readonly")
        const request = tx.objectStore(VOICE_CHUNK_STORE).getAll()
        request.addEventListener("success", () => resolve((request.result as VoiceJournalChunkRecord[]) ?? []), {once: true})
        request.addEventListener("error", () => reject(request.error ?? new Error("voice chunk journal read failed")), {once: true})
      })
      await idbRequest<void>((resolve, reject) => {
        const tx = db.transaction(VOICE_CHUNK_STORE, "readwrite")
        const store = tx.objectStore(VOICE_CHUNK_STORE)
        for (const record of records) {
          if (record.state === "merged" && record.updatedAt <= cutoff) store.delete(record.key)
        }
        tx.addEventListener("complete", () => resolve(), {once: true})
        tx.addEventListener("abort", () => reject(tx.error ?? new Error("voice chunk collection aborted")), {once: true})
        tx.addEventListener("error", () => reject(tx.error ?? new Error("voice chunk collection failed")), {once: true})
      })
    })
  }

  async flush(): Promise<void> {
    await this.#writeTail
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    this.#pendingWrites += 1
    const run = this.#writeTail.then(operation, operation)
    const settled = run
      .catch((error) => this.#rememberError(error))
      .finally(() => {
        this.#pendingWrites = Math.max(0, this.#pendingWrites - 1)
      })
    this.#writeTail = settled
    return settled
  }

  async #database(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return null
    if (this.#dbPromise !== null) return this.#dbPromise
    this.#dbPromise = new Promise((resolve) => {
      let settled = false
      const finish = (db: IDBDatabase | null): void => {
        if (settled) return
        settled = true
        resolve(db)
      }
      try {
        const request = indexedDB.open(VOICE_CHUNK_DB_NAME, VOICE_CHUNK_DB_VERSION)
        request.addEventListener("upgradeneeded", () => {
          const db = request.result
          if (!db.objectStoreNames.contains(VOICE_CHUNK_STORE)) {
            const store = db.createObjectStore(VOICE_CHUNK_STORE, {keyPath: "key"})
            store.createIndex("sessionId", "sessionId", {unique: false})
            store.createIndex("state", "state", {unique: false})
            store.createIndex("updatedAt", "updatedAt", {unique: false})
          }
        })
        request.addEventListener("success", () => {
          const db = request.result
          db.addEventListener("versionchange", () => db.close())
          finish(db)
        }, {once: true})
        request.addEventListener("error", () => {
          this.#rememberError(request.error ?? new Error("voice chunk journal open failed"))
          finish(null)
        }, {once: true})
        request.addEventListener("blocked", () => finish(null), {once: true})
      } catch (error) {
        this.#rememberError(error)
        finish(null)
      }
    })
    return this.#dbPromise
  }

  #rememberError(error: unknown): void {
    this.#lastError = error instanceof Error ? error.message : String(error)
  }
}

async function chunkRecord(chunk: VoiceChunk): Promise<VoiceJournalChunkRecord> {
  const pcm = chunk.pcm.map(copyArrayBuffer)
  const audioHash = chunk.audioHash || await hashPcm(pcm)
  chunk.audioHash = audioHash
  return {
    key: recordKey(chunk.sessionId, chunk.id),
    sessionId: chunk.sessionId,
    turnId: chunk.turnId,
    id: chunk.id,
    index: chunk.index,
    state: chunk.state,
    startedAt: chunk.startedAt,
    endedAt: chunk.endedAt,
    pcm,
    pcmBytes: chunk.pcmBytes,
    text: chunk.text,
    error: chunk.error,
    attempts: chunk.attempts,
    captureEpoch: chunk.captureEpoch,
    sequenceStart: chunk.sequenceStart,
    sequenceEnd: chunk.sequenceEnd,
    acknowledgedSequence: chunk.acknowledgedSequence,
    paragraphIndex: chunk.paragraphIndex,
    audioHash,
    updatedAt: Date.now(),
  }
}

export function voiceChunkFromJournal(record: VoiceJournalChunkRecord): VoiceChunk {
  return {
    sessionId: record.sessionId,
    turnId: record.turnId,
    id: record.id,
    index: record.index,
    state: record.state === "processing" ? "retrying" : record.state,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    pcm: record.pcm.map(copyArrayBuffer),
    pcmBytes: record.pcmBytes,
    text: record.text,
    error: record.state === "processing" ? "restored after reload" : record.error,
    attempts: record.attempts,
    captureEpoch: record.captureEpoch,
    sequenceStart: record.sequenceStart,
    sequenceEnd: record.sequenceEnd,
    acknowledgedSequence: record.acknowledgedSequence ?? null,
    paragraphIndex: record.paragraphIndex,
    audioHash: record.audioHash,
  }
}

function recordKey(sessionId: string, chunkId: string): string {
  return `${sessionId}:${chunkId}`
}

function memoryJournal(): Map<string, VoiceJournalChunkRecord> {
  const root = globalThis as MemoryJournalGlobal
  const existing = root[MEMORY_JOURNAL_KEY]
  if (existing !== undefined) return existing
  const created = new Map<string, VoiceJournalChunkRecord>()
  root[MEMORY_JOURNAL_KEY] = created
  return created
}

function compareRecords(a: VoiceJournalChunkRecord, b: VoiceJournalChunkRecord): number {
  return a.startedAt - b.startedAt || a.index - b.index || a.id.localeCompare(b.id)
}

function cloneRecord(record: VoiceJournalChunkRecord): VoiceJournalChunkRecord {
  return {...record, pcm: record.pcm.map(copyArrayBuffer)}
}

function copyArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0)
}

function idbRequest<T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      executor(resolve, reject)
    } catch (error) {
      reject(error)
    }
  })
}

async function hashPcm(pcm: readonly ArrayBuffer[]): Promise<string> {
  const bytes = concatenatePcm(pcm)
  try {
    if (typeof crypto?.subtle?.digest === "function") {
      const digest = await crypto.subtle.digest("SHA-256", bytes)
      return hex(new Uint8Array(digest))
    }
  } catch {
    // Use the deterministic fallback below.
  }
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}-${bytes.byteLength}`
}

function concatenatePcm(pcm: readonly ArrayBuffer[]): Uint8Array {
  const total = pcm.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const buffer of pcm) {
    const view = new Uint8Array(buffer)
    bytes.set(view, offset)
    offset += view.byteLength
  }
  return bytes
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
