import {file, serve, type Server, type ServerWebSocket} from "bun"
import {existsSync, readFileSync, statSync, writeFileSync} from "node:fs"
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

type AppWebSocketData = {kind: "app-web"} | ({kind: "terminal"} & PtySocketData)
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

const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()
const terminalSessions = createPtySessionManager({
	cwd: process.cwd(),
	shell: Bun.env.SHELL || "/bin/zsh",
})
const CHROME_API_URL = Bun.env.METAFOR_CHROME_API_URL ?? "http://localhost:7880"
const INTERPRETER_ORIGIN_PORT = Bun.env.METAFOR_INTERPRETER_PORT ?? "6500"
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
	port: Number(Bun.env.PORT ?? 3000),
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
		"/health": () => Response.json({ok: true}),
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/ws": (req: Request, wsServer: Server<AppWebSocketData>) =>
			wsServer.upgrade(req, {data: {kind: "app-web"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426}),
		"/hud/terminal/stream": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const url = new URL(req.url)
			const data: {kind: "terminal"; replay: boolean; connectedAt: number; sessionId?: string} = {
				kind: "terminal",
				replay: url.searchParams.get("replay") !== "0",
				connectedAt: Date.now(),
			}
			const session = url.searchParams.get("session")
			if (session !== null && session.length > 0) data.sessionId = session
			return wsServer.upgrade(req, {data}) ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/hud/todo": (req: Request) => {
			if (req.method !== "GET") return new Response("Method Not Allowed", {status: 405})
			return todoMarkdownResponse()
		},
		"/hud/voice/settings": async (req: Request) => {
			if (req.method === "GET") return await readInterpreterVoiceSettingsResponse()
			if (req.method === "POST") return await writeInterpreterVoiceSettingsResponse(req)
			return new Response("Method Not Allowed", {status: 405})
		},
	},
	fetch: async (req: Request) => {
		const url = new URL(req.url)
		const todoItem = /^\/hud\/todo\/items\/([^/]+)$/.exec(url.pathname)
		if ((req.method === "PATCH" || req.method === "POST") && todoItem !== null) {
			return await patchTodoItem(decodeURIComponent(todoItem[1]!), req)
		}
		return new Response("Not Found", {status: 404})
	},
	websocket: {
		open(ws) {
			if (ws.data.kind === "terminal") {
				try {
					terminalSessions.attach(ws as ServerWebSocket<PtySocketData>)
				} catch (error) {
					if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
						type: "terminal.error",
						message: error instanceof Error ? error.message : "shell failed",
					}))
					ws.close(1011, "shell failed")
				}
				return
			}
			sockets.add(ws)
		},
		message(ws, message) {
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
				void buildSnapshot(payload)
					.then((world) => ws.send(JSON.stringify(world)))
					.catch((error) => {
						ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
					})
				return
			}
		},
		close(ws) {
			if (ws.data.kind === "terminal") {
				ws.data.session?.detach(ws as ServerWebSocket<PtySocketData>)
				delete ws.data.session
				return
			}
			sockets.delete(ws)
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

async function patchTodoItem(id: string, req: Request): Promise<Response> {
	const parsed = await readJsonObject(req)
	if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
	const checked = asBoolean(parsed.body["checked"])
	if (checked === undefined) return jsonResponse({ok: false, error: "checked must be boolean"}, 400)
	try {
		const result = updateTodoMarkdownItem(readTodoMarkdownForEdit(), id, {checked})
		return writeTodoMarkdown(result.markdown)
	} catch (error) {
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
		return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 502)
	}
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
	const response = await fetch(`${CHROME_API_URL}/windows`, {signal: AbortSignal.timeout(1500)})
	if (!response.ok) throw new Error(`chrome windows ${response.status}`)
	const payload = await response.json() as ChromeWindowsPayload
	for (const window of payload.windows ?? []) {
		if (window.kind !== "browser" || typeof window.id !== "number") continue
		for (const tab of window.tabs ?? []) {
			if (typeof tab.index !== "number" || !isInterpreterTab(tab.url)) continue
			return {windowId: window.id, tabIndex: tab.index}
		}
	}
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
	const response = await fetch(`${CHROME_API_URL}/eval`, {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({...target, js}),
		signal: AbortSignal.timeout(2000),
	})
	if (!response.ok) throw new Error(`chrome eval ${response.status}`)
	const payload = await response.json() as ChromeEvalPayload
	const parsed = parseChromeEvalParsed(payload)
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {values: {}}
	const record = parsed as {origin?: unknown; values?: unknown}
	const origin = typeof record.origin === "string" ? record.origin : undefined
	const values = asVoiceSettingsValues(record.values) ?? {}
	return origin === undefined ? {values} : {origin, values}
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

console.log(server.url.href)
