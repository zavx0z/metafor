export type PtyTerminalSize = {
  cols: number
  rows: number
}

export type PtyInputSource = "keyboard" | "paste" | "api"
export type PtyStatusKind = "idle" | "connected" | "running" | "disconnected" | "error"

export type PtyClientMessage =
  | {type: "input.write"; data: string; source?: PtyInputSource}
  | {type: "terminal.resize"; size: PtyTerminalSize}

export type PtyServerMessage =
  | {type: "terminal.ready"; shell: string; size: PtyTerminalSize}
  | {type: "terminal.write"; data: string}
  | {type: "terminal.status"; status: {kind: PtyStatusKind; label: string; detail?: string}}
  | {type: "terminal.exit"; code: number | null; signal: string | null}
  | {type: "terminal.error"; message: string}
