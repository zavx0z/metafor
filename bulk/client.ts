import type { BulkLayoutSettings } from "@metafor/types/bulk/settings"
import type { BulkViewportStats } from "@metafor/types/bulk/viewport"
import type { BulkRenderSettings, SettingsSnapshot } from "@metafor/types/bulk/settings"
import type { BulkHudController, BulkHudSettingsSnapshot, BulkViewportWithHud } from "@metafor/types/bulk/hud"
import type { BulkRuntimeSnapshot } from "@metafor/types/bulk/runtime"
import type { ClientMaterializePayload, SnapshotMessage } from "@metafor/types/bulk/protocol"
import {Force} from "force"
import {createBulkViewport} from "bulk/web"
import {buildBoundaryBulkManifest} from "./world.ts"
import {
	BULK_LAYOUT_SETTING_KEYS,
	DEFAULT_BULK_SCENE_SRC,
	DEFAULT_BULK_SETTINGS,
	loadSettings,
	saveSettings,
} from "bulk/settings"
import {installBulkHud} from "./hud.ts"
import {applyForcePartToSnapshot} from "./force-snapshot.ts"

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

let bulkViewport: BulkViewportWithHud | null = null
let hud: BulkHudController | null = null
let initialMaterializationRequested = false
let pendingSnapshotMessage: SnapshotMessage | null = null
let currentSnapshot: BulkRuntimeSnapshot | null = null
let persistSettingsTimer: ReturnType<typeof setTimeout> | null = null
let activeSettings: BulkHudSettingsSnapshot = {
	layoutSettings: {...DEFAULT_BULK_SETTINGS.layout},
	renderSettings: {...DEFAULT_BULK_SETTINGS.render},
}
let activeSrc = DEFAULT_BULK_SCENE_SRC
let lastAppliedSceneState: {layoutSettings: Partial<BulkLayoutSettings>; src: string} | null = null
let pendingSceneState: {layoutSettings: Partial<BulkLayoutSettings>; src: string} | null = null

const SETTINGS_LOAD_TIMEOUT_MS = 1_200
const force = new Force("bulk")
let forceConnected = false

const updateBulkStats = (stats: BulkViewportStats): void => {
	hud?.setStats(stats)
}

const applySnapshotWorld = (
	src: string,
	snapshot: BulkRuntimeSnapshot,
	layoutSettings: Partial<BulkLayoutSettings>,
): void => {
	if (!bulkViewport) return

	bulkViewport.applyManifest(buildBoundaryBulkManifest(snapshot, src, layoutSettings))
	if (pendingSceneState && pendingSceneState.src === src) {
		lastAppliedSceneState = pendingSceneState
		pendingSceneState = null
	}
	hud?.setBusy(!forceConnected)
}

const applySnapshotMessage = (message: SnapshotMessage): void => {
	currentSnapshot = message.snapshot
	if (!bulkViewport) {
		pendingSnapshotMessage = message
		return
	}

	const layoutSettings = pendingSceneState?.src === message.src
		? pendingSceneState.layoutSettings
		: activeSettings.layoutSettings
	applySnapshotWorld(message.src, message.snapshot, layoutSettings)
}

const areLayoutSettingsEqual = (
	left: Partial<BulkLayoutSettings> | null,
	right: Partial<BulkLayoutSettings> | null,
): boolean => {
	if (!left || !right) return false
	return BULK_LAYOUT_SETTING_KEYS.every((key) => left[key] === right[key])
}

const normalizeSceneSrc = (src: string | null | undefined): string => {
	const next = src?.trim() ?? ""
	return next.length > 0 ? next : DEFAULT_BULK_SCENE_SRC
}

const persistedSettingsSnapshot = (): SettingsSnapshot => ({
	src: activeSrc,
	layoutSettings: activeSettings.layoutSettings,
	renderSettings: activeSettings.renderSettings,
})

const persistSettings = async (): Promise<void> => {
	await saveSettings(persistedSettingsSnapshot())
}

const schedulePersistSettings = (settings: BulkHudSettingsSnapshot): void => {
	activeSettings = cloneSettings(settings)
	if (persistSettingsTimer !== null) clearTimeout(persistSettingsTimer)
	persistSettingsTimer = setTimeout(() => {
		persistSettingsTimer = null
		void persistSettings().catch((error) => {
			console.error("settings persist error:", error)
		})
	}, 120)
}

const flushPersistSettings = (): void => {
	if (persistSettingsTimer !== null) {
		clearTimeout(persistSettingsTimer)
		persistSettingsTimer = null
	}

	void persistSettings().catch((error) => {
		console.error("settings persist error:", error)
	})
}

const createMaterializePayload = (
	src: string,
	settings: BulkHudSettingsSnapshot,
): ClientMaterializePayload => ({
	type: "materialize",
	src: normalizeSceneSrc(src),
	layoutSettings: settings.layoutSettings,
})

const applyHudRequest = (src: string, settings: BulkHudSettingsSnapshot): void => {
	activeSettings = cloneSettings(settings)
	const payload = createMaterializePayload(src, settings)
	activeSrc = payload.src
	flushPersistSettings()
	bulkViewport?.setLayoutSettings(payload.layoutSettings)
	bulkViewport?.setRenderSettings(settings.renderSettings)

	const needsMaterialize = !lastAppliedSceneState || lastAppliedSceneState.src !== payload.src
	const needsRelayout =
		!needsMaterialize && lastAppliedSceneState && !areLayoutSettingsEqual(lastAppliedSceneState.layoutSettings, payload.layoutSettings)
	if (!needsMaterialize && !needsRelayout) {
		hud?.setBusy(false)
		return
	}

	hud?.setBusy(true)
	pendingSceneState = {
		src: payload.src,
		layoutSettings: payload.layoutSettings,
	}

	if (needsRelayout && currentSnapshot) {
		applySnapshotWorld(payload.src, currentSnapshot, payload.layoutSettings)
		return
	}

	if (!forceConnected) {
		hud?.setBusy(true)
		return
	}

	force.impulse(payload)
}

const applyRenderSettingsFromHud = (renderSettings: Partial<BulkRenderSettings>): void => {
	activeSettings = {
		...activeSettings,
		renderSettings: {...renderSettings},
	}
	bulkViewport?.setRenderSettings(renderSettings)
	schedulePersistSettings(activeSettings)
}

const requestInitialMaterialization = (): void => {
	if (initialMaterializationRequested || !forceConnected || hud === null || bulkViewport === null) return
	initialMaterializationRequested = true
	applyHudRequest(hud.currentSrc(), activeSettings)
}

const loadSettingsSafe = async (): Promise<SettingsSnapshot | null> => {
	try {
		return await withTimeout(
			loadSettings(),
			SETTINGS_LOAD_TIMEOUT_MS,
			`settings load timed out after ${SETTINGS_LOAD_TIMEOUT_MS}ms`,
		)
	} catch {
		return null
	}
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
			}),
		])
	} finally {
		if (timeout !== null) clearTimeout(timeout)
	}
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
	const persisted = await loadSettingsSafe()
	if (persisted !== null) {
		activeSrc = normalizeSceneSrc(persisted.src)
		activeSettings = {
			layoutSettings: {...DEFAULT_BULK_SETTINGS.layout, ...persisted.layoutSettings},
			renderSettings: {...DEFAULT_BULK_SETTINGS.render, ...persisted.renderSettings},
		}
	}

	await waitForVisibleDocument()
	const rect = bulkCanvas.getBoundingClientRect()
	bulkViewport = await createBulkViewport({
		canvas: bulkCanvas,
		width: Math.max(1, Math.floor(rect.width)),
		height: Math.max(1, Math.floor(rect.height)),
		onStats: updateBulkStats,
	})
	bulkViewport.setLayoutSettings(activeSettings.layoutSettings)
	bulkViewport.setRenderSettings(activeSettings.renderSettings)
	hud = installBulkHud({
		viewport: bulkViewport,
		initialSrc: activeSrc,
		initialSettings: activeSettings,
		onApply: applyHudRequest,
		onRenderSettingsChange: applyRenderSettingsFromHud,
		onSettingsPersist: schedulePersistSettings,
	})
	hud.setConnectionStatus(forceConnected)
	requestInitialMaterialization()

	if (pendingSnapshotMessage) {
		const snapshotMessage = pendingSnapshotMessage
		pendingSnapshotMessage = null
		applySnapshotMessage(snapshotMessage)
	}

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

force.onCreate = (message: unknown) => {
	forceConnected = true
	hud?.setConnectionStatus(true)

	if (typeof message !== "object" || message === null) return
	if (
		(message as {version?: unknown}).version === 1 &&
		Array.isArray((message as {actors?: unknown}).actors) &&
		Array.isArray((message as {wimps?: unknown}).wimps)
	) {
		initialMaterializationRequested = true
		applySnapshotMessage({type: "snapshot", src: activeSrc, snapshot: message as BulkRuntimeSnapshot})
		return
	}
	if ((message as {type?: unknown}).type === "snapshot") {
		initialMaterializationRequested = true
		applySnapshotMessage(message as SnapshotMessage)
		return
	}
	if ((message as {type?: unknown}).type === "error") {
		hud?.setBusy(!forceConnected)
	}
	requestInitialMaterialization()
}

force.onDestroy = () => {
	forceConnected = false
	initialMaterializationRequested = false
	hud?.setConnectionStatus(false)
	hud?.setBusy(true)
}

force.onImpulse = (forceMessage) => {
		let snapshotNeedsRebuild = false
		for (const part of forceMessage.parts) {
			if (currentSnapshot && applyForcePartToSnapshot(currentSnapshot, part) === "rebuild") snapshotNeedsRebuild = true
			if (part.part === "graviton" && part.path === "/structural") {
				const signal = part.value as {rootSrc?: unknown}
				const rootSrc = signal.rootSrc
				if (typeof rootSrc !== "string") continue
				if (pendingSceneState && pendingSceneState.src === rootSrc) {
					lastAppliedSceneState = pendingSceneState
					pendingSceneState = null
					hud?.setBusy(!forceConnected)
				}
				continue
			}
			bulkViewport?.handleForce(part.part, part)
		}
		if (snapshotNeedsRebuild && currentSnapshot && lastAppliedSceneState) {
			applySnapshotWorld(lastAppliedSceneState.src, currentSnapshot, lastAppliedSceneState.layoutSettings)
		}
}

function cloneSettings(settings: BulkHudSettingsSnapshot): BulkHudSettingsSnapshot {
	return {
		layoutSettings: {...settings.layoutSettings},
		renderSettings: {...settings.renderSettings},
	}
}
