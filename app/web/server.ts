import {file, serve} from "bun"
import {mkdirSync} from "node:fs"
import {dirname, join, normalize} from "node:path"
import index from "./index.html"
import {buildBoundaryWorldRows} from "./world.ts"
import type {Boundary, BoundaryBulkRuntimeSnapshot} from "boundary"
import type {
	ClientForceBridgePayload,
	ClientMessage,
	ClientMaterializePayload,
	ClientRelayoutPayload,
	Particle,
	ServerWorldPayload,
} from "./server.t.ts"

const ROOT = normalize(join(import.meta.dir, "../../"))
const APP_CHANNEL = "app-web"
const DEFAULT_PORT = 3000
const configuredPort = Number(Bun.env.PORT ?? DEFAULT_PORT)
const APP_PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_PORT
const BOUNDARY_PATH = Bun.env.BOUNDARY_PATH ?? join(import.meta.dir, "tmp/boundary.sqlite")
const DARK_SERVER_SPECIFIER = "dark/server"

mkdirSync(dirname(BOUNDARY_PATH), {recursive: true})
process.env.BOUNDARY_PATH = BOUNDARY_PATH

await import(DARK_SERVER_SPECIFIER)

const boundary = (globalThis as typeof globalThis & {boundary: Boundary}).boundary

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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const publish = (payload: unknown): void => {
	server.publish(APP_CHANNEL, JSON.stringify(payload))
}

const send = (ws: {send(message: string): unknown}, payload: unknown): void => {
	ws.send(JSON.stringify(payload))
}

const valuePartPayload = (value: unknown): Particle | null => {
	if (!value || typeof value !== "object") return null
	const part = value as {part?: unknown; op?: unknown; path?: unknown; value?: unknown}
	return (part.part === "gluon" || part.part === "higgs") && part.op === "replace" && typeof part.path === "string" && "value" in part
		? {part: part.part, op: "replace", path: part.path, value: part.value}
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

	return {type: "force", parts: parts as Particle[]}
}

const bulkSnapshotSignature = (snapshot: BoundaryBulkRuntimeSnapshot): string =>
	`${snapshot.actors.length}:${snapshot.topologies.length}`

const hasRootActor = (snapshot: BoundaryBulkRuntimeSnapshot, src: string): boolean =>
	snapshot.actors.some((actor) =>
		actor.wimp === src &&
		actor.parentActor === null &&
		actor.parentTopology === null,
	)

const waitForBoundaryWorld = async (src: string): Promise<BoundaryBulkRuntimeSnapshot> => {
	const deadline = Date.now() + 30_000
	let lastSignature = ""
	let stableSince = 0

	while (Date.now() < deadline) {
		const snapshot = await boundary.bulkRuntime()
		const rootReady = hasRootActor(snapshot, src)
		const signature = bulkSnapshotSignature(snapshot)

		if (rootReady && signature === lastSignature) {
			if (stableSince !== 0 && Date.now() - stableSince >= 500) return snapshot
			if (stableSince === 0) stableSince = Date.now()
		} else {
			lastSignature = signature
			stableSince = rootReady ? Date.now() : 0
		}

		await delay(50)
	}

	throw new Error(`Boundary world for ${src} did not stabilize`)
}

const materializeWorld = async (
	message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerWorldPayload> => {
	const src = message.src.trim() || "zavx0z/git"
	let snapshot: BoundaryBulkRuntimeSnapshot
	if (message.type === "materialize") {
		boundary.emit({parts: [{part: "graviton", op: "test", path: "wimp", value: src}]})
		snapshot = await waitForBoundaryWorld(src)
	} else {
		snapshot = await boundary.bulkRuntime()
	}

	const world = buildBoundaryWorldRows(snapshot, src, message.layoutSettings ?? {})
	return {type: "world", src, world}
}

boundary.entropy((event) => {
	publish({
		type: "force",
		parts: event.data.parts,
	})
})

const server = serve({
	port: APP_PORT,
	...(tls ? {tls} : {}),
	routes: {
		"/": index,
		"/health": () => Response.json({ok: true}),
		"/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(ROOT, "pkg/engine/static/JetBrainsMono-Bold.ttf"))),
		"/ws": {
			GET(req, wsServer) {
				if (wsServer.upgrade(req)) return
				return new Response("Upgrade failed", {status: 400})
			},
		},
	},
	websocket: {
		open(ws) {
			ws.subscribe(APP_CHANNEL)
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
				void materializeWorld(payload)
					.then((world) => send(ws, world))
					.catch((error) => {
						send(ws, {type: "error", error: error instanceof Error ? error.message : String(error)})
					})
				return
			}

			const forceBridgePayload = clientForceBridgePayload(payload)
			if (forceBridgePayload === null) return
			boundary.emit({parts: forceBridgePayload.parts})
		},
	},
})

console.log(`${tls ? "https" : "http"}://${server.hostname}:${server.port}`)
