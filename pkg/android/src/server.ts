export type AndroidStreamFlag = { value: boolean };

export type AndroidSocketData = {
  kind: "android" | "android-h264";
  running: AndroidStreamFlag;
  process?: Bun.Subprocess;
};

export type AndroidSocketLike = {
  data: AndroidSocketData;
  readyState: number;
  send(data: string | Buffer): unknown;
};

type AndroidClientMessage =
  | { type: "tap"; x: number; y: number }
  | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { type: "key"; code: string };

const WS_OPEN = 1;
const MIN_SWIPE_MS = 50;
const MAX_SWIPE_MS = 2000;
const FRAME_PAUSE_MS = 80;
const ERROR_PAUSE_MS = 2000;
const H264_RESTART_PAUSE_MS = 60;
const H264_BIT_RATE = process.env.ANDROID_H264_BIT_RATE ?? "4000000";
const H264_SIZE = process.env.ANDROID_H264_SIZE;
const ANDROID_SERIAL = process.env.ANDROID_SERIAL;

export function createAndroidSocketData<T extends object>(extra: T): T & AndroidSocketData {
  return {
    ...extra,
    kind: "android",
    running: { value: true },
  };
}

export function createAndroidH264SocketData<T extends object>(extra: T): T & AndroidSocketData {
  return {
    ...extra,
    kind: "android-h264",
    running: { value: true },
  };
}

export function stopAndroidStream(data: AndroidSocketData): void {
  data.running.value = false;

  if (data.process) {
    try {
      data.process.kill();
    } catch {
      // Already exited.
    }
  }
}

/**
 * Streams `adb exec-out screencap -p` as binary PNG websocket frames.
 * The `running` flag lives in socket data so a host app can stop the loop in
 * its websocket close hook without keeping package-private state.
 */
export function startAndroidLoop(ws: AndroidSocketLike): void {
  const flag = ws.data.running;
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  (async () => {
    while (flag.value && ws.readyState === WS_OPEN) {
      const frame = await adbCapture();

      if (!flag.value) {
        return;
      }

      if (!frame.ok) {
        if (ws.readyState === WS_OPEN) {
          ws.send(JSON.stringify({ type: "error", error: frame.error }));
        }

        await sleep(ERROR_PAUSE_MS);
        continue;
      }

      if (ws.readyState !== WS_OPEN) {
        return;
      }

      try {
        ws.send(Buffer.from(frame.png.buffer, frame.png.byteOffset, frame.png.byteLength));
      } catch {
        return;
      }

      await sleep(FRAME_PAUSE_MS);
    }
  })().catch((error) => {
    if (ws.readyState === WS_OPEN) {
      ws.send(JSON.stringify({ type: "error", error: String(error) }));
    }
  });
}

/**
 * Streams Android's raw Annex-B H.264 screenrecord output as binary websocket
 * chunks. Browser clients decode it with WebCodecs and use the PNG stream as
 * fallback when WebCodecs is not available.
 */
export function startAndroidH264Loop(ws: AndroidSocketLike): void {
  let proc: Bun.Subprocess | null = null;
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  (async () => {
    while (ws.data.running.value && ws.readyState === WS_OPEN) {
      const target = await adbTargetArgs();
      const args = [
        ...target,
        "exec-out",
        "screenrecord",
        "--output-format=h264",
        "--bit-rate",
        H264_BIT_RATE,
        "--time-limit",
        "0",
      ];

      if (H264_SIZE) {
        args.push("--size", H264_SIZE);
      }

      args.push("-");

      const spawned = Bun.spawn(["adb", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });

      proc = spawned;
      ws.data.process = spawned;
      const stderr = new Response(spawned.stderr).text();
      const reader = spawned.stdout.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (!ws.data.running.value || ws.readyState !== WS_OPEN) {
            break;
          }

          ws.send(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        }

        const [code, err] = await Promise.all([spawned.exited, stderr]);

        if (!ws.data.running.value || ws.readyState !== WS_OPEN) {
          return;
        }

        if (code !== 0) {
          ws.send(JSON.stringify({ type: "error", error: err.trim() || `screenrecord exit ${code}` }));
          return;
        }
      } catch (error) {
        if (ws.data.running.value && ws.readyState === WS_OPEN) {
          ws.send(JSON.stringify({ type: "error", error: String(error) }));
        }

        return;
      } finally {
        if (ws.data.process === spawned) {
          delete ws.data.process;
        }

        if (proc === spawned) {
          proc = null;
        }
      }

      await sleep(H264_RESTART_PAUSE_MS);
    }
  })().finally(() => {
    if (proc !== null) {
      try {
        proc.kill();
      } catch {
        // Already exited.
      }
    }

    if (proc !== null && ws.data.process === proc) {
      delete ws.data.process;
    }
  });
}

export function handleAndroidSocketMessage(raw: string | Buffer): void {
  const message = parseAndroidClientMessage(raw);

  if (message === null) {
    return;
  }

  if (message.type === "tap") {
    void adbShell(["input", "tap", `${Math.round(message.x)}`, `${Math.round(message.y)}`]);
    return;
  }

  if (message.type === "swipe") {
    const durationMs = clampInt(message.durationMs ?? 250, MIN_SWIPE_MS, MAX_SWIPE_MS);
    void adbShell([
      "input",
      "swipe",
      `${Math.round(message.x1)}`,
      `${Math.round(message.y1)}`,
      `${Math.round(message.x2)}`,
      `${Math.round(message.y2)}`,
      `${durationMs}`,
    ]);
    return;
  }

  void adbShell(["input", "keyevent", message.code]);
}

export async function androidSizeResponse(): Promise<Response> {
  const size = await adbDeviceSize();
  return Response.json(size ?? { error: "adb wm size failed" }, { status: size ? 200 : 502 });
}

export async function androidScreencapResponse(): Promise<Response> {
  const frame = await adbCapture();

  if (!frame.ok) {
    return Response.json({ error: frame.error }, { status: 502 });
  }

  const png = new Uint8Array(frame.png.byteLength);
  png.set(frame.png);

  return new Response(new Blob([png.buffer], { type: "image/png" }), {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
    },
  });
}

export async function androidTapResponse(req: Request): Promise<Response> {
  const body = await readJson<{ x: number; y: number }>(req);

  if (!body || !Number.isFinite(body.x) || !Number.isFinite(body.y)) {
    return Response.json({ error: "x/y required" }, { status: 400 });
  }

  const result = await adbShell(["input", "tap", `${Math.round(body.x)}`, `${Math.round(body.y)}`]);
  return androidCommandResponse(result);
}

export async function androidSwipeResponse(req: Request): Promise<Response> {
  const body = await readJson<{ x1: number; y1: number; x2: number; y2: number; durationMs?: number }>(req);

  if (
    !body ||
    ![body.x1, body.y1, body.x2, body.y2].every((value) => Number.isFinite(value))
  ) {
    return Response.json({ error: "x1/y1/x2/y2 required" }, { status: 400 });
  }

  const durationMs = clampInt(body.durationMs ?? 250, MIN_SWIPE_MS, MAX_SWIPE_MS);
  const result = await adbShell([
    "input",
    "swipe",
    `${Math.round(body.x1)}`,
    `${Math.round(body.y1)}`,
    `${Math.round(body.x2)}`,
    `${Math.round(body.y2)}`,
    `${durationMs}`,
  ]);

  return androidCommandResponse(result);
}

export async function androidKeyResponse(req: Request): Promise<Response> {
  const body = await readJson<{ code: string }>(req);

  if (!body || typeof body.code !== "string" || !isAndroidKeyCode(body.code)) {
    return Response.json({ error: "code required (KEYCODE_* or number)" }, { status: 400 });
  }

  const result = await adbShell(["input", "keyevent", body.code]);
  return androidCommandResponse(result);
}

export async function adbCapture(): Promise<{ ok: true; png: Uint8Array } | { ok: false; error: string }> {
  try {
    const proc = Bun.spawn(["adb", ...(await adbTargetArgs()), "exec-out", "screencap", "-p"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
    const code = await proc.exited;

    if (code !== 0) {
      return { ok: false, error: `adb exit ${code}` };
    }

    if (bytes.byteLength < 64) {
      return { ok: false, error: "empty screencap" };
    }

    return { ok: true, png: bytes };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function adbShell(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const proc = Bun.spawn(["adb", ...(await adbTargetArgs()), "shell", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;

  return { ok: code === 0, out, err };
}

export async function adbDeviceSize(): Promise<{ w: number; h: number } | null> {
  const result = await adbShell(["wm", "size"]);

  if (!result.ok) {
    return null;
  }

  const match = result.out.match(/(\d+)x(\d+)/);

  if (!match) {
    return null;
  }

  return { w: Number(match[1]), h: Number(match[2]) };
}

function parseAndroidClientMessage(raw: string | Buffer): AndroidClientMessage | null {
  let value: unknown;

  try {
    value = JSON.parse(typeof raw === "string" ? raw : raw.toString());
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as Partial<AndroidClientMessage>;

  if (message.type === "tap" && Number.isFinite(message.x) && Number.isFinite(message.y)) {
    return message as AndroidClientMessage;
  }

  if (
    message.type === "swipe" &&
    Number.isFinite(message.x1) &&
    Number.isFinite(message.y1) &&
    Number.isFinite(message.x2) &&
    Number.isFinite(message.y2)
  ) {
    return message as AndroidClientMessage;
  }

  if (message.type === "key" && typeof message.code === "string" && isAndroidKeyCode(message.code)) {
    return message as AndroidClientMessage;
  }

  return null;
}

function isAndroidKeyCode(value: string): boolean {
  return /^[A-Z_0-9]+$/.test(value);
}

function androidCommandResponse(result: { ok: boolean; out: string; err: string }): Response {
  return Response.json(
    result.ok ? { ok: true } : { error: result.err || result.out },
    { status: result.ok ? 200 : 502 },
  );
}

async function adbTargetArgs(): Promise<string[]> {
  if (ANDROID_SERIAL) {
    return ["-s", ANDROID_SERIAL];
  }

  const proc = Bun.spawn(["adb", "devices"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const serial = out
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\S+)\s+device$/)?.[1])
    .find((value): value is string => Boolean(value));

  return serial ? ["-s", serial] : [];
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}
