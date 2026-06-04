import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { Subprocess } from "bun";
import {
  createCommandRouter,
  defaultVoiceCommands,
  type CommandMatch,
} from "../commands";
import {
  commandGrammar,
  defaultVoskLibraryPath,
  defaultVoskModelPath,
  loadVosk,
  openVoskModel,
  type RecognitionChunk,
  type VoskRecognizer,
} from "../vosk";

type WsData = {
  id: string;
  active: boolean;
  bytes: number;
  chunks: number;
  lastPartial: string;
  recognizer?: VoskRecognizer;
  sampleRate: number;
  startedAt?: number;
};

type StartRecognizerOptions = {
  sampleRate: number;
  useGrammar: boolean;
  grammar?: string[];
  words?: boolean;
};

type VoiceSocket = Bun.ServerWebSocket<WsData>;
type TunnelStatus = "disabled" | "starting" | "connected" | "external" | "disconnected" | "error";

type AsrTunnelConfig = {
  enabled: boolean;
  sshHost: string;
  localBind: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  healthUrl: string;
  checkIntervalMs: number;
  checkTimeoutMs: number;
  reconnectDelayMs: number;
  maxFailures: number;
  startupGraceMs: number;
  serverAliveInterval: number;
  serverAliveCountMax: number;
  connectTimeout: number;
};

type AsrTunnelInfo = {
  enabled: boolean;
  status: TunnelStatus;
  local: string;
  remote: string;
  healthUrl: string;
  sshHost: string;
  pid: number | null;
  restarts: number;
  failures: number;
  lastOkAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
};

type TtsConfig = {
  enabled: boolean;
  sshHost: string;
  remoteUrl: string;
  python: string;
  remoteWorkDir: string;
  seed: number;
  nfeSteps: number;
  speed: number;
  crossFadeDuration: number;
  removeSilence: boolean;
};

type TtsRequestOptions = {
  seed: number;
  nfeSteps: number;
  speed: number;
  crossFadeDuration: number;
  removeSilence: boolean;
};

type ProsodySegment =
  | {
      kind: "speech";
      text: string;
      speed: number;
    }
  | {
      kind: "pause";
      ms: number;
    };

type WhisperSessionFileName =
  | "audio.wav"
  | "transcript.txt"
  | "meta.json"
  | "reference.wav"
  | "reference.txt"
  | "tts.wav"
  | "tts.txt"
  | "tts-meta.json";

type WhisperSessionSummary = {
  id: string;
  createdAt: string;
  transcript: string;
  durationMs: number | null;
  sampleRate: number | null;
  audioBytes: number | null;
  audioUrl: string;
  transcriptUrl: string;
  metaUrl: string;
  referenceUrl: string | null;
  referenceTextUrl: string | null;
  referenceText: string;
  referenceAudioBytes: number | null;
  ttsUrl: string | null;
  ttsTextUrl: string | null;
  ttsText: string;
  ttsAudioBytes: number | null;
  ttsCreatedAt: string | null;
};

const HOST = Bun.env.HOST ?? "127.0.0.1";
const PORT = numberFromEnv("PORT", 4765);
const DEFAULT_SAMPLE_RATE = numberFromEnv("VOICE_SAMPLE_RATE", 16_000);
const LOG_LEVEL = numberFromEnv("VOSK_LOG_LEVEL", -1);
const USE_GRAMMAR = Bun.env.VOICE_GRAMMAR !== "0";
const ASR_TUNNEL_CONFIG = readAsrTunnelConfig();
const TTS_CONFIG = readTtsConfig();
const WEB_ROOT = import.meta.dir;
const WHISPER_RECORDINGS_ROOT = resolve(WEB_ROOT, "../../recordings/whisper");
const MAX_WHISPER_AUDIO_BYTES = positiveNumberFromEnv("VOICE_WHISPER_MAX_AUDIO_BYTES", 80 * 1024 * 1024);

const router = createCommandRouter(defaultVoiceCommands);
const grammar = USE_GRAMMAR ? commandGrammar(router.recognitionPhrases) : undefined;
const libraryPath = defaultVoskLibraryPath();
const modelPath = defaultVoskModelPath();
const library = loadVosk(libraryPath);
library.symbols.vosk_set_log_level(LOG_LEVEL);
const model = openVoskModel(modelPath, library);
const sockets = new Set<VoiceSocket>();
let asrTunnel: AsrTunnelSupervisor | null = null;

const server = Bun.serve<WsData>({
  hostname: HOST,
  port: PORT,
  fetch(req, srv) {
    return handleRequest(req, srv);
  },
  websocket: {
    idleTimeout: 0,
    sendPings: true,
    open(ws) {
      sockets.add(ws);
      send(ws, {
        type: "ready",
        id: ws.data.id,
        config: serviceConfig(),
      });
      console.log(`[voice] ws open id=${ws.data.id}`);
    },
    message(ws, raw) {
      void handleWsMessage(ws, raw);
    },
    close(ws, code, reason) {
      void closeRecognizer(ws, false, false);
      sockets.delete(ws);
      console.log(`[voice] ws close id=${ws.data.id} code=${code} reason="${reason}"`);
    },
  },
});

console.log(`[voice] playground -> http://${server.hostname}:${server.port}`);
console.log(`[voice] model=${modelPath}`);
console.log(`[voice] lib=${libraryPath}`);

process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));

async function handleRequest(
  req: Request,
  srv: Bun.Server<WsData>,
): Promise<Response | undefined> {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    const upgraded = srv.upgrade(req, {
      data: {
        id: crypto.randomUUID(),
        active: false,
        bytes: 0,
        chunks: 0,
        lastPartial: "",
        sampleRate: DEFAULT_SAMPLE_RATE,
      },
    });
    return upgraded ? undefined : text("WebSocket upgrade failed", 426);
  }

  if (url.pathname === "/health") {
    return json({ ok: true, service: "@metafor/voice", sockets: sockets.size, asrTunnel: asrTunnelInfo() });
  }

  if (url.pathname === "/api/info") {
    return json({ ok: true, ...serviceConfig() });
  }

  if (url.pathname === "/api/match" && req.method === "POST") {
    return matchCommand(req);
  }

  if (url.pathname === "/api/whisper/sessions" && req.method === "GET") {
    return listWhisperSessions();
  }

  if (url.pathname === "/api/whisper/sessions" && req.method === "POST") {
    return saveWhisperSession(req);
  }

  const whisperSession = matchWhisperSession(url.pathname);
  if (whisperSession && req.method === "DELETE") {
    return deleteWhisperSession(whisperSession.sessionId);
  }

  const whisperReference = matchWhisperSessionAction(url.pathname, "reference");
  if (whisperReference && req.method === "POST") {
    return prepareWhisperReference(req, whisperReference.sessionId);
  }

  const whisperTts = matchWhisperSessionAction(url.pathname, "tts");
  if (whisperTts && req.method === "POST") {
    return generateWhisperTts(req, whisperTts.sessionId);
  }

  const whisperSessionFile = matchWhisperSessionFile(url.pathname);
  if (whisperSessionFile) {
    return serveWhisperSessionFile(whisperSessionFile.sessionId, whisperSessionFile.fileName);
  }

  if (url.pathname === "/" || url.pathname === "/playground") {
    return serveStatic("index.html");
  }

  if (url.pathname === "/whisper" || url.pathname === "/whisper/") {
    return serveStatic("whisper.html");
  }

  if (url.pathname === "/styles.css") return serveStatic("styles.css");
  if (url.pathname === "/app.js") return serveStatic("app.js");
  if (url.pathname === "/whisper.js") return serveStatic("whisper.js");

  return text("Not found", 404);
}

async function matchCommand(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    const match = router.match(text);
    return json({ ok: true, match: match ? serializeMatch(match) : null });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}

async function listWhisperSessions(): Promise<Response> {
  try {
    await mkdir(WHISPER_RECORDINGS_ROOT, { recursive: true });
    const entries = await readdir(WHISPER_RECORDINGS_ROOT, { withFileTypes: true });
    const sessions = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory() && isSafePathSegment(entry.name))
          .map((entry) => readWhisperSession(entry.name)),
      )
    ).filter((session): session is WhisperSessionSummary => session !== null);

    sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return json({ ok: true, root: WHISPER_RECORDINGS_ROOT, sessions });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

async function saveWhisperSession(req: Request): Promise<Response> {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return json({ ok: false, error: "audio_required" }, 400);
    }
    if (audio.size <= 0) {
      return json({ ok: false, error: "audio_empty" }, 400);
    }
    if (audio.size > MAX_WHISPER_AUDIO_BYTES) {
      return json({ ok: false, error: "audio_too_large", maxBytes: MAX_WHISPER_AUDIO_BYTES }, 413);
    }

    const transcript = formText(form.get("transcript")).trim();
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
    const dir = join(WHISPER_RECORDINGS_ROOT, id);
    const messages = parseJsonFormValue(form.get("messages"), []);
    const segments = parseJsonFormValue(form.get("segments"), []);
    const meta = parseJsonFormValue(form.get("meta"), {});
    const metaRecord = isPlainRecord(meta) ? meta : {};
    const durationMs = finiteNumberFromUnknown(metaRecord.durationMs);
    const sampleRate = finiteNumberFromUnknown(metaRecord.sampleRate);

    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, "audio.wav"), audio);
    await Bun.write(join(dir, "transcript.txt"), transcript);
    await Bun.write(
      join(dir, "meta.json"),
      JSON.stringify(
        {
          ...metaRecord,
          id,
          createdAt,
          transcriptBytes: new TextEncoder().encode(transcript).byteLength,
          messages,
          segments,
          durationMs,
          sampleRate,
          audio: {
            file: "audio.wav",
            originalName: audio.name,
            type: audio.type || "audio/wav",
            bytes: audio.size,
          },
        },
        null,
        2,
      ),
    );

    const session = await readWhisperSession(id);
    return json({ ok: true, session });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}

async function deleteWhisperSession(sessionId: string): Promise<Response> {
  try {
    if (!isSafePathSegment(sessionId)) {
      return json({ ok: false, error: "invalid_session" }, 400);
    }
    const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
    await rm(dir, { recursive: true, force: true });
    return json({ ok: true, id: sessionId });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}

async function prepareWhisperReference(req: Request, sessionId: string): Promise<Response> {
  try {
    const body = await parseJsonRequest(req);
    const referenceText = typeof body.referenceText === "string" ? body.referenceText : undefined;
    const session = await writeWhisperReference(sessionId, referenceText);
    return json({ ok: true, session });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}

async function generateWhisperTts(req: Request, sessionId: string): Promise<Response> {
  try {
    if (!TTS_CONFIG.enabled) {
      return json({ ok: false, error: "tts_disabled" }, 503);
    }

    const body = await parseJsonRequest(req);
    const ttsText = typeof body.text === "string" ? body.text.trim() : "";
    const referenceText = typeof body.referenceText === "string" ? cleanupOneLine(body.referenceText) : "";
    if (!ttsText) {
      return json({ ok: false, error: "text_required" }, 400);
    }
    const ttsOptions = ttsRequestOptions(body);
    const segments = parseProsodyText(ttsText, ttsOptions.speed);

    const paths = await ensureWhisperReference(sessionId);
    if (referenceText) {
      await Bun.write(paths.referenceTextPath, referenceText);
    }
    const ttsInputPath = join(paths.dir, "tts-request.txt");
    const ttsSegmentsPath = join(paths.dir, "tts-segments.json");
    await Bun.write(ttsInputPath, ttsText);
    await Bun.write(ttsSegmentsPath, JSON.stringify({ segments }, null, 2));

    const remoteId = `${sessionId}-${Date.now()}`;
    const remoteDir = `${TTS_CONFIG.remoteWorkDir.replace(/\/+$/, "")}/${remoteId}`;
    const remoteTarget = `${TTS_CONFIG.sshHost}:${remoteDir}/`;
    const localTtsPath = join(paths.dir, "tts.wav");
    const localRunnerPath = join(paths.dir, "tts-runner.py");
    const createdAt = new Date().toISOString();
    await Bun.write(localRunnerPath, remoteTtsScript(remoteDir, TTS_CONFIG, ttsOptions));

    await runCommand(["ssh", TTS_CONFIG.sshHost, "mkdir", "-p", remoteDir], "tts remote mkdir");
    await runCommand(
      [
        "scp",
        paths.referenceAudioPath,
        paths.referenceTextPath,
        ttsInputPath,
        ttsSegmentsPath,
        localRunnerPath,
        remoteTarget,
      ],
      "tts upload",
    );
    await runCommand(
      [
        "ssh",
        TTS_CONFIG.sshHost,
        TTS_CONFIG.python,
        `${remoteDir}/tts-runner.py`,
      ],
      "tts generate",
    );
    await runCommand(["scp", `${TTS_CONFIG.sshHost}:${remoteDir}/tts.wav`, localTtsPath], "tts download");

    const audioFile = Bun.file(localTtsPath);
    await Bun.write(join(paths.dir, "tts.txt"), ttsText);
    await Bun.write(
      join(paths.dir, "tts-meta.json"),
      JSON.stringify(
        {
          createdAt,
          text: ttsText,
          audio: {
            file: "tts.wav",
            bytes: audioFile.size,
          },
          reference: {
            file: "reference.wav",
            textFile: "reference.txt",
            text: referenceText || cleanupOneLine(await readTextFile(paths.referenceTextPath)),
          },
          segments,
          tts: {
            sshHost: TTS_CONFIG.sshHost,
            remoteUrl: TTS_CONFIG.remoteUrl,
            seed: ttsOptions.seed,
            nfeSteps: ttsOptions.nfeSteps,
            speed: ttsOptions.speed,
            crossFadeDuration: ttsOptions.crossFadeDuration,
            removeSilence: ttsOptions.removeSilence,
          },
        },
        null,
        2,
      ),
    );

    const session = await readWhisperSession(sessionId);
    return json({ ok: true, session });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}

async function handleWsMessage(ws: VoiceSocket, raw: string | Buffer): Promise<void> {
  if (typeof raw === "string") {
    handleControl(ws, raw);
    return;
  }

  const pcm = toUint8Array(raw);
  if (!pcm?.byteLength) return;

  if (!ws.data.recognizer) {
    await startRecognizer(ws, { sampleRate: DEFAULT_SAMPLE_RATE, useGrammar: USE_GRAMMAR });
  }

  const recognizer = ws.data.recognizer;
  if (!recognizer) return;

  try {
    ws.data.bytes += pcm.byteLength;
    ws.data.chunks += 1;
    const chunk = recognizer.acceptPcm(pcm);
    await emitRecognition(ws, chunk);
  } catch (error) {
    sendError(ws, error);
  }
}

function handleControl(ws: VoiceSocket, raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(ws, { type: "error", error: "invalid_json" });
    return;
  }

  if (msg.type === "start") {
    const customGrammar = normalizeGrammar(msg.grammar);
    void startRecognizer(ws, {
      sampleRate: normalizeSampleRate(msg.sampleRate),
      useGrammar: msg.useGrammar !== false,
      ...(customGrammar ? { grammar: customGrammar } : {}),
      words: msg.words === true,
    });
    return;
  }

  if (msg.type === "stop") {
    void closeRecognizer(ws, true);
    return;
  }

  if (msg.type === "reset") {
    ws.data.recognizer?.reset();
    ws.data.lastPartial = "";
    send(ws, { type: "reset" });
    return;
  }

  if (msg.type === "ping") {
    send(ws, { type: "pong", t: Date.now() });
    return;
  }

  send(ws, { type: "error", error: "unknown_message" });
}

async function startRecognizer(
  ws: VoiceSocket,
  options: StartRecognizerOptions,
): Promise<void> {
  await closeRecognizer(ws, false);
  ws.data.sampleRate = options.sampleRate;
  ws.data.bytes = 0;
  ws.data.chunks = 0;
  ws.data.lastPartial = "";
  ws.data.startedAt = Date.now();
  ws.data.active = true;
  ws.data.recognizer = model.createRecognizer({
    sampleRate: options.sampleRate,
    grammar: options.grammar ?? (options.useGrammar ? grammar : undefined),
    words: options.words,
  });

  send(ws, {
    type: "started",
    sampleRate: options.sampleRate,
    grammar: !!(options.grammar ?? (options.useGrammar ? grammar : undefined)),
  });
}

async function closeRecognizer(
  ws: VoiceSocket,
  emitFinal: boolean,
  notify = true,
): Promise<void> {
  const recognizer = ws.data.recognizer;
  if (!recognizer) return;

  if (emitFinal) {
    try {
      const final = recognizer.finalResult();
      await emitRecognition(ws, final);
    } catch (error) {
      sendError(ws, error);
    }
  }

  recognizer.close();
  ws.data.recognizer = undefined;
  ws.data.active = false;
  if (notify) {
    send(ws, {
      type: "stopped",
      bytes: ws.data.bytes,
      chunks: ws.data.chunks,
      durationMs: ws.data.startedAt ? Date.now() - ws.data.startedAt : 0,
    });
  }
}

async function emitRecognition(ws: VoiceSocket, chunk: RecognitionChunk): Promise<void> {
  if (chunk.kind === "partial") {
    if (chunk.text === ws.data.lastPartial) return;
    ws.data.lastPartial = chunk.text;
    send(ws, {
      type: "partial",
      text: chunk.text,
      json: chunk.json,
    });
    return;
  }

  ws.data.lastPartial = "";
  send(ws, {
    type: chunk.kind,
    text: chunk.text,
    json: chunk.json,
  });

  if (!chunk.text) return;

  const match = await router.dispatch(chunk.text);
  if (!match) return;

  send(ws, {
    type: "command",
    match: serializeMatch(match),
  });
}

function serializeMatch(match: CommandMatch) {
  return {
    id: match.command.id,
    phrase: match.phrase,
    kind: match.kind,
    distance: match.distance,
    normalizedText: match.normalizedText,
    normalizedPhrase: match.normalizedPhrase,
  };
}

function serviceConfig() {
  return {
    modelPath,
    libraryPath,
    defaultSampleRate: DEFAULT_SAMPLE_RATE,
    grammar: USE_GRAMMAR,
    phrases: router.recognitionPhrases,
    asrTunnel: asrTunnelInfo(),
    remoteAsrUrl: `ws://${ASR_TUNNEL_CONFIG.localBind}:${ASR_TUNNEL_CONFIG.localPort}/ws`,
    whisperRecordingsRoot: WHISPER_RECORDINGS_ROOT,
    tts: {
      enabled: TTS_CONFIG.enabled,
      sshHost: TTS_CONFIG.sshHost,
      remoteUrl: TTS_CONFIG.remoteUrl,
      seed: TTS_CONFIG.seed,
      nfeSteps: TTS_CONFIG.nfeSteps,
      speed: TTS_CONFIG.speed,
      crossFadeDuration: TTS_CONFIG.crossFadeDuration,
      removeSilence: TTS_CONFIG.removeSilence,
    },
  };
}

function serveStatic(fileName: string): Response {
  const path = resolve(WEB_ROOT, fileName);
  if (!path.startsWith(WEB_ROOT) || !existsSync(path)) return text("Not found", 404);
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": contentTypeFor(path),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function contentTypeFor(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function matchWhisperSessionAction(
  pathname: string,
  action: "reference" | "tts",
): { sessionId: string } | null {
  const match = new RegExp(`^/api/whisper/sessions/([^/]+)/${action}$`).exec(pathname);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? "");
  return isSafePathSegment(sessionId) ? { sessionId } : null;
}

function matchWhisperSession(pathname: string): { sessionId: string } | null {
  const match = /^\/api\/whisper\/sessions\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? "");
  return isSafePathSegment(sessionId) ? { sessionId } : null;
}

function matchWhisperSessionFile(
  pathname: string,
): { sessionId: string; fileName: WhisperSessionFileName } | null {
  const match =
    /^\/api\/whisper\/sessions\/([^/]+)\/(audio\.wav|transcript\.txt|meta\.json|reference\.wav|reference\.txt|tts\.wav|tts\.txt|tts-meta\.json)$/.exec(
      pathname,
    );
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? "");
  const fileName = match[2] as WhisperSessionFileName | undefined;
  if (!fileName || !isSafePathSegment(sessionId)) return null;
  return { sessionId, fileName };
}

async function serveWhisperSessionFile(
  sessionId: string,
  fileName: WhisperSessionFileName,
): Promise<Response> {
  if (!isSafePathSegment(sessionId)) return text("Not found", 404);
  const path = join(WHISPER_RECORDINGS_ROOT, sessionId, fileName);
  if (!existsSync(path)) return text("Not found", 404);

  const contentType =
    fileName.endsWith(".wav")
      ? "audio/wav"
      : fileName.endsWith(".txt")
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8";

  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function readWhisperSession(id: string): Promise<WhisperSessionSummary | null> {
  if (!isSafePathSegment(id)) return null;

  const dir = join(WHISPER_RECORDINGS_ROOT, id);
  const [meta, transcript, referenceText, ttsText, ttsMeta] = await Promise.all([
    readJson(join(dir, "meta.json")),
    readTextFile(join(dir, "transcript.txt")),
    readTextFile(join(dir, "reference.txt")),
    readTextFile(join(dir, "tts.txt")),
    readJson(join(dir, "tts-meta.json")),
  ]);
  if (!existsSync(join(dir, "audio.wav")) && !transcript && meta === null) return null;

  const metaRecord = isPlainRecord(meta) ? meta : {};
  const audioRecord = isPlainRecord(metaRecord.audio) ? metaRecord.audio : {};
  const referenceRecord = isPlainRecord(metaRecord.reference) ? metaRecord.reference : {};
  const ttsMetaRecord = isPlainRecord(ttsMeta) ? ttsMeta : {};
  const ttsAudioRecord = isPlainRecord(ttsMetaRecord.audio) ? ttsMetaRecord.audio : {};
  const createdAt = typeof metaRecord.createdAt === "string" ? metaRecord.createdAt : id;
  const referenceExists = existsSync(join(dir, "reference.wav"));
  const ttsExists = existsSync(join(dir, "tts.wav"));

  return {
    id,
    createdAt,
    transcript,
    durationMs: finiteNumberFromUnknown(metaRecord.durationMs),
    sampleRate: finiteNumberFromUnknown(metaRecord.sampleRate),
    audioBytes: finiteNumberFromUnknown(audioRecord.bytes),
    audioUrl: `/api/whisper/sessions/${encodeURIComponent(id)}/audio.wav`,
    transcriptUrl: `/api/whisper/sessions/${encodeURIComponent(id)}/transcript.txt`,
    metaUrl: `/api/whisper/sessions/${encodeURIComponent(id)}/meta.json`,
    referenceUrl: referenceExists ? `/api/whisper/sessions/${encodeURIComponent(id)}/reference.wav` : null,
    referenceTextUrl: referenceText || referenceExists
      ? `/api/whisper/sessions/${encodeURIComponent(id)}/reference.txt`
      : null,
    referenceText,
    referenceAudioBytes: finiteNumberFromUnknown(referenceRecord.bytes),
    ttsUrl: ttsExists ? `/api/whisper/sessions/${encodeURIComponent(id)}/tts.wav` : null,
    ttsTextUrl: ttsText || ttsExists ? `/api/whisper/sessions/${encodeURIComponent(id)}/tts.txt` : null,
    ttsText,
    ttsAudioBytes: finiteNumberFromUnknown(ttsAudioRecord.bytes),
    ttsCreatedAt: typeof ttsMetaRecord.createdAt === "string" ? ttsMetaRecord.createdAt : null,
  };
}

async function ensureWhisperReference(sessionId: string): Promise<{
  dir: string;
  referenceAudioPath: string;
  referenceTextPath: string;
}> {
  if (!isSafePathSegment(sessionId)) throw new Error("invalid_session");
  const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
  const referenceAudioPath = join(dir, "reference.wav");
  const referenceTextPath = join(dir, "reference.txt");
  if (!existsSync(referenceAudioPath) || !existsSync(referenceTextPath)) {
    await writeWhisperReference(sessionId);
  }
  if (!existsSync(referenceAudioPath) || !existsSync(referenceTextPath)) {
    throw new Error("reference_not_ready");
  }
  return { dir, referenceAudioPath, referenceTextPath };
}

async function writeWhisperReference(
  sessionId: string,
  referenceTextOverride?: string,
): Promise<WhisperSessionSummary | null> {
  if (!isSafePathSegment(sessionId)) throw new Error("invalid_session");
  const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
  const audioPath = join(dir, "audio.wav");
  const referenceAudioPath = join(dir, "reference.wav");
  const referenceTextPath = join(dir, "reference.txt");
  if (!existsSync(audioPath)) throw new Error("audio_not_found");

  const requestedReferenceText = cleanupOneLine(referenceTextOverride ?? "");
  const transcript = requestedReferenceText || cleanupOneLine(await readTextFile(join(dir, "transcript.txt")));
  if (!transcript) throw new Error("transcript_required");

  const meta = await readJson(join(dir, "meta.json"));
  const metaRecord = isPlainRecord(meta) ? meta : {};
  const bounds = referenceBounds(metaRecord);
  const ffmpegArgs = [
    "ffmpeg",
    "-hide_banner",
    "-y",
    "-ss",
    bounds.start.toFixed(3),
    ...(bounds.end === null ? [] : ["-to", bounds.end.toFixed(3)]),
    "-i",
    audioPath,
    "-af",
    "highpass=f=70,lowpass=f=7800,loudnorm=I=-18:TP=-1.5:LRA=11",
    "-ar",
    "16000",
    "-ac",
    "1",
    referenceAudioPath,
  ];

  await runCommand(ffmpegArgs, "reference ffmpeg");
  const referenceFile = Bun.file(referenceAudioPath);
  const createdAt = new Date().toISOString();
  await Bun.write(referenceTextPath, transcript);
  await Bun.write(
    join(dir, "meta.json"),
    JSON.stringify(
      {
        ...metaRecord,
        reference: {
          file: "reference.wav",
          textFile: "reference.txt",
          createdAt,
          start: bounds.start,
          end: bounds.end,
          bytes: referenceFile.size,
        },
      },
      null,
      2,
    ),
  );

  return readWhisperSession(sessionId);
}

function referenceBounds(meta: Record<string, unknown>): { start: number; end: number | null } {
  const segments = Array.isArray(meta.segments) ? meta.segments : [];
  let start: number | null = null;
  let end: number | null = null;
  for (const segment of segments) {
    if (!isPlainRecord(segment)) continue;
    const segmentStart = finiteNumberFromUnknown(segment.start);
    const segmentEnd = finiteNumberFromUnknown(segment.end);
    if (segmentStart !== null) start = start === null ? segmentStart : Math.min(start, segmentStart);
    if (segmentEnd !== null) end = end === null ? segmentEnd : Math.max(end, segmentEnd);
  }

  if (start === null) start = 0;
  start = Math.max(0, start - 0.25);
  if (end === null || end <= start) return { start, end: null };

  end += 0.35;
  if (end - start > 12) end = start + 12;
  return { start, end };
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function readJson(path: string): Promise<unknown | null> {
  const text = await readTextFile(path);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function parseJsonFormValue(value: FormDataEntryValue | null, fallback: unknown): unknown {
  const text = formText(value);
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumberFromUnknown(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,140}$/.test(value);
}

function cleanupOneLine(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function ttsRequestOptions(body: Record<string, unknown>): TtsRequestOptions {
  return {
    seed: clampInteger(body.seed, 0, 2_147_483_647, TTS_CONFIG.seed),
    nfeSteps: clampNumber(body.nfeSteps, 4, 64, TTS_CONFIG.nfeSteps),
    speed: clampNumber(body.speed, 0.3, 2, TTS_CONFIG.speed),
    crossFadeDuration: clampNumber(body.crossFadeDuration, 0, 1, TTS_CONFIG.crossFadeDuration),
    removeSilence: typeof body.removeSilence === "boolean" ? body.removeSilence : TTS_CONFIG.removeSilence,
  };
}

function parseProsodyText(rawText: string, defaultSpeed: number): ProsodySegment[] {
  const source = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\n\s*\n+/g, " [[pause:650]] ")
    .replace(/\n+/g, " ");
  const marker = /\[\[\s*(pause|speed)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\]\]/gi;
  const segments: ProsodySegment[] = [];
  let currentSpeed = defaultSpeed;
  let lastIndex = 0;

  for (const match of source.matchAll(marker)) {
    const markerIndex = match.index ?? 0;
    pushSpeechSegment(segments, source.slice(lastIndex, markerIndex), currentSpeed);

    const kind = (match[1] ?? "").toLowerCase();
    const value = Number(match[2] ?? "");
    if (kind === "pause") {
      pushPauseSegment(segments, clampInteger(value, 0, 5_000, 650));
    } else if (kind === "speed") {
      currentSpeed = clampNumber(value, 0.3, 2, currentSpeed);
    }
    lastIndex = markerIndex + match[0].length;
  }

  pushSpeechSegment(segments, source.slice(lastIndex), currentSpeed);
  if (!segments.some((segment) => segment.kind === "speech")) {
    throw new Error("text_has_no_speech_segments");
  }
  return segments;
}

function pushSpeechSegment(segments: ProsodySegment[], text: string, speed: number): void {
  const cleaned = cleanupOneLine(text);
  if (!cleaned) return;
  const previous = segments.at(-1);
  if (previous?.kind === "speech" && previous.speed === speed) {
    previous.text = cleanupOneLine(`${previous.text} ${cleaned}`);
    return;
  }
  segments.push({ kind: "speech", text: cleaned, speed });
}

function pushPauseSegment(segments: ProsodySegment[], ms: number): void {
  if (ms <= 0) return;
  const previous = segments.at(-1);
  if (previous?.kind === "pause") {
    previous.ms = Math.min(5_000, previous.ms + ms);
    return;
  }
  segments.push({ kind: "pause", ms });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function parseJsonRequest(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return isPlainRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function remoteTtsScript(remoteDir: string, config: TtsConfig, options: TtsRequestOptions): string {
  return `
from pathlib import Path
from gradio_client import Client, handle_file
import json
import shutil
import subprocess

base = Path(${JSON.stringify(remoteDir)})
ref_audio = base / "reference.wav"
ref_text = (base / "reference.txt").read_text(encoding="utf-8").strip()
segments = json.loads((base / "tts-segments.json").read_text(encoding="utf-8"))["segments"]
parts_dir = base / "parts"
parts_dir.mkdir(exist_ok=True)
client = Client(${JSON.stringify(config.remoteUrl)})
part_paths = []
results = []

def normalize_audio(src, dst):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-y", "-i", str(src),
        "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(dst),
    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def silence(ms, dst):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-y", "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
        "-t", f"{ms / 1000:.3f}", "-acodec", "pcm_s16le", str(dst),
    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

for index, segment in enumerate(segments):
    kind = segment.get("kind")
    part = parts_dir / f"{index:03d}-{kind}.wav"
    if kind == "pause":
        silence(int(segment.get("ms", 650)), part)
        part_paths.append(part)
        continue

    if kind != "speech":
        continue
    result = client.predict(
        handle_file(str(ref_audio)),
        ref_text,
        str(segment.get("text", "")).strip(),
        ${pythonBoolean(options.removeSilence)},
        False,
        ${JSON.stringify(options.seed)},
        ${JSON.stringify(options.crossFadeDuration)},
        ${JSON.stringify(options.nfeSteps)},
        float(segment.get("speed", ${JSON.stringify(options.speed)})),
        api_name="/basic_tts",
    )
    audio = result[0] if isinstance(result, (list, tuple)) else result
    if isinstance(audio, dict):
        audio_path = audio.get("path") or audio.get("name")
    else:
        audio_path = audio
    if not audio_path:
        raise RuntimeError("no_audio_output")
    normalize_audio(audio_path, part)
    part_paths.append(part)
    results.append({"segment": segment, "result": result})

if not part_paths:
    raise RuntimeError("no_audio_parts")

out = base / "tts.wav"
if len(part_paths) == 1:
    shutil.copy(part_paths[0], out)
else:
    concat_file = base / "concat.txt"
    concat_file.write_text("\\n".join(f"file '{path}'" for path in part_paths), encoding="utf-8")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_file), "-c", "copy", str(out),
    ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

(base / "result.json").write_text(
    json.dumps({"segments": segments, "results": results}, ensure_ascii=False, default=str),
    encoding="utf-8",
)
print(json.dumps({"ok": True, "audio": str(out)}, ensure_ascii=False))
`;
}

function pythonBoolean(value: boolean): string {
  return value ? "True" : "False";
}

async function runCommand(args: string[], label: string): Promise<{ stdout: string; stderr: string }> {
  const process = Bun.spawn(args, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    readStream(process.stdout),
    readStream(process.stderr),
    process.exited,
  ]);
  if (code !== 0) {
    const detail = (stderr || stdout || "no output").trim();
    throw new Error(`${label} failed (${code}): ${detail}`.slice(0, 1400));
  }
  return { stdout, stderr };
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (stream === null) return "";
  return await new Response(stream).text();
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return null;
}

function normalizeSampleRate(value: unknown): number {
  const sampleRate = Number(value ?? DEFAULT_SAMPLE_RATE);
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 96_000) {
    return DEFAULT_SAMPLE_RATE;
  }
  return Math.round(sampleRate);
}

function normalizeGrammar(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const phrases = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  if (phrases.length === 0) return undefined;
  return [...new Set([...phrases, "[unk]"])];
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(Bun.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function positiveNumberFromEnv(name: string, fallback: number): number {
  const value = numberFromEnv(name, fallback);
  return value > 0 ? value : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = Bun.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

function readAsrTunnelConfig(): AsrTunnelConfig {
  const localBind = Bun.env.VOICE_ASR_TUNNEL_LOCAL_BIND ?? "127.0.0.1";
  const localPort = positiveNumberFromEnv("VOICE_ASR_TUNNEL_LOCAL_PORT", 8877);
  const remoteHost = Bun.env.VOICE_ASR_TUNNEL_REMOTE_HOST ?? "127.0.0.1";
  const remotePort = positiveNumberFromEnv("VOICE_ASR_TUNNEL_REMOTE_PORT", 8787);
  return {
    enabled: booleanFromEnv("VOICE_ASR_TUNNEL", true),
    sshHost: Bun.env.VOICE_ASR_TUNNEL_SSH_HOST ?? "ai-srv",
    localBind,
    localPort,
    remoteHost,
    remotePort,
    healthUrl: Bun.env.VOICE_ASR_TUNNEL_HEALTH_URL ?? `http://${localBind}:${localPort}/health`,
    checkIntervalMs: positiveNumberFromEnv("VOICE_ASR_TUNNEL_CHECK_INTERVAL_MS", 5_000),
    checkTimeoutMs: positiveNumberFromEnv("VOICE_ASR_TUNNEL_CHECK_TIMEOUT_MS", 1_500),
    reconnectDelayMs: positiveNumberFromEnv("VOICE_ASR_TUNNEL_RECONNECT_DELAY_MS", 2_000),
    maxFailures: positiveNumberFromEnv("VOICE_ASR_TUNNEL_MAX_FAILURES", 2),
    startupGraceMs: positiveNumberFromEnv("VOICE_ASR_TUNNEL_STARTUP_GRACE_MS", 12_000),
    serverAliveInterval: positiveNumberFromEnv("VOICE_ASR_TUNNEL_SERVER_ALIVE_INTERVAL", 15),
    serverAliveCountMax: positiveNumberFromEnv("VOICE_ASR_TUNNEL_SERVER_ALIVE_COUNT_MAX", 2),
    connectTimeout: positiveNumberFromEnv("VOICE_ASR_TUNNEL_CONNECT_TIMEOUT", 8),
  };
}

function readTtsConfig(): TtsConfig {
  return {
    enabled: booleanFromEnv("VOICE_TTS", true),
    sshHost: Bun.env.VOICE_TTS_SSH_HOST ?? "ai-srv",
    remoteUrl: Bun.env.VOICE_TTS_REMOTE_URL ?? "http://127.0.0.1:7860/",
    python: Bun.env.VOICE_TTS_REMOTE_PYTHON ?? "/home/zavx0z/apps/f5-tts-misha/.venv/bin/python",
    remoteWorkDir: Bun.env.VOICE_TTS_REMOTE_WORKDIR ?? "/tmp/metafor-voice-tts",
    seed: Math.round(numberFromEnv("VOICE_TTS_SEED", 42)),
    nfeSteps: positiveNumberFromEnv("VOICE_TTS_NFE_STEPS", 32),
    speed: positiveNumberFromEnv("VOICE_TTS_SPEED", 1),
    crossFadeDuration: positiveNumberFromEnv("VOICE_TTS_CROSS_FADE", 0.15),
    removeSilence: booleanFromEnv("VOICE_TTS_REMOVE_SILENCE", true),
  };
}

function asrTunnelInfo(): AsrTunnelInfo {
  return asrTunnel?.info() ?? {
    enabled: ASR_TUNNEL_CONFIG.enabled,
    status: ASR_TUNNEL_CONFIG.enabled ? "disconnected" : "disabled",
    local: `${ASR_TUNNEL_CONFIG.localBind}:${ASR_TUNNEL_CONFIG.localPort}`,
    remote: `${ASR_TUNNEL_CONFIG.remoteHost}:${ASR_TUNNEL_CONFIG.remotePort}`,
    healthUrl: ASR_TUNNEL_CONFIG.healthUrl,
    sshHost: ASR_TUNNEL_CONFIG.sshHost,
    pid: null,
    restarts: 0,
    failures: 0,
    lastOkAt: null,
    lastCheckAt: null,
    lastError: null,
  };
}

class AsrTunnelSupervisor {
  #status: TunnelStatus;
  #process: Subprocess<"ignore", "ignore", "pipe"> | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopping = false;
  #restarts = 0;
  #failures = 0;
  #lastOkAt: Date | null = null;
  #lastCheckAt: Date | null = null;
  #lastError: string | null = null;
  #startedAtMs = 0;

  constructor(readonly config: AsrTunnelConfig) {
    this.#status = config.enabled ? "disconnected" : "disabled";
  }

  start(): void {
    if (!this.config.enabled || this.#stopping) return;
    this.#scheduleCheck(0);
  }

  stop(): void {
    this.#stopping = true;
    this.#clearTimer();
    this.#stopProcess("server shutdown");
    this.#status = this.config.enabled ? "disconnected" : "disabled";
  }

  info(): AsrTunnelInfo {
    return {
      enabled: this.config.enabled,
      status: this.#status,
      local: `${this.config.localBind}:${this.config.localPort}`,
      remote: `${this.config.remoteHost}:${this.config.remotePort}`,
      healthUrl: this.config.healthUrl,
      sshHost: this.config.sshHost,
      pid: this.#process?.pid ?? null,
      restarts: this.#restarts,
      failures: this.#failures,
      lastOkAt: this.#lastOkAt?.toISOString() ?? null,
      lastCheckAt: this.#lastCheckAt?.toISOString() ?? null,
      lastError: this.#lastError,
    };
  }

  #scheduleCheck(delayMs: number): void {
    if (this.#stopping || !this.config.enabled) return;
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#check();
    }, delayMs);
  }

  async #check(): Promise<void> {
    if (this.#stopping || !this.config.enabled) return;
    const result = await this.#healthCheck();
    if (result.ok) {
      this.#failures = 0;
      this.#lastError = null;
      this.#lastOkAt = new Date();
      this.#status = this.#process === null ? "external" : "connected";
      this.#startedAtMs = 0;
      this.#scheduleCheck(this.config.checkIntervalMs);
      return;
    }

    this.#lastError = result.error;
    if (this.#process === null) {
      this.#spawn();
      this.#scheduleCheck(this.config.reconnectDelayMs);
      return;
    }

    if (this.#status === "starting" && Date.now() - this.#startedAtMs < this.config.startupGraceMs) {
      this.#scheduleCheck(this.config.reconnectDelayMs);
      return;
    }

    this.#failures += 1;
    if (this.#failures >= this.config.maxFailures) {
      console.warn(`[voice] asr tunnel unhealthy after ${this.#failures} checks: ${result.error}`);
      this.#restart("health check failed");
      this.#scheduleCheck(this.config.reconnectDelayMs);
      return;
    }

    this.#scheduleCheck(this.config.checkIntervalMs);
  }

  async #healthCheck(): Promise<{ ok: true } | { ok: false; error: string }> {
    this.#lastCheckAt = new Date();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.checkTimeoutMs);
    try {
      const response = await fetch(this.config.healthUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.ok) return { ok: true };
      return { ok: false, error: `health ${response.status}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  #spawn(): void {
    if (this.#stopping || this.#process !== null) return;
    const args = [
      "-N",
      "-L",
      `${this.config.localBind}:${this.config.localPort}:${this.config.remoteHost}:${this.config.remotePort}`,
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      `ConnectTimeout=${this.config.connectTimeout}`,
      "-o",
      `ServerAliveInterval=${this.config.serverAliveInterval}`,
      "-o",
      `ServerAliveCountMax=${this.config.serverAliveCountMax}`,
      this.config.sshHost,
    ];
    this.#status = "starting";
    this.#restarts += 1;
    this.#failures = 0;
    this.#lastError = null;
    this.#startedAtMs = Date.now();
    console.log(`[voice] asr tunnel start: ssh ${args.join(" ")}`);

    try {
      const process = Bun.spawn(["ssh", ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
      }) as Subprocess<"ignore", "ignore", "pipe">;
      this.#process = process;
      this.#consumeStderr(process);
      void process.exited.then((code) => {
        if (this.#process !== process) return;
        this.#process = null;
        this.#startedAtMs = 0;
        if (this.#stopping) return;
        this.#status = "disconnected";
        this.#lastError = `ssh exited ${code}`;
        console.warn(`[voice] asr tunnel exited code=${code}`);
        this.#scheduleCheck(this.config.reconnectDelayMs);
      });
    } catch (error) {
      this.#process = null;
      this.#startedAtMs = 0;
      this.#status = "error";
      this.#lastError = error instanceof Error ? error.message : String(error);
      console.error(`[voice] asr tunnel spawn failed: ${this.#lastError}`);
      this.#scheduleCheck(this.config.reconnectDelayMs);
    }
  }

  #restart(reason: string): void {
    this.#stopProcess(reason);
    this.#spawn();
  }

  #stopProcess(reason: string): void {
    const process = this.#process;
    this.#process = null;
    this.#startedAtMs = 0;
    if (process === null) return;
    console.warn(`[voice] asr tunnel stop pid=${process.pid}: ${reason}`);
    try {
      process.kill("SIGTERM");
    } catch (error) {
      console.warn("[voice] asr tunnel kill failed", error);
    }
  }

  async #consumeStderr(process: Subprocess<"ignore", "ignore", "pipe">): Promise<void> {
    if (process.stderr === null) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of process.stderr) {
        const text = decoder.decode(chunk).trim();
        if (text) console.warn(`[voice] asr tunnel ssh: ${text}`);
      }
    } catch (error) {
      if (!this.#stopping) console.warn("[voice] asr tunnel stderr failed", error);
    }
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}

asrTunnel = new AsrTunnelSupervisor(ASR_TUNNEL_CONFIG);
asrTunnel.start();
console.log(`[voice] asr tunnel ${asrTunnel.info().enabled ? "enabled" : "disabled"} ${asrTunnel.info().local} -> ${asrTunnel.info().remote}`);

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function send(ws: VoiceSocket, payload: unknown): void {
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error("[voice] ws send failed", error);
  }
}

function sendError(ws: VoiceSocket, error: unknown): void {
  send(ws, {
    type: "error",
    error: error instanceof Error ? error.message : String(error),
  });
}

function shutdown(exitCode: number): void {
  asrTunnel?.stop();
  for (const ws of sockets) {
    void closeRecognizer(ws, false, false);
    ws.close(1001, "server shutdown");
  }

  model.close();
  library.close();
  process.exit(exitCode);
}
