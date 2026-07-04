import {file, serve, type Server, type ServerWebSocket} from "bun"
import {Buffer} from "node:buffer"
import {networkInterfaces} from "node:os"
import {join} from "node:path"
import "dark/server"
import type {
	AppClientAsset,
	AppClientBundle,
	AppLogTone,
	AppWebSocketData,
	BoundaryUpdateMessage,
	ClientMaterializePayload,
	ClientMessage,
	ClientRelayoutPayload,
	EnergyBridgeSocketData,
	MatrixBridgeSocketData,
	ServerSnapshotPayload,
} from "./server.t.ts"
import {DEFAULT_BULK_SCENE_SRC} from "bulk/settings"
import {energyBridgeAuth, readEnergyBridgeMessage} from "./energy-bridge.ts"
import {matrixBridgeAuth, readMatrixBridgeMessage} from "./matrix-bridge.ts"

const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()
const matrixBridgeSockets = new Set<ServerWebSocket<AppWebSocketData>>()
const energyBridgeSockets = new Set<ServerWebSocket<AppWebSocketData>>()
const HOST = Bun.env.HOST ?? Bun.env.APP_WEB_HOST ?? "127.0.0.1"
const PORT = Number(Bun.env.PORT ?? 3000)
const TLS_ENABLED = Boolean(Bun.env.TLS_KEY_FILE && Bun.env.TLS_CERT_FILE)
const MATRIX_BRIDGE_TOKEN = Bun.env.MATRIX_BRIDGE_TOKEN?.trim() || null
const ENERGY_BRIDGE_TOKEN = Bun.env.ENERGY_BRIDGE_TOKEN?.trim() || null
const REDIRECT_ENABLED = TLS_ENABLED && (Bun.env.APP_WEB_REDIRECT === "1" || (Bun.env.APP_WEB_REDIRECT !== "0" && PORT === 443))
const REDIRECT_HOST = Bun.env.APP_WEB_REDIRECT_HOST ?? HOST
const REDIRECT_PORT = Number(Bun.env.APP_WEB_REDIRECT_PORT ?? 80)
const APP_CLIENT_SOURCE_MAPS_ENABLED = Bun.env.APP_WEB_CLIENT_SOURCEMAP === "0"
	? false
	: Bun.env.APP_WEB_CLIENT_SOURCEMAP === "1"
		|| Bun.env.NETWORK_TMUX_MODE === "dev"
		|| (Bun.env.BUN_ENV !== "production" && Bun.env.NODE_ENV !== "production")
const APP_WEB_STARTED_AT = new Date()
const LOG_COLOR_ENABLED = Bun.env.NO_COLOR === undefined && Bun.env.FORCE_COLOR !== "0"
const APP_CLIENT_BUNDLE = await buildAppClientBundle()
const redirectServer = REDIRECT_ENABLED ? startHttpRedirectServer() : null

const buildSnapshot = async (
	message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerSnapshotPayload> => {
	const src = message.src.trim() || DEFAULT_BULK_SCENE_SRC
	const snapshot = await boundary.bulkRuntime()
	return {type: "snapshot", src, snapshot}
}

boundary.entropy((event) => {
	broadcastForceMessage(event.data)
	broadcastMatrixForceMessage(event.data)
	broadcastEnergyForceMessage(event.data)
})

function broadcastForceMessage(message: BoundaryUpdateMessage): number {
	const payload = JSON.stringify({
		type: "force",
		parts: message.parts,
	})
	let clients = 0
	for (const socket of sockets) {
		if (socket.readyState !== WebSocket.OPEN) continue
		socket.send(payload)
		clients += 1
	}
	return clients
}

function broadcastMatrixForceMessage(
	message: BoundaryUpdateMessage,
	exceptSocket?: ServerWebSocket<AppWebSocketData>,
): number {
	const payload = JSON.stringify({
		type: "force",
		parts: message.parts,
	})
	let clients = 0
	for (const socket of matrixBridgeSockets) {
		if (socket === exceptSocket || socket.readyState !== WebSocket.OPEN) continue
		socket.send(payload)
		clients += 1
	}
	return clients
}

function broadcastEnergyForceMessage(
	message: BoundaryUpdateMessage,
	exceptSocket?: ServerWebSocket<AppWebSocketData>,
): number {
	const payload = JSON.stringify({
		type: "force",
		parts: message.parts,
	})
	let clients = 0
	for (const socket of energyBridgeSockets) {
		if (socket === exceptSocket || socket.readyState !== WebSocket.OPEN) continue
		socket.send(payload)
		clients += 1
	}
	return clients
}

function broadcastEnergyProcessTask(task: import("boundary").ProcessTask): number {
	const payload = JSON.stringify({type: "process-task", version: 1, task})
	let clients = 0
	for (const socket of energyBridgeSockets) {
		if (socket.readyState !== WebSocket.OPEN) continue
		socket.send(payload)
		clients += 1
	}
	return clients
}

async function sendMatrixSnapshot(socket: ServerWebSocket<AppWebSocketData>, reason: string): Promise<void> {
	const started = Date.now()
	try {
		const snapshot = await boundary.matrixRuntime()
		if (socket.readyState !== WebSocket.OPEN) return
		socket.send(JSON.stringify({type: "matrix-snapshot", version: 1, reason, snapshot}))
		appLog("WS", "matrix snapshot", `reason=${reason} in ${Date.now() - started}ms`, "green")
	} catch (error) {
		appLog("ERR", "matrix snapshot failed", `reason=${reason} error=${errorMessage(error)}`, "red")
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
		}
	}
}

async function handleMatrixBridgeMessage(
	socket: ServerWebSocket<AppWebSocketData>,
	raw: string | Buffer,
): Promise<void> {
	const payload = readMatrixBridgeMessage(raw)
	if (payload === null) {
		appLog("WS", "matrix bridge ignored", "invalid message", "yellow")
		return
	}

	if (payload.type === "hello") {
		appLog("WS", "matrix hello", `pid=${payload.pid} started=${payload.startedAt}`, "cyan")
		return
	}

	if (payload.type === "snapshot-request") {
		await sendMatrixSnapshot(socket, payload.reason ?? "request")
		return
	}

	if (payload.type === "process-task") {
		const energyClients = broadcastEnergyProcessTask(payload.task)
		appLog("WS", "matrix process task", `actor=${payload.task.actorId} process=${payload.task.processId} energy=${energyClients}`, "cyan")
		return
	}

	const message: BoundaryUpdateMessage = {parts: payload.parts}
	try {
		await boundary.absorb(message)
		const browserClients = broadcastForceMessage(message)
		const matrixClients = broadcastMatrixForceMessage(message, socket)
		const energyClients = broadcastEnergyForceMessage(message)
		appLog("WS", "matrix force", `parts=${message.parts.length} browser=${browserClients} matrix=${matrixClients} energy=${energyClients}`, "green")
	} catch (error) {
		appLog("ERR", "matrix force failed", errorMessage(error), "red")
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
		}
	}
}

async function handleEnergyBridgeMessage(
	socket: ServerWebSocket<AppWebSocketData>,
	raw: string | Buffer,
): Promise<void> {
	const payload = readEnergyBridgeMessage(raw)
	if (payload === null) {
		appLog("WS", "energy bridge ignored", "invalid message", "yellow")
		return
	}

	if (payload.type === "hello") {
		appLog("WS", "energy hello", `pid=${payload.pid} env=${payload.env.id} started=${payload.startedAt}`, "cyan")
		return
	}

	if (payload.type === "claim") {
		const message: BoundaryUpdateMessage = {
			parts: [{
				part: "z",
				op: "test",
				path: payload.actorId,
				value: {
					kind: "claim",
					processId: payload.processId,
					token: payload.token,
					env: payload.env,
					...(payload.mass !== undefined ? {mass: payload.mass} : {}),
				},
			}],
		}
		try {
			await boundary.absorb(message)
			const browserClients = broadcastForceMessage(message)
			const matrixClients = broadcastMatrixForceMessage(message)
			const energyClients = broadcastEnergyForceMessage(message, socket)
			appLog("WS", "energy claim", `actor=${payload.actorId} process=${payload.processId} browser=${browserClients} matrix=${matrixClients} energy=${energyClients}`, "cyan")
		} catch (error) {
			appLog("ERR", "energy claim failed", errorMessage(error), "red")
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
			}
		}
		return
	}

	if (payload.type === "process-result") {
		appLog("WS", "energy result", `ok=${payload.result.ok} actor=${payload.result.actorId} process=${payload.result.processId}`, payload.result.ok ? "green" : "yellow")
		return
	}

	const message: BoundaryUpdateMessage = {parts: payload.parts}
	try {
		await boundary.absorb(message)
		const browserClients = broadcastForceMessage(message)
		const matrixClients = broadcastMatrixForceMessage(message)
		const energyClients = broadcastEnergyForceMessage(message, socket)
		appLog("WS", "energy force", `parts=${message.parts.length} browser=${browserClients} matrix=${matrixClients} energy=${energyClients}`, "green")
	} catch (error) {
		appLog("ERR", "energy force failed", errorMessage(error), "red")
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
		}
	}
}

const server = serve<AppWebSocketData>({
	hostname: HOST,
	port: PORT,
	development: false,
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
		"/": () => appClientAssetResponse(APP_CLIENT_BUNDLE.html),
		"/index.html": () => appClientAssetResponse(APP_CLIENT_BUNDLE.html),
		...appClientAssetRoutes(APP_CLIENT_BUNDLE),
		"/health": (req: Request) => {
			const started = Date.now()
			const response = Response.json({ok: true})
			if (Bun.env.APP_WEB_LOG_HEALTH === "1") logHttp(req, "health", response.status, started)
			return response
		},
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/models/bots.glb": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/models/bots.glb"))),
		"/ws": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const ok = wsServer.upgrade(req, {data: {kind: "app-web"}})
			logWsUpgrade(req, "app-web", ok)
			return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/matrix/ws": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const auth = matrixBridgeAuth({
				url: new URL(req.url),
				requestHost: wsServer.requestIP(req)?.address ?? null,
				serverHost: HOST,
				token: MATRIX_BRIDGE_TOKEN,
				headerToken: matrixBridgeHeaderToken(req),
			})
			if (!auth.ok) {
				logWsUpgrade(req, "matrix.bridge", false, auth.reason)
				return new Response("Forbidden", {status: 403})
			}
			const data: MatrixBridgeSocketData = {kind: "matrix-bridge", connectedAt: Date.now()}
			const ok = wsServer.upgrade(req, {data})
			logWsUpgrade(req, "matrix.bridge", ok)
			return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/energy/ws": (req: Request, wsServer: Server<AppWebSocketData>) => {
			const auth = energyBridgeAuth({
				url: new URL(req.url),
				requestHost: wsServer.requestIP(req)?.address ?? null,
				serverHost: HOST,
				token: ENERGY_BRIDGE_TOKEN,
				headerToken: energyBridgeHeaderToken(req),
			})
			if (!auth.ok) {
				logWsUpgrade(req, "energy.bridge", false, auth.reason)
				return new Response("Forbidden", {status: 403})
			}
			const data: EnergyBridgeSocketData = {kind: "energy-bridge", connectedAt: Date.now()}
			const ok = wsServer.upgrade(req, {data})
			logWsUpgrade(req, "energy.bridge", ok)
			return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
		},
		"/force": async (req: Request) => {
			const started = Date.now()
			if (req.method !== "POST") {
				logHttp(req, "force", 405, started, "method not allowed")
				return new Response("Method Not Allowed", {status: 405})
			}
			const parsed = await readJsonObject(req)
			if (parsed.error !== undefined) {
				logHttp(req, "force", 400, started, `error=${parsed.error}`)
				return jsonResponse({ok: false, error: parsed.error}, 400)
			}
			const parts = parsed.body.parts
			if (!Array.isArray(parts)) {
				logHttp(req, "force", 400, started, "error=parts must be an array")
				return jsonResponse({ok: false, error: "parts must be an array"}, 400)
			}
			const message: BoundaryUpdateMessage = {parts: parts as BoundaryUpdateMessage["parts"]}
			try {
				await boundary.absorb(message)
				const clients = broadcastForceMessage(message)
				const matrixClients = broadcastMatrixForceMessage(message)
				const energyClients = broadcastEnergyForceMessage(message)
				logHttp(req, "force", 200, started, `parts=${message.parts.length} clients=${clients} matrix=${matrixClients} energy=${energyClients}`)
				return jsonResponse({ok: true, parts: message.parts.length, clients, matrixClients, energyClients})
			} catch (error) {
				logHttp(req, "force", 400, started, `error=${errorMessage(error)}`)
				return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 400)
			}
		},
		"/*": async (req: Request) => {
			logHttp(req, "not-found", 404, Date.now())
			return new Response("Not Found", {status: 404})
		},
	},
	websocket: {
		open(ws) {
			if (ws.data.kind === "energy-bridge") {
				energyBridgeSockets.add(ws)
				appLog("WS", "energy bridge opened", `clients=${energyBridgeSockets.size}`, "green")
				return
			}
			if (ws.data.kind === "matrix-bridge") {
				matrixBridgeSockets.add(ws)
				appLog("WS", "matrix bridge opened", `clients=${matrixBridgeSockets.size}`, "green")
				void sendMatrixSnapshot(ws, "open")
				return
			}
			sockets.add(ws)
			appLog("WS", "app client opened", `clients=${sockets.size}`, "green")
		},
		message(ws, message) {
			if (ws.data.kind === "energy-bridge") {
				void handleEnergyBridgeMessage(ws, message)
				return
			}
			if (ws.data.kind === "matrix-bridge") {
				void handleMatrixBridgeMessage(ws, message)
				return
			}

			let payload: ClientMessage | null = null
			try {
				payload = JSON.parse(String(message)) as ClientMessage
			} catch {
				return
			}

			if (!payload || typeof payload !== "object" || typeof payload.type !== "string") return

			if (payload.type === "materialize" || payload.type === "relayout") {
				const started = Date.now()
				appLog("WS", "snapshot requested", `type=${payload.type} src=${payload.src.trim() || DEFAULT_BULK_SCENE_SRC}`, "cyan")
				void buildSnapshot(payload)
					.then((world) => {
						appLog("WS", "snapshot ready", `type=${payload.type} in ${Date.now() - started}ms`, "green")
						ws.send(JSON.stringify(world))
					})
					.catch((error) => {
						appLog("ERR", "snapshot failed", `type=${payload.type} in ${Date.now() - started}ms error=${errorMessage(error)}`, "red")
						ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
					})
			}
		},
		close(ws) {
			if (ws.data.kind === "energy-bridge") {
				energyBridgeSockets.delete(ws)
				appLog("WS", "energy bridge closed", `clients=${energyBridgeSockets.size}`, "gray")
				return
			}
			if (ws.data.kind === "matrix-bridge") {
				matrixBridgeSockets.delete(ws)
				appLog("WS", "matrix bridge closed", `clients=${matrixBridgeSockets.size}`, "gray")
				return
			}
			sockets.delete(ws)
			appLog("WS", "app client closed", `clients=${sockets.size}`, "gray")
		},
	},
})

async function buildAppClientBundle(): Promise<AppClientBundle> {
	const result = await Bun.build({
		entrypoints: [join(import.meta.dir, "index.html")],
		loader: {".wgsl": "text"},
		minify: !APP_CLIENT_SOURCE_MAPS_ENABLED,
		sourcemap: APP_CLIENT_SOURCE_MAPS_ENABLED ? "linked" : "none",
		target: "browser",
	})
	if (!result.success) {
		const detail = result.logs.map((log) => log.message).join("\n")
		throw new Error(`Failed to build app/web client bundle${detail.length > 0 ? `:\n${detail}` : ""}`)
	}

	let html: AppClientAsset | null = null
	const assets = new Map<string, AppClientAsset>()
	for (const output of result.outputs) {
		const pathname = output.path.replace(/^\.\//, "/")
		const asset: AppClientAsset = {
			body: await output.arrayBuffer(),
			type: output.type || "application/octet-stream",
		}
		if (pathname === "/index.html") html = asset
		else assets.set(pathname, asset)
	}
	if (html === null) throw new Error("Failed to build app/web client bundle: index.html output missing")
	return {assets, html}
}

function appClientAssetResponse(asset: AppClientAsset): Response {
	return new Response(asset.body.slice(0), {
		headers: {
			"cache-control": "no-store",
			"content-type": asset.type,
		},
	})
}

function appClientAssetRoutes(bundle: AppClientBundle): Record<string, () => Response> {
	return Object.fromEntries([...bundle.assets].map(([pathname, asset]) => [
		pathname,
		() => appClientAssetResponse(asset),
	]))
}

function matrixBridgeHeaderToken(req: Request): string | null {
	const explicit = req.headers.get("x-matrix-bridge-token")?.trim()
	if (explicit) return explicit
	const authorization = req.headers.get("authorization")?.trim()
	const match = authorization?.match(/^Bearer\s+(.+)$/i)
	return match?.[1]?.trim() || null
}

function energyBridgeHeaderToken(req: Request): string | null {
	const explicit = req.headers.get("x-energy-bridge-token")?.trim()
	if (explicit) return explicit
	const authorization = req.headers.get("authorization")?.trim()
	const match = authorization?.match(/^Bearer\s+(.+)$/i)
	return match?.[1]?.trim() || null
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

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {"content-type": "application/json; charset=utf-8"},
	})
}

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
	const suffix = detail.length > 0 ? ` ${detail}` : ""
	appLog("HTTP", route, `${status} ${Date.now() - started}ms ${req.method} ${compactLogPath(url)}${suffix}`, tone)
}

function logWsUpgrade(req: Request, channel: string, ok: boolean, detail = ""): void {
	const url = new URL(req.url)
	const suffix = detail.length > 0 ? ` ${detail}` : ""
	appLog(ok ? "WS" : "WARN", `${channel} upgrade`, `${compactLogPath(url)} ${ok ? "accepted" : "failed"}${suffix}`, ok ? "green" : "yellow")
}

function compactLogPath(url: URL): string {
	return `${url.pathname}${url.search}`
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
	for (const url of urls) appLog("URL", "app entry", url, "cyan")
	if (redirectServer !== null) appLog("URL", "http redirect", redirectServer.url.href, "cyan")
	appLog("TIME", "started", formatLogDateTime(APP_WEB_STARTED_AT), "gray")
}

function startHttpRedirectServer(): Server<never> {
	try {
		const redirect = serve({
			hostname: REDIRECT_HOST,
			port: REDIRECT_PORT,
			fetch(req) {
				const source = new URL(req.url)
				const target = new URL(req.url)
				target.protocol = "https:"
				target.hostname = source.hostname
				target.port = PORT === 443 ? "" : String(PORT)
				return Response.redirect(target.toString(), 308)
			},
		})
		return redirect
	} catch (error) {
		throw new Error(`Failed to start HTTP redirect on ${REDIRECT_HOST}:${REDIRECT_PORT}: ${errorMessage(error)}`)
	}
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
