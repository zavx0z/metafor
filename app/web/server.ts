import {file, serve, type Server, type ServerWebSocket} from "bun"
import {randomUUID} from "node:crypto"
import {existsSync, readFileSync, statSync, writeFileSync} from "node:fs"
import {networkInterfaces} from "node:os"
import {join, resolve} from "node:path"
import "dark/server"
import {createPtySessionManager, parsePtyClientMessage, type PtySocketData} from "@metafor/pty/server"
import {parseMarkdownTodo, updateTodoMarkdownItem} from "@ui/panes/todo-model"
import index from "./index.html"
import type {
	ClientMessage,
	ClientMaterializePayload,
	ClientRelayoutPayload,
	ServerSnapshotPayload,
} from "./server.t.ts"

type RtcSignalSocketData = {
	kind: "rtc-signal"
	room: string
	peerId: string
	connectedAt: number
}
type AppWebSocketData = {kind: "app-web"} | ({kind: "terminal"} & PtySocketData) | RtcSignalSocketData
type TodoMarkdownPayload = {
	ok: true
	path: string
	mtimeMs: number
	size: number
	text: string
	items: ReturnType<typeof parseMarkdownTodo>
}
type ChromeWindowsPayload = {
	windows?: Array<{
		id?: number
		kind?: string
		tabs?: Array<{index?: number; title?: string; url?: string}>
	}>
}
type ChromeEvalPayload = {
	ok?: boolean
	parsed?: unknown
	result?: string
}
type InterpreterVoiceSettingsPayload = {
	origin?: string
	values?: Record<string, string>
}
type AndroidControlCommand =
	| {type: "tap"; x: number; y: number}
	| {type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number}
	| {type: "key"; code: string}
	| {type: "launch"; packageName: string}

const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()
const rtcRooms = new Map<string, Map<string, ServerWebSocket<AppWebSocketData>>>()
const terminalSessions = createPtySessionManager({
	cwd: process.cwd(),
	shell: Bun.env.SHELL || "/bin/zsh",
})
const HOST = Bun.env.HOST ?? Bun.env.APP_WEB_HOST ?? "127.0.0.1"
const PORT = Number(Bun.env.PORT ?? 3000)
const TLS_ENABLED = Boolean(Bun.env.TLS_KEY_FILE && Bun.env.TLS_CERT_FILE)
const CHROME_API_URL = Bun.env.METAFOR_CHROME_API_URL ?? "http://localhost:7880"
const INTERPRETER_ORIGIN_PORT = Bun.env.METAFOR_INTERPRETER_PORT ?? "6500"
const APP_WEB_STARTED_AT = new Date()
const LOG_COLOR_ENABLED = Bun.env.NO_COLOR === undefined && Bun.env.FORCE_COLOR !== "0"
const VOICE_LOCAL_STORAGE_KEYS = [
	"metafor.interpreter.voice.url",
	"metafor.interpreter.voice.wakeUrl",
	"metafor.interpreter.voice.context",
	"metafor.interpreter.voice.wakePhrases:v1",
	"metafor.interpreter.voice.activationPhrases:v1",
	"metafor.interpreter.voice.deactivationPhrases:v1",
	"metafor.interpreter.voice.stopPhrases:v1",
	"metafor.interpreter.voice.activationFuzzy:v1",
	"metafor.interpreter.voice.deactivationFuzzy:v1",
	"metafor.interpreter.voice.stopFuzzy:v1",
	"metafor.interpreter.voice.deactivationMode:v1",
	"metafor.interpreter.voice.recognitionTimeoutSeconds:v1",
	"metafor.interpreter.voice.autoSend:v1",
	"metafor.interpreter.voice.signalVolume:v1",
	"metafor.interpreter.voice.signalVolume:v2",
	"metafor.interpreter.hostTerminal.agentSoundEnabled:v1",
	"metafor.interpreter.hostTerminal.agentSoundVolume:v1",
	"metafor.interpreter.voice.agentReadyVolume:v1",
] as const

const buildSnapshot = async (
	message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerSnapshotPayload> => {
	const src = message.src.trim() || "zavx0z/git"
	const snapshot = await boundary.bulkRuntime()
	return {type: "snapshot", src, snapshot}
}

boundary.entropy((event) => {
	const message = JSON.stringify({
		type: "force",
		parts: event.data.parts,
	})
	for (const socket of sockets) {
		if (socket.readyState === WebSocket.OPEN) socket.send(message)
	}
})

const server = serve<AppWebSocketData>({
	hostname: HOST,
	port: PORT,
	...(Bun.env.TLS_KEY_FILE && Bun.env.TLS_CERT_FILE
		? {
				tls: {
					key: file(Bun.env.TLS_KEY_FILE),
					cert: file(Bun.env.TLS_CERT_FILE),
					...(Bun.env.TLS_CA_FILE ? {ca: file(Bun.env.TLS_CA_FILE)} : {}),
					...(Bun.env.TLS_PASSPHRASE ? {passphrase: Bun.env.TLS_PASSPHRASE} : {}),
				},
			}
		: {}),
	routes: {
		"/": index,
		"/health": (req: Request) => {
			const started = Date.now()
			const response = Response.json({ok: true})
			if (Bun.env.APP_WEB_LOG_HEALTH === "1") logHttp(req, "health", response.status, started)
			return response
		},
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/ws": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const ok = wsServer.upgrade(req, {data: {kind: "app-web"}})
			logWsUpgrade(req, "app-web", ok)
			return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/hud/terminal/stream": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const url = new URL(req.url)
			const data: {kind: "terminal"; replay: boolean; connectedAt: number; sessionId?: string; sessionKey?: string; tmuxSession?: string} = {
				kind: "terminal",
				replay: url.searchParams.get("replay") !== "0",
				connectedAt: Date.now(),
			}
			const session = url.searchParams.get("session")
			if (session !== null && session.length > 0) data.sessionId = session
			const key = url.searchParams.get("key")
			if (key !== null && key.length > 0) data.sessionKey = key
			const tmux = url.searchParams.get("tmux")
			if (tmux !== null && tmux.length > 0) data.tmuxSession = tmux
			const ok = wsServer.upgrade(req, {data})
			logWsUpgrade(req, "terminal", ok, terminalUpgradeDetail(data))
			return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/hud/webrtc/signaling": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const url = new URL(req.url)
			const room = sanitizeRtcId(url.searchParams.get("room") ?? "app-web")
			const peerId = sanitizeRtcId(url.searchParams.get("peer") ?? randomUUID())
			if (room === null || peerId === null) {
				logHttp(req, "rtc.signal.invalid", 400, Date.now(), "invalid room or peer id")
				return jsonResponse({ok: false, error: "invalid WebRTC room or peer id"}, 400)
			}
			const ok = wsServer.upgrade(req, {
				data: {
					kind: "rtc-signal",
					room,
					peerId,
					connectedAt: Date.now(),
				},
			})
			logWsUpgrade(req, "rtc-signal", ok, `room=${room} peer=${peerId}`)
			return ok ? undefined : new Response("WebRTC signaling upgrade failed", {status: 426})
		},
		"/hud/todo": (req: Request) => {
			const started = Date.now()
			if (req.method !== "GET") {
				logHttp(req, "todo.read", 405, started, "method not allowed")
				return new Response("Method Not Allowed", {status: 405})
			}
			const response = todoMarkdownResponse()
			logHttp(req, "todo.read", response.status, started)
			return response
		},
		"/hud/voice/settings": async (req: Request) => {
			const started = Date.now()
			if (req.method === "GET") {
				const response = await readInterpreterVoiceSettingsResponse()
				logHttp(req, "voice.read", response.status, started)
				return response
			}
			if (req.method === "POST") {
				const response = await writeInterpreterVoiceSettingsResponse(req)
				logHttp(req, "voice.write", response.status, started)
				return response
			}
			logHttp(req, "voice", 405, started, "method not allowed")
			return new Response("Method Not Allowed", {status: 405})
		},
		"/hud/android/control": async (req: Request) => {
			const started = Date.now()
			if (req.method !== "POST") {
				logHttp(req, "android", 405, started, "method not allowed")
				return new Response("Method Not Allowed", {status: 405})
			}
			const response = await broadcastAndroidControlResponse(req, started)
			return response
		},
	},
	fetch: async (req: Request) => {
		const url = new URL(req.url)
		if (url.pathname === "/hud/interpreter/processes" || url.pathname.startsWith("/hud/interpreter/processes/")) {
			return await proxyInterpreterRequest(req, url)
		}
		const todoItem = /^\/hud\/todo\/items\/([^/]+)$/.exec(url.pathname)
		if ((req.method === "PATCH" || req.method === "POST") && todoItem !== null) {
			const started = Date.now()
			const response = await patchTodoItem(decodeURIComponent(todoItem[1]!), req, started)
			return response
		}
		logHttp(req, "not-found", 404, Date.now())
		return new Response("Not Found", {status: 404})
	},
	websocket: {
		open(ws) {
			if (ws.data.kind === "rtc-signal") {
				attachRtcSignalSocket(ws)
				return
				}
				if (ws.data.kind === "terminal") {
					try {
						const session = terminalSessions.attach(ws as ServerWebSocket<PtySocketData>)
						const info = session.info()
						appLog("PTY", "attached", `session=${shortId(info.id)} key=${info.key ?? "-"} tmux=${info.tmuxSession ?? "-"} clients=${info.clients}`, "cyan")
				} catch (error) {
					appLog("ERR", "terminal attach failed", errorMessage(error), "red")
					if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
						type: "terminal.error",
						message: error instanceof Error ? error.message : "shell failed",
					}))
					ws.close(1011, "shell failed")
					}
					return
				}
				sockets.add(ws)
				appLog("WS", "app client opened", `clients=${sockets.size}`, "green")
			},
		message(ws, message) {
			if (ws.data.kind === "rtc-signal") {
				handleRtcSignalMessage(ws, message)
				return
			}
			if (ws.data.kind === "terminal") {
				const payload = parsePtyClientMessage(message)
				const session = ws.data.session
				if (payload === null || session === undefined) return
				if (payload.type === "input.write") {
					session.write(payload.data, payload.localEchoId)
					return
				}
				if (payload.type === "terminal.clear") {
					session.clearScrollback()
					return
				}
				session.resize(payload.size)
				return
			}

			let payload: ClientMessage | null = null
			try {
				payload = JSON.parse(String(message)) as ClientMessage
			} catch {
				return
			}

			if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
				return
			}

			if (payload.type === "materialize" || payload.type === "relayout") {
				const started = Date.now()
				appLog("WS", "snapshot requested", `type=${payload.type} src=${payload.src.trim() || "zavx0z/git"}`, "cyan")
				void buildSnapshot(payload)
					.then((world) => {
						appLog("WS", "snapshot ready", `type=${payload.type} in ${Date.now() - started}ms`, "green")
						ws.send(JSON.stringify(world))
					})
					.catch((error) => {
						appLog("ERR", "snapshot failed", `type=${payload.type} in ${Date.now() - started}ms error=${errorMessage(error)}`, "red")
						ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
					})
				return
			}
		},
		close(ws) {
			if (ws.data.kind === "rtc-signal") {
				detachRtcSignalSocket(ws)
				return
			}
			if (ws.data.kind === "terminal") {
				const session = ws.data.session
				session?.detach(ws as ServerWebSocket<PtySocketData>)
				if (session !== undefined) {
					const info = session.info()
					appLog("PTY", "detached", `session=${shortId(info.id)} key=${info.key ?? "-"} tmux=${info.tmuxSession ?? "-"} clients=${info.clients}`, "gray")
				}
				delete ws.data.session
				return
			}
			sockets.delete(ws)
			appLog("WS", "app client closed", `clients=${sockets.size}`, "gray")
		},
	},
})

function todoMarkdownResponse(): Response {
	const payload = todoMarkdownPayload()
	if (payload === null) return jsonResponse({ok: false, path: todoMarkdownPath(), error: "TODO.md not found"}, 404)
	return jsonResponse(payload)
}

function todoMarkdownPayload(): TodoMarkdownPayload | null {
	const path = todoMarkdownPath()
	if (!existsSync(path)) return null
	const stat = statSync(path)
	const text = readFileSync(path, "utf8")
	return {
		ok: true,
		path,
		mtimeMs: stat.mtimeMs,
		size: stat.size,
		text,
		items: parseMarkdownTodo(text),
	}
}

function todoMarkdownPath(): string {
	return resolve(process.cwd(), "TODO.md")
}

function readTodoMarkdownForEdit(): string {
	const path = todoMarkdownPath()
	return existsSync(path) ? readFileSync(path, "utf8") : "# MetaFor TODO\n"
}

async function patchTodoItem(id: string, req: Request, started = Date.now()): Promise<Response> {
	const parsed = await readJsonObject(req)
	if (parsed.error !== undefined) {
		logHttp(req, "todo.patch", 400, started, `id=${id} error=${parsed.error}`)
		return jsonResponse({ok: false, error: parsed.error}, 400)
	}
	const checked = asBoolean(parsed.body["checked"])
	if (checked === undefined) {
		logHttp(req, "todo.patch", 400, started, `id=${id} checked=invalid`)
		return jsonResponse({ok: false, error: "checked must be boolean"}, 400)
	}
	try {
		const result = updateTodoMarkdownItem(readTodoMarkdownForEdit(), id, {checked})
		const response = writeTodoMarkdown(result.markdown)
		logHttp(req, "todo.patch", response.status, started, `id=${id} checked=${checked}`)
		return response
	} catch (error) {
		logHttp(req, "todo.patch", 400, started, `id=${id} error=${errorMessage(error)}`)
		return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 400)
	}
}

function writeTodoMarkdown(text: string): Response {
	const path = todoMarkdownPath()
	writeFileSync(path, text, "utf8")
	const payload = todoMarkdownPayload()
	if (payload === null) return jsonResponse({ok: false, path, error: "TODO.md not found after write"}, 500)
	const message = JSON.stringify({type: "hud-todo-changed", todo: payload})
	for (const socket of sockets) {
		if (socket.data.kind === "app-web" && socket.readyState === WebSocket.OPEN) socket.send(message)
	}
	return jsonResponse(payload)
}

async function readInterpreterVoiceSettingsResponse(): Promise<Response> {
	try {
		const payload = await readInterpreterVoiceSettings()
		return jsonResponse({ok: true, ...payload})
	} catch (error) {
		appLog("ERR", "voice settings read", errorMessage(error), "red")
		return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 502)
	}
}

async function writeInterpreterVoiceSettingsResponse(req: Request): Promise<Response> {
	const parsed = await readJsonObject(req)
	if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
	const values = asVoiceSettingsUpdate(parsed.body["values"])
	if (values === null) return jsonResponse({ok: false, error: "values must be an object of voice setting keys"}, 400)
	try {
		const payload = await writeInterpreterVoiceSettings(values)
		return jsonResponse({ok: true, ...payload})
	} catch (error) {
		appLog("ERR", "voice settings write", errorMessage(error), "red")
		return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 502)
	}
}

async function broadcastAndroidControlResponse(req: Request, started = Date.now()): Promise<Response> {
	const parsed = await readJsonObject(req)
	if (parsed.error !== undefined) {
		logHttp(req, "android", 400, started, `error=${parsed.error}`)
		return jsonResponse({ok: false, error: parsed.error}, 400)
	}
	const command = asAndroidControlCommand(parsed.body)
	if (command === null) {
		logHttp(req, "android", 400, started, "invalid command")
		return jsonResponse({ok: false, error: "invalid android control command"}, 400)
	}
	const message = JSON.stringify({type: "hud-android-control", command})
	let clients = 0
	for (const socket of sockets) {
		if (socket.data.kind !== "app-web" || socket.readyState !== WebSocket.OPEN) continue
		socket.send(message)
		clients += 1
	}
	logHttp(req, "android", 200, started, `${command.type} clients=${clients}`)
	return jsonResponse({ok: true, clients, command})
}

async function readInterpreterVoiceSettings(): Promise<InterpreterVoiceSettingsPayload> {
	const target = await findInterpreterTab()
	const keysJson = JSON.stringify(VOICE_LOCAL_STORAGE_KEYS)
	const js = [
		`const keys = ${keysJson};`,
		"const values = {};",
		"for (const key of keys) {",
		"  const value = localStorage.getItem(key);",
		"  if (value !== null) values[key] = value;",
		"}",
		"return JSON.stringify({origin: location.origin, values});",
	].join("\n")
	return await evalInterpreterVoiceSettings(target, js)
}

async function writeInterpreterVoiceSettings(values: Record<string, string | null>): Promise<InterpreterVoiceSettingsPayload> {
	const target = await findInterpreterTab()
	const valuesJson = JSON.stringify(values)
	const js = [
		`const values = ${valuesJson};`,
		"for (const [key, value] of Object.entries(values)) {",
		"  if (value === null) localStorage.removeItem(key);",
		"  else localStorage.setItem(key, String(value));",
		"}",
		"return JSON.stringify({origin: location.origin, values});",
	].join("\n")
	return await evalInterpreterVoiceSettings(target, js)
}

async function findInterpreterTab(): Promise<{windowId: number; tabIndex: number}> {
	const started = Date.now()
	const response = await fetch(`${CHROME_API_URL}/windows`, {signal: AbortSignal.timeout(1500)})
	if (!response.ok) throw new Error(`chrome windows ${response.status}`)
	const payload = await response.json() as ChromeWindowsPayload
	for (const window of payload.windows ?? []) {
		if (window.kind !== "browser" || typeof window.id !== "number") continue
		for (const tab of window.tabs ?? []) {
			if (typeof tab.index !== "number" || !isInterpreterTab(tab.url)) continue
			appLog("EXT", "chrome interpreter tab", `window=${window.id} tab=${tab.index} in ${Date.now() - started}ms`, "cyan")
			return {windowId: window.id, tabIndex: tab.index}
		}
	}
	appLog("WARN", "chrome interpreter tab", `not found in ${Date.now() - started}ms`, "yellow")
	throw new Error("interpreter tab not found")
}

function isInterpreterTab(rawUrl: string | undefined): boolean {
	if (rawUrl === undefined) return false
	try {
		const url = new URL(rawUrl)
		return url.port === INTERPRETER_ORIGIN_PORT && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)
	} catch {
		return false
	}
}

async function evalInterpreterVoiceSettings(target: {windowId: number; tabIndex: number}, js: string): Promise<InterpreterVoiceSettingsPayload> {
	const started = Date.now()
	const response = await fetch(`${CHROME_API_URL}/eval`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({...target, js}),
		signal: AbortSignal.timeout(2000),
	})
	if (!response.ok) throw new Error(`chrome eval ${response.status}`)
	const payload = await response.json() as ChromeEvalPayload
	appLog("EXT", "chrome eval", `window=${target.windowId} tab=${target.tabIndex} status=${response.status} in ${Date.now() - started}ms`, "cyan")
	const parsed = parseChromeEvalParsed(payload)
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {values: {}}
	const record = parsed as {origin?: unknown; values?: unknown}
	const origin = typeof record.origin === "string" ? record.origin : undefined
	const values = asVoiceSettingsValues(record.values) ?? {}
	return origin === undefined ? {values} : {origin, values}
}

async function proxyInterpreterRequest(req: Request, url: URL): Promise<Response> {
	const started = Date.now()
	const upstreamPath = url.pathname.slice("/hud/interpreter".length) || "/"
	if (!isAllowedInterpreterProxyPath(upstreamPath)) {
		logHttp(req, "interp.proxy", 404, started, `blocked upstream=${upstreamPath}`)
		return jsonResponse({ok: false, error: "interpreter route not allowed"}, 404)
	}
	const upstream = new URL(`http://127.0.0.1:${INTERPRETER_ORIGIN_PORT}${upstreamPath}`)
	upstream.search = url.search
	const headers = new Headers()
	const contentType = req.headers.get("content-type")
	if (contentType !== null) headers.set("content-type", contentType)
	try {
		const init: RequestInit = {
			method: req.method,
			headers,
			signal: AbortSignal.timeout(8000),
		}
		if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer()
		const response = await fetch(upstream, {
			...init,
		})
		logHttp(req, "interp.proxy", response.status, started)
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				"content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
			},
		})
	} catch (error) {
		logHttp(req, "interp.proxy", 502, started, `upstream=${upstream.pathname}${upstream.search} error=${errorMessage(error)}`)
		return jsonResponse({
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			hint: `interpreter http api is expected on 127.0.0.1:${INTERPRETER_ORIGIN_PORT}`,
		}, 502)
	}
}

function isAllowedInterpreterProxyPath(path: string): boolean {
	if (path === "/processes") return true
	if (path === "/processes/resolve" || path === "/processes/focus") return true
	return /^\/processes\/[^/]+(?:\/(?:action|breakpoint|breakpoints|context|focus|modules|source))?$/.test(path)
}

function parseChromeEvalParsed(payload: ChromeEvalPayload): unknown {
	if (payload.parsed !== undefined && payload.parsed !== null) return payload.parsed
	if (typeof payload.result !== "string" || payload.result.length === 0) return null
	try {
		return JSON.parse(payload.result)
	} catch {
		return null
	}
}

function asVoiceSettingsUpdate(value: unknown): Record<string, string | null> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	const next: Record<string, string | null> = {}
	for (const [key, item] of Object.entries(value)) {
		if (!isVoiceLocalStorageKey(key)) continue
		if (typeof item === "string") next[key] = item
		else if (item === null) next[key] = null
	}
	return Object.keys(next).length > 0 ? next : null
}

function asVoiceSettingsValues(value: unknown): Record<string, string> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	const next: Record<string, string> = {}
	for (const [key, item] of Object.entries(value)) {
		if (isVoiceLocalStorageKey(key) && typeof item === "string") next[key] = item
	}
	return next
}

function asAndroidControlCommand(value: Record<string, unknown>): AndroidControlCommand | null {
	const type = value["type"]
	if (type === "tap") {
		const x = finiteNumber(value["x"])
		const y = finiteNumber(value["y"])
		return x === null || y === null ? null : {type, x, y}
	}
	if (type === "swipe") {
		const x1 = finiteNumber(value["x1"])
		const y1 = finiteNumber(value["y1"])
		const x2 = finiteNumber(value["x2"])
		const y2 = finiteNumber(value["y2"])
		const durationMs = finiteNumber(value["durationMs"])
		if (x1 === null || y1 === null || x2 === null || y2 === null) return null
		return durationMs === null ? {type, x1, y1, x2, y2} : {type, x1, y1, x2, y2, durationMs}
	}
	if (type === "key") {
		const code = value["code"]
		return typeof code === "string" && code.length > 0 ? {type, code} : null
	}
	if (type === "launch") {
		const packageName = value["packageName"]
		return typeof packageName === "string" && packageName.length > 0 ? {type, packageName} : null
	}
	return null
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isVoiceLocalStorageKey(key: string): key is typeof VOICE_LOCAL_STORAGE_KEYS[number] {
	return (VOICE_LOCAL_STORAGE_KEYS as readonly string[]).includes(key)
}

async function readJsonObject(req: Request): Promise<{body: Record<string, unknown>; error?: undefined} | {body: Record<string, never>; error: string}> {
	try {
		const value = await req.json()
		if (typeof value === "object" && value !== null && !Array.isArray(value)) return {body: value as Record<string, unknown>}
		return {body: {}, error: "body must be a JSON object"}
	} catch (error) {
		return {body: {}, error: error instanceof Error ? error.message : String(error)}
	}
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined
}

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {"content-type": "application/json; charset=utf-8"},
	})
}

function attachRtcSignalSocket(ws: ServerWebSocket<AppWebSocketData>): void {
	if (ws.data.kind !== "rtc-signal") return
	const peers = rtcRoomPeers(ws.data.room)
	const requestedPeerId = ws.data.peerId
	let peerId = requestedPeerId
	while (peers.has(peerId)) peerId = `${requestedPeerId}-${randomUUID().slice(0, 8)}`
	ws.data.peerId = peerId
	const existingPeers = [...peers.keys()]
	peers.set(peerId, ws)
	appLog("RTC", "peer joined", `room=${ws.data.room} peer=${peerId} peers=${peers.size}`, "green")
	sendRtcJson(ws, {
		type: "hello",
		room: ws.data.room,
		peerId,
		peers: existingPeers,
	})
	broadcastRtcSignal(ws.data.room, peerId, {
		type: "peer-joined",
		peerId,
	})
}

function detachRtcSignalSocket(ws: ServerWebSocket<AppWebSocketData>): void {
	if (ws.data.kind !== "rtc-signal") return
	const {room, peerId} = ws.data
	const peers = rtcRooms.get(room)
	if (peers === undefined) return
	if (peers.get(peerId) === ws) peers.delete(peerId)
	if (peers.size === 0) {
		rtcRooms.delete(room)
		appLog("RTC", "room closed", `room=${room} peer=${peerId}`, "gray")
		return
	}
	appLog("RTC", "peer left", `room=${room} peer=${peerId} peers=${peers.size}`, "gray")
	broadcastRtcSignal(room, peerId, {
		type: "peer-left",
		peerId,
	})
}

function handleRtcSignalMessage(ws: ServerWebSocket<AppWebSocketData>, message: string | Buffer<ArrayBuffer>): void {
	if (ws.data.kind !== "rtc-signal" || typeof message !== "string" || message.length > 256 * 1024) return
	let payload: Record<string, unknown>
	try {
		const parsed = JSON.parse(message) as unknown
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return
		payload = parsed as Record<string, unknown>
	} catch {
		return
	}
	const to = typeof payload.to === "string" ? sanitizeRtcId(payload.to) : null
	const envelope = {
		...payload,
		from: ws.data.peerId,
		room: ws.data.room,
	}
	if (to !== null) {
		const target = rtcRooms.get(ws.data.room)?.get(to)
		if (target !== undefined && target.readyState === WebSocket.OPEN) {
			appLog("RTC", "signal direct", `room=${ws.data.room} from=${ws.data.peerId} to=${to} type=${String(payload.type ?? "-")}`, "cyan")
			sendRtcJson(target, envelope)
		} else {
			appLog("WARN", "signal target missing", `room=${ws.data.room} from=${ws.data.peerId} to=${to}`, "yellow")
		}
		return
	}
	appLog("RTC", "signal broadcast", `room=${ws.data.room} from=${ws.data.peerId} type=${String(payload.type ?? "-")}`, "cyan")
	broadcastRtcSignal(ws.data.room, ws.data.peerId, envelope)
}

function rtcRoomPeers(room: string): Map<string, ServerWebSocket<AppWebSocketData>> {
	const existing = rtcRooms.get(room)
	if (existing !== undefined) return existing
	const next = new Map<string, ServerWebSocket<AppWebSocketData>>()
	rtcRooms.set(room, next)
	return next
}

function broadcastRtcSignal(room: string, fromPeerId: string, payload: Record<string, unknown>): void {
	const peers = rtcRooms.get(room)
	if (peers === undefined) return
	for (const [peerId, socket] of peers) {
		if (peerId === fromPeerId || socket.readyState !== WebSocket.OPEN) continue
		sendRtcJson(socket, payload)
	}
}

function sendRtcJson(ws: ServerWebSocket<AppWebSocketData>, payload: Record<string, unknown>): void {
	ws.send(JSON.stringify(payload))
}

function sanitizeRtcId(value: string): string | null {
	const normalized = value.trim()
	if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(normalized)) return null
	return normalized
}

type AppLogTone = "cyan" | "gray" | "green" | "magenta" | "red" | "yellow"

function appLog(tag: string, label: string, detail: string, tone: AppLogTone): void {
	const prefix = paintLog(tone, `[${tag.padEnd(4)}]`)
	const time = paintLog("gray", formatLogTime(new Date()))
	console.log(`${prefix} ${time}  ${paintLog(tone, label.padEnd(14))} ${detail}`)
}

function appLogBanner(): void {
	console.log("")
	console.log(paintLog("cyan", "+--------------------------------------+"))
	console.log(paintLog("cyan", "| MetaFor app/web server               |"))
	console.log(paintLog("cyan", "+--------------------------------------+"))
}

function logHttp(req: Request, route: string, status: number, started: number, detail = ""): void {
	const url = new URL(req.url)
	const tone = status >= 500 ? "red" : status >= 400 ? "yellow" : "green"
	const path = compactLogPath(url)
	const suffix = detail.length > 0 ? ` ${detail}` : ""
	appLog("HTTP", route, `${status} ${Date.now() - started}ms ${req.method} ${path}${suffix}`, tone)
}

function logWsUpgrade(req: Request, channel: string, ok: boolean, detail = ""): void {
	const url = new URL(req.url)
	const suffix = detail.length > 0 ? ` ${detail}` : ""
	appLog(ok ? "WS" : "WARN", `${channel} upgrade`, `${compactLogPath(url)} ${ok ? "accepted" : "failed"}${suffix}`, ok ? "green" : "yellow")
}

function compactLogPath(url: URL): string {
	const aliases: Array<[string, string]> = [
		["/hud/interpreter", "/interp"],
		["/hud/android", "/android"],
		["/hud/terminal", "/terminal"],
		["/hud/webrtc", "/rtc"],
		["/hud/voice", "/voice"],
		["/hud/todo", "/todo"],
	]
	let path = url.pathname
	for (const [prefix, alias] of aliases) {
		if (path === prefix || path.startsWith(`${prefix}/`)) {
			path = `${alias}${path.slice(prefix.length)}`
			break
		}
	}
	return `${path}${url.search}`
}

function terminalUpgradeDetail(data: {replay: boolean; sessionId?: string; sessionKey?: string; tmuxSession?: string}): string {
	return [
		`replay=${data.replay}`,
		data.sessionId === undefined ? undefined : `session=${shortId(data.sessionId)}`,
		data.sessionKey === undefined ? undefined : `key=${data.sessionKey}`,
		data.tmuxSession === undefined ? undefined : `tmux=${data.tmuxSession}`,
	].filter((item): item is string => item !== undefined).join(" ")
}

function shortId(value: string): string {
	return value.length <= 8 ? value : value.slice(0, 8)
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function formatLogTime(date: Date): string {
	const hours = String(date.getHours()).padStart(2, "0")
	const minutes = String(date.getMinutes()).padStart(2, "0")
	const seconds = String(date.getSeconds()).padStart(2, "0")
	const ms = String(date.getMilliseconds()).padStart(3, "0")
	return `${hours}:${minutes}:${seconds}.${ms}`
}

function formatLogDateTime(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day} ${formatLogTime(date)}`
}

function paintLog(tone: AppLogTone, value: string): string {
	if (!LOG_COLOR_ENABLED) return value
	const colors: Record<AppLogTone | "reset", string> = {
		cyan: "\x1b[36m",
		gray: "\x1b[90m",
		green: "\x1b[32m",
		magenta: "\x1b[35m",
		red: "\x1b[31m",
		reset: "\x1b[0m",
		yellow: "\x1b[33m",
	}
	return `${colors[tone]}${value}${colors.reset}`
}

function printServerUrls(): void {
	const protocol = TLS_ENABLED ? "https" : "http"
	const port = server.port
	const urls = new Set<string>()
	urls.add(server.url.href)
	if (HOST === "0.0.0.0" || HOST === "::") {
		urls.add(`${protocol}://localhost:${port}/`)
		for (const address of localNetworkAddresses()) urls.add(`${protocol}://${address}:${port}/`)
	}
	appLogBanner()
	appLog("OK", `${TLS_ENABLED ? "HTTPS" : "HTTP"} online`, `pid=${process.pid} host=${HOST} port=${port}`, "green")
	appLog("CFG", "boundary", `path=${Bun.env.BOUNDARY_PATH ?? "(default)"}`, "magenta")
	if (TLS_ENABLED) {
		appLog("TLS", "key", Bun.env.TLS_KEY_FILE ?? "-", "green")
		appLog("TLS", "cert", Bun.env.TLS_CERT_FILE ?? "-", "green")
	} else {
		appLog("TLS", "disabled", "plain HTTP", "gray")
	}
	appLog("CFG", "chrome api", CHROME_API_URL, "magenta")
	appLog("CFG", "interpreter api", `http://127.0.0.1:${INTERPRETER_ORIGIN_PORT}`, "magenta")
	for (const url of urls) appLog("URL", "app entry", url, "cyan")
	appLog("URL", "rtc signal", `${protocol === "https" ? "wss" : "ws"}://<host>:${port}/hud/webrtc/signaling`, "cyan")
	appLog("TIME", "started", formatLogDateTime(APP_WEB_STARTED_AT), "gray")
}

function localNetworkAddresses(): string[] {
	const addresses: string[] = []
	for (const interfaces of Object.values(networkInterfaces())) {
		for (const item of interfaces ?? []) {
			if (item.family !== "IPv4" || item.internal) continue
			addresses.push(item.address)
		}
	}
	return addresses
}

printServerUrls()
