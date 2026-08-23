import {
	BULK_VIEWPORT_CAPTURE_VERSION,
	isBulkViewportCaptureControlRequest,
	type BulkViewportCaptureControlResponse,
} from "shared/protocol/bulk/capture"
import { Force } from "shared/transport/force"
import {
	createBulkViewport,
	type BulkVisualViewportWithHud,
} from "./web/index.ts"
import { installBulkHud } from "./hud.ts"
import {captureBulkViewportCanvas} from "./web/viewport-capture.ts"
import {BulkPresentedStoreProof} from "./web/observer-snapshot.ts"
import {readBulkInitialResponse} from "./page-bootstrap.ts"
import {
	activateBulkStore,
	applyBulkStoreMessage,
} from "./store-runtime.ts"
import {
	bulkStoreCaptureProof,
	BulkStoreViewportRenderer,
} from "./store-render.ts"
import {isBulkStoreApplyControl} from "./store-initial.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")
const bulkLoader = document.getElementById("bulk-loader") as HTMLDivElement | null
const bulkLoaderStatus = document.getElementById("bulk-loader-status") as HTMLDivElement | null
type BulkBootWindow = Window & {
	__METAFOR_BULK_INITIAL_RESPONSE__?: Promise<Response>
}

let bulkViewport: BulkVisualViewportWithHud | null = null
let storeRenderer: BulkStoreViewportRenderer | null = null
const presentedStoreProof = new BulkPresentedStoreProof()

const mark = (name: string): void => {
	performance.mark(`bulk.${name}`)
}

const measure = (name: string, start: string, end: string): void => {
	performance.measure(`bulk.${name}`, `bulk.${start}`, `bulk.${end}`)
}

const setLoaderStatus = (status: string): void => {
	if (bulkLoaderStatus !== null) bulkLoaderStatus.textContent = status
}

const showLoaderError = (error: unknown): void => {
	if (bulkLoader !== null) bulkLoader.dataset.error = "true"
	setLoaderStatus("Bulk Store не загрузился")
	console.error("[bulk] initialization failed", error)
}

const fetchInitialStore = async () => {
	if (performance.getEntriesByName("bulk.initial-fetch-start", "mark").length === 0) {
		mark("initial-fetch-start")
	}
	const bootWindow = window as BulkBootWindow
	const pending = bootWindow.__METAFOR_BULK_INITIAL_RESPONSE__
	delete bootWindow.__METAFOR_BULK_INITIAL_RESPONSE__
	const response = await (pending ?? fetch("/initial", {
		cache: "no-store",
		headers: {accept: "application/json"},
	}))
	const initial = await readBulkInitialResponse(response)
	mark("initial-fetch-end")
	measure("initial-fetch", "initial-fetch-start", "initial-fetch-end")
	return initial
}

const waitForPresentedFrame = async (): Promise<void> => {
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
	mark("scene-frame-ready")
	if (bulkLoader !== null) {
		bulkLoader.hidden = true
		bulkLoader.setAttribute("aria-hidden", "true")
	}
	mark("loader-hidden")
}

const waitForVisibleDocument = async (): Promise<void> => {
	if (document.visibilityState === "visible") return
	await new Promise<void>((resolve) => {
		const onVisibilityChange = (): void => {
			if (document.visibilityState !== "visible") return
			document.removeEventListener("visibilitychange", onVisibilityChange)
			resolve()
		}
		document.addEventListener("visibilitychange", onVisibilityChange)
	})
}

const initBulkViewport = async (): Promise<void> => {
	mark("viewport-start")
	await waitForVisibleDocument()
	const rect = bulkCanvas.getBoundingClientRect()
	bulkViewport = await createBulkViewport({
		canvas: bulkCanvas,
		width: Math.max(1, Math.floor(rect.width)),
		height: Math.max(1, Math.floor(rect.height)),
	})
	const resizeBulkViewport = (): void => {
		if (!bulkViewport) return
		const rect = bulkCanvas.getBoundingClientRect()
		bulkViewport.setSize(
			Math.max(1, Math.floor(rect.width || bulkCanvas.clientWidth || 1)),
			Math.max(1, Math.floor(rect.height || bulkCanvas.clientHeight || 1)),
		)
	}

	const resizeObserver = new ResizeObserver(() => resizeBulkViewport())
	resizeObserver.observe(bulkCanvas)
	window.addEventListener("resize", resizeBulkViewport)
	window.visualViewport?.addEventListener("resize", resizeBulkViewport)
	mark("viewport-end")
	measure("viewport", "viewport-start", "viewport-end")
}

const start = async (): Promise<void> => {
	mark("bootstrap-start")
	setLoaderStatus("Получение Bulk Store…")
	const initialPromise = fetchInitialStore()
	const viewportPromise = initBulkViewport()
	const initial = await initialPromise

	const observerId = `bulk-web-${crypto.randomUUID()}`
	const force = new Force("bulk", {
		id: observerId,
		parameters: {session: initial.session},
	})

	setLoaderStatus("Подготовка сцены…")
	mark("store-activate-start")
	const store = activateBulkStore(initial.store)
	mark("store-activate-end")
	measure("store-activate", "store-activate-start", "store-activate-end")

	await viewportPromise
	if (!bulkViewport) throw new Error("Bulk viewport is not initialized")
	installBulkHud({viewport: bulkViewport})
	mark("renderer-prepare-start")
	storeRenderer = new BulkStoreViewportRenderer(store, bulkViewport)
	mark("renderer-prepare-end")
	measure("renderer-prepare", "renderer-prepare-start", "renderer-prepare-end")
	mark("renderer-present-start")
	storeRenderer.present()
	mark("renderer-present-end")
	measure("renderer-present", "renderer-present-start", "renderer-present-end")
	presentedStoreProof.stage(() => bulkStoreCaptureProof(store))

	force.onControl = async (message) => {
		if (isBulkStoreApplyControl(message)) {
			applyBulkStoreMessage(store, storeRenderer!, message.message)
			presentedStoreProof.stage(() => bulkStoreCaptureProof(store))
			return
		}
		if (!isBulkViewportCaptureControlRequest(message)) return
		const storeProof = await presentedStoreProof.read()
		const viewport = bulkViewport
		const result = await captureBulkViewportCanvas(
			bulkCanvas,
			message,
			{observerId, store: storeProof},
			viewport === null
				? {}
				: {readPng: () => viewport.hud.renderer.captureLastPresentedFramePng()},
		)
		const response: BulkViewportCaptureControlResponse = {
			control: "bulk.viewport.capture.response",
			version: BULK_VIEWPORT_CAPTURE_VERSION,
			id: message.id,
			result,
		}
		force.sendControl(response)
	}
	force.onImpulse = (message) => {
		applyBulkStoreMessage(store, storeRenderer!, message)
		presentedStoreProof.stage(() => bulkStoreCaptureProof(store))
	}

	await waitForPresentedFrame()
	measure("bootstrap-to-scene", "bootstrap-start", "scene-frame-ready")
}

void start().catch(showLoaderError)
