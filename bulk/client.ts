import type { BulkViewportWithHud } from "@metafor/types/bulk/hud"
import type {BulkInitialPackage} from "@metafor/types/bulk/initial"
import { Force } from "shared/transport/force"
import { createBulkViewport } from "bulk/web"
import { DEFAULT_BULK_SCENE_SRC, DEFAULT_BULK_SETTINGS } from "bulk/settings"
import { installBulkHud } from "./hud.ts"
import { BulkProjectionStore } from "./projection.ts"
import { observedRootSrc } from "./web/force-protocol.ts"
import { buildBulkManifestation } from "./manifestation.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkViewportWithHud | null = null
let bulkHud: ReturnType<typeof installBulkHud> | null = null
const projection = new BulkProjectionStore()
let activeSrc = DEFAULT_BULK_SCENE_SRC

const applyProjectionManifestation = (src: string): void => {
	if (!bulkViewport) return
	bulkViewport.applyManifestPatch(
		buildBulkManifestation(projection.view(), src, DEFAULT_BULK_SETTINGS.layout),
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
	bulkHud = installBulkHud({viewport: bulkViewport})
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
	bulkViewport?.handleForce(part.part, part)
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
	bulkViewport?.applyManifestPatch(initial.manifest)

	const force = new Force("bulk", {
		id: `bulk-web-${crypto.randomUUID()}`,
		parameters: {session: initial.session},
	})
	force.onImpulse = receiveImpulse
}

void start().catch((error) => console.error("[bulk] initialization failed", error))
