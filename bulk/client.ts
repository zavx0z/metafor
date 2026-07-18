import type { BulkViewportWithHud } from "@metafor/types/bulk/hud"
import { Force } from "force"
import { createBulkViewport } from "bulk/web"
import { DEFAULT_BULK_SCENE_SRC, DEFAULT_BULK_SETTINGS } from "bulk/settings"
import { installBulkHud } from "./hud.ts"
import { BulkProjectionStore } from "./projection.ts"
import { observedRootSrc } from "./web/force-protocol.ts"
import { buildBoundaryBulkManifest } from "./world.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkViewportWithHud | null = null
const projection = new BulkProjectionStore()
let activeSrc = DEFAULT_BULK_SCENE_SRC

const force = new Force("bulk")

const applyProjectionWorld = (src: string): void => {
	if (!bulkViewport) return
	bulkViewport.applyManifestPatch(
		buildBoundaryBulkManifest(projection.view(), src, DEFAULT_BULK_SETTINGS.layout),
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
	installBulkHud({viewport: bulkViewport})
	applyProjectionWorld(activeSrc)

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

void initBulkViewport()

force.onImpulse = (forceMessage) => {
	const part = forceMessage.parts[0]
	const change = projection.apply(part)
	const rootSrcs = new Set(
		[...projection.atoms.values()]
			.filter((atom) => atom.parentAtom === null && atom.parentTopology === null)
			.map((atom) => atom.wimp),
	)
	const nextRootSrc = observedRootSrc(part, rootSrcs)
	if (nextRootSrc !== null) activeSrc = nextRootSrc
	if (change.changed) applyProjectionWorld(activeSrc)
	bulkViewport?.handleForce(part.part, part)
}
