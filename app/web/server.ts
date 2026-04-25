import { build, file, serve, type ServerWebSocket } from "bun"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { openDbInstanceSqlite, readDbWorldSnapshot } from "../../pkg/db/index.ts"
import type { AppWebLayoutSettings } from "./settings.ts"
import {
	ELECTROMAGNETISM_BROADCAST_CHANNEL,
	GLUON_BROADCAST_CHANNEL,
	GRAVITY_BROADCAST_CHANNEL,
	HIGGS_BROADCAST_CHANNEL,
	STRUCTURAL_BROADCAST_CHANNEL,
	WEAK_W_BROADCAST_CHANNEL,
	WEAK_Z_BROADCAST_CHANNEL,
	openGluonBroadcastChannel,
	openHiggsBroadcastChannel,
	isGluonMessage,
	isGravitonMessage,
	isHiggsMessage,
	isPhotonMessage,
	isStructuralSignalMessage,
	isWMessage,
	isZMessage,
	type GluonMessage,
	type HiggsMessage,
	type ValueProtocolPatch,
} from "@shared/protocol"

const ROOT = normalize(join(import.meta.dir, "../../"))
const APP_CHANNEL = "app-web"
const APP_DB_FILENAME = join(ROOT, "app/web/tmp/metafor-app.sqlite")
const DEFAULT_PORT = 2244
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

type WorkerName = "dark" | "boundary" | "bulk"
type WorkerStatus = "idle" | "ready" | "started" | "done" | "error"

type WorkerStatusMessage = {
	type: "worker-status"
	worker: WorkerName
	status: WorkerStatus
	src?: string
	error?: string
}

type WorkerLogMessage = {
	type: "log"
	message: unknown
}

type ClientMaterializeMessage = {
	type: "materialize"
	src: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

type ClientRelayoutMessage = {
	type: "relayout"
	src: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

type ClientReadSnapshotMessage = {
	type: "read-snapshot"
	src: string
}

type ClientProtocolBridgeMessage = {
	type: "protocol"
	channel: "gluon" | "higgs"
	patches: ValueProtocolPatch[]
}

type AppRuntime = {
	bulk: Worker
	boundary: Worker
	dark: Worker
}

const buildEntrypoint = async (entrypoint: string): Promise<Response> =>
	new Response((await build({ entrypoints: [entrypoint] })).outputs[0], {
		headers: { "Content-Type": "application/javascript" },
	})

const workerStates: Record<WorkerName, WorkerStatus> = {
	bulk: "idle",
	dark: "idle",
	boundary: "idle",
}

let runtime: AppRuntime | null = null
let runtimeLock: Promise<AppRuntime> | null = null
const protocolInputs = {
	gluon: openGluonBroadcastChannel(),
	higgs: openHiggsBroadcastChannel(),
} as const

const workerEntry = (relativePath: string): string => join(ROOT, relativePath)

const resetAppRuntimeFiles = (): void => {
	mkdirSync(dirname(APP_DB_FILENAME), { recursive: true })
	rmSync(APP_DB_FILENAME, { force: true })
	rmSync(`${APP_DB_FILENAME}-shm`, { force: true })
	rmSync(`${APP_DB_FILENAME}-wal`, { force: true })
}

const publish = (payload: unknown): void => {
	server.publish(APP_CHANNEL, JSON.stringify(payload))
}

const updateWorkerStatus = (
	worker: WorkerName,
	status: WorkerStatus,
	meta: { src?: string; error?: string } = {},
): void => {
	workerStates[worker] = status
	publish({ type: "worker-status", worker, status, ...meta })
}

const toWorkerMeta = (meta: {
	src: string | undefined
	error: string | undefined
}): { src?: string; error?: string } => {
	const nextMeta: { src?: string; error?: string } = {}
	if (meta.src !== undefined) nextMeta.src = meta.src
	if (meta.error !== undefined) nextMeta.error = meta.error
	return nextMeta
}

const isValueProtocolPatch = (value: unknown): value is ValueProtocolPatch => {
	if (!value || typeof value !== "object") return false
	const patch = value as { op?: unknown; path?: unknown; value?: unknown }
	return patch.op === "replace" && typeof patch.path === "string" && "value" in patch
}

const isClientProtocolBridgeMessage = (value: unknown): value is ClientProtocolBridgeMessage => {
	if (!value || typeof value !== "object") return false
	const message = value as {
		type?: unknown
		channel?: unknown
		patches?: unknown
	}

	return (
		message.type === "protocol" &&
		(message.channel === "gluon" || message.channel === "higgs") &&
		Array.isArray(message.patches) &&
		message.patches.every(isValueProtocolPatch)
	)
}

const createProtocolBridgeMessage = (payload: ClientProtocolBridgeMessage): GluonMessage | HiggsMessage =>
	payload.channel === "gluon"
		? {
				channel: "gluon",
				boson: "gluon",
				source: "app",
				patches: payload.patches,
			}
		: {
				channel: "higgs",
				boson: "higgs",
				source: "app",
				patches: payload.patches,
			}

const attachWorker = (
	workerName: WorkerName,
	worker: Worker,
): Promise<void> =>
	new Promise((resolve, reject) => {
		let resolved = false

		worker.onmessage = (event: MessageEvent<unknown>) => {
			const data = event.data

			if (data && typeof data === "object" && (data as { type?: unknown }).type === "worker-status") {
				const message = data as WorkerStatusMessage
				updateWorkerStatus(message.worker, message.status, toWorkerMeta({ src: message.src, error: message.error }))

				if (!resolved && message.worker === workerName) {
					if (message.status === "ready") {
						resolved = true
						resolve()
					} else if (message.status === "error") {
						reject(new Error(message.error ?? `${workerName} worker boot failed`))
					}
				}
				return
			}

			if (data && typeof data === "object" && (data as { type?: unknown }).type === "log") {
				const message = data as WorkerLogMessage
				publish({ type: "log", worker: workerName, message: message.message })
			}
		}

		worker.onerror = (error) => {
			updateWorkerStatus(workerName, "error", { error: error.message })
			if (!resolved) {
				reject(error)
			}
		}
	})

const terminateRuntime = (): void => {
	runtime?.dark.terminate()
	runtime?.boundary.terminate()
	runtime?.bulk.terminate()
	runtime = null
	updateWorkerStatus("bulk", "idle")
	updateWorkerStatus("dark", "idle")
	updateWorkerStatus("boundary", "idle")
}

const createRuntime = async (): Promise<AppRuntime> => {
	terminateRuntime()
	resetAppRuntimeFiles()

	const boundary = new Worker(workerEntry("app/web/runtime/boundary.worker.ts"), {
		name: "boundary",
	})
	const boundaryReady = attachWorker("boundary", boundary)
	boundary.postMessage({ type: "boot", dbFilename: APP_DB_FILENAME })
	await boundaryReady

	const bulk = new Worker(workerEntry("app/web/runtime/bulk.worker.ts"), {
		name: "bulk",
	})
	const bulkReady = attachWorker("bulk", bulk)
	bulk.postMessage({ type: "boot", dbFilename: APP_DB_FILENAME })
	await bulkReady

	const dark = new Worker(workerEntry("app/web/runtime/dark.worker.ts"), {
		name: "dark",
	})
	await attachWorker("dark", dark)

	runtime = { bulk, boundary, dark }
	return runtime
}

const recreateRuntime = async (): Promise<AppRuntime> => {
	if (!runtimeLock) {
		runtimeLock = createRuntime().finally(() => {
			runtimeLock = null
		})
	}
	return await runtimeLock
}

const getOrCreateRuntime = async (): Promise<AppRuntime> => {
	if (runtime) return runtime
	if (runtimeLock) return await runtimeLock
	runtimeLock = createRuntime().finally(() => {
		runtimeLock = null
	})
	return await runtimeLock
}

const protocolMirrors = [
	{ key: "gravity", channelName: GRAVITY_BROADCAST_CHANNEL, validator: isGravitonMessage },
	{ key: "electromagnetism", channelName: ELECTROMAGNETISM_BROADCAST_CHANNEL, validator: isPhotonMessage },
	{ key: "gluon", channelName: GLUON_BROADCAST_CHANNEL, validator: isGluonMessage },
	{ key: "higgs", channelName: HIGGS_BROADCAST_CHANNEL, validator: isHiggsMessage },
	{ key: "weak-z", channelName: WEAK_Z_BROADCAST_CHANNEL, validator: isZMessage },
	{ key: "weak-w", channelName: WEAK_W_BROADCAST_CHANNEL, validator: isWMessage },
	{ key: "structural", channelName: STRUCTURAL_BROADCAST_CHANNEL, validator: isStructuralSignalMessage },
] as const

const respondWithSnapshot = (ws: ServerWebSocket<unknown>, src: string): void => {
	const db = openDbInstanceSqlite({ filename: APP_DB_FILENAME })
	try {
		const snapshot = readDbWorldSnapshot(db, src)
		ws.send(JSON.stringify({ type: "snapshot-data", src, snapshot }))
	} finally {
		db.close()
	}
}

protocolMirrors.forEach(({ key, channelName, validator }) => {
	const channel = new BroadcastChannel(channelName)
	channel.onmessage = (event: MessageEvent<unknown>) => {
		if (!validator(event.data)) return
		publish({
			type: "protocol",
			channel: key,
			message: event.data,
		})
	}
})

const server = serve({
	port: APP_PORT,
	...(tls ? { tls } : {}),
	routes: {
		"/": () => new Response(file(join(import.meta.dir, "index.html"))),
		"/client.js": async () => await buildEntrypoint(join(import.meta.dir, "client.ts")),
		"/bulk.js": async () => await buildEntrypoint(join(ROOT, "bulk/web.ts")),
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
			ws.send(
				JSON.stringify({
					type: "snapshot",
					workers: workerStates,
				}),
			)
		},
		message(ws, message) {
			let payload:
				| ClientMaterializeMessage
				| ClientRelayoutMessage
				| ClientReadSnapshotMessage
				| ClientProtocolBridgeMessage
				| null = null
			try {
				payload = JSON.parse(String(message)) as
					| ClientMaterializeMessage
					| ClientRelayoutMessage
					| ClientReadSnapshotMessage
					| ClientProtocolBridgeMessage
			} catch {
				return
			}

			if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
				return
			}

			void (async () => {
				if (isClientProtocolBridgeMessage(payload)) {
					await getOrCreateRuntime()
					const protocolMessage = createProtocolBridgeMessage(payload)

					if (payload.channel === "gluon") {
						protocolInputs.gluon.postMessage(protocolMessage)
					} else {
						protocolInputs.higgs.postMessage(protocolMessage)
					}
					return
				}

				if (payload.type === "read-snapshot") {
					if (typeof payload.src !== "string" || payload.src.length === 0) return
					try {
						respondWithSnapshot(ws, payload.src)
					} catch (error) {
						publish({
							type: "log",
							worker: "server",
							message: `read-snapshot error: ${error instanceof Error ? error.message : String(error)}`,
						})
					}
					return
				}

				if (typeof payload.src !== "string" || (payload.type !== "materialize" && payload.type !== "relayout")) {
					return
				}

				if (payload.type === "materialize") {
					const currentRuntime = await recreateRuntime()
					currentRuntime.dark.postMessage({
						type: "materialize",
						src: payload.src || "zavx0z/git",
						dbFilename: APP_DB_FILENAME,
						layoutSettings: payload.layoutSettings,
					})
					return
				}

				const currentRuntime = await getOrCreateRuntime()
				currentRuntime.dark.postMessage({
					type: "relayout",
					src: payload.src || "zavx0z/git",
					layoutSettings: payload.layoutSettings,
				})
			})()
		},
	},
})

console.log(`${tls ? "https" : "http"}://${server.hostname}:${server.port}`)
