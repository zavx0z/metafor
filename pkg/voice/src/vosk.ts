import { dlopen, suffix } from "bun:ffi";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type Pointer = number | bigint;

type VoskSymbols = {
  vosk_set_log_level(logLevel: number): void;
  vosk_model_new(modelPath: Uint8Array): Pointer;
  vosk_model_free(model: Pointer): void;
  vosk_recognizer_new(model: Pointer, sampleRate: number): Pointer;
  vosk_recognizer_new_grm(model: Pointer, sampleRate: number, grammar: Uint8Array): Pointer;
  vosk_recognizer_set_words(recognizer: Pointer, words: number): void;
  vosk_recognizer_accept_waveform(recognizer: Pointer, data: Uint8Array, length: number): number;
  vosk_recognizer_result(recognizer: Pointer): string;
  vosk_recognizer_partial_result(recognizer: Pointer): string;
  vosk_recognizer_final_result(recognizer: Pointer): string;
  vosk_recognizer_reset(recognizer: Pointer): void;
  vosk_recognizer_free(recognizer: Pointer): void;
};

export type VoskLibrary = {
  symbols: VoskSymbols;
  close(): void;
};

export type VoskRecognizerOptions = {
  sampleRate?: number;
  grammar?: readonly string[];
  words?: boolean;
};

export type RecognitionJson = {
  text?: string;
  partial?: string;
  result?: unknown;
  alternatives?: unknown;
  [key: string]: unknown;
};

export type RecognitionChunk = {
  kind: "result" | "partial" | "final";
  text: string;
  json: RecognitionJson;
  raw: string;
};

const NULL_POINTERS = new Set<Pointer>([0, 0n]);
export const voicePackageRoot = resolve(import.meta.dir, "..");

export function defaultVoskModelPath(): string {
  const fromEnv = Bun.env.VOSK_MODEL;
  if (fromEnv) return fromEnv;

  return (
    firstExistingPath([resolve(voicePackageRoot, "models/ru"), resolve("models/ru")]) ??
    resolve("models/ru")
  );
}

export function defaultVoskLibraryPath(): string {
  const fromEnv = Bun.env.VOSK_LIB;
  if (fromEnv) return fromEnv;

  const localCandidates =
    suffix === "dll" ? ["lib/libvosk.dll", "lib/vosk.dll"] : [`lib/libvosk.${suffix}`];
  for (const candidate of localCandidates) {
    const localPath = firstExistingPath([
      resolve(voicePackageRoot, candidate),
      resolve(candidate),
    ]);
    if (localPath) return localPath;
  }

  return `libvosk.${suffix}`;
}

export function loadVosk(libraryPath = defaultVoskLibraryPath()): VoskLibrary {
  return dlopen(libraryPath, {
    vosk_set_log_level: {
      args: ["i32"],
      returns: "void",
    },
    vosk_model_new: {
      args: ["cstring"],
      returns: "ptr",
    },
    vosk_model_free: {
      args: ["ptr"],
      returns: "void",
    },
    vosk_recognizer_new: {
      args: ["ptr", "f32"],
      returns: "ptr",
    },
    vosk_recognizer_new_grm: {
      args: ["ptr", "f32", "cstring"],
      returns: "ptr",
    },
    vosk_recognizer_set_words: {
      args: ["ptr", "i32"],
      returns: "void",
    },
    vosk_recognizer_accept_waveform: {
      args: ["ptr", "buffer", "i32"],
      returns: "i32",
    },
    vosk_recognizer_result: {
      args: ["ptr"],
      returns: "cstring",
    },
    vosk_recognizer_partial_result: {
      args: ["ptr"],
      returns: "cstring",
    },
    vosk_recognizer_final_result: {
      args: ["ptr"],
      returns: "cstring",
    },
    vosk_recognizer_reset: {
      args: ["ptr"],
      returns: "void",
    },
    vosk_recognizer_free: {
      args: ["ptr"],
      returns: "void",
    },
  }) as unknown as VoskLibrary;
}

export function openVoskModel(modelPath: string, library?: VoskLibrary): VoskModel {
  const actualLibrary = library ?? loadVosk();
  const model = actualLibrary.symbols.vosk_model_new(toCString(modelPath));
  if (isNullPointer(model)) {
    if (!library) actualLibrary.close();
    throw new Error(`Failed to load Vosk model from ${modelPath}`);
  }

  return new VoskModel(actualLibrary, model, !library);
}

export class VoskModel {
  #closed = false;

  constructor(
    readonly library: VoskLibrary,
    readonly ptr: Pointer,
    readonly ownsLibrary = false,
  ) {}

  createRecognizer(options: VoskRecognizerOptions = {}): VoskRecognizer {
    this.#assertOpen();

    const sampleRate = options.sampleRate ?? 16_000;
    const recognizer = options.grammar?.length
      ? this.library.symbols.vosk_recognizer_new_grm(
          this.ptr,
          sampleRate,
          toCString(JSON.stringify(options.grammar)),
        )
      : this.library.symbols.vosk_recognizer_new(this.ptr, sampleRate);

    if (isNullPointer(recognizer)) {
      throw new Error("Failed to create Vosk recognizer");
    }

    if (options.words) {
      this.library.symbols.vosk_recognizer_set_words(recognizer, 1);
    }

    return new VoskRecognizer(this.library, recognizer);
  }

  close(): void {
    if (this.#closed) return;
    this.library.symbols.vosk_model_free(this.ptr);
    if (this.ownsLibrary) this.library.close();
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Vosk model is already closed");
    }
  }
}

export class VoskRecognizer {
  #closed = false;

  constructor(
    readonly library: VoskLibrary,
    readonly ptr: Pointer,
  ) {}

  acceptPcm(pcm: Uint8Array): RecognitionChunk {
    this.#assertOpen();

    const status = this.library.symbols.vosk_recognizer_accept_waveform(
      this.ptr,
      pcm,
      pcm.byteLength,
    );

    if (status === -1) {
      throw new Error("Vosk failed to process PCM waveform");
    }

    return status === 1 ? this.result() : this.partialResult();
  }

  result(): RecognitionChunk {
    return parseRecognition("result", this.library.symbols.vosk_recognizer_result(this.ptr));
  }

  partialResult(): RecognitionChunk {
    return parseRecognition(
      "partial",
      this.library.symbols.vosk_recognizer_partial_result(this.ptr),
    );
  }

  finalResult(): RecognitionChunk {
    return parseRecognition("final", this.library.symbols.vosk_recognizer_final_result(this.ptr));
  }

  reset(): void {
    this.#assertOpen();
    this.library.symbols.vosk_recognizer_reset(this.ptr);
  }

  close(): void {
    if (this.#closed) return;
    this.library.symbols.vosk_recognizer_free(this.ptr);
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Vosk recognizer is already closed");
    }
  }
}

export function* chunkPcm(pcm: Uint8Array, chunkBytes = 4_000): Generator<Uint8Array> {
  for (let offset = 0; offset < pcm.byteLength; offset += chunkBytes) {
    yield pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.byteLength));
  }
}

export function commandGrammar(phrases: readonly string[]): string[] {
  return [...new Set([...phrases, "[unk]"])];
}

function parseRecognition(kind: RecognitionChunk["kind"], raw: string): RecognitionChunk {
  const json = JSON.parse(raw || "{}") as RecognitionJson;
  const text = typeof json.text === "string" ? json.text : typeof json.partial === "string" ? json.partial : "";

  return { kind, text, json, raw };
}

function toCString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const cstring = new Uint8Array(bytes.byteLength + 1);
  cstring.set(bytes);
  return cstring;
}

function isNullPointer(ptr: Pointer): boolean {
  return NULL_POINTERS.has(ptr);
}

function firstExistingPath(paths: readonly string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}
