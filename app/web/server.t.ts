import type {ServerWebSocket} from "bun"
import type {Buffer} from "node:buffer"
import type {BulkLayoutSettings} from "@bulk/gravity/layout"
import type {BoundaryBulkRuntimeSnapshot} from "boundary"
import type {PtySocketData} from "@metafor/pty/server"
import type {parseMarkdownTodo} from "@ui/panes/todo-model"

export type AppLogTone = "cyan" | "gray" | "green" | "magenta" | "red" | "yellow"

export type JsonReadResult =
	| {body: Record<string, unknown>; error?: undefined}
	| {body: Record<string, never>; error: string}

export type RtcSignalSocketData = {
	kind: "rtc-signal"
	room: string
	peerId: string
	connectedAt: number
}

export type AppWebClientSocketData = {
	kind: "app-web"
	voiceClientId?: string
}

export type AppWebTerminalSocketData = {kind: "terminal"} & PtySocketData

export type TerminalPtySocketData = PtySocketData

export type AppWebSocketData = AppWebClientSocketData | AppWebTerminalSocketData | RtcSignalSocketData

export type TodoMarkdownPayload = {
	ok: true
	path: string
	mtimeMs: number
	size: number
	text: string
	items: ReturnType<typeof parseMarkdownTodo>
}

export type AndroidControlCommand =
	| {type: "tap"; x: number; y: number; frameW?: number; frameH?: number}
	| {type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number; frameW?: number; frameH?: number}
	| {type: "key"; code: string}
	| {type: "launch"; packageName: string}
	| {type: "open-accessibility"}

export type NetworkTerminalAction = "show" | "dock" | "toggle"

export type NetworkTerminalCommand = {
	action: NetworkTerminalAction
	session?: string
	key?: string
	tmux?: string
}

export type NetworkAction = "layout" | "status" | "start:tls" | "stop:tls" | "start:redirect" | "stop:redirect" | "tail" | "clear" | "stop"

export type AppClientAsset = {
	body: ArrayBuffer
	type: string
}

export type AppClientBundle = {
	assets: Map<string, AppClientAsset>
	html: AppClientAsset
}

export type ClientMaterializePayload = {
	type: "materialize"
	src: string
	layoutSettings?: Partial<BulkLayoutSettings>
}

export type ClientRelayoutPayload = {
	type: "relayout"
	src: string
	layoutSettings?: Partial<BulkLayoutSettings>
}

export type ClientVoiceLeasePayload = {
	type: "hud-voice-lease"
	action: "request" | "release"
	clientId: string
	reason?: string
}

export type ClientMessage = ClientMaterializePayload | ClientRelayoutPayload | ClientVoiceLeasePayload

export type ServerSnapshotPayload = {
	type: "snapshot"
	src: string
	snapshot: BoundaryBulkRuntimeSnapshot
}

export type RtcSignalingMessage = string | Buffer<ArrayBuffer>

export type RtcSignalingServerDeps = {
	appLog(tag: string, label: string, detail: string, tone: AppLogTone): void
	logHttp(req: Request, route: string, status: number, started: number, detail?: string): void
	logWsUpgrade(req: Request, channel: string, ok: boolean, detail?: string): void
	jsonResponse(value: unknown, status?: number): Response
}

export type VoiceServerDeps = {
	sockets: Set<ServerWebSocket<AppWebSocketData>>
	chromeApiUrl: string
	tlsEnabled: boolean
	port: number
	appLog(tag: string, label: string, detail: string, tone: AppLogTone): void
	errorMessage(error: unknown): string
	jsonResponse(value: unknown, status?: number): Response
	readJsonObject(req: Request): Promise<JsonReadResult>
	formatLogBytes(value: number): string
	compactLogValue(value: string, maxLength?: number): string
	shortId(value: string): string
}

export type ChromeWindowsPayload = {
	windows?: Array<{
		id?: number
		kind?: string
		tabs?: Array<{index?: number; title?: string; url?: string}>
	}>
}

export type ChromeEvalPayload = {
	ok?: boolean
	parsed?: unknown
	result?: string
}

export type ChromeEvalTarget = {
	windowId: number
	tabIndex: number
}

export type InterpreterVoiceSettingsPayload = {
	origin?: string
	values?: Record<string, string>
}

export type VoiceRtcDebugPayload = {
	state: string
	appPeerId: string
	relayPeerId: string
	sampleRate: number
	localAudioBytes: number
	localAudioRms: number
	relayAudioBytes: number
	relayAudioRms: number
	asrMessages: number
	asrTextMessages: number
	lastAsrType: string
	lastAsrText: string
	fallbackReason: string
	updatedAt: number
}

export type VoiceLocalStorageKey =
	| "metafor.interpreter.voice.url"
	| "metafor.interpreter.voice.wakeUrl"
	| "metafor.interpreter.voice.context"
	| "metafor.interpreter.voice.wakePhrases:v1"
	| "metafor.interpreter.voice.activationPhrases:v1"
	| "metafor.interpreter.voice.deactivationPhrases:v1"
	| "metafor.interpreter.voice.stopPhrases:v1"
	| "metafor.interpreter.voice.activationFuzzy:v1"
	| "metafor.interpreter.voice.deactivationFuzzy:v1"
	| "metafor.interpreter.voice.stopFuzzy:v1"
	| "metafor.interpreter.voice.deactivationMode:v1"
	| "metafor.interpreter.voice.recognitionTimeoutSeconds:v1"
	| "metafor.interpreter.voice.autoSend:v1"
	| "metafor.interpreter.voice.signalVolume:v1"
	| "metafor.interpreter.voice.signalVolume:v2"
	| "metafor.interpreter.hostTerminal.agentSoundEnabled:v1"
	| "metafor.interpreter.hostTerminal.agentSoundVolume:v1"
	| "metafor.interpreter.voice.agentReadyVolume:v1"
