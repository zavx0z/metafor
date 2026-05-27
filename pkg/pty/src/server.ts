import homepage from "./index.html";
import type { ServerWebSocket, Subprocess } from "bun";

type SocketData = {
  session?: TerminalSession;
  connectedAt: number;
};

type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

type ServerMessage =
  | { type: "output"; data: string }
  | { type: "status"; state: string; detail?: string }
  | { type: "exit"; code: number | null; signal: string | null }
  | { type: "error"; message: string };

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_COLS = 300;
const MAX_ROWS = 120;

const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3002");
const shell = process.env.SHELL ?? "/bin/zsh";

class TerminalSession {
  private readonly decoder = new TextDecoder();
  private readonly proc: Subprocess<"ignore", "ignore", "ignore">;
  private readonly terminal: Bun.Terminal;
  private disposed = false;

  constructor(
    private readonly ws: ServerWebSocket<SocketData>,
    cols: number,
    rows: number,
  ) {
    this.proc = Bun.spawn([shell, "-l"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
      },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      terminal: {
        cols,
        rows,
        name: "xterm-256color",
        data: (_terminal, data) => {
          this.send({
            type: "output",
            data: this.decoder.decode(data, { stream: true }),
          });
        },
        exit: (_terminal, exitCode, signal) => {
          const tail = this.decoder.decode();

          if (tail) {
            this.send({ type: "output", data: tail });
          }

          this.send({
            type: "status",
            state: "disconnected",
            detail: signal ?? `pty closed (${exitCode})`,
          });
        },
      },
    });

    if (!this.proc.terminal) {
      throw new Error("Bun did not attach a PTY to the shell process");
    }

    this.terminal = this.proc.terminal;

    this.proc.exited
      .then((code) => {
        this.send({ type: "exit", code, signal: null });
      })
      .catch((error) => {
        this.send({
          type: "error",
          message:
            error instanceof Error ? error.message : "terminal process failed",
        });
      });
  }

  write(data: string) {
    if (!this.disposed && !this.terminal.closed) {
      this.terminal.write(data);
    }
  }

  resize(cols: number, rows: number) {
    if (this.disposed || this.terminal.closed) {
      return;
    }

    this.terminal.resize(clamp(cols, 1, MAX_COLS), clamp(rows, 1, MAX_ROWS));
  }

  close() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      this.proc.kill("SIGHUP");
    } catch {
      // The process may already have exited.
    }

    try {
      if (!this.terminal.closed) {
        this.terminal.close();
      }
    } catch {
      // Closing an already detached PTY is harmless.
    }
  }

  private send(message: ServerMessage) {
    if (!this.disposed && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

const server = Bun.serve<SocketData>({
  hostname,
  port,
  routes: {
    "/": homepage,
  },
  development:
    process.env.NODE_ENV === "production"
      ? false
      : {
          hmr: true,
          console: true,
        },
  fetch(req, bunServer) {
    const url = new URL(req.url);

    if (url.pathname === "/terminal") {
      if (!isAllowedOrigin(req, url)) {
        return new Response("Forbidden", { status: 403 });
      }

      const upgraded = bunServer.upgrade(req, {
        data: {
          connectedAt: Date.now(),
        },
      });

      return upgraded
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    data: {} as SocketData,
    idleTimeout: 0,
    maxPayloadLength: 1024 * 1024,
    open(ws) {
      try {
        ws.data.session = new TerminalSession(ws, DEFAULT_COLS, DEFAULT_ROWS);
        ws.send(
          JSON.stringify({
            type: "status",
            state: "connected",
            detail: shell,
          } satisfies ServerMessage),
        );
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "shell failed",
          } satisfies ServerMessage),
        );
        ws.close(1011, "shell failed");
      }
    },
    message(ws, message) {
      const payload = parseClientMessage(message);
      const session = ws.data.session;

      if (!payload || !session) {
        return;
      }

      if (payload.type === "input") {
        session.write(payload.data);
        return;
      }

      session.resize(payload.cols, payload.rows);
    },
    close(ws) {
      ws.data.session?.close();
      ws.data.session = undefined;
    },
  },
});

console.log(`Bun PTY terminal listening at ${server.url}`);

function parseClientMessage(
  raw: string | ArrayBuffer | Uint8Array,
): ClientMessage | null {
  const text =
    typeof raw === "string"
      ? raw
      : new TextDecoder().decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw));

  try {
    const value = JSON.parse(text) as Partial<ClientMessage>;

    if (value.type === "input" && typeof value.data === "string") {
      return value as ClientMessage;
    }

    if (
      value.type === "resize" &&
      typeof value.cols === "number" &&
      typeof value.rows === "number"
    ) {
      return value as ClientMessage;
    }
  } catch {
    return null;
  }

  return null;
}

function isAllowedOrigin(req: Request, url: URL) {
  const origin = req.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}
