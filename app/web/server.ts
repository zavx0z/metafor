import { file, serve } from "bun"
import { join, normalize } from "node:path"
import {force} from "boundary"
import index from "./index.html"
import type {
	ClientForceBridgePayload,
	Particle,
} from "./server.t.ts"

const ROOT = normalize(join(import.meta.dir, "../../"))
const APP_CHANNEL = "app-web"
const DEFAULT_PORT = 3000
const configuredPort = Number(Bun.env.PORT ?? DEFAULT_PORT)
const APP_PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_PORT

const TLS_KEY_FILE = Bun.env.TLS_KEY_FILE
const TLS_CERT_FILE = Bun.env.TLS_CERT_FILE
const TLS_CA_FILE = Bun.env.TLS_CA_FILE
const TLS_PASSPHRASE = Bun.env.TLS_PASSPHRASE
const tls = TLS_KEY_FILE && TLS_CERT_FILE
	? {
			key: file(TLS_KEY_FILE),
			cert: file(TLS_CERT_FILE),
			...(TLS_CA_FILE ? { ca: file(TLS_CA_FILE) } : {}),
			...(TLS_PASSPHRASE ? { passphrase: TLS_PASSPHRASE } : {}),
		}
	: undefined

const publish = (payload: unknown): void => {
	server.publish(APP_CHANNEL, JSON.stringify(payload))
}

const valuePartPayload = (value: unknown): Particle | null => {
	if (!value || typeof value !== "object") return null
	const part = value as { part?: unknown; op?: unknown; path?: unknown; value?: unknown }
	return (part.part === "gluon" || part.part === "higgs") && part.op === "replace" && typeof part.path === "string" && "value" in part
		? { part: part.part, op: "replace", path: part.path, value: part.value }
		: null
}

const clientForceBridgePayload = (value: unknown): ClientForceBridgePayload | null => {
	if (!value || typeof value !== "object") return null
	const message = value as {
		type?: unknown
		parts?: unknown
	}
	if (message.type !== "force") return null
	if (!Array.isArray(message.parts)) return null
	const parts = message.parts.map(valuePartPayload)
	if (parts.some((part) => part === null)) return null

	return { type: "force", parts: parts as Particle[] }
}

force.observe((event) => {
	const parts = event.data.parts
	publish({
		type: "force",
		parts,
	})
})

const server = serve({
	port: APP_PORT,
	...(tls ? { tls } : {}),
	routes: {
		"/": index,
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(ROOT, "pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/ws": {
			GET(req, wsServer) {
				if (wsServer.upgrade(req)) return
				return new Response("Upgrade failed", { status: 400 })
			},
		},
	},
	websocket: {
		open(ws) {
			ws.subscribe(APP_CHANNEL)
		},
		message(_ws, message) {
			let payload: ClientForceBridgePayload | null = null
			try {
				payload = JSON.parse(String(message)) as ClientForceBridgePayload
			} catch {
				return
			}

			if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
				return
			}

			const forceBridgePayload = clientForceBridgePayload(payload)
			if (forceBridgePayload === null) return
			force.emit({ parts: forceBridgePayload.parts })
		},
	},
})

console.log(`${tls ? "https" : "http"}://${server.hostname}:${server.port}`)
