import {file, serve, type Server, type ServerWebSocket} from "bun"
import {mkdirSync} from "node:fs"
import {dirname, join, normalize} from "node:path"
import index from "./index.html"
import {buildBoundaryWorldRows} from "./world.ts"
import type {Boundary} from "boundary"
import type {
	ClientMessage,
	ClientMaterializePayload,
	ClientRelayoutPayload,
	ServerWorldPayload,
} from "./server.t.ts"

type AppWebSocketData = {kind: "app-web"}

const ROOT = normalize(join(import.meta.dir, "../../"))
const DEFAULT_PORT = 3000
const configuredPort = Number(Bun.env.PORT ?? DEFAULT_PORT)
const APP_PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_PORT
const BOUNDARY_PATH = Bun.env.BOUNDARY_PATH ?? join(import.meta.dir, "tmp/boundary.sqlite")
const DARK_SERVER_SPECIFIER: string = "dark/server"

mkdirSync(dirname(BOUNDARY_PATH), {recursive: true})
process.env.BOUNDARY_PATH = BOUNDARY_PATH

await import(DARK_SERVER_SPECIFIER)

const boundary = (globalThis as typeof globalThis & {boundary: Boundary}).boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()

const TLS_KEY_FILE = Bun.env.TLS_KEY_FILE
const TLS_CERT_FILE = Bun.env.TLS_CERT_FILE
const TLS_CA_FILE = Bun.env.TLS_CA_FILE
const TLS_PASSPHRASE = Bun.env.TLS_PASSPHRASE
const tls = TLS_KEY_FILE && TLS_CERT_FILE
	? {
			key: file(TLS_KEY_FILE),
			cert: file(TLS_CERT_FILE),
			...(TLS_CA_FILE ? {ca: file(TLS_CA_FILE)} : {}),
			...(TLS_PASSPHRASE ? {passphrase: TLS_PASSPHRASE} : {}),
		}
	: undefined

const buildWorld = async (
	message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerWorldPayload> => {
	const src = message.src.trim() || "zavx0z/git"
	const snapshot = await boundary.bulkRuntime()
	const world = buildBoundaryWorldRows(snapshot, src, message.layoutSettings ?? {})
	return {type: "world", src, world}
}

const broadcast = (payload: unknown): void => {
	const message = JSON.stringify(payload)
	for (const socket of sockets) {
		if (socket.readyState === WebSocket.OPEN) socket.send(message)
	}
}

boundary.entropy((event) => {
	broadcast({
		type: "force",
		parts: event.data.parts,
	})
})

const server = serve<AppWebSocketData>({
	port: APP_PORT,
	...(tls ? {tls} : {}),
	routes: {
		"/": index,
		"/health": () => Response.json({ok: true}),
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(ROOT, "pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/ws": (req: Request, wsServer: Server<AppWebSocketData>) =>
			wsServer.upgrade(req, {data: {kind: "app-web"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426}),
	},
	websocket: {
		open(ws) {
			sockets.add(ws)
		},
		message(ws, message) {
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
				void buildWorld(payload)
					.then((world) => ws.send(JSON.stringify(world)))
					.catch((error) => {
						ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
					})
				return
			}
		},
		close(ws) {
			sockets.delete(ws)
		},
	},
})

console.log(`${tls ? "https" : "http"}://${server.hostname}:${server.port}`)
