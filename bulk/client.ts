import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
	BULK_VIEWPORT_CAPTURE_VERSION,
	isBulkViewportCaptureControlRequest,
	type BulkViewportCaptureControlResponse,
} from "@metafor/types/bulk/capture"
import { Force } from "shared/transport/force"
import {
	createBulkViewport,
	type BulkVisualViewportWithHud,
} from "bulk/web"
import {BulkVisualSceneLifecycle} from "bulk/visual"
import { installBulkHud } from "./hud.ts"
import {captureBulkViewportCanvas} from "./web/viewport-capture.ts"
import {BulkPresentedSnapshot} from "./web/observer-snapshot.ts"
import {
	BULK_INITIAL_ELEMENT_ID,
	parseBulkInitialJson,
} from "./page-bootstrap.ts"
import {
	isBulkGraphUpdateControl,
} from "./visual-initial.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkVisualViewportWithHud | null = null
let visualLifecycle: BulkVisualSceneLifecycle | null = null
const presentedSnapshot = new BulkPresentedSnapshot()

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
}

const readInitialPackage = () => {
	const element = document.getElementById(BULK_INITIAL_ELEMENT_ID)
	if (element === null) throw new Error("Bulk page initial element is missing")
	return parseBulkInitialJson(element.textContent)
}

const start = async (): Promise<void> => {
	const initial = readInitialPackage()
	await initBulkViewport()
	if (!bulkViewport) throw new Error("Bulk viewport is not initialized")
	installBulkHud({viewport: bulkViewport})
	// The server already ran the selected strategy. Hydration presents that
	// geometry as-is; no layout strategy runs in this browser on the initial
	// path, which `visualLayoutBuiltScenes()` proves in the spec.
	visualLifecycle = new BulkVisualSceneLifecycle({target: bulkViewport})
	visualLifecycle.hydrate(initial)
	presentedSnapshot.stage(() => visualLifecycle!.snapshot())

	const observerId = `bulk-web-${crypto.randomUUID()}`
	const force = new Force("bulk", {
		id: observerId,
		parameters: {session: initial.session},
	})
	force.onControl = async (message) => {
		if (isBulkGraphUpdateControl(message)) {
			visualLifecycle!.hydrate(message.scene)
			const part = message.message.parts[0]
			bulkViewport?.handleForce(part.part, part)
			presentedSnapshot.stage(() => visualLifecycle!.snapshot())
			return
		}
		if (!isBulkViewportCaptureControlRequest(message)) return
		const snapshot = await presentedSnapshot.read()
		const viewport = bulkViewport
		const result = await captureBulkViewportCanvas(
			bulkCanvas,
			message,
			{observerId, snapshot},
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
	force.onImpulse = () => {
		throw new Error("Bulk browser rejects direct Particle updates without a Graph replacement")
	}
}

void start().catch((error) => console.error("[bulk] initialization failed", error))
