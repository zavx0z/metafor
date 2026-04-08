import {
	appendProtocolMessage,
	appendWorkerLog,
	initProtocolLogger,
	setConnectionStatus,
	setWorkerStatus,
} from "./protocol-logger.ts"

type WorkerStatusMessage = {
	type: "worker-status"
	worker: "dark" | "boundary"
	status: "idle" | "ready" | "started" | "done" | "error"
	src?: string
	error?: string
}

type ProtocolMessage = {
	type: "protocol"
	channel: string
	message: unknown
}

type SnapshotMessage = {
	type: "snapshot"
	workers: Record<string, "idle" | "ready" | "started" | "done" | "error">
}

type LogMessage = {
	type: "log"
	worker: string
	message: unknown
}

type BulkWorkerMessage =
	| {
			type: "worker-status"
			worker: "bulk"
			status: "ready" | "error"
			error?: string
	  }
	| {
			type: "bulk-stats"
			gravityAddCount: number
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

initProtocolLogger()

const form = document.getElementById("control-form") as HTMLFormElement
const srcInput = document.getElementById("src-input") as HTMLInputElement
const submitButton = document.getElementById("materialize-btn") as HTMLButtonElement
const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement
const bulkCounter = document.getElementById("bulk-counter") as HTMLSpanElement

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`)
const bulkWorker = new Worker("/bulk.js", {
	name: "bulk",
	type: "module",
})

const postBulkSize = (width: number, height: number): void => {
	bulkWorker.postMessage({
		type: "resize",
		width,
		height,
	})
}

if ("transferControlToOffscreen" in bulkCanvas) {
	const offscreen = bulkCanvas.transferControlToOffscreen()
	const rect = bulkCanvas.getBoundingClientRect()
	const pixelRatio = window.devicePixelRatio || 1

	bulkWorker.postMessage(
		{
			type: "init",
			canvas: offscreen,
			width: Math.max(1, Math.floor(rect.width * pixelRatio)),
			height: Math.max(1, Math.floor(rect.height * pixelRatio)),
		},
		[offscreen],
	)

	const resizeObserver = new ResizeObserver((entries) => {
		const entry = entries[0]
		if (!entry) return

		const nextPixelRatio = window.devicePixelRatio || 1
		postBulkSize(
			Math.max(1, Math.floor(entry.contentRect.width * nextPixelRatio)),
			Math.max(1, Math.floor(entry.contentRect.height * nextPixelRatio)),
		)
	})

	resizeObserver.observe(bulkCanvas)
} else {
	setWorkerStatus("bulk", "error", {
		error: "OffscreenCanvas недоступен в этом браузере.",
	})
}

bulkWorker.onmessage = (event: MessageEvent<BulkWorkerMessage>) => {
	const message = event.data
	if (message.type === "worker-status") {
		setWorkerStatus("bulk", message.status, toWorkerMeta({ src: undefined, error: message.error }))
		return
	}

	if (message.type === "bulk-stats") {
		bulkCounter.textContent = `${message.gravityAddCount} gravity add patches`
	}
}

socket.onopen = () => {
	setConnectionStatus(true)
	submitButton.disabled = false
}

socket.onclose = () => {
	setConnectionStatus(false)
	submitButton.disabled = true
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as WorkerStatusMessage | ProtocolMessage | SnapshotMessage | LogMessage

	if (message.type === "snapshot") {
		for (const [worker, status] of Object.entries(message.workers)) {
			if (worker === "dark" || worker === "boundary") {
				setWorkerStatus(worker, status)
			}
		}
		return
	}

	if (message.type === "worker-status") {
		setWorkerStatus(message.worker, message.status, toWorkerMeta({ src: message.src, error: message.error }))
		if (message.worker === "dark" && (message.status === "done" || message.status === "error")) {
			submitButton.disabled = socket.readyState !== WebSocket.OPEN
		}
		return
	}

	if (message.type === "protocol") {
		appendProtocolMessage(message.channel, message.message)
		bulkWorker.postMessage(message)
		return
	}

	if (message.type === "log") {
		appendWorkerLog(message.worker, message.message)
	}
}

form.addEventListener("submit", (event) => {
	event.preventDefault()
	submitButton.disabled = true
	socket.send(
		JSON.stringify({
			type: "materialize",
			src: srcInput.value.trim() || "zavx0z/git",
		}),
	)
})
