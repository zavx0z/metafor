import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

type ClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

type ServerMessage =
  | { type: "output"; data: string }
  | { type: "status"; state: string; detail?: string }
  | { type: "exit"; code: number | null; signal: string | null }
  | { type: "error"; message: string };

const terminalElement = document.querySelector<HTMLDivElement>("#terminal");
const statusElement =
  document.querySelector<HTMLDivElement>("#connection-status");
const reconnectButton =
  document.querySelector<HTMLButtonElement>("#reconnect-button");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-button");

if (!terminalElement || !statusElement || !reconnectButton || !clearButton) {
  throw new Error("Terminal UI is incomplete");
}

const terminalContainer = terminalElement;
const status = statusElement;
const reconnect = reconnectButton;
const clear = clearButton;

const terminal = new Terminal({
  allowProposedApi: false,
  cursorBlink: true,
  cursorStyle: "block",
  fontFamily:
    '"SFMono-Regular", "Cascadia Code", "Liberation Mono", Menlo, Consolas, monospace',
  fontSize: 14,
  letterSpacing: 0,
  lineHeight: 1.15,
  scrollback: 5000,
  theme: {
    background: "#090b10",
    black: "#111318",
    blue: "#5eb1ff",
    brightBlack: "#687386",
    brightBlue: "#8bc7ff",
    brightCyan: "#7ee0d6",
    brightGreen: "#8cdfba",
    brightMagenta: "#d9a5ff",
    brightRed: "#ff8585",
    brightWhite: "#ffffff",
    brightYellow: "#ffd166",
    cursor: "#edf0f7",
    cyan: "#6acfc4",
    foreground: "#edf0f7",
    green: "#6ec6a4",
    magenta: "#c792ea",
    red: "#ff6b6b",
    selectionBackground: "#334155",
    white: "#d9dee8",
    yellow: "#f1b64b",
  },
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(terminalContainer);

let socket: WebSocket | null = null;
let pendingResize = 0;

function setStatus(state: string, detail?: string) {
  status.dataset.state = state;
  status.textContent = detail ? `${state}: ${detail}` : state;
}

function websocketURL() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/terminal`;
}

function send(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function fitAndSyncSize() {
  cancelAnimationFrame(pendingResize);
  pendingResize = requestAnimationFrame(() => {
    fitAddon.fit();
    send({
      type: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    });
  });
}

function writeSystemLine(message: string) {
  terminal.writeln(`\x1b[90m${message}\x1b[0m`);
}

function handleServerMessage(event: MessageEvent<string>) {
  let message: ServerMessage;

  try {
    message = JSON.parse(event.data) as ServerMessage;
  } catch {
    return;
  }

  switch (message.type) {
    case "output":
      terminal.write(message.data);
      break;
    case "status":
      setStatus(message.state, message.detail);
      break;
    case "exit":
      setStatus("disconnected", "shell exited");
      writeSystemLine(
        `Process exited: code=${message.code ?? "null"} signal=${
          message.signal ?? "null"
        }`,
      );
      break;
    case "error":
      setStatus("error", message.message);
      writeSystemLine(message.message);
      break;
  }
}

function connect() {
  if (socket) {
    socket.close();
    socket = null;
  }

  setStatus("connecting");
  const nextSocket = new WebSocket(websocketURL());
  socket = nextSocket;

  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) {
      return;
    }

    setStatus("connected");
    fitAndSyncSize();
    terminal.focus();
  });

  nextSocket.addEventListener("message", (event) => {
    if (socket === nextSocket) {
      handleServerMessage(event);
    }
  });

  nextSocket.addEventListener("close", () => {
    if (socket !== nextSocket) {
      return;
    }

    if (status.dataset.state !== "error" && status.dataset.state !== "disconnected") {
      setStatus("disconnected");
    }
  });

  nextSocket.addEventListener("error", () => {
    if (socket !== nextSocket) {
      return;
    }

    setStatus("error", "websocket");
  });
}

terminal.onData((data) => {
  send({ type: "input", data });
});

terminal.onResize(({ cols, rows }) => {
  send({ type: "resize", cols, rows });
});

reconnect.addEventListener("click", () => {
  connect();
});

clear.addEventListener("click", () => {
  terminal.clear();
  terminal.focus();
});

new ResizeObserver(fitAndSyncSize).observe(terminalContainer);

window.addEventListener("beforeunload", () => {
  socket?.close();
});

connect();
