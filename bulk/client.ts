import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
	BULK_VIEWPORT_CAPTURE_VERSION,
	isBulkViewportCaptureControlRequest,
	type BulkViewportCaptureControlResponse,
} from "@metafor/types/bulk/capture"
import type {BulkCausalFrontier, BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import { Force } from "shared/transport/force"
import {
	createBulkViewport,
	type BulkVisualViewportWithHud,
} from "bulk/web"
import { DEFAULT_BULK_SCENE_SRC } from "bulk/settings"
import { installBulkHud } from "./hud.ts"
import { BulkProjectionStore, type BulkProjectionChange } from "./projection.ts"
import { observedRootSrc } from "./web/force-protocol.ts"
import { buildBulkManifestation } from "./manifestation.ts"
import {captureBulkViewportCanvas} from "./web/viewport-capture.ts"
import {BulkPresentedSnapshot} from "./web/observer-snapshot.ts"
import {
	BulkVisualScenePresenter,
} from "./visual-viewport.ts"
import {resolveBulkVisualLayout} from "./visual-layout.ts"
import {isVisualPreparedScene} from "@metafor/visual/layout/centered-nested"
import type {BulkInitialScene} from "./visual-initial.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkVisualViewportWithHud | null = null
const projection = new BulkProjectionStore()
const presenter = new BulkVisualScenePresenter()
let activeSrc = DEFAULT_BULK_SCENE_SRC
let throughTs: number | null = null
let frontier: BulkCausalFrontier | null = null
const presentedSnapshot = new BulkPresentedSnapshot()

const observerSnapshot = (): BulkObserverSnapshot => ({
	version: 1,
	throughTs,
	rootSrc: activeSrc,
	projection: projection.snapshot(),
})

/**
 * Applies one changed manifestation.
 *
 * The whole change is forwarded, not a boolean digest of it: `facet` names the
 * upstream fact that moved and `affectedAtomIds` is the closure it reached.
 * Narrowing this to `{changed, structural}` here is what used to make every
 * accepted change a full rebuild, because the visual side then had nothing to
 * localize against.
 */
const applyProjectionManifestation = (
	src: string,
	change: BulkProjectionChange,
): void => {
	if (!bulkViewport) return
	presenter.apply(
		bulkViewport,
		buildBulkManifestation(projection.view(), src),
		projection.view(),
		change,
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
	if (change.changed) {
		applyProjectionManifestation(activeSrc, change)
	}
	throughTs = part.ts
	bulkViewport?.handleForce(part.part, part)
	presentedSnapshot.stage(observerSnapshot)
}

const readInitialPackage = async (): Promise<BulkInitialScene> => {
	const response = await fetch("/initial", {method: "POST"})
	if (!response.ok) throw new Error(`Bulk initial package failed: ${response.status} ${await response.text()}`)
	const initial = await response.json() as BulkInitialScene
	if (!isVisualPreparedScene(initial.visual)) {
		throw new Error("Bulk initial package carries no prepared visual state")
	}
	return initial
}

const start = async (): Promise<void> => {
	await initBulkViewport()
	const initial = await readInitialPackage()
	projection.hydrate(initial.projection)
	activeSrc = initial.rootSrc
	throughTs = initial.throughTs
	frontier = initial.frontier
	if (!bulkViewport) throw new Error("Bulk viewport is not initialized")
	installBulkHud({viewport: bulkViewport})
	// The server already ran the selected strategy. Hydration presents that
	// geometry as-is; no layout strategy runs in this browser on the initial
	// path, which `visualLayoutBuiltScenes()` proves in the spec.
	presenter.selectLayout(resolveBulkVisualLayout(initial.visual.layoutSlug))
	presenter.hydrate(bulkViewport, initial.manifest, initial.visual.payload)
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
