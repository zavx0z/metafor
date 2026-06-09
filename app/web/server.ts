import { build, file, serve } from "bun"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import type { AppWebLayoutSettings } from "./settings.ts"
import {
	DB_SYNC_BROADCAST_CHANNEL,
	ELECTROMAGNETISM_BROADCAST_CHANNEL,
	GLUON_BROADCAST_CHANNEL,
	GRAVITY_BROADCAST_CHANNEL,
	HIGGS_BROADCAST_CHANNEL,
	STRUCTURAL_BROADCAST_CHANNEL,
	WEAK_W_BROADCAST_CHANNEL,
	WEAK_Z_BROADCAST_CHANNEL,
} from "../../protocol.ts"

type ValuePatch = { op: "replace"; path: string; value: unknown }

const ROOT = normalize(join(import.meta.dir, "../../"))
const APP_CHANNEL = "app-web"
const APP_DB_FILENAME = join(ROOT, "app/web/tmp/metafor-app.sqlite")
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

type ClientProtocolBridgePayload = {
	type: "protocol"
	channel: "gluon" | "higgs"
	patches: ValuePatch[]
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
	gluon: new BroadcastChannel(GLUON_BROADCAST_CHANNEL),
	higgs: new BroadcastChannel(HIGGS_BROADCAST_CHANNEL),
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

const valuePatchPayload = (value: unknown): ValuePatch | null => {
	if (!value || typeof value !== "object") return null
	const patch = value as { op?: unknown; path?: unknown; value?: unknown }
	return patch.op === "replace" && typeof patch.path === "string" && "value" in patch
		? { op: "replace", path: patch.path, value: patch.value }
		: null
}

const clientProtocolBridgePayload = (value: unknown): ClientProtocolBridgePayload | null => {
	if (!value || typeof value !== "object") return null
	const message = value as {
		type?: unknown
		channel?: unknown
		patches?: unknown
	}
	if (message.type !== "protocol") return null
	if (message.channel !== "gluon" && message.channel !== "higgs") return null
	if (!Array.isArray(message.patches)) return null
	const patches = message.patches.map(valuePatchPayload)
	if (patches.some((patch) => patch === null)) return null

	return { type: "protocol", channel: message.channel, patches: patches as ValuePatch[] }
}

const createProtocolBridgeMessage = (payload: ClientProtocolBridgePayload): { patches: ValuePatch[] } => ({
	patches: payload.patches,
})

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
	{ key: "gravity", channelName: GRAVITY_BROADCAST_CHANNEL },
	{ key: "electromagnetism", channelName: ELECTROMAGNETISM_BROADCAST_CHANNEL },
	{ key: "gluon", channelName: GLUON_BROADCAST_CHANNEL },
	{ key: "higgs", channelName: HIGGS_BROADCAST_CHANNEL },
	{ key: "weak-z", channelName: WEAK_Z_BROADCAST_CHANNEL },
	{ key: "weak-w", channelName: WEAK_W_BROADCAST_CHANNEL },
	{ key: "structural", channelName: STRUCTURAL_BROADCAST_CHANNEL },
	{ key: "db-sync", channelName: DB_SYNC_BROADCAST_CHANNEL },
] as const

protocolMirrors.forEach(({ key, channelName }) => {
	const channel = new BroadcastChannel(channelName)
	channel.onmessage = (event: MessageEvent<unknown>) => {
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
		"/bulk.js": async () => await buildEntrypoint(join(ROOT, "bulk/web/index.ts")),
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
		message(_ws, message) {
			let payload:
				| ClientMaterializeMessage
				| ClientRelayoutMessage
				| ClientProtocolBridgePayload
				| null = null
			try {
				payload = JSON.parse(String(message)) as
					| ClientMaterializeMessage
					| ClientRelayoutMessage
					| ClientProtocolBridgePayload
			} catch {
				return
			}

			if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
				return
			}

			void (async () => {
				const protocolBridgePayload = clientProtocolBridgePayload(payload)
				if (protocolBridgePayload !== null) {
					await getOrCreateRuntime()
					const protocolMessage = createProtocolBridgeMessage(protocolBridgePayload)

					if (protocolBridgePayload.channel === "gluon") {
						protocolInputs.gluon.postMessage(protocolMessage)
					} else {
						protocolInputs.higgs.postMessage(protocolMessage)
					}
					return
				}

				const runtimePayload = payload as ClientMaterializeMessage | ClientRelayoutMessage
				if (
					typeof runtimePayload.src !== "string"
					|| (runtimePayload.type !== "materialize" && runtimePayload.type !== "relayout")
				) {
					return
				}

				if (runtimePayload.type === "materialize") {
					const currentRuntime = await recreateRuntime()
					currentRuntime.dark.postMessage({
						type: "materialize",
						src: runtimePayload.src || "zavx0z/git",
						dbFilename: APP_DB_FILENAME,
						layoutSettings: runtimePayload.layoutSettings,
					})
					return
				}

				const currentRuntime = await getOrCreateRuntime()
				currentRuntime.dark.postMessage({
					type: "relayout",
					src: runtimePayload.src || "zavx0z/git",
					layoutSettings: runtimePayload.layoutSettings,
				})
			})()
		},
	},
})

console.log(`${tls ? "https" : "http"}://${server.hostname}:${server.port}`)
