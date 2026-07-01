export type PtyTerminalSize = {
  cols: number
  rows: number
}

export type PtyTerminalState = {
  echo: boolean
  localEcho: boolean
  alternateScreen: boolean
  applicationCursorKeys: boolean
  applicationKeypad: boolean
  bracketedPaste: boolean
  cursorVisible: boolean
}

export type PtyInputSource = "keyboard" | "paste" | "api"
export type PtyStatusKind = "idle" | "connected" | "running" | "disconnected" | "error"

export type PtyClientMessage =
  | {type: "input.write"; data: string; source?: PtyInputSource; localEchoId?: number}
  | {type: "terminal.resize"; size: PtyTerminalSize}
  | {type: "terminal.clear"}

export type PtyServerMessage =
  | {type: "terminal.ready"; shell: string; size: PtyTerminalSize; sessionId: string; restored: boolean; replayBytes: number; state: PtyTerminalState}
  | {type: "terminal.write"; data: string; state?: PtyTerminalState}
  | {type: "terminal.state"; state: PtyTerminalState}
  | {type: "terminal.local-echo"; id: number; accepted: boolean; state: PtyTerminalState}
  | {type: "terminal.status"; status: {kind: PtyStatusKind; label: string; detail?: string}}
  | {type: "terminal.exit"; code: number | null; signal: string | null}
  | {type: "terminal.error"; message: string}
