import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createCommandRouter, defaultVoiceCommands } from "../src/commands";
import {
  commandGrammar,
  defaultVoskModelPath,
  loadVosk,
  openVoskModel,
  type VoskModel,
  voicePackageRoot,
} from "../src/vosk";

type CliOptions = {
  modelPath: string;
  libraryPath?: string;
  ffmpegPath: string;
  device: string;
  sampleRate: number;
  chunkBytes: number;
  durationSeconds: number;
  useGrammar: boolean;
  printPartial: boolean;
  listDevices: boolean;
  logLevel: number;
};

const options = parseArgs(Bun.argv.slice(2));

if (options.listDevices) {
  await listAvFoundationDevices(options.ffmpegPath);
  process.exit(0);
}

const router = createCommandRouter(defaultVoiceCommands);
const grammar = options.useGrammar ? commandGrammar(router.recognitionPhrases) : undefined;
const library = loadVosk(options.libraryPath);
library.symbols.vosk_set_log_level(options.logLevel);

let model: VoskModel | undefined;
let recognizer: ReturnType<VoskModel["createRecognizer"]> | undefined;
let microphone: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
let stopped = false;

try {
  model = openVoskModel(options.modelPath, library);
  recognizer = model.createRecognizer({ sampleRate: options.sampleRate, grammar });

  microphone = startFfmpegMicrophone(options);
  installShutdownHandlers(() => {
    stopped = true;
    microphone?.kill();
  });

  console.log(`listening: ${options.device} (${options.sampleRate} Hz mono PCM)`);
  console.log("try: \"включи свет\", \"открой гит хаб\", \"проверь веб джи пи ю\"");
  console.log("press Ctrl+C to stop");

  const stderrPromise = collectProcessText(microphone.stderr);
  const deadline =
    options.durationSeconds > 0
      ? Date.now() + options.durationSeconds * 1000
      : Number.POSITIVE_INFINITY;

  for await (const chunk of microphone.stdout) {
    if (stopped) break;
    if (Date.now() >= deadline) {
      stopped = true;
      microphone.kill();
      break;
    }

    for (const pcm of splitChunk(chunk, options.chunkBytes)) {
      const result = recognizer.acceptPcm(pcm);

      if (result.kind === "partial") {
        if (options.printPartial && result.text) {
          console.log(`partial: ${result.text}`);
        }
        continue;
      }

      if (!result.text) continue;

      console.log(`text: ${result.text}`);
      await dispatchCommand(router, result.text);
    }
  }

  const final = recognizer.finalResult();
  if (final.text) {
    console.log(`final: ${final.text}`);
    await dispatchCommand(router, final.text);
  }

  const exitCode = await microphone.exited;
  const stderr = await stderrPromise;
  if (!stopped && exitCode !== 0) {
    throw new Error(formatFfmpegError(exitCode, stderr));
  }
} finally {
  microphone?.kill();
  recognizer?.close();
  model?.close();
  library.close();
}

async function dispatchCommand(
  router: ReturnType<typeof createCommandRouter>,
  text: string,
): Promise<void> {
  const match = await router.dispatch(text);
  if (!match) return;

  const suffix = match.kind === "fuzzy" ? ` distance=${match.distance}` : "";
  console.log(`command: ${match.command.id} (${match.phrase}, ${match.kind}${suffix})`);
}

function startFfmpegMicrophone(
  options: CliOptions,
): Bun.Subprocess<"ignore", "pipe", "pipe"> {
  return Bun.spawn(
    [
      options.ffmpegPath,
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-f",
      "avfoundation",
      "-i",
      options.device,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(options.sampleRate),
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "-",
    ],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
}

async function listAvFoundationDevices(ffmpegPath: string): Promise<void> {
  const process = Bun.spawn(
    [ffmpegPath, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    collectProcessText(process.stdout),
    collectProcessText(process.stderr),
    process.exited,
  ]);
  const output = `${stderr}${stdout}`.trim();
  const formatted = formatDeviceList(output);
  console.log(formatted || "No AVFoundation devices reported by ffmpeg.");
  if (exitCode !== 0 && !/\[\d+\]/.test(output)) {
    console.log("");
    console.log(
      "No audio devices were visible to ffmpeg. Grant Microphone permission to the terminal running Bun, then retry.",
    );
  }
}

function formatDeviceList(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const section = line.match(/AVFoundation (video|audio) devices:/);
      if (section) return `${section[1]} devices:`;

      const device = line.match(/\[(\d+)\] (.+)$/);
      if (device) return `  [${device[1]}] ${device[2]}`;

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    modelPath: defaultVoskModelPath(),
    ffmpegPath: Bun.env.FFMPEG_PATH ?? defaultFfmpegPath(),
    device: Bun.env.MIC_DEVICE ?? ":0",
    sampleRate: Number(Bun.env.MIC_SAMPLE_RATE ?? 16_000),
    chunkBytes: 4_000,
    durationSeconds: 0,
    useGrammar: true,
    printPartial: false,
    listDevices: false,
    logLevel: Number(Bun.env.VOSK_LOG_LEVEL ?? -1),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--list-devices") {
      options.listDevices = true;
      continue;
    }

    if (arg === "--model") {
      options.modelPath = next();
      continue;
    }

    if (arg === "--lib") {
      options.libraryPath = next();
      continue;
    }

    if (arg === "--ffmpeg") {
      options.ffmpegPath = next();
      continue;
    }

    if (arg === "--device") {
      options.device = next();
      continue;
    }

    if (arg === "--sample-rate") {
      options.sampleRate = Number(next());
      continue;
    }

    if (arg === "--chunk-bytes") {
      options.chunkBytes = Number(next());
      continue;
    }

    if (arg === "--duration") {
      options.durationSeconds = Number(next());
      continue;
    }

    if (arg === "--partial") {
      options.printPartial = true;
      continue;
    }

    if (arg === "--no-grammar") {
      options.useGrammar = false;
      continue;
    }

    if (arg === "--log-level") {
      options.logLevel = Number(next());
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.ffmpegPath || !existsSync(options.ffmpegPath)) {
    throw new Error(`ffmpeg not found at ${options.ffmpegPath}`);
  }

  const sampleRate = Number(options.sampleRate);
  const chunkBytes = Number(options.chunkBytes);
  const durationSeconds = Number(options.durationSeconds);
  const logLevel = Number(options.logLevel);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Sample rate must be a positive number");
  }

  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("Chunk size must be a positive integer");
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error("Duration must be zero or a positive number");
  }

  if (!Number.isInteger(logLevel)) {
    throw new Error("Vosk log level must be an integer");
  }

  options.sampleRate = sampleRate;
  options.chunkBytes = chunkBytes;
  options.durationSeconds = durationSeconds;
  options.logLevel = logLevel;

  return options as CliOptions;
}

function defaultFfmpegPath(): string {
  const packagePath = resolve(voicePackageRoot, "bin/ffmpeg");
  if (existsSync(packagePath)) return packagePath;
  const cwdPath = resolve("./bin/ffmpeg");
  if (existsSync(cwdPath)) return cwdPath;
  return "ffmpeg";
}

function splitChunk(chunk: Uint8Array, chunkBytes: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < chunk.byteLength; offset += chunkBytes) {
    chunks.push(chunk.subarray(offset, Math.min(offset + chunkBytes, chunk.byteLength)));
  }
  return chunks;
}

async function collectProcessText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function installShutdownHandlers(stop: () => void): void {
  const handler = () => {
    stop();
    process.exitCode = 130;
  };

  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}

function formatFfmpegError(exitCode: number, stderr: string): string {
  const trimmed = stderr.trim();
  if (
    trimmed.includes("not authorized") ||
    trimmed.includes("Input/output error") ||
    trimmed.includes("Invalid audio device index")
  ) {
    return `ffmpeg microphone capture failed (${exitCode}). Grant Microphone permission to the terminal running Bun, run "bun run recognize:mic --list-devices", then retry with the visible audio device such as --device ":0".\n${trimmed}`;
  }

  return `ffmpeg microphone capture failed (${exitCode}).\n${trimmed}`;
}

function printHelp(): void {
  console.log(`Usage:
  bun run recognize:mic
  bun run recognize:mic --list-devices
  bun run recognize:mic --device ":1" --partial

Environment:
  FFMPEG_PATH       Path to ffmpeg. Default: ./bin/ffmpeg.
  MIC_DEVICE        AVFoundation device, default :0.
  MIC_SAMPLE_RATE   Capture sample rate, default 16000.
  VOSK_MODEL        Russian model directory. Default: ./models/ru.
  VOSK_LIB          Path to libvosk.dylib, libvosk.so, or libvosk.dll.
  VOSK_LOG_LEVEL    Vosk log level. Default: -1.

Options:
  --list-devices    Print AVFoundation devices reported by ffmpeg.
  --device VALUE    AVFoundation input. Use :0 for first audio device.
  --duration N      Stop after N seconds. Default: 0, run until Ctrl+C.
  --partial         Print Vosk partial results.
  --model PATH      Russian model directory.
  --lib PATH        Shared library path.
  --ffmpeg PATH     ffmpeg binary path.
  --sample-rate N   PCM sample rate sent to Vosk. Default: 16000.
  --chunk-bytes N   PCM bytes per Vosk call. Default: 4000.
  --no-grammar      Use the full model vocabulary instead of command grammar.
  --log-level N     Vosk log level. Default: -1.`);
}
