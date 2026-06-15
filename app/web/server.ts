import {file, serve, type Server, type ServerWebSocket} from "bun"
import {join} from "node:path"
import "dark/server"
import index from "./index.html"
import {buildBoundaryWorldRows} from "./world.ts"
import type {
	ClientMessage,
	ClientMaterializePayload,
	ClientRelayoutPayload,
	ServerWorldPayload,
} from "./server.t.ts"

type AppWebSocketData = {kind: "app-web"}

const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()

const buildWorld = async (
	message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerWorldPayload> => {
	const src = message.src.trim() || "zavx0z/git"
	const snapshot = await boundary.bulkRuntime()
	const world = buildBoundaryWorldRows(snapshot, src, message.layoutSettings ?? {})
	return {type: "world", src, world}
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

console.log(server.url.href)
