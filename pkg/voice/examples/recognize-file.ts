import { createCommandRouter, defaultVoiceCommands } from "../src/commands";
import {
  chunkPcm,
  commandGrammar,
  defaultVoskModelPath,
  loadVosk,
  openVoskModel,
  type VoskModel,
} from "../src/vosk";
import { parseWavPcm } from "../src/wav";

type CliOptions = {
  filePath: string;
  modelPath: string;
  libraryPath?: string;
  sampleRate: number;
  rawPcm: boolean;
  useGrammar: boolean;
  chunkBytes: number;
  logLevel: number;
};

const options = parseArgs(Bun.argv.slice(2));

const router = createCommandRouter(defaultVoiceCommands);
const fileBytes = new Uint8Array(await Bun.file(options.filePath).arrayBuffer());
const audio = options.rawPcm
  ? { pcm: fileBytes, sampleRate: options.sampleRate }
  : parseWavPcm(fileBytes);

const sampleRate = options.rawPcm ? options.sampleRate : audio.sampleRate;
const grammar = options.useGrammar ? commandGrammar(router.recognitionPhrases) : undefined;
const library = loadVosk(options.libraryPath);
library.symbols.vosk_set_log_level(options.logLevel);

let model: VoskModel | undefined;
let recognizer: ReturnType<VoskModel["createRecognizer"]> | undefined;

try {
  model = openVoskModel(options.modelPath, library);
  recognizer = model.createRecognizer({ sampleRate, grammar });

  for (const chunk of chunkPcm(audio.pcm, options.chunkBytes)) {
    const result = recognizer.acceptPcm(chunk);
    if (result.kind !== "result" || !result.text) continue;

    console.log(`text: ${result.text}`);
    await dispatchCommand(router, result.text);
  }

  const final = recognizer.finalResult();
  if (final.text) {
    console.log(`final: ${final.text}`);
    await dispatchCommand(router, final.text);
  }
} finally {
  recognizer?.close();
  model?.close();
  library.close();
}

async function dispatchCommand(
  router: ReturnType<typeof createCommandRouter>,
  text: string,
): Promise<void> {
  const match = await router.dispatch(text);
  if (match) {
    const suffix = match.kind === "fuzzy" ? ` distance=${match.distance}` : "";
    console.log(`command: ${match.command.id} (${match.phrase}, ${match.kind}${suffix})`);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    modelPath: defaultVoskModelPath(),
    sampleRate: Number(Bun.env.VOSK_SAMPLE_RATE ?? 16_000),
    rawPcm: false,
    useGrammar: true,
    chunkBytes: 4_000,
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

    if (arg === "--model") {
      options.modelPath = next();
      continue;
    }

    if (arg === "--lib") {
      options.libraryPath = next();
      continue;
    }

    if (arg === "--sample-rate") {
      options.sampleRate = Number(next());
      continue;
    }

    if (arg === "--raw-pcm") {
      options.rawPcm = true;
      continue;
    }

    if (arg === "--no-grammar") {
      options.useGrammar = false;
      continue;
    }

    if (arg === "--chunk-bytes") {
      options.chunkBytes = Number(next());
      continue;
    }

    if (arg === "--log-level") {
      options.logLevel = Number(next());
      continue;
    }

    if (!arg.startsWith("-") && !options.filePath) {
      options.filePath = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.filePath) {
    printHelp();
    process.exit(1);
  }

  const sampleRate = Number(options.sampleRate);
  const chunkBytes = Number(options.chunkBytes);
  const logLevel = Number(options.logLevel);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Sample rate must be a positive number");
  }

  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("Chunk size must be a positive integer");
  }

  if (!Number.isInteger(logLevel)) {
    throw new Error("Vosk log level must be an integer");
  }

  options.sampleRate = sampleRate;
  options.chunkBytes = chunkBytes;
  options.logLevel = logLevel;

  return options as CliOptions;
}

function printHelp(): void {
  console.log(`Usage:
  bun run recognize <audio.wav> [--model ./models/ru] [--lib ./lib/libvosk.dylib]
  bun run recognize <audio.pcm> --raw-pcm --sample-rate 16000

Environment:
  VOSK_MODEL         Russian model directory. Default: ./models/ru.
  VOSK_LIB           Path to libvosk.dylib, libvosk.so, or libvosk.dll.
  VOSK_SAMPLE_RATE   Sample rate for raw PCM input. Default: 16000.
  VOSK_LOG_LEVEL     Vosk log level. Default: -1.

Options:
  --model PATH       Russian model directory. Default: ./models/ru.
  --lib PATH         Shared library path. Default: ./lib/libvosk.<platform suffix>, then system path.
  --raw-pcm          Treat input as headerless 16-bit mono PCM.
  --sample-rate N    Input sample rate for raw PCM.
  --no-grammar       Use the full model vocabulary instead of command phrase grammar.
  --chunk-bytes N    PCM bytes per Vosk call. Default: 4000.
  --log-level N      Vosk log level. Default: -1.`);
}
