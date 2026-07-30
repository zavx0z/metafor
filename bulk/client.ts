import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
	BULK_VIEWPORT_CAPTURE_VERSION,
	isBulkViewportCaptureControlRequest,
	type BulkViewportCaptureControlResponse,
} from "@metafor/types/bulk/capture"
import type {BulkInitialPackage, BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import { Force } from "shared/transport/force"
import {
	createBulkViewport,
	type BulkVisualViewportWithHud,
} from "bulk/web"
import { DEFAULT_BULK_SCENE_SRC } from "bulk/settings"
import { installBulkHud } from "./hud.ts"
import { BulkProjectionStore } from "./projection.ts"
import { observedRootSrc } from "./web/force-protocol.ts"
import { buildBulkManifestation } from "./manifestation.ts"
import {captureBulkViewportCanvas} from "./web/viewport-capture.ts"
import {BulkPresentedSnapshot} from "./web/observer-snapshot.ts"
import {
	applyCenteredNestedBulkViewportManifest,
} from "./visual-viewport.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkVisualViewportWithHud | null = null
const projection = new BulkProjectionStore()
let activeSrc = DEFAULT_BULK_SCENE_SRC
let throughTs: number | null = null
const presentedSnapshot = new BulkPresentedSnapshot()

const observerSnapshot = (): BulkObserverSnapshot => ({
	version: 1,
	throughTs,
	rootSrc: activeSrc,
	projection: projection.snapshot(),
})

const applyViewportManifest = (manifest: BulkManifest): void => {
	if (!bulkViewport) return
	applyCenteredNestedBulkViewportManifest(
		bulkViewport,
		manifest,
		projection.view(),
	)
}

const applyProjectionManifestation = (src: string): void => {
	applyViewportManifest(
		buildBulkManifestation(
			projection.view(),
			src,
		),
	)
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

const receiveImpulse = (forceMessage: Parameters<Force["onImpulse"]>[0]): void => {
	const part = forceMessage.parts[0]
	const change = projection.apply(part)
	const rootSrcs = new Set(
		[...projection.atoms.values()]
			.filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
			.map((atom) => atom.wimp),
	)
	const nextRootSrc = observedRootSrc(part, rootSrcs)
	if (nextRootSrc !== null) activeSrc = nextRootSrc
	if (change.changed) applyProjectionManifestation(activeSrc)
	throughTs = part.ts
	bulkViewport?.handleForce(part.part, part)
	presentedSnapshot.stage(observerSnapshot)
}

const readInitialPackage = async (): Promise<BulkInitialPackage> => {
	const response = await fetch("/initial", {method: "POST"})
	if (!response.ok) throw new Error(`Bulk initial package failed: ${response.status} ${await response.text()}`)
	return await response.json() as BulkInitialPackage
}

const start = async (): Promise<void> => {
	await initBulkViewport()
	const initial = await readInitialPackage()
	projection.hydrate(initial.projection)
	activeSrc = initial.rootSrc
	throughTs = initial.throughTs
	if (!bulkViewport) throw new Error("Bulk viewport is not initialized")
	installBulkHud({viewport: bulkViewport})
	applyViewportManifest(initial.manifest)
	presentedSnapshot.stage(observerSnapshot)

	const observerId = `bulk-web-${crypto.randomUUID()}`
	const force = new Force("bulk", {
		id: observerId,
		parameters: {session: initial.session},
	})
	force.onControl = async (message) => {
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
	force.onImpulse = receiveImpulse
}

void start().catch((error) => console.error("[bulk] initialization failed", error))
