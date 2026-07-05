/**
 * Виджет «Android-экран» — полноэкранный live stream телефона.
 *
 * Основной транспорт — raw Annex-B H.264 из Android screenrecord по WebSocket
 * и декодирование в браузере через WebCodecs. ADB PNG websocket остается
 * fallback для браузеров без WebCodecs или при ошибке видео.
 */

export type AndroidHandle = { dispose(): void };
export type AndroidTransport = "auto" | "adb" | "h264";
export type AndroidMountOptions = {
  streamPath?: string;
  h264Path?: string;
  controlBasePath?: string;
  transport?: AndroidTransport;
  title?: string;
};

type AndroidCommand =
  | { type: "tap"; x: number; y: number }
  | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { type: "key"; code: string };

type StartCode = { index: number; length: number };

const SWIPE_THRESHOLD_PX = 8;
const RECONNECT_DELAY_MS = 1500;
const VIDEO_FRAME_DURATION_US = 33_333;
const H264_TAIL_FLUSH_MS = 160;
const DEFAULT_H264_CODEC = "avc1.64002A";

export function mountAndroid(container: HTMLElement, options: AndroidMountOptions = {}): AndroidHandle {
  const streamPath = options.streamPath ?? "/android/stream";
  const h264Path = options.h264Path ?? "/android/h264";
  const controlBasePath = (options.controlBasePath ?? "/android").replace(/\/$/, "");
  const transport = options.transport ?? "auto";

  container.style.position = "relative";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  const header = document.createElement("div");
  header.style.cssText = "padding:4px 8px;font-size:11px;color:#c6aa84;border-bottom:1px solid #2a2620;display:flex;gap:6px;align-items:center;";
  const title = document.createElement("span");
  title.textContent = options.title ?? "Android";
  title.style.cssText = "color:#fff3df;font-weight:500;letter-spacing:.04em;";
  const status = document.createElement("span");
  status.style.cssText = "color:#6a5a44;font-family:JetBrains Mono,Menlo,monospace;font-size:10px;flex:1;";
  status.textContent = "connecting...";
  const fpsEl = document.createElement("span");
  fpsEl.style.cssText = "color:#6a5a44;font-family:JetBrains Mono,Menlo,monospace;font-size:10px;";
  fpsEl.textContent = "0 fps";
  header.append(title, status, fpsEl);

  const stage = document.createElement("div");
  stage.style.cssText = "flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden;";
  const mediaCss = "max-width:100%;max-height:100%;cursor:crosshair;user-select:none;-webkit-user-drag:none;image-rendering:auto;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `${mediaCss}display:none;background:#000;`;
  const ctx = canvas.getContext("2d", { alpha: false });
  const img = document.createElement("img");
  img.alt = "android screen";
  img.style.cssText = `${mediaCss}display:none;`;
  img.draggable = false;
  stage.append(canvas, img);

  const toolbar = document.createElement("div");
  toolbar.style.cssText = "padding:4px;display:flex;gap:4px;justify-content:center;border-top:1px solid #2a2620;";
  const btn = (label: string, code: string, tip: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = tip;
    b.style.cssText = "background:#1f1a13;color:#c6aa84;border:1px solid #2a2620;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px;";
    b.addEventListener("click", () => sendKey(code));
    return b;
  };
  toolbar.append(
    btn("<", "KEYCODE_BACK", "Назад"),
    btn("O", "KEYCODE_HOME", "Домой"),
    btn("[]", "KEYCODE_APP_SWITCH", "Недавние"),
    btn("V-", "KEYCODE_VOLUME_DOWN", "Volume -"),
    btn("V+", "KEYCODE_VOLUME_UP", "Volume +"),
    btn("P", "KEYCODE_POWER", "Power"),
  );

  container.append(header, stage, toolbar);

  let ws: WebSocket | null = null;
  let decoder: VideoDecoder | null = null;
  let h264Parser: H264AnnexBParser | null = null;
  let configuredCodec: string | null = null;
  let blobUrl: string | null = null;
  let pendingUrl: string | null = null;
  let dragStart: { x: number; y: number; t: number } | null = null;
  let disposed = false;
  let mediaMode: "adb" | "h264" = transport === "adb" ? "adb" : "h264";
  let fallbackStarted = false;
  let controlViaHttp = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let decoderFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let h264RefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let h264FollowupTimer: ReturnType<typeof setTimeout> | null = null;
  let framesInWindow = 0;
  let fpsWindowStart = performance.now();
  let frameIndex = 0;

  const setStatus = (s: string, color = "#6a5a44"): void => {
    status.textContent = s;
    status.style.color = color;
  };

  const tickFps = (): void => {
    const now = performance.now();
    const dt = now - fpsWindowStart;
    if (dt >= 1000) {
      fpsEl.textContent = `${((framesInWindow * 1000) / dt).toFixed(1)} fps`;
      framesInWindow = 0;
      fpsWindowStart = now;
    }
  };

  const showMedia = (mode: "adb" | "h264"): void => {
    mediaMode = mode;
    img.style.display = mode === "adb" ? "block" : "none";
    canvas.style.display = mode === "h264" ? "block" : "none";
  };

  const mediaMetrics = (): { rect: DOMRect; width: number; height: number } | null => {
    if (mediaMode === "h264" && canvas.width > 0 && canvas.height > 0) {
      const rect = canvas.getBoundingClientRect();
      return rect.width === 0 || rect.height === 0 ? null : { rect, width: canvas.width, height: canvas.height };
    }

    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const rect = img.getBoundingClientRect();
      return rect.width === 0 || rect.height === 0 ? null : { rect, width: img.naturalWidth, height: img.naturalHeight };
    }

    return null;
  };

  const toDevice = (ev: MouseEvent): { x: number; y: number } | null => {
    const metrics = mediaMetrics();
    if (metrics === null) return null;
    const { rect, width, height } = metrics;
    return {
      x: (ev.clientX - rect.left) * (width / rect.width),
      y: (ev.clientY - rect.top) * (height / rect.height),
    };
  };

  const sendHttp = (command: AndroidCommand): void => {
    const path = command.type === "key" ? "key" : command.type;
    void fetch(`${controlBasePath}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`control ${response.status}`);
        }

        if (controlViaHttp) {
          scheduleH264Refresh();
          scheduleH264FollowupFrame();
        }
      })
      .catch(() => setStatus("control error", "#e07a6a"));
  };

  const sendCommand = (command: AndroidCommand): void => {
    if (!controlViaHttp && ws !== null && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command));
      return;
    }

    sendHttp(command);
  };

  const sendKey = (code: string): void => sendCommand({ type: "key", code });

  const disposeDecoder = (): void => {
    if (decoderFlushTimer !== null) {
      clearTimeout(decoderFlushTimer);
      decoderFlushTimer = null;
    }

    h264Parser?.dispose();
    h264Parser = null;

    if (decoder !== null) {
      try {
        decoder.close();
      } catch {
        // Already closed.
      }
      decoder = null;
    }

    configuredCodec = null;
  };

  const fallbackToAdb = (reason: string): void => {
    if (disposed || transport === "h264") {
      setStatus(reason, "#e07a6a");
      return;
    }

    if (fallbackStarted) {
      return;
    }

    fallbackStarted = true;
    disposeDecoder();
    if (ws !== null) {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      ws = null;
    }
    setStatus(`${reason}, adb fallback`, "#e0b16a");
    connectAdb();
  };

  const ensureDecoder = (codec: string): VideoDecoder | null => {
    if (ctx === null) {
      fallbackToAdb("canvas error");
      return null;
    }

    if (decoder !== null && configuredCodec === codec) {
      return decoder;
    }

    disposeDecoder();
    configuredCodec = codec;
    decoder = new VideoDecoder({
      output(frame) {
        const width = frame.displayWidth || frame.codedWidth;
        const height = frame.displayHeight || frame.codedHeight;

        if (mediaMode !== "h264") {
          showMedia("h264");
        }

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        frame.close();
        framesInWindow++;
        tickFps();
      },
      error(error) {
        fallbackToAdb(`decoder ${error.message}`);
      },
    });

    try {
      decoder.configure({
        codec,
        optimizeForLatency: true,
      });
    } catch (error) {
      fallbackToAdb(`codec ${String(error)}`);
      return null;
    }

    return decoder;
  };

  const scheduleDecoderFlush = (activeDecoder: VideoDecoder): void => {
    if (decoderFlushTimer !== null) {
      clearTimeout(decoderFlushTimer);
    }

    decoderFlushTimer = setTimeout(() => {
      decoderFlushTimer = null;

      if (disposed || decoder !== activeDecoder || activeDecoder.state !== "configured") {
        return;
      }

      void activeDecoder.flush().catch(() => {
        // Decoder errors are reported through the configured error callback.
      });
    }, 80);
  };

  const decodeAccessUnit = (unit: Uint8Array, key: boolean, codec: string): void => {
    const activeDecoder = ensureDecoder(codec);

    if (activeDecoder === null) {
      return;
    }

    if (!key && activeDecoder.decodeQueueSize > 6) {
      return;
    }

    try {
      activeDecoder.decode(new EncodedVideoChunk({
        type: key ? "key" : "delta",
        timestamp: frameIndex * VIDEO_FRAME_DURATION_US,
        duration: VIDEO_FRAME_DURATION_US,
        data: unit,
      }));
      scheduleDecoderFlush(activeDecoder);
      frameIndex++;
    } catch (error) {
      fallbackToAdb(`decode ${String(error)}`);
    }
  };

  const connectH264 = (loadPreview = true): void => {
    if (disposed) return;

    if (!("VideoDecoder" in window) || !("EncodedVideoChunk" in window)) {
      fallbackToAdb("no WebCodecs");
      return;
    }

    controlViaHttp = true;
    frameIndex = 0;
    framesInWindow = 0;
    fpsWindowStart = performance.now();
    fpsEl.textContent = "h264";
    h264Parser = new H264AnnexBParser(decodeAccessUnit);
    setStatus("h264 connecting...");

    if (loadPreview) {
      void loadInitialPreview();
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const localWs = new WebSocket(`${proto}//${location.host}${h264Path}`);
    ws = localWs;
    localWs.binaryType = "arraybuffer";

    localWs.addEventListener("open", () => setStatus("h264 video", "#9bd17a"));
    localWs.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        try {
          const j = JSON.parse(e.data) as { type?: string; error?: string };
          if (j.type === "error") fallbackToAdb(j.error ?? "h264 error");
        } catch {
          // Ignore non-protocol strings.
        }
        return;
      }

      const bytes = e.data instanceof ArrayBuffer
        ? new Uint8Array(e.data)
        : new Uint8Array(e.data as ArrayBufferLike);
      h264Parser?.push(bytes);
    });
    localWs.addEventListener("close", () => {
      if (disposed || ws !== localWs) return;
      fallbackToAdb("h264 closed");
    });
    localWs.addEventListener("error", () => fallbackToAdb("h264 ws error"));
  };

  const scheduleH264Refresh = (): void => {
    if (disposed || transport === "adb") {
      return;
    }

    if (h264RefreshTimer !== null) {
      clearTimeout(h264RefreshTimer);
    }

    h264RefreshTimer = setTimeout(() => {
      h264RefreshTimer = null;

      void refreshH264FromDevice();
    }, 80);
  };

  const scheduleH264FollowupFrame = (): void => {
    if (disposed || transport === "adb") {
      return;
    }

    if (h264FollowupTimer !== null) {
      clearTimeout(h264FollowupTimer);
    }

    h264FollowupTimer = setTimeout(() => {
      h264FollowupTimer = null;

      if (disposed || !controlViaHttp) {
        return;
      }

      void drawScreencapToCanvas();
    }, 520);
  };

  const refreshH264FromDevice = async (): Promise<void> => {
    if (disposed || !controlViaHttp) {
      return;
    }

    await drawScreencapToCanvas();

    if (disposed || transport === "adb" || !controlViaHttp) {
      return;
    }

    const oldWs = ws;
    ws = null;

    if (oldWs !== null) {
      try {
        oldWs.close();
      } catch {
        // Already closed.
      }
    }

    disposeDecoder();
    connectH264(false);
  };

  const connectAdb = (): void => {
    if (disposed) return;
    controlViaHttp = false;
    showMedia("adb");
    fpsEl.textContent = "0 fps";
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const localWs = new WebSocket(`${proto}//${location.host}${streamPath}`);
    ws = localWs;
    localWs.binaryType = "blob";
    localWs.addEventListener("open", () => setStatus("adb png", "#9bd17a"));
    localWs.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        try {
          const j = JSON.parse(e.data) as { type?: string; error?: string };
          if (j.type === "error") setStatus(j.error ?? "stream error", "#e07a6a");
        } catch {
          // Ignore non-protocol strings.
        }
        return;
      }
      const blob = e.data as Blob;
      const next = URL.createObjectURL(blob);
      // Двойная буферизация: revoke предыдущий blob только когда новый кадр принят.
      if (pendingUrl !== null) URL.revokeObjectURL(pendingUrl);
      pendingUrl = next;
      img.src = next;
      framesInWindow++;
      tickFps();
    });
    localWs.addEventListener("close", () => {
      if (disposed || ws !== localWs) return;
      setStatus("disconnected", "#e07a6a");
      reconnectTimer = setTimeout(connectAdb, RECONNECT_DELAY_MS);
    });
    localWs.addEventListener("error", () => setStatus("ws error", "#e07a6a"));
  };

  img.addEventListener("load", () => {
    if (pendingUrl !== null) {
      if (blobUrl !== null && blobUrl !== pendingUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = pendingUrl;
      pendingUrl = null;
    }
  });

  stage.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const p = toDevice(e);
    if (p === null) return;
    dragStart = { x: p.x, y: p.y, t: performance.now() };
  });
  window.addEventListener("mouseup", (e) => {
    if (dragStart === null) return;
    const start = dragStart;
    dragStart = null;
    const p = toDevice(e);
    if (p === null) return;
    const dist = Math.hypot(p.x - start.x, p.y - start.y);
    const dur = Math.max(50, Math.round(performance.now() - start.t));
    if (dist < SWIPE_THRESHOLD_PX) sendCommand({ type: "tap", x: start.x, y: start.y });
    else sendCommand({ type: "swipe", x1: start.x, y1: start.y, x2: p.x, y2: p.y, durationMs: dur });
  });

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const metrics = mediaMetrics();
    if (metrics === null) return;
    const sx = metrics.width / 2;
    const sy = metrics.height / 2;
    const scale = metrics.height / metrics.rect.height;
    const dy = e.deltaY * scale * 2;
    sendCommand({ type: "swipe", x1: sx, y1: sy, x2: sx, y2: sy - dy, durationMs: 120 });
  }, { passive: false });

  if (transport === "adb") connectAdb();
  else connectH264();

  async function loadInitialPreview(): Promise<void> {
    showMedia("adb");

    try {
      const response = await fetch(`${controlBasePath}/screencap`, { cache: "no-store" });

      if (!response.ok || disposed || mediaMode === "h264") {
        return;
      }

      const next = URL.createObjectURL(await response.blob());
      if (pendingUrl !== null) URL.revokeObjectURL(pendingUrl);
      pendingUrl = next;
      img.src = next;
    } catch {
      // H.264 stream can still start without the preview frame.
    }
  }

  async function drawScreencapToCanvas(): Promise<void> {
    if (ctx === null) {
      return;
    }

    try {
      const response = await fetch(`${controlBasePath}/screencap`, { cache: "no-store" });

      if (!response.ok || disposed) {
        return;
      }

      const bitmap = await createImageBitmap(await response.blob());

      try {
        if (disposed) {
          return;
        }

        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }

        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        showMedia("h264");
        framesInWindow++;
        tickFps();
      } finally {
        bitmap.close();
      }
    } catch {
      // H.264 reconnect can still recover without the immediate preview frame.
    }
  }

  return {
    dispose() {
      disposed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (h264RefreshTimer !== null) clearTimeout(h264RefreshTimer);
      if (h264FollowupTimer !== null) clearTimeout(h264FollowupTimer);
      if (ws !== null) {
        try {
          ws.close();
        } catch {
          // Already closed.
        }
      }
      disposeDecoder();
      if (blobUrl !== null) URL.revokeObjectURL(blobUrl);
      if (pendingUrl !== null) URL.revokeObjectURL(pendingUrl);
    },
  };
}

class H264AnnexBParser {
  private buffer = new Uint8Array();
  private prefix: Uint8Array[] = [];
  private codec = DEFAULT_H264_CODEC;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onAccessUnit: (unit: Uint8Array, key: boolean, codec: string) => void) {}

  push(chunk: Uint8Array): void {
    this.clearFlushTimer();
    this.buffer = concatBytes([this.buffer, chunk]);

    const starts = findStartCodes(this.buffer);

    if (starts.length === 0) {
      this.buffer = this.buffer.slice(Math.max(0, this.buffer.byteLength - 4));
      return;
    }

    const firstStart = starts[0]!;
    if (firstStart.index > 0) {
      this.buffer = this.buffer.slice(firstStart.index);
      return this.push(new Uint8Array());
    }

    if (starts.length < 2) {
      this.scheduleTailFlush();
      return;
    }

    for (let i = 0; i < starts.length - 1; i++) {
      this.handleNal(this.buffer.slice(starts[i]!.index, starts[i + 1]!.index));
    }

    this.buffer = this.buffer.slice(starts[starts.length - 1]!.index);
    this.scheduleTailFlush();
  }

  dispose(): void {
    this.clearFlushTimer();
    this.buffer = new Uint8Array();
    this.prefix = [];
  }

  private handleNal(nal: Uint8Array): void {
    const type = nalType(nal);

    if (type === 7) {
      this.codec = codecFromSps(nal) ?? this.codec;
      this.prefix.push(nal);
      return;
    }

    if (type === 8 || type === 6 || type === 9) {
      this.prefix.push(nal);
      return;
    }

    if (type === 1 || type === 5) {
      const unit = concatBytes([...this.prefix, nal]);
      this.prefix = [];
      this.onAccessUnit(unit, type === 5, this.codec);
      return;
    }

    this.prefix.push(nal);
  }

  private scheduleTailFlush(): void {
    if (this.buffer.byteLength === 0) {
      return;
    }

    const starts = findStartCodes(this.buffer);

    if (starts.length !== 1) {
      return;
    }

    const type = nalType(this.buffer);

    if (type !== 1 && type !== 5) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      const tail = this.buffer;

      this.buffer = new Uint8Array();
      this.handleNal(tail);
    }, H264_TAIL_FLUSH_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

function findStartCodes(bytes: Uint8Array): StartCode[] {
  const starts: StartCode[] = [];

  for (let i = 0; i < bytes.byteLength - 3; i++) {
    if (bytes[i] !== 0 || bytes[i + 1] !== 0) {
      continue;
    }

    if (bytes[i + 2] === 1) {
      starts.push({ index: i, length: 3 });
      i += 2;
      continue;
    }

    if (bytes[i + 2] === 0 && bytes[i + 3] === 1) {
      starts.push({ index: i, length: 4 });
      i += 3;
    }
  }

  return starts;
}

function nalType(nal: Uint8Array): number {
  const start = startCodeLength(nal);
  return start === 0 || start >= nal.byteLength ? -1 : nal[start]! & 0x1f;
}

function codecFromSps(nal: Uint8Array): string | null {
  const start = startCodeLength(nal);
  const profile = nal[start + 1];
  const compatibility = nal[start + 2];
  const level = nal[start + 3];

  if (profile === undefined || compatibility === undefined || level === undefined) {
    return null;
  }

  return `avc1.${hex(profile)}${hex(compatibility)}${hex(level)}`;
}

function startCodeLength(bytes: Uint8Array): number {
  if (bytes[0] !== 0 || bytes[1] !== 0) {
    return 0;
  }

  if (bytes[2] === 1) {
    return 3;
  }

  if (bytes[2] === 0 && bytes[3] === 1) {
    return 4;
  }

  return 0;
}

function concatBytes(chunks: ReadonlyArray<Uint8Array<ArrayBufferLike>>): Uint8Array<ArrayBuffer> {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}
