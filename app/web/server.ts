import { build, file, serve } from "bun"
import { mkdirSync, rmSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import type { DbWorldSnapshot } from "../../pkg/db/index.ts"
import {
	ELECTROMAGNETISM_BROADCAST_CHANNEL,
	GLUON_BROADCAST_CHANNEL,
	GRAVITY_BROADCAST_CHANNEL,
	HIGGS_BROADCAST_CHANNEL,
	WEAK_W_BROADCAST_CHANNEL,
	WEAK_Z_BROADCAST_CHANNEL,
	isGluonMessage,
	isGravitonMessage,
	isHiggsMessage,
	isPhotonMessage,
	isWMessage,
	isZMessage,
} from "@shared/protocol"

const ROOT = normalize(join(import.meta.dir, "../../"))
const APP_CHANNEL = "app-web"
const APP_DB_FILENAME = join(ROOT, "app/web/tmp/metafor-app.sqlite")
const APP_INSTANCE_DB_FILENAME = join(ROOT, "app/web/tmp/metafor-instance.sqlite")
const DEFAULT_PORT = 3000
const configuredPort = Number(Bun.env.PORT ?? DEFAULT_PORT)
const APP_PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_PORT

type WorkerName = "dark" | "boundary"
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

type InstanceSnapshotMessage = {
	type: "instance-snapshot"
	src: string
	snapshot: DbWorldSnapshot
}

type ClientMaterializeMessage = {
	type: "materialize"
	src: string
}

type AppRuntime = {
	boundary: Worker
	dark: Worker
}

const buildEntrypoint = async (entrypoint: string): Promise<Response> =>
	new Response((await build({ entrypoints: [entrypoint] })).outputs[0], {
		headers: { "Content-Type": "application/javascript" },
	})

const workerStates: Record<WorkerName, WorkerStatus> = {
	dark: "idle",
	boundary: "idle",
}

let runtime: AppRuntime | null = null
let runtimeLock: Promise<AppRuntime> | null = null

const workerEntry = (relativePath: string): string => join(ROOT, relativePath)

const resetAppRuntimeFiles = (): void => {
	mkdirSync(dirname(APP_DB_FILENAME), { recursive: true })
	rmSync(APP_DB_FILENAME, { force: true })
	rmSync(`${APP_DB_FILENAME}-shm`, { force: true })
	rmSync(`${APP_DB_FILENAME}-wal`, { force: true })
	rmSync(APP_INSTANCE_DB_FILENAME, { force: true })
	rmSync(`${APP_INSTANCE_DB_FILENAME}-shm`, { force: true })
	rmSync(`${APP_INSTANCE_DB_FILENAME}-wal`, { force: true })
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
				return
			}

			if (data && typeof data === "object" && (data as { type?: unknown }).type === "instance-snapshot") {
				const message = data as InstanceSnapshotMessage
				publish(message)
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
	runtime = null
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

	const dark = new Worker(workerEntry("app/web/runtime/dark.worker.ts"), {
		name: "dark",
	})
	await attachWorker("dark", dark)

	runtime = { boundary, dark }
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

const protocolMirrors = [
	{ key: "gravity", channelName: GRAVITY_BROADCAST_CHANNEL, validator: isGravitonMessage },
	{ key: "electromagnetism", channelName: ELECTROMAGNETISM_BROADCAST_CHANNEL, validator: isPhotonMessage },
	{ key: "gluon", channelName: GLUON_BROADCAST_CHANNEL, validator: isGluonMessage },
	{ key: "higgs", channelName: HIGGS_BROADCAST_CHANNEL, validator: isHiggsMessage },
	{ key: "weak-z", channelName: WEAK_Z_BROADCAST_CHANNEL, validator: isZMessage },
	{ key: "weak-w", channelName: WEAK_W_BROADCAST_CHANNEL, validator: isWMessage },
] as const

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
	routes: {
		"/": () => new Response(file(join(import.meta.dir, "index.html"))),
		"/client.js": async () => await buildEntrypoint(join(import.meta.dir, "client.ts")),
		"/bulk.js": async () => await buildEntrypoint(join(ROOT, "bulk/web.ts")),
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
			let payload: ClientMaterializeMessage | null = null
			try {
				payload = JSON.parse(String(message)) as ClientMaterializeMessage
			} catch {
				return
			}

			if (!payload || payload.type !== "materialize" || typeof payload.src !== "string") return

			void (async () => {
				const currentRuntime = await recreateRuntime()
				currentRuntime.dark.postMessage({
					type: "materialize",
					src: payload?.src || "zavx0z/git",
					dbFilename: APP_DB_FILENAME,
					instanceDbFilename: APP_INSTANCE_DB_FILENAME,
				})
			})()
		},
	},
})

console.log(`https://${server.hostname}:${server.port}`)
