import { bootBoundaryDomain } from "../../../boundary/boot.ts"
import { openDbSqliteBackend } from "../../../pkg/db/index.ts"

type BoundaryBootMessage = {
	type: "boot"
	dbFilename: string
}

type BoundaryWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<BoundaryBootMessage>) => void) | null
	postMessage(message: unknown): void
}

const boundaryWorker = globalThis as BoundaryWorkerScope
let booted = false

boundaryWorker.onmessage = (event: MessageEvent<BoundaryBootMessage>) => {
	const message = event.data
	if (booted || message.type !== "boot") return

	try {
		bootBoundaryDomain(() =>
			openDbSqliteBackend({
				filename: message.dbFilename,
			}),
		)
		booted = true
		boundaryWorker.postMessage({ type: "worker-status", worker: "boundary", status: "ready" })
	} catch (error) {
		boundaryWorker.postMessage({
			type: "worker-status",
			worker: "boundary",
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		})
	}
}
