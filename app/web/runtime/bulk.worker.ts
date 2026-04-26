import { openDbSqliteBackend } from "store/db"
import { createAppBulkProcessRuntime } from "./bulk.process.ts"

type BulkBootMessage = {
	type: "boot"
	dbFilename: string
}

type BulkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<BulkBootMessage>) => void) | null
	postMessage(message: unknown): void
}

const bulkWorker = globalThis as BulkWorkerScope
let booted = false

bulkWorker.onmessage = (event: MessageEvent<BulkBootMessage>) => {
	const message = event.data
	if (booted || message.type !== "boot") return

	try {
		const backend = openDbSqliteBackend({
			filename: message.dbFilename,
		})

		createAppBulkProcessRuntime({
			backend,
			openTargetBackend: () =>
				openDbSqliteBackend({
					filename: message.dbFilename,
				}),
			log(payload) {
				bulkWorker.postMessage({ type: "log", message: payload })
			},
		})

		booted = true
		bulkWorker.postMessage({ type: "worker-status", worker: "bulk", status: "ready" })
	} catch (error) {
		bulkWorker.postMessage({
			type: "worker-status",
			worker: "bulk",
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		})
	}
}
