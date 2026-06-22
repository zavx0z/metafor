import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
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

type TtsConfig = {
  enabled: boolean;
  sshHost: string;
  remoteUrl: string;
  remoteWorkdir: string;
  remotePython: string;
  seed: number;
  nfeSteps: number;
  speed: number;
  crossFadeDuration: number;
  removeSilence: boolean;
};

type AccentConfig = {
  enabled: boolean;
  sshHost: string;
  remotePython: string;
  workdir: string;
  modelSize: string;
  useDictionary: boolean;
  device: string;
};

type TtsOptions = {
  seed: number;
  nfeSteps: number;
  speed: number;
  crossFadeDuration: number;
  removeSilence: boolean;
};

type TtsReferencePrompt = {
  audioPath: string;
  textPath: string;
  text: string;
  seconds: number;
};

type TtsSegment =
  | {
      kind: "speech";
      text: string;
      speed: number;
    }
  | {
      kind: "pause";
      ms: number;
    };

type WhisperUser = {
  id: string;
  name: string;
  createdAt: string;
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
  userId: string;
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
  readyAt: string | null;
};

const HOST = Bun.env.HOST ?? "127.0.0.1";
const PORT = numberFromEnv("PORT", 4765);
const DEFAULT_SAMPLE_RATE = numberFromEnv("VOICE_SAMPLE_RATE", 16_000);
const LOG_LEVEL = numberFromEnv("VOSK_LOG_LEVEL", -1);
const USE_GRAMMAR = Bun.env.VOICE_GRAMMAR !== "0";
const TTS_CONFIG = readTtsConfig();
const ACCENT_CONFIG = readAccentConfig();
const ACCENT_OVERRIDES = new Map<string, number>([
  ["медленнее", 0],
]);
const DEFAULT_WHISPER_USER_ID = "default";
const DEFAULT_WHISPER_USER_NAME = "Основной";
const WEB_ROOT = import.meta.dir;
const WHISPER_RECORDINGS_ROOT = resolve(WEB_ROOT, "../../recordings/whisper");
const WHISPER_USERS_PATH = join(WHISPER_RECORDINGS_ROOT, "users.json");
const MAX_WHISPER_AUDIO_BYTES = positiveNumberFromEnv("VOICE_WHISPER_MAX_AUDIO_BYTES", 80 * 1024 * 1024);
const TTS_REFERENCE_PROMPT_SECONDS = positiveNumberFromEnv("VOICE_TTS_REFERENCE_PROMPT_SECONDS", 5);
const TTS_REFERENCE_PROMPT_MAX_SENTENCES = Math.round(
  positiveNumberFromEnv("VOICE_TTS_REFERENCE_PROMPT_MAX_SENTENCES", 3),
);
const TTS_REFERENCE_PROMPT_MAX_CHARS = Math.round(
  positiveNumberFromEnv("VOICE_TTS_REFERENCE_PROMPT_MAX_CHARS", 120),
);

const router = createCommandRouter(defaultVoiceCommands);
const grammar = USE_GRAMMAR ? commandGrammar(router.recognitionPhrases) : undefined;
const libraryPath = defaultVoskLibraryPath();
const modelPath = defaultVoskModelPath();
const library = loadVosk(libraryPath);
library.symbols.vosk_set_log_level(LOG_LEVEL);
const model = openVoskModel(modelPath, library);
const sockets = new Set<VoiceSocket>();

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
    return json({ ok: true, service: "@metafor/voice", sockets: sockets.size });
  }

  if (url.pathname === "/api/info") {
    return json({ ok: true, ...serviceConfig() });
  }

  if (url.pathname === "/api/match" && req.method === "POST") {
    return matchCommand(req);
  }

  if (url.pathname === "/api/whisper/users" && req.method === "GET") {
    return listWhisperUsers();
  }

  if (url.pathname === "/api/whisper/users" && req.method === "POST") {
    return createWhisperUser(req);
  }

  const whisperUser = matchWhisperUser(url.pathname);
  if (whisperUser && req.method === "DELETE") {
    return deleteWhisperUser(whisperUser.userId);
  }

  if (url.pathname === "/api/whisper/sessions" && req.method === "GET") {
    return listWhisperSessions();
  }

  if (url.pathname === "/api/whisper/sessions" && req.method === "POST") {
    return saveWhisperSession(req);
  }

  if (url.pathname === "/api/whisper/accent" && req.method === "POST") {
    return accentWhisperText(req);
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

  const whisperReady = matchWhisperSessionAction(url.pathname, "ready");
  if (whisperReady && req.method === "POST") {
    return markWhisperSessionReady(req, whisperReady.sessionId);
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

async function listWhisperUsers(): Promise<Response> {
  try {
    const users = await readWhisperUsers();
    return json({ ok: true, users });
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

async function createWhisperUser(req: Request): Promise<Response> {
  try {
    const body = await parseJsonRequest(req);
    const name = cleanupUserName(typeof body.name === "string" ? body.name : "");
    if (!name) return json({ ok: false, error: "user_name_required" }, 400);

    const users = await readWhisperUsers();
    const existing = users.find((user) => normalizeUserName(user.name) === normalizeUserName(name));
    if (existing) return json({ ok: true, user: existing, users });

    const user: WhisperUser = {
      id: uniqueWhisperUserId(name, users),
      name,
      createdAt: new Date().toISOString(),
    };
    const nextUsers = [...users, user];
    await writeWhisperUsers(nextUsers);
    return json({ ok: true, user, users: nextUsers });
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

async function deleteWhisperUser(userId: string): Promise<Response> {
  try {
    if (!isSafePathSegment(userId)) return json({ ok: false, error: "invalid_user" }, 400);
    if (userId === DEFAULT_WHISPER_USER_ID) return json({ ok: false, error: "default_user_required" }, 400);

    const users = await readWhisperUsers();
    const nextUsers = users.filter((user) => user.id !== userId);
    if (nextUsers.length === users.length) return json({ ok: false, error: "user_not_found" }, 404);

    const reassigned = await reassignWhisperSessionsUser(userId, DEFAULT_WHISPER_USER_ID);
    await writeWhisperUsers(nextUsers);
    return json({ ok: true, users: nextUsers, reassigned });
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
    if (!isSafePathSegment(sessionId)) return json({ ok: false, error: "invalid_session" }, 400);
    await rm(join(WHISPER_RECORDINGS_ROOT, sessionId), { recursive: true, force: true });
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
    if (!isSafePathSegment(sessionId)) return json({ ok: false, error: "invalid_session" }, 400);
    const body = await parseJsonRequest(req);
    const referenceText = typeof body.referenceText === "string" ? cleanupOneLine(body.referenceText) : "";
    const ready = typeof body.ready === "boolean" ? body.ready : undefined;
    const session = await writeWhisperReference(sessionId, referenceText, ready);
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

async function markWhisperSessionReady(req: Request, sessionId: string): Promise<Response> {
  try {
    if (!isSafePathSegment(sessionId)) return json({ ok: false, error: "invalid_session" }, 400);
    const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
    if (!existsSync(join(dir, "reference.wav"))) return json({ ok: false, error: "reference_required" }, 400);
    const referenceText = cleanupOneLine(await readTextFile(join(dir, "reference.txt")));
    if (!referenceText) return json({ ok: false, error: "reference_text_required" }, 400);

    const body = await parseJsonRequest(req);
    const userId = typeof body.userId === "string" && isSafePathSegment(body.userId)
      ? body.userId
      : DEFAULT_WHISPER_USER_ID;
    if (!(await whisperUserExists(userId))) return json({ ok: false, error: "user_not_found" }, 404);

    const meta = await readJson(join(dir, "meta.json"));
    const metaRecord = isPlainRecord(meta) ? meta : {};
    await Bun.write(
      join(dir, "meta.json"),
      JSON.stringify(
        {
          ...metaRecord,
          userId,
          ready: true,
          readyAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return json({ ok: true, session: await readWhisperSession(sessionId) });
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

async function accentWhisperText(req: Request): Promise<Response> {
  try {
    if (!ACCENT_CONFIG.enabled) return json({ ok: false, error: "accent_disabled" }, 503);

    const body = await parseJsonRequest(req);
    const text = normalizeTtsText(typeof body.text === "string" ? body.text : "");
    if (!text) return json({ ok: false, error: "accent_text_required" }, 400);

    const rawText = await runRemoteAccent(text);
    const projectedText = projectStressMarks(text, rawText);
    const accentedText = applyAccentOverrides(removeSingleSyllableStress(projectedText ?? rawText));

    return json({
      ok: true,
      text: accentedText,
      rawText,
      projected: projectedText !== null,
      accent: {
        sshHost: ACCENT_CONFIG.sshHost,
        modelSize: ACCENT_CONFIG.modelSize,
        useDictionary: ACCENT_CONFIG.useDictionary,
        device: ACCENT_CONFIG.device,
      },
    });
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
    accent: {
      enabled: ACCENT_CONFIG.enabled,
      sshHost: ACCENT_CONFIG.sshHost,
      modelSize: ACCENT_CONFIG.modelSize,
      useDictionary: ACCENT_CONFIG.useDictionary,
      device: ACCENT_CONFIG.device,
    },
    whisperRecordingsRoot: WHISPER_RECORDINGS_ROOT,
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

function matchWhisperSession(pathname: string): { sessionId: string } | null {
  const match = /^\/api\/whisper\/sessions\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? "");
  return isSafePathSegment(sessionId) ? { sessionId } : null;
}

function matchWhisperUser(pathname: string): { userId: string } | null {
  const match = /^\/api\/whisper\/users\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const userId = decodeURIComponent(match[1] ?? "");
  return isSafePathSegment(userId) ? { userId } : null;
}

function matchWhisperSessionAction(
  pathname: string,
  action: "reference" | "tts" | "ready",
): { sessionId: string } | null {
  const match = new RegExp(`^/api/whisper/sessions/([^/]+)/${action}$`).exec(pathname);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1] ?? "");
  return isSafePathSegment(sessionId) ? { sessionId } : null;
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
  const userId = typeof metaRecord.userId === "string" && isSafePathSegment(metaRecord.userId)
    ? metaRecord.userId
    : DEFAULT_WHISPER_USER_ID;
  const readyAt =
    metaRecord.ready === false
      ? null
      : typeof metaRecord.readyAt === "string"
        ? metaRecord.readyAt
        : referenceExists && referenceText && typeof referenceRecord.createdAt === "string"
          ? referenceRecord.createdAt
          : null;

  return {
    id,
    userId,
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
    readyAt,
  };
}

async function writeWhisperReference(
  sessionId: string,
  referenceTextOverride?: string,
  ready?: boolean,
): Promise<WhisperSessionSummary | null> {
  const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
  const audioPath = join(dir, "audio.wav");
  const referenceAudioPath = join(dir, "reference.wav");
  const referenceTextPath = join(dir, "reference.txt");
  if (!existsSync(audioPath)) throw new Error("audio_not_found");

  const referenceText = referenceTextOverride || cleanupOneLine(await readTextFile(join(dir, "transcript.txt")));
  if (!referenceText) throw new Error("reference_text_required");

  try {
    await runCommand([
      "ffmpeg",
      "-hide_banner",
      "-y",
      "-i",
      audioPath,
      "-af",
      "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=11",
      "-ar",
      "16000",
      "-ac",
      "1",
      referenceAudioPath,
    ]);
  } catch {
    await Bun.write(referenceAudioPath, Bun.file(audioPath));
  }

  const meta = await readJson(join(dir, "meta.json"));
  const metaRecord = isPlainRecord(meta) ? meta : {};
  const referenceFile = Bun.file(referenceAudioPath);
  const createdAt = new Date().toISOString();
  const nextMeta: Record<string, unknown> = {
    ...metaRecord,
    reference: {
      file: "reference.wav",
      textFile: "reference.txt",
      createdAt,
      bytes: referenceFile.size,
    },
  };
  if (ready === true) {
    nextMeta.readyAt = createdAt;
    nextMeta.ready = true;
  } else if (ready === false) {
    delete nextMeta.readyAt;
    nextMeta.ready = false;
  }
  await Bun.write(referenceTextPath, referenceText);
  await Bun.write(
    join(dir, "meta.json"),
    JSON.stringify(nextMeta, null, 2),
  );

  return readWhisperSession(sessionId);
}

async function generateWhisperTts(req: Request, sessionId: string): Promise<Response> {
  try {
    if (!TTS_CONFIG.enabled) return json({ ok: false, error: "tts_disabled" }, 503);
    if (!isSafePathSegment(sessionId)) return json({ ok: false, error: "invalid_session" }, 400);

    const body = await parseJsonRequest(req);
    const text = normalizeTtsText(typeof body.text === "string" ? body.text : "");
    if (!text) return json({ ok: false, error: "tts_text_required" }, 400);

    const session = await readWhisperSession(sessionId);
    if (!session) return json({ ok: false, error: "session_not_found" }, 404);

    const referenceText = cleanupOneLine(
      typeof body.referenceText === "string"
        ? body.referenceText
        : session.referenceText || session.transcript,
    );
    if (!referenceText) return json({ ok: false, error: "reference_text_required" }, 400);

    const options = ttsOptionsFromBody(body);
    const segments = parseTtsSegments(text, options.speed);
    if (!segments.some((segment) => segment.kind === "speech")) {
      return json({ ok: false, error: "tts_speech_required" }, 400);
    }

    const dir = join(WHISPER_RECORDINGS_ROOT, sessionId);
    const referenceAudioPath = join(dir, "reference.wav");
    if (!existsSync(referenceAudioPath)) {
      await writeWhisperReference(sessionId, referenceText);
    }
    const promptReference = await prepareTtsReferencePrompt(dir, referenceText);

    const createdAt = new Date().toISOString();
    const ttsTextPath = join(dir, "tts.txt");
    const ttsSegmentsPath = join(dir, "tts-segments.json");
    const ttsRunnerPath = join(dir, "tts-runner.py");
    const ttsAudioPath = join(dir, "tts.wav");
    const remoteDir = `${TTS_CONFIG.remoteWorkdir.replace(/\/+$/, "")}/${sessionId}-${Date.now()}`;

    await Bun.write(ttsTextPath, text);
    await Bun.write(ttsSegmentsPath, JSON.stringify({ segments }, null, 2));
    await Bun.write(ttsRunnerPath, remoteTtsRunnerScript(remoteDir, TTS_CONFIG, options));

    await runCommand(["ssh", TTS_CONFIG.sshHost, `mkdir -p ${shellQuote(remoteDir)}`]);
    await runCommand([
      "scp",
      promptReference.audioPath,
      promptReference.textPath,
      ttsTextPath,
      ttsSegmentsPath,
      ttsRunnerPath,
      `${TTS_CONFIG.sshHost}:${remoteDir}/`,
    ]);
    await runCommand([
      "ssh",
      TTS_CONFIG.sshHost,
      `cd ${shellQuote(remoteDir)} && ${shellQuote(TTS_CONFIG.remotePython)} ${shellQuote(`${remoteDir}/tts-runner.py`)}`,
    ]);
    await runCommand(["scp", `${TTS_CONFIG.sshHost}:${remoteDir}/tts.wav`, ttsAudioPath]);

    const ttsFile = Bun.file(ttsAudioPath);
    await Bun.write(
      join(dir, "tts-meta.json"),
      JSON.stringify(
        {
          createdAt,
          text,
          audio: {
            file: "tts.wav",
            bytes: ttsFile.size,
          },
          reference: {
            file: "reference.wav",
            textFile: "reference.txt",
            text: referenceText,
          },
          promptReference: {
            file: "tts-reference.wav",
            textFile: "tts-reference.txt",
            text: promptReference.text,
            seconds: promptReference.seconds,
          },
          segments,
          tts: {
            sshHost: TTS_CONFIG.sshHost,
            remoteUrl: TTS_CONFIG.remoteUrl,
            seed: options.seed,
            nfeSteps: options.nfeSteps,
            speed: options.speed,
            crossFadeDuration: options.crossFadeDuration,
            removeSilence: options.removeSilence,
          },
        },
        null,
        2,
      ),
    );

    const updated = await readWhisperSession(sessionId);
    return json({ ok: true, session: updated });
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

async function prepareTtsReferencePrompt(dir: string, referenceText: string): Promise<TtsReferencePrompt> {
  const sourceAudioPath = join(dir, "reference.wav");
  const audioPath = join(dir, "tts-reference.wav");
  const textPath = join(dir, "tts-reference.txt");
  const text = shortTtsReferenceText(referenceText);
  const seconds = Math.max(1, TTS_REFERENCE_PROMPT_SECONDS);

  await runCommand([
    "ffmpeg",
    "-hide_banner",
    "-y",
    "-i",
    sourceAudioPath,
    "-t",
    String(seconds),
    "-ar",
    "16000",
    "-ac",
    "1",
    audioPath,
  ]);
  await Bun.write(textPath, text);

  return {
    audioPath,
    textPath,
    text,
    seconds,
  };
}

function shortTtsReferenceText(referenceText: string): string {
  const source = cleanupOneLine(referenceText);
  if (!source) return "";

  const maxSentences = Math.max(1, TTS_REFERENCE_PROMPT_MAX_SENTENCES);
  const maxChars = Math.max(24, TTS_REFERENCE_PROMPT_MAX_CHARS);
  const selected: string[] = [];
  let length = 0;

  for (const sentence of splitSentences(source)) {
    const nextLength = length + (selected.length > 0 ? 1 : 0) + sentence.length;
    if (selected.length > 0 && nextLength > maxChars) break;
    selected.push(sentence);
    length = nextLength;
    if (selected.length >= maxSentences) break;
  }

  const result = cleanupOneLine(selected.join(" "));
  if (result) return result.length <= maxChars ? result : trimTextAtWord(result, maxChars);
  return trimTextAtWord(source, maxChars);
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!/[.!?…]/.test(char)) continue;

    const next = text[index + 1] ?? "";
    if (next && !/\s/.test(next)) continue;

    const sentence = text.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = index + 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function trimTextAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 24 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function ttsOptionsFromBody(body: Record<string, unknown>): TtsOptions {
  return {
    seed: Math.round(clampNumber(body.seed, 0, 2_147_483_647, TTS_CONFIG.seed)),
    nfeSteps: Math.round(clampNumber(body.nfeSteps, 4, 64, TTS_CONFIG.nfeSteps)),
    speed: clampNumber(body.speed, 0.3, 2, TTS_CONFIG.speed),
    crossFadeDuration: clampNumber(body.crossFadeDuration, 0, 1, TTS_CONFIG.crossFadeDuration),
    removeSilence:
      typeof body.removeSilence === "boolean" ? body.removeSilence : TTS_CONFIG.removeSilence,
  };
}

function parseTtsSegments(text: string, baseSpeed: number): TtsSegment[] {
  const segments: TtsSegment[] = [];
  const marker = /\[\[\s*(pause|speed)(?:\s*:\s*([0-9]+(?:[\.,][0-9]+)?))?\s*\]\]/gi;
  let cursor = 0;
  let speed = baseSpeed;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(text)) !== null) {
    pushTtsSpeechSegment(segments, text.slice(cursor, match.index), speed);
    const kind = match[1]?.toLowerCase();
    const value = parseMarkerNumber(match[2]);
    if (kind === "pause") {
      segments.push({ kind: "pause", ms: Math.round(clampNumber(value, 120, 10_000, 650)) });
    } else if (kind === "speed") {
      speed = clampNumber(value, 0.3, 2, baseSpeed);
    }
    cursor = marker.lastIndex;
  }

  pushTtsSpeechSegment(segments, text.slice(cursor), speed);
  return segments;
}

function pushTtsSpeechSegment(segments: TtsSegment[], text: string, speed: number): void {
  const speech = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const part of speech) {
    segments.push({ kind: "speech", text: part, speed });
  }
}

function normalizeTtsText(text: string): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseMarkerNumber(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function remoteTtsRunnerScript(
  remoteDir: string,
  config: TtsConfig,
  options: TtsOptions,
): string {
  return `
from pathlib import Path
from gradio_client import Client, handle_file
import json
import shutil
import subprocess

base = Path(${JSON.stringify(remoteDir)})
ref_audio = base / "tts-reference.wav"
ref_text = (base / "tts-reference.txt").read_text(encoding="utf-8").strip()
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

def first_audio_path(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("path") or value.get("name")
    if isinstance(value, (list, tuple)):
        for item in value:
            found = first_audio_path(item)
            if found:
                return found
    return None

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
        ${pythonBool(options.removeSilence)},
        False,
        ${options.seed},
        ${options.crossFadeDuration},
        ${options.nfeSteps},
        float(segment.get("speed", ${options.speed})),
        api_name="/basic_tts",
    )
    audio_path = first_audio_path(result)
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

function pythonBool(value: boolean): string {
  return value ? "True" : "False";
}

async function runRemoteAccent(text: string): Promise<string> {
  const script = `
import json
import sys
from ruaccent import RUAccent

payload = json.loads(sys.stdin.read())
accentizer = RUAccent()
accentizer.load(
    omograph_model_size=payload["model_size"],
    use_dictionary=payload["use_dictionary"],
    tiny_mode=False,
    device=payload["device"],
    workdir=payload["workdir"],
)
text = accentizer.process_all(payload["text"], skip_regex=r"\\[\\[[^\\]]+\\]\\]")
print(json.dumps({"text": text}, ensure_ascii=False))
`;
  const payload = JSON.stringify({
    text,
    model_size: ACCENT_CONFIG.modelSize,
    use_dictionary: ACCENT_CONFIG.useDictionary,
    device: ACCENT_CONFIG.device,
    workdir: ACCENT_CONFIG.workdir,
  });
  const stdout = await runCommandWithInput(
    [
      "ssh",
      ACCENT_CONFIG.sshHost,
      `${shellQuote(ACCENT_CONFIG.remotePython)} -c ${shellQuote(script)}`,
    ],
    payload,
  );
  const lines = stdout.trim().split(/\n+/);
  const lastLine = lines.at(-1) ?? "";
  const parsed = JSON.parse(lastLine) as unknown;
  if (!isPlainRecord(parsed) || typeof parsed.text !== "string") {
    throw new Error("accent_invalid_response");
  }
  return parsed.text;
}

function projectStressMarks(original: string, accented: string): string | null {
  let result = "";
  let accentedIndex = 0;
  let pendingStress = false;

  for (const originalChar of original) {
    while (accented[accentedIndex] === "+") {
      pendingStress = true;
      accentedIndex += 1;
    }

    const accentedChar = accented[accentedIndex];
    if (!accentedChar || !sameTextChar(originalChar, accentedChar)) return null;

    if (pendingStress && isRussianVowel(originalChar)) result += "+";
    result += originalChar;
    pendingStress = false;
    accentedIndex += 1;
  }

  while (accented[accentedIndex] === "+") accentedIndex += 1;
  return accented.slice(accentedIndex).trim() ? null : result;
}

function removeSingleSyllableStress(text: string): string {
  return text.replace(/[А-Яа-яЁё+]+/g, (word) => {
    const vowelCount = [...word.replace(/\+/g, "")].filter(isRussianVowel).length;
    return vowelCount <= 1 ? word.replace(/\+/g, "") : word;
  });
}

function applyAccentOverrides(text: string): string {
  return text.replace(/[А-Яа-яЁё+]+/g, (word) => {
    const cleanWord = word.replace(/\+/g, "");
    const stressedVowelIndex = ACCENT_OVERRIDES.get(normalizeTextChar(cleanWord));
    if (stressedVowelIndex === undefined) return word;

    let result = "";
    let vowelIndex = 0;
    let applied = false;
    for (const char of cleanWord) {
      if (isRussianVowel(char)) {
        if (vowelIndex === stressedVowelIndex) {
          result += "+";
          applied = true;
        }
        vowelIndex += 1;
      }
      result += char;
    }
    return applied ? result : cleanWord;
  });
}

function sameTextChar(left: string, right: string): boolean {
  return normalizeTextChar(left) === normalizeTextChar(right);
}

function normalizeTextChar(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function isRussianVowel(value: string): boolean {
  return /[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/.test(value);
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

async function readWhisperUsers(): Promise<WhisperUser[]> {
  await mkdir(WHISPER_RECORDINGS_ROOT, { recursive: true });
  const data = await readJson(WHISPER_USERS_PATH);
  const source = Array.isArray(data)
    ? data
    : isPlainRecord(data) && Array.isArray(data.users)
      ? data.users
      : [];
  const users = source
    .map(normalizeWhisperUser)
    .filter((user): user is WhisperUser => user !== null);
  return ensureDefaultWhisperUser(users);
}

async function writeWhisperUsers(users: readonly WhisperUser[]): Promise<void> {
  await mkdir(WHISPER_RECORDINGS_ROOT, { recursive: true });
  await Bun.write(
    WHISPER_USERS_PATH,
    JSON.stringify({ users: ensureDefaultWhisperUser(users) }, null, 2),
  );
}

async function whisperUserExists(userId: string): Promise<boolean> {
  return (await readWhisperUsers()).some((user) => user.id === userId);
}

function normalizeWhisperUser(value: unknown): WhisperUser | null {
  if (!isPlainRecord(value)) return null;
  const id = typeof value.id === "string" && isSafePathSegment(value.id) ? value.id : "";
  const name = cleanupUserName(typeof value.name === "string" ? value.name : "");
  if (!id || !name) return null;
  return {
    id,
    name,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function ensureDefaultWhisperUser(users: readonly WhisperUser[]): WhisperUser[] {
  const result: WhisperUser[] = [];
  const seen = new Set<string>();
  const defaultUser = users.find((user) => user.id === DEFAULT_WHISPER_USER_ID) ?? {
    id: DEFAULT_WHISPER_USER_ID,
    name: DEFAULT_WHISPER_USER_NAME,
    createdAt: "1970-01-01T00:00:00.000Z",
  };

  for (const user of [defaultUser, ...users]) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    result.push(user);
  }
  return result;
}

function cleanupUserName(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeUserName(value: string): string {
  return cleanupUserName(value).toLocaleLowerCase("ru");
}

function uniqueWhisperUserId(name: string, users: readonly WhisperUser[]): string {
  const used = new Set(users.map((user) => user.id));
  const base = slugUserName(name) || "user";
  let id = base;
  let index = 2;
  while (used.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function slugUserName(name: string): string {
  const ascii = cleanupUserName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ru")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `user-${crypto.randomUUID().slice(0, 8)}`;
}

async function reassignWhisperSessionsUser(fromUserId: string, toUserId: string): Promise<number> {
  await mkdir(WHISPER_RECORDINGS_ROOT, { recursive: true });
  const entries = await readdir(WHISPER_RECORDINGS_ROOT, { withFileTypes: true });
  let changed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafePathSegment(entry.name)) continue;
    const metaPath = join(WHISPER_RECORDINGS_ROOT, entry.name, "meta.json");
    const meta = await readJson(metaPath);
    const metaRecord = isPlainRecord(meta) ? meta : {};
    if (metaRecord.userId !== fromUserId) continue;
    await Bun.write(metaPath, JSON.stringify({ ...metaRecord, userId: toUserId }, null, 2));
    changed += 1;
  }
  return changed;
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

async function parseJsonRequest(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return isPlainRecord(body) ? body : {};
  } catch {
    return {};
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

async function runCommand(args: string[]): Promise<void> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${args[0]} failed (${exitCode}): ${stderr || stdout}`);
  }
}

async function runCommandWithInput(args: string[], input: string): Promise<string> {
  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(input);
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${args[0]} failed (${exitCode}): ${stderr || stdout}`);
  }
  return stdout;
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

function readTtsConfig(): TtsConfig {
  return {
    enabled: booleanFromEnv("VOICE_TTS", true),
    sshHost: Bun.env.VOICE_TTS_SSH_HOST ?? "ai-srv",
    remoteUrl: Bun.env.VOICE_TTS_REMOTE_URL ?? "http://127.0.0.1:7860/",
    remoteWorkdir: Bun.env.VOICE_TTS_REMOTE_WORKDIR ?? "/tmp/metafor-voice-tts",
    remotePython:
      Bun.env.VOICE_TTS_REMOTE_PYTHON ?? "/home/zavx0z/apps/f5-tts-misha/.venv/bin/python",
    seed: Math.round(clampNumber(Bun.env.VOICE_TTS_SEED, 0, 2_147_483_647, 42)),
    nfeSteps: Math.round(clampNumber(Bun.env.VOICE_TTS_NFE_STEPS, 4, 64, 32)),
    speed: clampNumber(Bun.env.VOICE_TTS_SPEED, 0.3, 2, 1),
    crossFadeDuration: clampNumber(Bun.env.VOICE_TTS_CROSS_FADE, 0, 1, 0.15),
    removeSilence: booleanFromEnv("VOICE_TTS_REMOVE_SILENCE", true),
  };
}

function readAccentConfig(): AccentConfig {
  return {
    enabled: booleanFromEnv("VOICE_ACCENT", true),
    sshHost: Bun.env.VOICE_ACCENT_SSH_HOST ?? "ai-srv",
    remotePython:
      Bun.env.VOICE_ACCENT_REMOTE_PYTHON ?? "/home/zavx0z/apps/ruaccent/.venv/bin/python",
    workdir: Bun.env.VOICE_ACCENT_WORKDIR ?? "/home/zavx0z/apps/ruaccent/models",
    modelSize: Bun.env.VOICE_ACCENT_MODEL_SIZE ?? "turbo3.1",
    useDictionary: booleanFromEnv("VOICE_ACCENT_USE_DICTIONARY", true),
    device: Bun.env.VOICE_ACCENT_DEVICE ?? "CPU",
  };
}

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
  for (const ws of sockets) {
    void closeRecognizer(ws, false, false);
    ws.close(1001, "server shutdown");
  }

  model.close();
  library.close();
  process.exit(exitCode);
}
