type OrtModule = typeof import("onnxruntime-web/wasm")
type OrtTensor = import("onnxruntime-web/wasm").Tensor
type OrtSession = import("onnxruntime-web/wasm").InferenceSession

export type VoiceSileroVadDebugSnapshot = {
  ready: boolean
  loading: boolean
  error: string | null
  speechProbability: number | null
  lastInferenceAt: number
  processedChunks: number
  pendingChunks: number
  pendingSamples: number
}

export type VoiceSileroVadProbability = {
  probability: number | null
  at: number
}

const SILERO_MODEL_URL = "/assets/voice/models/silero_vad_16k_op15.onnx"
const ORT_WASM_URL = "/assets/voice/ort/ort-wasm-simd-threaded.wasm"
const SILERO_SAMPLE_RATE = 16_000
const SILERO_CHUNK_SAMPLES = 512
const SILERO_STATE_SIZE = 2 * 1 * 128
const MAX_PENDING_CHUNKS = 8

export class VoiceSileroVad {
  #ort: OrtModule | null = null
  #session: OrtSession | null = null
  #loadPromise: Promise<void> | null = null
  #running = false
  #stopped = false
  #state = new Float32Array(SILERO_STATE_SIZE)
  #scratch = new Float32Array(SILERO_CHUNK_SAMPLES)
  #scratchLength = 0
  #pendingChunks: Float32Array[] = []
  #speechProbability: number | null = null
  #lastInferenceAt = 0
  #processedChunks = 0
  #error: string | null = null

  start(): void {
    this.#stopped = false
    void this.#ensureLoaded()
  }

  stop(): void {
    this.#stopped = true
    this.#pendingChunks = []
    this.#scratchLength = 0
  }

  reset(): void {
    this.#state.fill(0)
    this.#pendingChunks = []
    this.#scratchLength = 0
    this.#speechProbability = null
    this.#lastInferenceAt = 0
    this.#processedChunks = 0
  }

  acceptFrame(samples: Float32Array): void {
    if (this.#stopped || this.#error !== null) return
    let offset = 0
    while (offset < samples.length) {
      const available = SILERO_CHUNK_SAMPLES - this.#scratchLength
      const count = Math.min(available, samples.length - offset)
      this.#scratch.set(samples.subarray(offset, offset + count), this.#scratchLength)
      this.#scratchLength += count
      offset += count
      if (this.#scratchLength === SILERO_CHUNK_SAMPLES) {
        this.#pendingChunks.push(new Float32Array(this.#scratch))
        this.#scratchLength = 0
        while (this.#pendingChunks.length > MAX_PENDING_CHUNKS) this.#pendingChunks.shift()
      }
    }
    void this.#drain()
  }

  probability(): VoiceSileroVadProbability {
    return {
      probability: this.#speechProbability,
      at: this.#lastInferenceAt,
    }
  }

  debugSnapshot(): VoiceSileroVadDebugSnapshot {
    return {
      ready: this.#session !== null,
      loading: this.#loadPromise !== null,
      error: this.#error,
      speechProbability: this.#speechProbability,
      lastInferenceAt: this.#lastInferenceAt,
      processedChunks: this.#processedChunks,
      pendingChunks: this.#pendingChunks.length,
      pendingSamples: this.#scratchLength,
    }
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#session !== null || this.#error !== null) return
    if (this.#loadPromise !== null) return this.#loadPromise
    this.#loadPromise = this.#load()
    try {
      await this.#loadPromise
    } finally {
      this.#loadPromise = null
    }
  }

  async #load(): Promise<void> {
    try {
      const ort = await import("onnxruntime-web/wasm")
      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      ort.env.wasm.wasmPaths = {
        wasm: new URL(ORT_WASM_URL, location.href).href,
      }
      this.#ort = ort
      this.#session = await ort.InferenceSession.create(new URL(SILERO_MODEL_URL, location.href).href, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      })
      void this.#drain()
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      this.#pendingChunks = []
    }
  }

  async #drain(): Promise<void> {
    if (this.#running || this.#stopped || this.#error !== null || this.#pendingChunks.length === 0) return
    await this.#ensureLoaded()
    const session = this.#session
    const ort = this.#ort
    if (session === null || ort === null) return

    this.#running = true
    try {
      while (!this.#stopped && this.#pendingChunks.length > 0) {
        const chunk = this.#pendingChunks.shift()
        if (chunk === undefined) break
        await this.#runChunk(ort, session, chunk)
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      this.#pendingChunks = []
    } finally {
      this.#running = false
    }
  }

  async #runChunk(ort: OrtModule, session: OrtSession, chunk: Float32Array): Promise<void> {
    const stateDims: [number, number, number] = [2, 1, this.#state.length / 2]
    const feeds: Record<string, OrtTensor> = {
      input: new ort.Tensor("float32", chunk, [1, SILERO_CHUNK_SAMPLES]),
      state: new ort.Tensor("float32", this.#state, stateDims),
    }
    if (session.inputNames.includes("sr")) {
      feeds["sr"] = new ort.Tensor("int64", new BigInt64Array([BigInt(SILERO_SAMPLE_RATE)]), [])
    }

    const result = await session.run(feeds)
    const probability = tensorNumber(result["output"])
    const nextState = tensorFloats(result["stateN"])
    if (probability !== null) {
      this.#speechProbability = probability
      this.#lastInferenceAt = performance.now()
      this.#processedChunks += 1
    }
    if (nextState !== null && nextState.length === this.#state.length) {
      this.#state = new Float32Array(nextState)
    }
  }
}

function tensorNumber(tensor: OrtTensor | undefined): number | null {
  const data = tensor?.data
  if (data === undefined || data.length === 0) return null
  const first = Number(data[0])
  return Number.isFinite(first) ? Math.min(1, Math.max(0, first)) : null
}

function tensorFloats(tensor: OrtTensor | undefined): Float32Array | null {
  const data = tensor?.data
  if (!(data instanceof Float32Array)) return null
  return data
}
