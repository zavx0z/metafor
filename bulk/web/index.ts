import type {
	BulkRenderDarkParticle as BulkDarkParticle,
	BulkRenderFieldParticle as BulkFieldParticle,
	BulkRenderFieldProxy as BulkFieldProxy,
	BulkRenderManifest as BulkManifest,
	BulkRenderOrbitalParticle as BulkOrbitalParticle,
} from "@metafor/types/bulk/manifest"
import type {
	BulkViewportController,
	BulkViewportFitAxis,
	BulkViewportOptions,
	BulkViewportStats,
	BulkVisualLayer,
	BulkViewPose,
	BulkWebkitFullscreenDocument,
	BulkWebkitFullscreenElement,
	CanvasTouchTapState,
	DarkParticleRenderRecord,
	FadingLabelRemovalRecord,
	FadingRemovalRecord,
	FieldParticleRenderRecord,
	HoverablePickTarget,
	LabelRenderRecord,
	LabelSpec,
	RestoredBulkViewPose,
	StoredBulkViewPose,
	SurfaceLabelVisual,
	ViewNavigationState,
} from "@metafor/types/bulk/viewport"
import type {
	BulkHudSurfaceSlot,
	BulkViewportHudController,
	BulkViewportWithHud,
} from "@metafor/types/bulk/hud"
import type { BulkRenderSettings } from "@metafor/types/bulk/settings"
import type { SurfaceArcLimits, TextExtents } from "@metafor/types/bulk/text"
import type {
	BulkVisualQuantumMaterial,
	BulkVisualRelationPath,
	BulkVisualRenderManifest,
	BulkVisualRenderPatch,
	BulkVisualTransitionPath,
} from "@metafor/types/bulk/visual"
import type {Particle} from "shared/protocol/force/particle"
import {
	DEFAULT_BULK_SETTINGS,
	bulkViewportConfig,
	normalizeBulkRenderSettings,
	resolveBulkTorusLabelMetrics,
} from "bulk/settings"
import {shouldContinueBulkRenderLoop} from "./render-loop.ts"
import {
	assertBulkVisualProjectionBoundary,
	bulkVisualFieldSourceAddress,
	changedBulkVisualQuantumMaterialIds,
	changedBulkVisualShapeIds,
	indexBulkVisualFieldAliases,
} from "./visual-projection.ts"
import {
	pruneUnusedRenderGeometryCache,
	releaseRenderGeometryCache,
	releaseUniqueRenderGeometry,
	replaceUniqueRenderGeometry,
} from "./render-resources.ts"
import {
	applyVisualLineMaterial,
	createVisualLineMaterial,
	createVisualQuantumMaterial,
} from "@metafor/visual"
import {resolveOwnedAtomVisualFitBounds} from "./atom-visual-fit.ts"
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	GridHelper,
	LineGlowMaterial,
	LineSegments,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	PlaneGeometry,
	Quaternion,
	Renderer,
	Space,
	SphereGeometry,
	Text,
	TextMaterial,
	TorusGeometry,
	TrueTypeFont,
	Raycaster,
	Vector3,
	ViewPoint,
} from "@metafor/engine"
import {
	HUD,
	UiSurface,
	VirtualInput,
	Z,
	drawIconCentered,
	handleActiveInputKey,
	insertActiveInputText,
	surfaceHasActiveInput,
	uiIcons,
	type VirtualInputSoftKeyboardMode,
	type UiRuntime,
	type UiSurfaceLayoutFn,
	type UiSurfaceLayerOpts,
	type UiSurfaceNode,
	type UiSurfaceRect,
} from "@ui/elements"
import {
	getBulkPickTargetKey,
	isBulkSpherePickTarget,
	resolveBulkHoverPriorityTarget,
	resolveBulkPickHit,
	resolveBulkPickHits,
	resolveBulkViewportFitPose,
} from "../web-navigation"
import type {
	BulkEmbeddedPickShape,
	BulkHoverPriorityCandidate,
	BulkPickTarget,
} from "@metafor/types/bulk/viewport"
import {BulkSceneStore} from "../scene"
import {mergeVisualBatchPaths} from "./visual-patch-application"
import {
	bendTextAroundEquator,
	createSurfaceLabel,
	resolveSurfaceFitScale,
} from "@bulk/gravity/text"

import {
	FOCUS_FLIGHT_MS,
	HOVER_PICK_HIT_PADDING_MM,
	HOVER_PRIORITY_HYSTERESIS_PX,
	HOVER_RETENTION_HIT_PADDING_MM,
	INPUT_RENDER_WAKE_MS,
	LABEL_FADE_IN_MS,
	LABEL_INITIAL_SCALE,
	MIN_SURFACE_LABEL_FIT_SCALE,
	POSITION_SMOOTHING_MS,
	REMOVAL_FADE_MS,
	REMOVAL_SCALE_MULTIPLIER,
	ROOT_BACKGROUND,
	SCALE_SMOOTHING_MS,
	SCENE_TRANSITION_WAKE_MS,
	SURFACE_ARC_LIMITS,
	THEME_PRIMARY,
	THEME_PRIMARY_GLOW,
	THEME_SECONDARY,
	THEME_SECONDARY_GLOW,
	THEME_TERTIARY,
	THEME_TERTIARY_GLOW,
} from "./constants"
import { computeLerpFactor, easeOutCubic, mixScalar, renderLocalLength } from "./math"
import { resolveForceFieldId, resolveForceFieldsPayload } from "shared/protocol/force/fields"
import {
	resolveForceImpulseRadius,
	resolveForceImpulseTiming,
	resolveForceImpulseVisual,
} from "./force-protocol"

export type BulkVisualViewportWithHud = BulkViewportWithHud & Readonly<{
	applyVisualManifestPatch(projection: BulkVisualRenderManifest): void
	applyVisualRenderPatch(patch: BulkVisualRenderPatch): void
}>

const LABEL_TEXT_COLOR = new Color(1, 1, 1)

type OrbitalParticleRenderRecord = {
	depth: number
	node: Mesh
	material: ReturnType<typeof createVisualQuantumMaterial>
	pickTarget: HoverablePickTarget
	snapshot: BulkOrbitalParticle
	targetLocalPosition: Vector3
}

type FieldProxyRenderRecord = {
	depth: number
	node: Mesh
	material: ReturnType<typeof createVisualQuantumMaterial>
	pickTarget: HoverablePickTarget
	snapshot: BulkFieldProxy
}

type LineBatchRenderRecord = {
	fingerprint: string
	line: LineSegments
	material: LineGlowMaterial
	ownerDarkParticleId: number
}

type ImpulseRenderRecord = {
	node: Mesh
	start: Vector3
	target: Vector3
	startedAtMs: number
	durationMs: number
}

const NAVIGATION_VIEWPORT_FIT_PADDING_RATIO = 1.25
const BULK_RADIAL_MENU_SECTOR_COUNT = 12
const BULK_RADIAL_MENU_SIZE_PX = 296
const BULK_RADIAL_MENU_INNER_SIZE_PX = 150
const BULK_RADIAL_MENU_LONG_PRESS_MS = 560
const BULK_RADIAL_MENU_LONG_PRESS_MOVE_PX = 10
const BULK_RADIAL_MENU_PROJECTED_HIT_PAD_PX = 48
const BULK_RADIAL_MENU_HUD_Z = 10
const BULK_TOUCH_TAP_MOVE_PX = 14
let activeRenderSettings: BulkRenderSettings = { ...DEFAULT_BULK_SETTINGS.render }

const BULK_VIEW_POSE_STORAGE_KEY = "metafor.bulk.viewport.pose:v2"

const vectorFromStoredBulkPose = (value: unknown): Vector3 | null => {
	if (typeof value !== "object" || value === null) return null
	const record = value as Record<string, unknown>
	const x = typeof record.x === "number" ? record.x : NaN
	const y = typeof record.y === "number" ? record.y : NaN
	const z = typeof record.z === "number" ? record.z : NaN
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
	return new Vector3(x, y, z)
}

const readStoredBulkViewPose = (): RestoredBulkViewPose | null => {
	try {
		const raw = window.sessionStorage.getItem(BULK_VIEW_POSE_STORAGE_KEY)
		if (raw === null) return null
		const stored = JSON.parse(raw) as Partial<StoredBulkViewPose>
		if (stored.href !== window.location.href) return null
		const position = vectorFromStoredBulkPose(stored.position)
		const target = vectorFromStoredBulkPose(stored.target)
		const up = vectorFromStoredBulkPose(stored.up)
		if (position === null || target === null || up === null || position.distanceTo(target) <= 1e-6 || up.length() <= 1e-6) return null
		return {
			position,
			rootFitLockedToViewport: stored.rootFitLockedToViewport ?? true,
			target,
			up: up.normalize(),
		}
	} catch {
		return null
	}
}
const writeStoredBulkViewPose = (pose: BulkViewPose, rootFitLockedToViewport: boolean): void => {
	try {
		window.sessionStorage.setItem(BULK_VIEW_POSE_STORAGE_KEY, JSON.stringify({
			href: window.location.href,
			position: {x: pose.position.x, y: pose.position.y, z: pose.position.z},
			rootFitLockedToViewport,
			target: {x: pose.target.x, y: pose.target.y, z: pose.target.z},
			up: {x: pose.up.x, y: pose.up.y, z: pose.up.z},
		} satisfies StoredBulkViewPose))
	} catch {
		// Session storage is best-effort. Reload still works without pose persistence.
	}
}

const bulkFullscreenElement = (): Element | null => {
	const webkitDocument = document as BulkWebkitFullscreenDocument
	return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null
}

const requestBulkFullscreen = async (preferredTarget: Element): Promise<void> => {
	const targets = bulkFullscreenTargetCandidates(preferredTarget)
	let lastError: unknown = null
	for (const target of targets) {
		try {
			await requestBulkElementFullscreen(target)
			return
		} catch (error) {
			lastError = error
		}
	}
	throw lastError ?? new Error("fullscreen request failed")
}

const requestBulkElementFullscreen = async (target: Element): Promise<void> => {
	if (target.requestFullscreen !== undefined) {
		if (!isBulkAndroidBrowser()) {
			try {
				await target.requestFullscreen({navigationUI: "hide"} as FullscreenOptions)
				return
			} catch (error) {
				if (!isBulkFullscreenOptionsError(error)) throw error
			}
		}
		await target.requestFullscreen()
		return
	}
	const webkitTarget = target as BulkWebkitFullscreenElement
	const request = webkitTarget.webkitRequestFullscreen ?? webkitTarget.webkitRequestFullScreen
	if (request === undefined) throw new Error(`fullscreen is not available on ${target.tagName.toLowerCase()}`)
	await Promise.resolve(request.call(target))
}

const bulkFullscreenTargetCandidates = (preferredTarget: Element): Element[] => {
	const body = document.body
	const root = document.documentElement
	const preferred: Array<Element | null> = isBulkAndroidBrowser()
		? [root, body, preferredTarget]
		: [preferredTarget, root, body]
	return uniqueBulkElements(preferred.filter((item): item is Element => item instanceof Element))
}

const uniqueBulkElements = (elements: readonly Element[]): Element[] => {
	const seen = new Set<Element>()
	const result: Element[] = []
	for (const element of elements) {
		if (seen.has(element)) continue
		seen.add(element)
		result.push(element)
	}
	return result
}

const isBulkAndroidBrowser = (): boolean => {
	const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
	return /android/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)
}

const isBulkFullscreenOptionsError = (error: unknown): boolean => {
	const text = error instanceof Error ? error.message : String(error)
	return /dictionary|navigationUI|parameter|argument|options|type/i.test(text)
}

const exitBulkFullscreen = async (): Promise<void> => {
	const webkitDocument = document as BulkWebkitFullscreenDocument
	if (document.exitFullscreen !== undefined && document.fullscreenElement !== null) {
		await document.exitFullscreen()
		return
	}
	const exit = webkitDocument.webkitExitFullscreen ?? webkitDocument.webkitCancelFullScreen
	if (exit !== undefined && webkitDocument.webkitFullscreenElement !== null) await Promise.resolve(exit.call(document))
}

const getViewportConfig = () => bulkViewportConfig.viewport
const getWorkspaceBaseZ = (): number => getViewportConfig().levelsMm.elbow
const getFloorZ = (): number => getViewportConfig().levelsMm.floor

const particleColor = (particle: { colorR: number; colorG: number; colorB: number }): Color =>
	new Color(particle.colorR, particle.colorG, particle.colorB)

const glowColor = (color: Color, alpha: number = 0.14): Color =>
	new Color(
		color.r + (1 - color.r) * 0.7,
		color.g + (1 - color.g) * 0.7,
		color.b + (1 - color.b) * 0.7,
		alpha,
	)

const normalizeLabelText = (value: string | null | undefined): string | null => {
	if (typeof value !== "string") return null
	const text = value.trim()
	return text.length > 0 ? text : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const forceString = (value: unknown): string | null => {
	if (typeof value !== "string") return null
	const text = value.trim()
	return text.length > 0 ? text : null
}

const forcePositiveInteger = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null
	const numeric = Number(value)
	return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

const forceAtomDarkParticleId = (value: unknown): number | null => {
	const atomId = forcePositiveInteger(value)
	if (atomId === null) return null
	const darkParticleId = atomId * 2
	return Number.isSafeInteger(darkParticleId) ? darkParticleId : null
}

const getGeometryPositionArray = (geometry: BufferGeometry): Float32Array | null => {
	const positions = geometry.attributes.position?.array
	return positions instanceof Float32Array ? positions : null
}

const detachObject = (object: Object3D): void => {
	if (!object.parent) return
	object.parent.children = object.parent.children.filter((child) => child !== object)
	object.parent = null
}

class BulkRadialMenuPane extends UiSurface {
	onClose: (() => void) | null = null
	readonly #handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.close()
	}
	#visible = false
	#center = {x: 0, y: 0}
	#hoveredSector: number | null = null
	#pressedSector: number | null = null

	constructor() {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkRadialMenuPane"
		document.addEventListener("keydown", this.#handleKeyDown, true)
	}

	open(center: {x: number; y: number}): void {
		this.#visible = true
		this.#center = center
		this.#hoveredSector = null
		this.#pressedSector = null
		this.requestRender()
	}

	setCenter(center: {x: number; y: number}): void {
		if (!this.#visible) return
		if (Math.hypot(center.x - this.#center.x, center.y - this.#center.y) <= 0.25) return
		this.#center = center
		this.#hoveredSector = null
		this.#pressedSector = null
		this.requestRender()
	}

	close(): void {
		if (!this.#visible) return
		this.#visible = false
		this.#hoveredSector = null
		this.#pressedSector = null
		this.onClose?.()
		this.requestRender()
	}

	acceptsPointerEvents(): boolean {
		return this.#visible
	}

	containsPointer(localX: number, localY: number): boolean {
		return this.#sectorAt(localX, localY) !== null
	}

	protected render(): void {
		if (!this.#visible) return
		const center = this.#menuCenter()
		const outerRadius = BULK_RADIAL_MENU_SIZE_PX / 2
		const innerRadius = BULK_RADIAL_MENU_INNER_SIZE_PX / 2
		const base = new Color(0.035, 0.095, 0.13, 0.76)
		const border = new Color(0.22, 0.78, 0.94, 0.62)
		const bright = new Color(0.48, 0.94, 1, 0.88)

		this.#drawCircleStroke(
			center.x,
			center.y,
			(outerRadius + innerRadius) / 2,
			base,
			outerRadius - innerRadius,
			Z.CONTAINER + 0.2,
			96,
		)
		this.#drawCircleStroke(center.x, center.y, outerRadius - 1, border, 1.6, Z.ELEMENT + 0.14, 96)
		this.#drawCircleStroke(center.x, center.y, innerRadius + 1, new Color(0.48, 0.94, 1, 0.18), 1.2, Z.ELEMENT + 0.14, 72)

		for (let index = 0; index < BULK_RADIAL_MENU_SECTOR_COUNT; index += 1) {
			const angle = -Math.PI / 2 + index * this.#sectorAngle()
			const x0 = center.x + Math.cos(angle) * innerRadius
			const y0 = center.y + Math.sin(angle) * innerRadius
			const x1 = center.x + Math.cos(angle) * outerRadius
			const y1 = center.y + Math.sin(angle) * outerRadius
			this.drawRoundedLine(x0, y0, x1, y1, new Color(0.08, 0.28, 0.36, 0.68), 2.4, Z.ELEMENT + 0.22)
		}

		if (this.#hoveredSector !== null) {
			this.#drawSectorStroke(this.#hoveredSector, bright, this.#pressedSector === this.#hoveredSector ? 5 : 3, Z.TEXT + 0.2)
		}
	}

	override onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
		const next = this.#sectorAt(localX, localY)
		if (this.canvas !== null) this.canvas.canvas.style.cursor = next === null ? "default" : "pointer"
		if (next === this.#hoveredSector) return
		this.#hoveredSector = next
		this.requestRender()
	}

	override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
		if (event.button !== 0) return
		this.#pressedSector = this.#sectorAt(localX, localY)
		event.preventDefault()
		this.requestRender()
	}

	override onPointerUp(event: MouseEvent): void {
		this.#pressedSector = null
		event.preventDefault()
		this.requestRender()
	}

	override onContextMenu(event: MouseEvent): void {
		event.preventDefault()
	}

	override onPointerLeave(): void {
		this.#hoveredSector = null
		this.#pressedSector = null
		if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
		this.requestRender()
	}

	override dispose(): void {
		document.removeEventListener("keydown", this.#handleKeyDown, true)
		super.dispose()
	}

	#menuCenter(): {x: number; y: number} {
		return this.#center
	}

	#sectorAngle(): number {
		return (Math.PI * 2) / BULK_RADIAL_MENU_SECTOR_COUNT
	}

	#sectorAt(localX: number, localY: number): number | null {
		if (!this.#visible) return null
		const center = this.#menuCenter()
		const dx = localX - center.x
		const dy = localY - center.y
		const distance = Math.hypot(dx, dy)
		if (distance < BULK_RADIAL_MENU_INNER_SIZE_PX / 2 || distance > BULK_RADIAL_MENU_SIZE_PX / 2) return null
		const normalized = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
		return Math.min(BULK_RADIAL_MENU_SECTOR_COUNT - 1, Math.floor(normalized / this.#sectorAngle()))
	}

	#drawCircleStroke(cx: number, cy: number, radius: number, color: Color, thickness: number, z: number, segments: number): void {
		for (let index = 0; index < segments; index += 1) {
			const a0 = (index / segments) * Math.PI * 2
			const a1 = ((index + 1) / segments) * Math.PI * 2
			this.drawRoundedLine(
				cx + Math.cos(a0) * radius,
				cy + Math.sin(a0) * radius,
				cx + Math.cos(a1) * radius,
				cy + Math.sin(a1) * radius,
				color,
				thickness,
				z,
			)
		}
	}

	#drawSectorStroke(index: number, color: Color, thickness: number, z: number): void {
		const center = this.#menuCenter()
		const outerRadius = BULK_RADIAL_MENU_SIZE_PX / 2 - 6
		const innerRadius = BULK_RADIAL_MENU_INNER_SIZE_PX / 2 + 6
		const start = -Math.PI / 2 + index * this.#sectorAngle()
		const end = start + this.#sectorAngle()
		for (const angle of [start, end]) {
			this.drawRoundedLine(
				center.x + Math.cos(angle) * innerRadius,
				center.y + Math.sin(angle) * innerRadius,
				center.x + Math.cos(angle) * outerRadius,
				center.y + Math.sin(angle) * outerRadius,
				color,
				thickness,
				z,
			)
		}
		const arcSegments = 5
		for (let segment = 0; segment < arcSegments; segment += 1) {
			const a0 = start + (segment / arcSegments) * this.#sectorAngle()
			const a1 = start + ((segment + 1) / arcSegments) * this.#sectorAngle()
			for (const radius of [innerRadius, outerRadius]) {
				this.drawRoundedLine(
					center.x + Math.cos(a0) * radius,
					center.y + Math.sin(a0) * radius,
					center.x + Math.cos(a1) * radius,
					center.y + Math.sin(a1) * radius,
					color,
					thickness,
					z,
				)
			}
		}
	}
}

const readObjectScenePosition = (object: Object3D, target: Vector3): Vector3 => {
	const elements = object.matrixWorld.elements
	return target.set(elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0)
}

/** Большой экваториальный радиус Torus вместе с surface-offset подписи. */
const resolveCanonicalCurveRadius = (spec: LabelSpec): number =>
	Math.max(spec.torusRadius + spec.torusTube + spec.offset, 1e-6)

const createSurfaceLabelNode = (spec: LabelSpec, font: TrueTypeFont): SurfaceLabelVisual => {
	const label = createSurfaceLabel({
		text: spec.text,
		font,
		baseFontSize: spec.fontSize,
		material: new TextMaterial({ color: LABEL_TEXT_COLOR, opacity: 1, depthWrite: true }),
		curveRadiusMm: resolveCanonicalCurveRadius(spec),
		limits: SURFACE_ARC_LIMITS,
		minScale: MIN_SURFACE_LABEL_FIT_SCALE,
	})

	label.textNode.frustumCulled = false
	label.textNode.updateMatrix()

	const container = new Object3D()
	container.add(label.textNode)
	container.updateMatrix()

	return {
		container,
		coverCenterX: label.coverCenterX,
		extents: label.extents,
		initialCoverPositions: label.initialCoverPositions,
		initialStencilPositions: label.initialStencilPositions,
		material: label.textNode.material,
		stencilCenterX: label.stencilCenterX,
		textNode: label.textNode,
	}
}

const copyQuantumMaterial = (
	target: ReturnType<typeof createVisualQuantumMaterial>,
	source: ReturnType<typeof createVisualQuantumMaterial>,
): void => {
	target.color.copy(source.color)
	target.rimColor.copy(source.rimColor)
	target.opacity = source.opacity
	target.rimStrength = source.rimStrength
	target.iridescence = source.iridescence
	target.filmThickness = source.filmThickness
	target.highlightSize = source.highlightSize
}

const mixColor = (left: Color, right: Color, amount: number): Color =>
	new Color(
		left.r + (right.r - left.r) * amount,
		left.g + (right.g - left.g) * amount,
		left.b + (right.b - left.b) * amount,
		left.a + (right.a - left.a) * amount,
	)

const brightenColor = (color: Color, amount: number): Color => mixColor(color, new Color(1, 1, 1, color.a), amount)

const createWorkspaceGrid = (): GridHelper => {
	const gridConfig = getViewportConfig().grid
	const grid = new GridHelper(
		gridConfig.sizeMm,
		gridConfig.divisions,
		gridConfig.centerColorHex,
		gridConfig.colorHex,
	)
	grid.position.z = getFloorZ()
	grid.frustumCulled = false
	grid.updateMatrix()
	return grid
}

class BulkViewportHudRuntime implements BulkViewportHudController {
	readonly canvas: HTMLCanvasElement
	readonly renderer: Renderer
	readonly inputProxy: VirtualInput | null
	readonly #hud: HUD
	readonly #viewPoint: ViewPoint
	readonly #font: TrueTypeFont
	readonly #requestFrame: (wakeMs?: number) => void
	readonly #surfaces: BulkHudSurfaceSlot[] = []
	#surfaceOrder = 0
	#windowOrder = 0
	readonly #windowOrders = new Map<string, number>()
	readonly #windowZIndexes = new Map<string, number>()
	#activeWindowId: string | null = null
	#width = 1
	#height = 1
	#pixelScale = 1
	#focused: UiSurfaceNode | null = null
	#pressedSlot: BulkHudSurfaceSlot | null = null
	#hoveredSlot: BulkHudSurfaceSlot | null = null
	#activeTouchId: number | null = null
	#lastTouchEventAt = 0
	#claimNextClick = false
	#disposed = false

	readonly #handleWheel = (event: WheelEvent): void => this.#onWheel(event)
	readonly #handleMouseMove = (event: MouseEvent): void => this.#onMouseMove(event)
	readonly #handleMouseDown = (event: MouseEvent): void => this.#onMouseDown(event)
	readonly #handleMouseUp = (event: MouseEvent): void => this.#onMouseUp(event)
	readonly #handleClick = (event: MouseEvent): void => this.#onClick(event)
	readonly #handleMouseLeave = (): void => this.#onMouseLeave()
	readonly #handleTouchStart = (event: TouchEvent): void => this.#onTouchStart(event)
	readonly #handleTouchMove = (event: TouchEvent): void => this.#onTouchMove(event)
	readonly #handleTouchEnd = (event: TouchEvent): void => this.#onTouchEnd(event)
	readonly #handleTouchCancel = (event: TouchEvent): void => this.#onTouchCancel(event)
	readonly #handleContextMenu = (event: MouseEvent): void => this.#onContextMenu(event)
	readonly #handleKey = (event: KeyboardEvent): void => this.#onKey(event)
	readonly #handleWindowKey = (event: KeyboardEvent): void => this.#onWindowKey(event)
	readonly #handleWindowBlur = (): void => {
		if (this.inputProxy?.softKeyboardActive() === true) return
		this.setFocused(null)
	}
	readonly #handleVisibilityChange = (): void => {
		if (document.visibilityState !== "visible") this.setFocused(null)
	}

	constructor(
		canvas: HTMLCanvasElement,
		renderer: Renderer,
		viewPoint: ViewPoint,
		font: TrueTypeFont,
		requestFrame: (wakeMs?: number) => void,
	) {
		this.canvas = canvas
		this.renderer = renderer
		this.#viewPoint = viewPoint
		this.#font = font
		this.#requestFrame = requestFrame
		this.#hud = new HUD({distanceMm: 600})
		this.inputProxy = new VirtualInput(canvas.parentElement ?? document.body)
		this.inputProxy.onKey((event) => this.#onKey(event))
		this.inputProxy.onText((text) => this.#onInputText(text))
		this.#attachInputListeners()
	}

	get overlay(): HUD {
		return this.#hud
	}

	addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts: UiSurfaceLayerOpts = {}): void {
		surface.attachCanvas(this as unknown as UiRuntime)
		surface.setFramebufferClipSpace?.("screen")
		this.#hud.add(surface.node)
		const rect = layout({w: this.#width, h: this.#height})
		const windowId = this.#surfaceWindowId(opts)
		this.#surfaces.push({
			surface,
			layout,
			rect,
			order: this.#surfaceOrder++,
			windowZIndex: this.#surfaceWindowZIndexFor(windowId, opts),
			zIndex: windowId === null ? 0 : opts.zIndex ?? 0,
			windowId,
			windowOrder: this.#windowOrderFor(windowId),
	})
		this.#syncActiveSurfaceStates()
		this.#sortSurfaceSlots()
		this.#applyLayout()
		this.requestRender()
	}

	clearSurfaceRect(surface: UiSurfaceNode): void {
		const slot = this.#slotForSurface(surface)
		if (slot === null || slot.rectOverride === undefined) return
		delete slot.rectOverride
		this.#applyLayout()
		this.requestRender()
	}

	dispose(): void {
		this.#disposed = true
		this.canvas.removeEventListener("wheel", this.#handleWheel, true)
		this.canvas.removeEventListener("mousemove", this.#handleMouseMove, true)
		this.canvas.removeEventListener("mousedown", this.#handleMouseDown, true)
		this.canvas.removeEventListener("mouseleave", this.#handleMouseLeave, true)
		this.canvas.removeEventListener("click", this.#handleClick, true)
		this.canvas.removeEventListener("touchstart", this.#handleTouchStart, true)
		window.removeEventListener("touchmove", this.#handleTouchMove, true)
		window.removeEventListener("touchend", this.#handleTouchEnd, true)
		window.removeEventListener("touchcancel", this.#handleTouchCancel, true)
		this.canvas.removeEventListener("contextmenu", this.#handleContextMenu, true)
		this.canvas.removeEventListener("keydown", this.#handleKey, true)
		window.removeEventListener("mouseup", this.#handleMouseUp, true)
		window.removeEventListener("keydown", this.#handleWindowKey, true)
		window.removeEventListener("blur", this.#handleWindowBlur)
		document.removeEventListener("visibilitychange", this.#handleVisibilityChange)
		this.setFocused(null)
		this.#pressedSlot = null
		this.#hoveredSlot = null
		this.inputProxy?.dispose()
		for (const slot of this.#surfaces) {
			slot.surface.dispose?.()
			this.#hud.remove(slot.surface.node)
	}
		this.#surfaces.length = 0
	}

	flushPendingRender(): void {
		for (const slot of this.#surfaces) slot.surface.flushPendingRender?.()
	}

	handleSize(width: number, height: number): void {
		const nextW = Math.max(1, Math.floor(width))
		const nextH = Math.max(1, Math.floor(height))
		this.#width = nextW
		this.#height = nextH
		const physicalHeight = 2 * this.#hud.distanceMm * Math.tan(this.#viewPoint.fov / 2)
		this.#pixelScale = physicalHeight / nextH
		this.#applyLayout()
		this.requestRender()
	}

	relayout(): void {
		this.#applyLayout()
		this.requestRender()
	}

	requestRender(): void {
		if (this.#disposed) return
		this.#requestFrame()
	}

	setFocused(surface: UiSurfaceNode | null): void {
		if (surface !== null) {
			const slot = this.#slotForSurface(surface)
			if (slot !== null) this.#activateSurfaceWindow(slot)
		}
		if (this.#focused === surface) return
		this.#focused?.onDeactivate?.()
		this.#focused = surface
		surface?.onActivate?.()
		this.requestRender()
	}

	setSurfaceRect(surface: UiSurfaceNode, rect: UiSurfaceRect): UiSurfaceRect | null {
		const slot = this.#slotForSurface(surface)
		if (slot === null) return null
		const next = clampBulkHudSurfaceRect(rect, this.#width, this.#height)
		slot.rectOverride = next
		this.#applySurfaceSlotRect(slot, next, false)
		this.requestRender()
		return {...next}
	}

	surfaceFrame(surface: UiSurfaceNode): {rect: UiSurfaceRect; bounds: {w: number; h: number}} | null {
		const slot = this.#slotForSurface(surface)
		if (slot === null) return null
		return {
			rect: {...slot.rect},
			bounds: {w: this.#width, h: this.#height},
	}
	}

	#attachInputListeners(): void {
		this.canvas.addEventListener("wheel", this.#handleWheel, {capture: true, passive: false})
		this.canvas.addEventListener("mousemove", this.#handleMouseMove, true)
		this.canvas.addEventListener("mousedown", this.#handleMouseDown, true)
		this.canvas.addEventListener("mouseleave", this.#handleMouseLeave, true)
		this.canvas.addEventListener("click", this.#handleClick, true)
		this.canvas.addEventListener("touchstart", this.#handleTouchStart, {capture: true, passive: false})
		window.addEventListener("touchmove", this.#handleTouchMove, {capture: true, passive: false})
		window.addEventListener("touchend", this.#handleTouchEnd, {capture: true, passive: false})
		window.addEventListener("touchcancel", this.#handleTouchCancel, {capture: true, passive: false})
		this.canvas.addEventListener("contextmenu", this.#handleContextMenu, true)
		this.canvas.addEventListener("keydown", this.#handleKey, true)
		window.addEventListener("mouseup", this.#handleMouseUp, true)
		window.addEventListener("keydown", this.#handleWindowKey, true)
		window.addEventListener("blur", this.#handleWindowBlur)
		document.addEventListener("visibilitychange", this.#handleVisibilityChange)
		this.canvas.tabIndex = -1
	}

	#applyLayout(): void {
		for (const slot of this.#surfaces) {
			const layoutRect = slot.layout({w: this.#width, h: this.#height})
			const nextRect = layoutRect.visible === false || slot.rectOverride === undefined
				? layoutRect
				: clampBulkHudSurfaceRect(slot.rectOverride, this.#width, this.#height)
			if (layoutRect.visible !== false && slot.rectOverride !== undefined) slot.rectOverride = nextRect
			this.#applySurfaceSlotRect(slot, nextRect, true)
	}
	}

	#applySurfaceSlotRect(slot: BulkHudSurfaceSlot, rect: UiSurfaceRect, forceSetRect: boolean): void {
		const previous = slot.rect
		const previousScale = slot.pixelScale
		slot.rect = rect
		slot.pixelScale = this.#pixelScale
		const visible = rect.visible !== false && rect.w > 0 && rect.h > 0
		slot.surface.node.visible = visible
		if (!visible) {
			this.#releaseHiddenSurfaceSlot(slot)
			return
		}

		slot.surface.node.position.x = (rect.x - this.#width / 2) * this.#pixelScale
		slot.surface.node.position.y = (this.#height / 2 - rect.y) * this.#pixelScale
		slot.surface.node.updateMatrix()

		const sizeChanged = previous.w !== rect.w || previous.h !== rect.h || previous.visible === false || rect.visible === false
		const scaleChanged = previousScale === undefined || previousScale !== this.#pixelScale
		if (forceSetRect || sizeChanged || scaleChanged) {
			slot.surface.setRect(rect, this.#pixelScale, this.#font)
	} else if (previous.x !== rect.x || previous.y !== rect.y) {
			slot.surface.moveRect?.(rect, this.#pixelScale, this.#font) ?? slot.surface.setRect(rect, this.#pixelScale, this.#font)
	}
	}

	#sortSurfaceSlots(): void {
		this.#surfaces.sort((a, b) => a.windowZIndex - b.windowZIndex || a.windowOrder - b.windowOrder || a.zIndex - b.zIndex || a.order - b.order)
		for (const slot of this.#surfaces) this.#hud.add(slot.surface.node)
	}

	#surfaceWindowId(opts: UiSurfaceLayerOpts): string | null {
		const windowId = opts.windowId?.trim()
		return windowId === undefined || windowId.length === 0 ? null : windowId
	}

	#surfaceWindowZIndexFor(windowId: string | null, opts: UiSurfaceLayerOpts): number {
		if (windowId === null) return opts.zIndex ?? 0
		const existing = this.#windowZIndexes.get(windowId)
		if (existing !== undefined) return existing
		const zIndex = opts.windowZIndex ?? 0
		this.#windowZIndexes.set(windowId, zIndex)
		return zIndex
	}

	#windowOrderFor(windowId: string | null): number {
		if (windowId === null) return 0
		const existing = this.#windowOrders.get(windowId)
		if (existing !== undefined) return existing
		const order = ++this.#windowOrder
		this.#windowOrders.set(windowId, order)
		return order
	}

	#activateSurfaceWindow(slot: BulkHudSurfaceSlot): void {
		if (slot.windowId === null) return
		const order = ++this.#windowOrder
		this.#windowOrders.set(slot.windowId, order)
		for (const surfaceSlot of this.#surfaces) {
			if (surfaceSlot.windowId === slot.windowId) surfaceSlot.windowOrder = order
		}
		this.#activeWindowId = slot.windowId
		this.#syncActiveSurfaceStates()
		this.#sortSurfaceSlots()
		this.requestRender()
	}

	#syncActiveSurfaceStates(): void {
		for (const slot of this.#surfaces) {
			slot.surface.setActive?.(slot.windowId !== null && slot.windowId === this.#activeWindowId && slot.zIndex === 0)
		}
	}

	#releaseHiddenSurfaceSlot(slot: BulkHudSurfaceSlot): void {
		if (this.#hoveredSlot === slot) {
			slot.surface.onPointerLeave?.()
			this.#hoveredSlot = null
		}
		if (this.#pressedSlot === slot) {
			this.#pressedSlot = null
			this.#activeTouchId = null
			this.#claimNextClick = false
		}
		if (this.#focused === slot.surface) {
			this.setFocused(null)
			this.inputProxy?.blur()
		}
	}

	#surfaceAt(localX: number, localY: number): BulkHudSurfaceSlot | undefined {
		for (let i = this.#surfaces.length - 1; i >= 0; i -= 1) {
			const slot = this.#surfaces[i]!
			if (slot.surface.acceptsPointerEvents?.() === false) continue
			const rect = slot.rect
			if (slot.surface.node.visible === false || rect.visible === false || rect.w <= 0 || rect.h <= 0) continue
			if (localX < rect.x || localX > rect.x + rect.w || localY < rect.y || localY > rect.y + rect.h) continue
			if (slot.surface.containsPointer?.(localX - rect.x, localY - rect.y) === false) continue
			return slot
	}
		return undefined
	}

	#slotForSurface(surface: UiSurfaceNode): BulkHudSurfaceSlot | null {
		return this.#surfaces.find((slot) => slot.surface === surface) ?? null
	}

	#localCoords(event: MouseEvent | WheelEvent): {x: number; y: number} {
		const rect = this.canvas.getBoundingClientRect()
		return {x: event.clientX - rect.left, y: event.clientY - rect.top}
	}

	#localCoordsFromTouch(touch: Touch): {x: number; y: number} {
		const rect = this.canvas.getBoundingClientRect()
		return {x: touch.clientX - rect.left, y: touch.clientY - rect.top}
	}

	#mouseEventFromTouch(type: "mousedown" | "mousemove" | "mouseup", touch: Touch): MouseEvent {
		const init: MouseEventInit & PointerEventInit = {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === "mouseup" ? 0 : 1,
			clientX: touch.clientX,
			clientY: touch.clientY,
			screenX: touch.screenX,
			screenY: touch.screenY,
			pointerType: "touch",
			pointerId: touch.identifier,
			isPrimary: true,
		}
		const event = typeof PointerEvent === "function" ? new PointerEvent(type, init) : new MouseEvent(type, init)
		Object.defineProperty(event, "metaforPointerType", {value: "touch"})
		return event
	}

	#changedTouch(event: TouchEvent): Touch | null {
		if (this.#activeTouchId === null) return event.changedTouches[0] ?? null
		for (const touch of event.changedTouches) {
			if (touch.identifier === this.#activeTouchId) return touch
	}
		return null
	}

	#positionInputProxy(clientX: number, clientY: number): void {
		this.inputProxy?.setCaretViewport(clientX, clientY)
	}

	#claimPointerEvent(event: MouseEvent | WheelEvent | TouchEvent): void {
		event.stopImmediatePropagation()
	}

	#rememberTouchEvent(): void {
		this.#lastTouchEventAt = Date.now()
	}

	#isCompatibilityMouseEvent(event: MouseEvent): boolean {
		const source = (event as MouseEvent & {sourceCapabilities?: {firesTouchEvents?: boolean} | null}).sourceCapabilities
		if (source?.firesTouchEvents === true) return true
		return this.#lastTouchEventAt > 0 && Date.now() - this.#lastTouchEventAt < 900
	}

	#onWheel(event: WheelEvent): void {
		const local = this.#localCoords(event)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) return
		event.preventDefault()
		this.#claimPointerEvent(event)
		slot.surface.onWheel?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onMouseMove(event: MouseEvent): void {
		if (this.#isCompatibilityMouseEvent(event)) {
			event.preventDefault()
			this.#claimPointerEvent(event)
			return
		}
		const local = this.#localCoords(event)
		const slot = this.#pressedSlot ?? this.#surfaceAt(local.x, local.y)
		if (slot === undefined) {
			this.#hoveredSlot?.surface.onPointerLeave?.()
			this.#hoveredSlot = null
			return
	}
		this.#claimPointerEvent(event)
		if (this.#pressedSlot === null && slot !== this.#hoveredSlot) {
			this.#hoveredSlot?.surface.onPointerLeave?.()
			this.#hoveredSlot = slot
	}
		slot.surface.onPointerMove?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onMouseDown(event: MouseEvent): void {
		if (this.#isCompatibilityMouseEvent(event)) {
			event.preventDefault()
			this.#claimPointerEvent(event)
			this.#claimNextClick = true
			return
		}
		const local = this.#localCoords(event)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) {
			this.#claimNextClick = false
			this.setFocused(null)
			return
	}
		event.preventDefault()
		this.#claimPointerEvent(event)
		this.#claimNextClick = true
		this.#positionInputProxy(event.clientX, event.clientY)
		this.setFocused(slot.surface)
		this.#pressedSlot = slot
		slot.surface.onPointerDown?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
		this.#focusInputProxyForUserSurface(slot.surface, event)
	}

	#onMouseUp(event: MouseEvent): void {
		if (this.#isCompatibilityMouseEvent(event)) {
			event.preventDefault()
			this.#claimPointerEvent(event)
			this.#claimNextClick = false
			return
		}
		const slot = this.#pressedSlot
		if (slot === null) return
		this.#pressedSlot = null
		this.#activeTouchId = null
		this.#claimPointerEvent(event)
		const local = this.#localCoords(event)
		slot.surface.onPointerUp?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onClick(event: MouseEvent): void {
		if (this.#isCompatibilityMouseEvent(event)) {
			this.#claimNextClick = false
			event.preventDefault()
			this.#claimPointerEvent(event)
			return
		}
		const local = this.#localCoords(event)
		const clickedHud = this.#surfaceAt(local.x, local.y) !== undefined
		if (!this.#claimNextClick && !clickedHud) return
		this.#claimNextClick = false
		event.preventDefault()
		this.#claimPointerEvent(event)
	}

	#onTouchStart(event: TouchEvent): void {
		this.#rememberTouchEvent()
		if (this.#activeTouchId !== null || event.changedTouches.length === 0) return
		const touch = event.changedTouches[0]!
		const local = this.#localCoordsFromTouch(touch)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) {
			this.setFocused(null)
			return
	}
		const preserveNativeActivation = slot.surface.preserveNativeTouchActivation?.() === true
		if (!preserveNativeActivation) event.preventDefault()
		this.#claimPointerEvent(event)
		this.#positionInputProxy(touch.clientX, touch.clientY)
		this.setFocused(slot.surface)
		this.#pressedSlot = slot
		this.#activeTouchId = touch.identifier
		const mouseEvent = this.#mouseEventFromTouch("mousedown", touch)
		slot.surface.onPointerDown?.(mouseEvent, local.x - slot.rect.x, local.y - slot.rect.y)
		if (!preserveNativeActivation) this.#focusInputProxyForUserSurface(slot.surface, mouseEvent)
	}

	#focusInputProxyForUserSurface(surface: UiSurfaceNode, event: MouseEvent): void {
		if (this.inputProxy === null || event.button !== 0) return
		this.inputProxy.focus({softKeyboard: bulkSoftKeyboardInputModeForSurface(surface) === "text"})
	}

	#onTouchMove(event: TouchEvent): void {
		this.#rememberTouchEvent()
		if (this.#activeTouchId === null) return
		const touch = this.#changedTouch(event)
		const slot = this.#pressedSlot
		if (touch === null || slot === null) return
		event.preventDefault()
		this.#claimPointerEvent(event)
		const local = this.#localCoordsFromTouch(touch)
		slot.surface.onPointerMove?.(this.#mouseEventFromTouch("mousemove", touch), local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onTouchEnd(event: TouchEvent): void {
		this.#rememberTouchEvent()
		const touch = this.#changedTouch(event)
		const slot = this.#pressedSlot
		if (touch === null || slot === null) return
		this.#pressedSlot = null
		this.#activeTouchId = null
		this.#claimPointerEvent(event)
		const local = this.#localCoordsFromTouch(touch)
		slot.surface.onPointerUp?.(this.#mouseEventFromTouch("mouseup", touch), local.x - slot.rect.x, local.y - slot.rect.y)
		event.preventDefault()
	}

	#onTouchCancel(event: TouchEvent): void {
		this.#rememberTouchEvent()
		if (this.#activeTouchId === null) return
		const touch = this.#changedTouch(event)
		const slot = this.#pressedSlot
		this.#pressedSlot = null
		this.#activeTouchId = null
		if (slot === null) return
		event.preventDefault()
		this.#claimPointerEvent(event)
		const mouseEvent = touch === null
			? new MouseEvent("mouseup", {bubbles: true, cancelable: true, button: 0, buttons: 0})
			: this.#mouseEventFromTouch("mouseup", touch)
		slot.surface.onPointerUp?.(mouseEvent, -1, -1)
	}

	#onMouseLeave(): void {
		this.#hoveredSlot?.surface.onPointerLeave?.()
		this.#hoveredSlot = null
	}

	#onContextMenu(event: MouseEvent): void {
		const local = this.#localCoords(event)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) return
		event.preventDefault()
		this.#claimPointerEvent(event)
		slot.surface.onContextMenu?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onKey(event: KeyboardEvent): void {
		const focused = this.#focused
		if (focused === null) return
		focused.onKey?.(event)
		if (!event.defaultPrevented) handleActiveInputKey(focused as Parameters<typeof handleActiveInputKey>[0], event)
	}

	#onWindowKey(event: KeyboardEvent): void {
		if (this.#focused === null || this.inputProxy?.isFocused() === true) return
		if (!isBulkHudKeyFallbackTarget(event.target, this.canvas)) return
		this.#onKey(event)
	}

	#onInputText(text: string): void {
		const focused = this.#focused
		if (focused === null) return
		focused.onInputText?.(text)
		insertActiveInputText(focused as Parameters<typeof insertActiveInputText>[0], text)
	}
}

function clampBulkHudSurfaceRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
	const bw = Math.max(1, Math.floor(boundsW))
	const bh = Math.max(1, Math.floor(boundsH))
	const w = clampBulkHudNumber(finiteBulkHudNumber(rect.w, 1), 1, bw)
	const h = clampBulkHudNumber(finiteBulkHudNumber(rect.h, 1), 1, bh)
	const x = clampBulkHudNumber(finiteBulkHudNumber(rect.x, 0), 0, Math.max(0, bw - w))
	const y = clampBulkHudNumber(finiteBulkHudNumber(rect.y, 0), 0, Math.max(0, bh - h))
	return rect.visible === false ? {x, y, w, h, visible: false} : {x, y, w, h}
}

function clampBulkHudNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function finiteBulkHudNumber(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback
}

function bulkSoftKeyboardInputModeForSurface(surface: UiSurfaceNode): VirtualInputSoftKeyboardMode {
	const explicit = surface.softKeyboardInputMode?.()
	if (explicit !== undefined) return explicit
	return surfaceHasActiveInput(surface as Parameters<typeof handleActiveInputKey>[0]) ? "text" : "none"
}

function isBulkHudKeyFallbackTarget(target: EventTarget | null, canvas: HTMLCanvasElement): boolean {
	if (target === null || target === window || target === document || target === document.body || target === document.documentElement) return true
	if (target === canvas) return true
	if (!(target instanceof HTMLElement)) return false
	if (target.closest("textarea,input,select,[contenteditable='true']") !== null) return false
	return target === canvas.parentElement || target.contains(canvas)
}

export const createBulkViewport = async (options: BulkViewportOptions): Promise<BulkVisualViewportWithHud> => {
	const renderer = new Renderer()
	await renderer.init(options.canvas)
	if (!renderer.canvas) {
		throw new Error("Не удалось инициализировать WebGPU canvas в bulk viewport")
	}

	renderer.setPixelRatio(window.devicePixelRatio || 1)
	renderer.setSize(options.width, options.height)
	activeRenderSettings = normalizeBulkRenderSettings(activeRenderSettings)
	const uiFont = await TrueTypeFont.fromUrl("/engine-static/JetBrainsMono-Bold.ttf")
	const labelFont = uiFont
	const viewportConfig = getViewportConfig()
	const raycaster = new Raycaster()
	const space = new Space()
	space.background = ROOT_BACKGROUND.clone()
	const workspaceGrid = createWorkspaceGrid()
	space.add(workspaceGrid)

	const workspace = new Object3D()
	workspace.position.set(0, 0, getWorkspaceBaseZ())
	workspace.updateMatrix()
	space.add(workspace)

	let pickTargets: HoverablePickTarget[] = []
	let hoveredPickTarget: HoverablePickTarget | null = null
	let radialMenuPickTarget: HoverablePickTarget | null = null
	const sphereSurfaceCache = new Map<string, BufferGeometry>()
	const torusSurfaceCache = new Map<string, BufferGeometry>()
	let activeVisualSphereMeshDetail:
		BulkVisualRenderManifest["sphereMeshDetail"] | null = null
	let activeVisualDarkTorusMeshDetail:
		BulkVisualRenderManifest["darkTorusMeshDetail"] | null = null
	let activeVisualEmbeddedTorusMeshDetail:
		BulkVisualRenderManifest["embeddedTorusMeshDetail"] | null = null
	let orbitalSphereRadiusById = new Map<string, number>()
	let orbitalTorusById = new Map<string, Readonly<{radius: number; tube: number}>>()
	let fieldProxySphereRadiusById = new Map<string, number>()
	let fieldProxyTorusById =
		new Map<string, Readonly<{radius: number; tube: number}>>()
	let darkMaterialById =
		new Map<number, BulkVisualQuantumMaterial>()
	let fieldMaterialById =
		new Map<string, BulkVisualQuantumMaterial>()
	let orbitalMaterialById =
		new Map<string, BulkVisualQuantumMaterial>()
	let fieldProxyMaterialById =
		new Map<string, BulkVisualQuantumMaterial>()
	let activeTransitionPaths: readonly BulkVisualTransitionPath[] = []
	let activeRelationPaths: readonly BulkVisualRelationPath[] = []
	let visualFieldParticleIdBySourceAddress:
		ReadonlyMap<string, string> = new Map()
	let parentByDarkParticleId = new Map<number, number | null>()
	let clickNavigationSuppressed = false
	let isPrimaryPointerDown = false
	let navigationState: ViewNavigationState | null = null
	let focusedViewportFitTargetKey: string | null = null
	let rootFitLockedToViewport = true
	let rootFitViewportWidth = options.width
	let rootFitViewportHeight = options.height
	let pointerDownX = 0
	let pointerDownY = 0
	let touchTapState: CanvasTouchTapState | null = null
	const radialMenuPane = new BulkRadialMenuPane()
	let radialMenuLongPress: {
		startX: number
		startY: number
		target: HoverablePickTarget
		timer: ReturnType<typeof setTimeout>
		touchId: number
	} | null = null
	let disposed = false
	let frameHandle = 0
	let renderWakeUntilMs = 0
	let lastAnimationTimestamp = 0
	const darkParticleRecords = new Map<number, DarkParticleRenderRecord>()
	const fieldParticleRecords = new Map<string, FieldParticleRenderRecord>()
	const orbitalParticleRecords = new Map<string, OrbitalParticleRenderRecord>()
	const transitionBatchRecords = new Map<string, LineBatchRenderRecord>()
	const fieldProxyRecords = new Map<string, FieldProxyRenderRecord>()
	const relationBatchRecords = new Map<string, LineBatchRenderRecord>()
	const impulseRecords: ImpulseRenderRecord[] = []
	const sceneProjection = new BulkSceneStore()
	const fadingRemovalRecords: FadingRemovalRecord[] = []
	const labelRecords = new Map<string, LabelRenderRecord>()
	const fadingLabelRemovalRecords: FadingLabelRemovalRecord[] = []
	let activeVisualLayers: ReadonlySet<BulkVisualLayer> | null =
		options.visualLayers === undefined ? null : new Set(options.visualLayers)
	const reusableScenePosition = new Vector3()
	const reusableInheritedScale = new Vector3()
	const reusableSceneQuaternion = new Quaternion()
	const reusableLabelNormal = new Vector3()
	const reusableLabelRight = new Vector3()
	const reusableLabelPos = new Vector3()
	const reusableLabelUp = new Vector3()
	const reusableLabelToCamera = new Vector3()
	const reusableMajorDir = new Vector3()
	const reusableTubeCenter = new Vector3()
	const reusableScaledOffset = new Vector3()
	const reusableLabelMatrix = new Matrix4()
	const reusableLabelCurveQuaternion = new Quaternion()
	const reusableLabelCurveSceneMatrix = new Matrix4()
	const reusableLabelCurveInheritedScale = new Vector3()
	const reusableLabelCurveLocalMatrix = new Matrix4()
	const reusableAnchorInverseMatrix = new Matrix4()
	const invalidateGeometry = (geometry: BufferGeometry): void => {
		renderer.invalidateGeometry(geometry)
	}

	const getSphereSurfaceGeometry = (radius: number): BufferGeometry => {
		const detail = activeVisualSphereMeshDetail
		if (!detail) throw new Error("Bulk Visual Sphere mesh detail is absent")
		const key = `${radius}:${detail.widthSegments}:${detail.heightSegments}`
		const cached = sphereSurfaceCache.get(key)
		if (cached) return cached
		const geometry = new SphereGeometry({radius, ...detail})
		sphereSurfaceCache.set(key, geometry)
		return geometry
	}

	const getTorusSurfaceGeometry = (
		radius: number,
		tube: number,
		detail: Readonly<{radialSegments: number; tubularSegments: number}>,
	): BufferGeometry => {
		const key =
			`${radius}:${tube}:${detail.radialSegments}:${detail.tubularSegments}`
		const cached = torusSurfaceCache.get(key)
		if (cached) return cached
		const geometry = new TorusGeometry({
			radius,
			tube,
			radialSegments: detail.radialSegments,
			tubularSegments: detail.tubularSegments,
		})
		torusSurfaceCache.set(key, geometry)
		return geometry
	}

	const pruneSurfaceGeometryCaches = (): void => {
		const used = new Set<BufferGeometry>()
		space.traverse((object) => {
			if (object instanceof Mesh) used.add(object.geometry)
		})
		pruneUnusedRenderGeometryCache(
			sphereSurfaceCache,
			used,
			invalidateGeometry,
		)
		pruneUnusedRenderGeometryCache(
			torusSurfaceCache,
			used,
			invalidateGeometry,
		)
	}

	const releaseLineBatchRecord = (record: LineBatchRenderRecord): void => {
		detachObject(record.line)
		releaseUniqueRenderGeometry(
			record.line.geometry,
			invalidateGeometry,
		)
		/*
		 * Engine materials own no native resource and have no dispose API.
		 * Detaching the line and deleting its record releases both references;
		 * geometry needs explicit invalidation because Renderer caches GPUBuffer.
		 */
		record.material.visible = false
	}

	const visualLayerVisible = (layer: BulkVisualLayer): boolean =>
		activeVisualLayers === null || activeVisualLayers.has(layer)

	const requiredQuantumMaterial = (
		materials: ReadonlyMap<number | string, BulkVisualQuantumMaterial>,
		id: number | string,
		label: string,
	): BulkVisualQuantumMaterial => {
		const material = materials.get(id)
		if (!material) throw new Error(`Bulk Visual ${label} ${String(id)} has no package material`)
		return material
	}

	const orbitalVisualLayer = (
		particle: Pick<BulkOrbitalParticle, "orbitalParticleKind">,
	): BulkVisualLayer => particle.orbitalParticleKind === "state" ? "state" : "causal"

	const syncVisualLayerVisibility = (): void => {
		workspaceGrid.visible = visualLayerVisible("grid")
			for (const record of darkParticleRecords.values()) {
				const layer: BulkVisualLayer =
					record.snapshot.parentDarkParticleId === null ? "atom" : "matter"
				record.torus.visible = visualLayerVisible(layer)
		}
		for (const record of fieldParticleRecords.values()) {
			record.node.visible = visualLayerVisible("field")
		}
		for (const record of orbitalParticleRecords.values()) {
			const layer = orbitalVisualLayer(record.snapshot)
				record.node.visible = visualLayerVisible(layer)
		}
		for (const record of transitionBatchRecords.values()) {
			record.line.visible = visualLayerVisible("transition")
		}
		for (const record of fieldProxyRecords.values()) {
			record.node.visible = visualLayerVisible("field-proxy")
		}
		for (const record of relationBatchRecords.values()) {
			record.line.visible = visualLayerVisible("relation")
		}
		for (const record of labelRecords.values()) {
			record.container.visible =
				visualLayerVisible("label") && visualLayerVisible(record.layer)
		}
	}

	const viewPoint = new ViewPoint({
		element: options.canvas,
		fov: viewportConfig.camera.fovRad,
		near: viewportConfig.camera.near,
		far: viewportConfig.camera.far,
		position: viewportConfig.camera.position,
		target: viewportConfig.camera.target,
	})
	/**
	 * Камера в Bulk свободно подходит к атомам. Постоянный near=1 обрезал
	 * геометрию ровно в момент близкого просмотра: камера уже рядом, а её
	 * frustum ещё рассчитан на обзор всего мира. Near зависит только от
	 * текущей дистанции до точки взгляда; far остаётся достаточным для
	 * полного контура, поэтому этот пересчёт не меняет layout или данные.
	 */
	const syncViewportClipPlanes = (): void => {
		const distance = viewPoint.position.distanceTo(viewPoint.getTarget())
		const nextNear = Math.min(1, Math.max(0.001, distance * 0.0001))
		const nextFar = Math.max(viewportConfig.camera.far, distance * 8)
		if (Math.abs(viewPoint.near - nextNear) < 1e-6 && Math.abs(viewPoint.far - nextFar) < 1e-3) return
		viewPoint.near = nextNear
		viewPoint.far = nextFar
		viewPoint.updateProjectionMatrix()
	}
	viewPoint.setAspectRatio(options.width / options.height)
	const restoredViewPose = readStoredBulkViewPose()
	if (restoredViewPose !== null) {
		viewPoint.position.copy(restoredViewPose.position)
		viewPoint.getTarget().copy(restoredViewPose.target)
		viewPoint.getUp().copy(restoredViewPose.up).normalize()
		viewPoint.update()
		rootFitLockedToViewport = restoredViewPose.rootFitLockedToViewport
	}

	const requestRenderLoop = (wakeMs: number = 0): void => {
		if (disposed) return
		if (wakeMs > 0) renderWakeUntilMs = Math.max(renderWakeUntilMs, performance.now() + wakeMs)
		if (frameHandle !== 0) return
		frameHandle = requestAnimationFrame(animate)
	}
	let hudRuntime: BulkViewportHudRuntime

	const resetHoverMaterial = (target: HoverablePickTarget): void => {
		target.material.color.copy(target.baseColor)
		target.material.rimColor.copy(target.baseRimColor)
		target.material.rimStrength = target.baseRimStrength
		target.material.opacity = target.baseOpacity
	}

	const applyHoverMaterial = (target: HoverablePickTarget): void => {
		const hoverColor = brightenColor(target.baseColor, 0.24)
		const hoverRimColor = brightenColor(target.baseRimColor, 0.34)
		target.material.color.copy(hoverColor)
		target.material.rimColor.copy(hoverRimColor)
		target.material.rimStrength = Math.min(
			8,
			Math.max(
				target.baseRimStrength * 1.35,
				target.baseRimStrength + 0.24,
			),
		)
		target.material.opacity = Math.min(1, target.baseOpacity + 0.08)
	}

	const getPickTargetKey = (target: BulkPickTarget | null): string | null => {
		return target ? getBulkPickTargetKey(target) : null
	}

	const syncPickTargetMaterialState = (target: HoverablePickTarget): void => {
		const targetKey = getPickTargetKey(target)
		if (
			targetKey !== null &&
			(targetKey === getPickTargetKey(hoveredPickTarget) || targetKey === getPickTargetKey(radialMenuPickTarget))
		) applyHoverMaterial(target)
		else resetHoverMaterial(target)
	}

	const setHoveredPickTarget = (target: HoverablePickTarget | null): void => {
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(target)) {
			if (target === null) options.canvas.style.cursor = ""
			return
		}
		const previous = hoveredPickTarget
		hoveredPickTarget = target
		if (previous) syncPickTargetMaterialState(previous)
		if (hoveredPickTarget) syncPickTargetMaterialState(hoveredPickTarget)
		options.canvas.style.cursor = hoveredPickTarget ? "pointer" : ""
		requestRenderLoop()
	}

	const setRadialMenuPickTarget = (target: HoverablePickTarget | null): void => {
		if (getPickTargetKey(radialMenuPickTarget) === getPickTargetKey(target)) return
		const previous = radialMenuPickTarget
		radialMenuPickTarget = target
		if (previous) syncPickTargetMaterialState(previous)
		if (radialMenuPickTarget) syncPickTargetMaterialState(radialMenuPickTarget)
		requestRenderLoop()
	}

	radialMenuPane.onClose = () => {
		setRadialMenuPickTarget(null)
		setHoveredPickTarget(null)
	}

	const clampTransitionScale = (value: number): number => {
		if (!Number.isFinite(value) || value <= 1e-6) return 1
		return Math.max(0.05, Math.min(20, value))
	}

	const applyDarkParticleRecordScale = (record: DarkParticleRenderRecord): void => {
		const scale = record.currentTransitionScale
		record.container.scale.set(scale, scale, scale)
		record.container.updateMatrix()
	}

	const applyFieldParticleRecordScale = (record: FieldParticleRenderRecord): void => {
		record.node.scale.set(
			record.currentTransitionScale,
			record.currentTransitionScale,
			record.currentTransitionScale,
		)
		record.node.updateMatrix()
	}

	const refreshPickTargets = (): void => {
		pickTargets = [
			...[...darkParticleRecords.values()]
				.filter((record) =>
					visualLayerVisible(
						record.snapshot.parentDarkParticleId === null ? "atom" : "matter",
					),
				)
				.sort(
					(left, right) =>
						left.snapshot.depth - right.snapshot.depth ||
						left.snapshot.darkParticleOrder - right.snapshot.darkParticleOrder ||
						left.snapshot.darkParticleId - right.snapshot.darkParticleId,
				)
				.map((record) => record.pickTarget),
			...[...fieldParticleRecords.values()]
				.filter(() => visualLayerVisible("field"))
				.sort(
					(left, right) =>
						left.depth - right.depth ||
						left.snapshot.fieldId - right.snapshot.fieldId ||
						left.snapshot.fieldParticleId.localeCompare(right.snapshot.fieldParticleId),
				)
				.map((record) => record.pickTarget),
			...[...orbitalParticleRecords.values()]
				.filter((record) =>
					visualLayerVisible(orbitalVisualLayer(record.snapshot)),
				)
				.sort(
					(left, right) =>
						left.depth - right.depth ||
						left.snapshot.sourceId - right.snapshot.sourceId ||
						left.snapshot.orbitalParticleId.localeCompare(
							right.snapshot.orbitalParticleId,
						),
				)
				.map((record) => record.pickTarget),
			...[...fieldProxyRecords.values()]
				.filter(() => visualLayerVisible("field-proxy"))
				.sort(
					(left, right) =>
						left.depth - right.depth ||
						left.snapshot.fieldId - right.snapshot.fieldId ||
						left.snapshot.fieldProxyId.localeCompare(
							right.snapshot.fieldProxyId,
						),
				)
				.map((record) => record.pickTarget),
		]
	}

	const refreshParentByDarkParticleId = (): void => {
		parentByDarkParticleId = new Map(
			[...darkParticleRecords.values()].map((record) => [
				record.snapshot.darkParticleId,
				record.snapshot.parentDarkParticleId,
			]),
		)
	}

	const refreshDarkParticleRecordGeometryAndMaterial = (record: DarkParticleRenderRecord): void => {
		const detail = activeVisualDarkTorusMeshDetail
		if (detail === null) {
			throw new Error("Bulk Visual Dark Torus mesh detail is absent")
		}
		record.torus.geometry = getTorusSurfaceGeometry(
			record.snapshot.torusRadius,
			record.snapshot.torusTube,
			detail,
		)
		copyQuantumMaterial(
			record.material,
			createVisualQuantumMaterial(requiredQuantumMaterial(
				darkMaterialById,
				record.snapshot.darkParticleId,
				"Dark particle material",
			)),
		)
		record.torus.visible = visualLayerVisible(
			record.snapshot.parentDarkParticleId === null ? "atom" : "matter",
		)
		record.pickTarget.baseColor.copy(record.material.color)
		record.pickTarget.baseRimColor.copy(record.material.rimColor)
		record.pickTarget.baseRimStrength = record.material.rimStrength
		record.pickTarget.baseOpacity = record.material.opacity
		syncPickTargetMaterialState(record.pickTarget)
	}

	const refreshFieldParticleRecordGeometryAndMaterial = (record: FieldParticleRenderRecord): void => {
		record.node.geometry = getSphereSurfaceGeometry(record.snapshot.sphereRadius)
		copyQuantumMaterial(
			record.material,
			createVisualQuantumMaterial(requiredQuantumMaterial(
				fieldMaterialById,
				record.snapshot.fieldParticleId,
				"Field material",
			)),
		)
		record.pickTarget.baseColor.copy(record.material.color)
		record.pickTarget.baseRimColor.copy(record.material.rimColor)
		record.pickTarget.baseRimStrength = record.material.rimStrength
		record.pickTarget.baseOpacity = record.material.opacity
		syncPickTargetMaterialState(record.pickTarget)
	}

	const createDarkParticleRecord = (darkParticle: BulkDarkParticle): DarkParticleRenderRecord => {
		const material = createVisualQuantumMaterial(requiredQuantumMaterial(
			darkMaterialById,
			darkParticle.darkParticleId,
			"Dark particle material",
		))
		const detail = activeVisualDarkTorusMeshDetail
		if (detail === null) {
			throw new Error("Bulk Visual Dark Torus mesh detail is absent")
		}
		const torus = new Mesh(
			getTorusSurfaceGeometry(darkParticle.torusRadius, darkParticle.torusTube, detail),
			material,
		)
		torus.visible = visualLayerVisible(
			darkParticle.parentDarkParticleId === null ? "atom" : "matter",
		)
		torus.updateMatrix()

		const container = new Object3D()
		container.position.set(darkParticle.localX, darkParticle.localY, darkParticle.localZ)
		container.add(torus)

		const pickTarget: HoverablePickTarget = {
			kind: "darkParticle",
			darkParticleId: darkParticle.darkParticleId,
			parentDarkParticleId: darkParticle.parentDarkParticleId,
			depth: darkParticle.depth,
			center: new Vector3(
				workspace.position.x + darkParticle.localX,
				workspace.position.y + darkParticle.localY,
				workspace.position.z + darkParticle.localZ,
			),
			torusRadius: darkParticle.torusRadius,
			torusTube: darkParticle.torusTube,
			outerRadius: darkParticle.torusRadius + darkParticle.torusTube,
			material,
			baseColor: material.color.clone(),
			baseRimColor: material.rimColor.clone(),
			baseRimStrength: material.rimStrength,
			baseOpacity: material.opacity,
		}

		const record: DarkParticleRenderRecord = {
			container,
			currentTransitionScale: 1,
			material,
			pickTarget,
			snapshot: { ...darkParticle },
			targetLocalPosition: new Vector3(darkParticle.localX, darkParticle.localY, darkParticle.localZ),
			torus,
	}
		applyDarkParticleRecordScale(record)
		refreshDarkParticleRecordGeometryAndMaterial(record)
		container.updateMatrix()
		return record
	}

	const createFieldParticleRecord = (field: BulkFieldParticle, depth: number): FieldParticleRenderRecord => {
		const material = createVisualQuantumMaterial(requiredQuantumMaterial(
			fieldMaterialById,
			field.fieldParticleId,
			"Field material",
		))
		const node = new Mesh(getSphereSurfaceGeometry(field.sphereRadius), material)
		node.position.set(field.localX, field.localY, field.localZ)

		const pickTarget: HoverablePickTarget = {
			kind: "fieldParticle",
			parentDarkParticleId: field.parentDarkParticleId,
			fieldParticleId: field.fieldParticleId,
			depth,
			center: new Vector3(
				workspace.position.x + field.localX,
				workspace.position.y + field.localY,
				workspace.position.z + field.localZ,
			),
			sphereRadius: field.sphereRadius,
			outerRadius: field.sphereRadius,
			material,
			baseColor: material.color.clone(),
			baseRimColor: material.rimColor.clone(),
			baseRimStrength: material.rimStrength,
			baseOpacity: material.opacity,
		}

		const record: FieldParticleRenderRecord = {
			currentTransitionScale: 1,
			depth,
			material,
			node,
			parentDarkParticleId: field.parentDarkParticleId,
			pickTarget,
			snapshot: { ...field },
			targetLocalPosition: new Vector3(field.localX, field.localY, field.localZ),
		}
		applyFieldParticleRecordScale(record)
		refreshFieldParticleRecordGeometryAndMaterial(record)
		node.updateMatrix()
		return record
	}

	const upsertDarkParticleRecord = (darkParticle: BulkDarkParticle): DarkParticleRenderRecord => {
		const existing = darkParticleRecords.get(darkParticle.darkParticleId)
		if (!existing) {
			const created = createDarkParticleRecord(darkParticle)
			darkParticleRecords.set(darkParticle.darkParticleId, created)
			return created
		}
		if (
			Object.keys(darkParticle).every((key) => Object.is(
				existing.snapshot[key as keyof BulkDarkParticle],
				darkParticle[key as keyof BulkDarkParticle],
			))
		) return existing

		const previousLocalOuterRadius =
			(existing.snapshot.torusRadius + existing.snapshot.torusTube) *
			existing.currentTransitionScale
		const nextLocalOuterRadius =
			darkParticle.torusRadius + darkParticle.torusTube
		const geometryChanged =
			Math.abs(existing.snapshot.torusRadius - darkParticle.torusRadius) > 1e-6 ||
			Math.abs(existing.snapshot.torusTube - darkParticle.torusTube) > 1e-6 ||
			existing.snapshot.depth !== darkParticle.depth

		existing.snapshot = { ...darkParticle }
		existing.targetLocalPosition.set(darkParticle.localX, darkParticle.localY, darkParticle.localZ)
		if (existing.pickTarget.kind === "darkParticle") {
			existing.pickTarget.parentDarkParticleId = darkParticle.parentDarkParticleId
	}
		existing.pickTarget.depth = darkParticle.depth

		if (geometryChanged && nextLocalOuterRadius > 1e-6) {
			existing.currentTransitionScale = clampTransitionScale(previousLocalOuterRadius / nextLocalOuterRadius)
	}

		refreshDarkParticleRecordGeometryAndMaterial(existing)
		applyDarkParticleRecordScale(existing)
		return existing
	}

	const upsertFieldParticleRecord = (field: BulkFieldParticle, depth: number): FieldParticleRenderRecord => {
		const existing = fieldParticleRecords.get(field.fieldParticleId)
		if (!existing) {
			const created = createFieldParticleRecord(field, depth)
			fieldParticleRecords.set(field.fieldParticleId, created)
			return created
		}
		if (
			existing.depth === depth &&
			Object.keys(field).every((key) => Object.is(
				existing.snapshot[key as keyof BulkFieldParticle],
				field[key as keyof BulkFieldParticle],
			))
		) return existing

		const previousLocalRadius = existing.snapshot.sphereRadius * existing.currentTransitionScale
		const geometryChanged =
			Math.abs(existing.snapshot.sphereRadius - field.sphereRadius) > 1e-6 ||
			existing.depth !== depth ||
			existing.snapshot.fieldParticleKind !== field.fieldParticleKind

		existing.snapshot = { ...field }
		existing.depth = depth
		existing.parentDarkParticleId = field.parentDarkParticleId
		existing.targetLocalPosition.set(field.localX, field.localY, field.localZ)
		if (existing.pickTarget.kind === "fieldParticle") existing.pickTarget.parentDarkParticleId = field.parentDarkParticleId
		existing.pickTarget.depth = depth

		if (geometryChanged && field.sphereRadius > 1e-6) {
			existing.currentTransitionScale = clampTransitionScale(previousLocalRadius / field.sphereRadius)
	}

		refreshFieldParticleRecordGeometryAndMaterial(existing)
		applyFieldParticleRecordScale(existing)
		return existing
	}

	const requiredEmbeddedPickShape = (
		sphereRadius: number | undefined,
		torus: Readonly<{radius: number; tube: number}> | undefined,
		label: string,
	): BulkEmbeddedPickShape => {
		if ((sphereRadius === undefined) === (torus === undefined)) {
			throw new Error(`Bulk Visual ${label} must have exactly one form`)
		}
		return sphereRadius !== undefined
			? {form: "sphere", sphereRadius}
			: {
				form: "torus",
				torusRadius: torus!.radius,
				torusTube: torus!.tube,
			}
	}

	const pickTargetMaterialState = (
		material: ReturnType<typeof createVisualQuantumMaterial>,
	) => ({
		baseColor: material.color.clone(),
		baseOpacity: material.opacity,
		baseRimColor: material.rimColor.clone(),
		baseRimStrength: material.rimStrength,
		material,
	})

	const createOrbitalParticlePickTarget = (
		particle: BulkOrbitalParticle,
		depth: number,
		material: ReturnType<typeof createVisualQuantumMaterial>,
	): HoverablePickTarget => {
		const shape = requiredEmbeddedPickShape(
			orbitalSphereRadiusById.get(particle.orbitalParticleId),
			orbitalTorusById.get(particle.orbitalParticleId),
			`orbital ${particle.orbitalParticleId}`,
		)
		const common = {
			center: new Vector3(
				workspace.position.x + particle.localX,
				workspace.position.y + particle.localY,
				workspace.position.z + particle.localZ,
			),
			depth,
			kind: "orbitalParticle" as const,
			orbitalParticleId: particle.orbitalParticleId,
			outerRadius: shape.form === "sphere"
				? shape.sphereRadius
				: shape.torusRadius + shape.torusTube,
			parentDarkParticleId: particle.parentDarkParticleId,
			...pickTargetMaterialState(material),
		}
		return shape.form === "sphere"
			? {...common, form: shape.form, sphereRadius: shape.sphereRadius}
			: {
				...common,
				form: shape.form,
				torusRadius: shape.torusRadius,
				torusTube: shape.torusTube,
			}
	}

	const orbitalParticleGeometry = (particle: BulkOrbitalParticle): BufferGeometry => {
		const shape = requiredEmbeddedPickShape(
			orbitalSphereRadiusById.get(particle.orbitalParticleId),
			orbitalTorusById.get(particle.orbitalParticleId),
			`orbital ${particle.orbitalParticleId}`,
		)
		const toroidal =
			particle.orbitalParticleKind === "state" ||
			particle.orbitalParticleKind === "process" ||
			particle.orbitalParticleKind === "finally"
		if (toroidal) {
			const detail = activeVisualEmbeddedTorusMeshDetail
			if (shape.form !== "torus" || detail === null) {
				throw new Error(
					`Bulk Visual ${particle.orbitalParticleKind} ${particle.orbitalParticleId} has no Torus form`,
				)
			}
			return getTorusSurfaceGeometry(
				shape.torusRadius,
				shape.torusTube,
				detail,
			)
		}
		if (shape.form !== "sphere") {
			throw new Error(
				`Bulk Visual ${particle.orbitalParticleKind} ${particle.orbitalParticleId} has no Sphere form`,
			)
		}
		return getSphereSurfaceGeometry(shape.sphereRadius)
	}

	const orbitalParticleOuterRadius = (orbitalParticleId: string): number => {
		const shape = requiredEmbeddedPickShape(
			orbitalSphereRadiusById.get(orbitalParticleId),
			orbitalTorusById.get(orbitalParticleId),
			`orbital ${orbitalParticleId}`,
		)
		return shape.form === "sphere"
			? shape.sphereRadius
			: shape.torusRadius + shape.torusTube
	}

	const orbitalParticleMaterial = (particle: BulkOrbitalParticle) =>
		createVisualQuantumMaterial(requiredQuantumMaterial(
			orbitalMaterialById,
			particle.orbitalParticleId,
			"orbital material",
		))

	const upsertOrbitalParticleRecord = (
		particle: BulkOrbitalParticle,
		depth: number,
	): OrbitalParticleRenderRecord => {
		const existing = orbitalParticleRecords.get(particle.orbitalParticleId)
		if (!existing) {
			const material = orbitalParticleMaterial(particle)
			const node = new Mesh(orbitalParticleGeometry(particle), material)
			node.position.set(particle.localX, particle.localY, particle.localZ)
			node.visible = visualLayerVisible(orbitalVisualLayer(particle))
			node.updateMatrix()
			const record = {
				depth,
				node,
				material,
				pickTarget: createOrbitalParticlePickTarget(
					particle,
					depth,
					material,
				),
				snapshot: {...particle, relatedStateIds: [...particle.relatedStateIds]},
				targetLocalPosition: new Vector3(
					particle.localX,
					particle.localY,
					particle.localZ,
				),
			}
			orbitalParticleRecords.set(particle.orbitalParticleId, record)
			return record
		}
		existing.depth = depth
		existing.snapshot = {...particle, relatedStateIds: [...particle.relatedStateIds]}
		existing.targetLocalPosition.set(
			particle.localX,
			particle.localY,
			particle.localZ,
		)
		existing.node.geometry = orbitalParticleGeometry(particle)
		copyQuantumMaterial(existing.material, orbitalParticleMaterial(particle))
		Object.assign(
			existing.pickTarget,
			createOrbitalParticlePickTarget(particle, depth, existing.material),
		)
		syncPickTargetMaterialState(existing.pickTarget)
		existing.node.visible = visualLayerVisible(orbitalVisualLayer(particle))
		return existing
	}

	// Package paths arrive as flat local-frame `x, y, z` triples, so segments are
	// expanded straight into the GPU buffer without per-point objects.
	const sampledPathsGeometry = (
		paths: readonly Readonly<{points: readonly number[]}>[],
		label: string,
	): BufferGeometry => {
		const geometry = new BufferGeometry()
		let segmentCount = 0
		for (const path of paths) {
			if (path.points.length < 6 || path.points.length % 3 !== 0) {
				throw new Error(`Bulk Visual ${label} sampled path is empty`)
			}
			segmentCount += path.points.length / 3 - 1
		}
		const positions = new Float32Array(segmentCount * 6)
		let offset = 0
		for (const path of paths) {
			const points = path.points
			for (let index = 3; index < points.length; index += 3) {
				positions[offset] = points[index - 3]!
				positions[offset + 1] = points[index - 2]!
				positions[offset + 2] = points[index - 1]!
				positions[offset + 3] = points[index]!
				positions[offset + 4] = points[index + 1]!
				positions[offset + 5] = points[index + 2]!
				offset += 6
			}
		}
		geometry.setAttribute("position", new BufferAttribute(positions, 3))
		return geometry
	}

	const syncLineBatchRecords = (
		paths: readonly (BulkVisualTransitionPath | BulkVisualRelationPath)[],
		records: Map<string, LineBatchRenderRecord>,
		label: string,
		layer: BulkVisualLayer,
	): void => {
		const pathsByBatchId = new Map<
			string,
			(BulkVisualTransitionPath | BulkVisualRelationPath)[]
		>()
		for (const path of paths) {
			const batch = pathsByBatchId.get(path.batchId) ?? []
			batch.push(path)
			pathsByBatchId.set(path.batchId, batch)
		}
		for (const [batchId, batch] of pathsByBatchId) {
			const first = batch[0]
			if (!first) continue
				if (batch.some((path) =>
					path.ownerDarkParticleId !== first.ownerDarkParticleId ||
					path.batchFingerprint !== first.batchFingerprint ||
					JSON.stringify(path.material) !== JSON.stringify(first.material)
				)) {
				throw new Error(
					`Bulk Visual ${label} batch ${batchId} is not homogeneous`,
				)
			}
			const parent = darkParticleRecords.get(first.ownerDarkParticleId)
			if (!parent) {
				throw new Error(
					`Bulk Visual ${label} batch ${batchId} has no render parent ${first.ownerDarkParticleId}`,
				)
			}
				const fingerprint = first.batchFingerprint
			const existing = records.get(batchId)
			if (!existing) {
				const material = createVisualLineMaterial(first.material)
				const line = new LineSegments(
					sampledPathsGeometry(batch, `${label} batch ${batchId}`),
					material,
				)
				line.visible = visualLayerVisible(layer)
				line.updateMatrix()
				parent.container.add(line)
				records.set(batchId, {
					fingerprint,
					line,
					material,
					ownerDarkParticleId: first.ownerDarkParticleId,
				})
				continue
				}
				if (existing.fingerprint !== fingerprint) {
					existing.line.geometry = replaceUniqueRenderGeometry(
						existing.line.geometry,
						sampledPathsGeometry(batch, `${label} batch ${batchId}`),
						invalidateGeometry,
					)
					applyVisualLineMaterial(existing.material, first.material)
					existing.fingerprint = fingerprint
				}
			existing.ownerDarkParticleId = first.ownerDarkParticleId
			existing.line.visible = visualLayerVisible(layer)
			if (existing.line.parent !== parent.container) {
				parent.container.add(existing.line)
			}
		}
			for (const [batchId, record] of records) {
				if (pathsByBatchId.has(batchId)) continue
				releaseLineBatchRecord(record)
				records.delete(batchId)
			}
		}

	const fieldProxyGeometry = (proxy: BulkFieldProxy): BufferGeometry => {
		const shape = requiredEmbeddedPickShape(
			fieldProxySphereRadiusById.get(proxy.fieldProxyId),
			fieldProxyTorusById.get(proxy.fieldProxyId),
			`Field proxy ${proxy.fieldProxyId}`,
		)
		if (shape.form === "sphere") {
			return getSphereSurfaceGeometry(shape.sphereRadius)
		}
		const detail = activeVisualEmbeddedTorusMeshDetail
		if (detail === null) {
			throw new Error("Bulk Visual embedded Torus mesh detail is absent")
		}
		return getTorusSurfaceGeometry(
			shape.torusRadius,
			shape.torusTube,
			detail,
		)
	}

	const fieldProxyMaterial = (proxy: BulkFieldProxy) =>
		createVisualQuantumMaterial(requiredQuantumMaterial(
			fieldProxyMaterialById,
			proxy.fieldProxyId,
			"Field proxy material",
		))

	const createFieldProxyPickTarget = (
		proxy: BulkFieldProxy,
		depth: number,
		material: ReturnType<typeof createVisualQuantumMaterial>,
	): HoverablePickTarget => {
		const shape = requiredEmbeddedPickShape(
			fieldProxySphereRadiusById.get(proxy.fieldProxyId),
			fieldProxyTorusById.get(proxy.fieldProxyId),
			`Field proxy ${proxy.fieldProxyId}`,
		)
		const common = {
			center: new Vector3(
				workspace.position.x + proxy.localX,
				workspace.position.y + proxy.localY,
				workspace.position.z + proxy.localZ,
			),
			depth,
			fieldProxyId: proxy.fieldProxyId,
			kind: "fieldProxy" as const,
			outerRadius: shape.form === "sphere"
				? shape.sphereRadius
				: shape.torusRadius + shape.torusTube,
			parentDarkParticleId: proxy.parentDarkParticleId,
			...pickTargetMaterialState(material),
		}
		return shape.form === "sphere"
			? {...common, form: shape.form, sphereRadius: shape.sphereRadius}
			: {
				...common,
				form: shape.form,
				torusRadius: shape.torusRadius,
				torusTube: shape.torusTube,
			}
	}

	const upsertFieldProxyRecord = (
		proxy: BulkFieldProxy,
		depth: number,
	): FieldProxyRenderRecord => {
		const existing = fieldProxyRecords.get(proxy.fieldProxyId)
		if (!existing) {
			const material = fieldProxyMaterial(proxy)
			const node = new Mesh(fieldProxyGeometry(proxy), material)
			node.position.set(proxy.localX, proxy.localY, proxy.localZ)
			node.visible = visualLayerVisible("field-proxy")
			node.updateMatrix()
			const record = {
				depth,
				node,
				material,
				pickTarget: createFieldProxyPickTarget(proxy, depth, material),
				snapshot: {...proxy},
			}
			fieldProxyRecords.set(proxy.fieldProxyId, record)
			return record
		}
		existing.depth = depth
		existing.snapshot = {...proxy}
		copyQuantumMaterial(existing.material, fieldProxyMaterial(proxy))
		existing.node.geometry = fieldProxyGeometry(proxy)
		existing.node.position.set(proxy.localX, proxy.localY, proxy.localZ)
		Object.assign(
			existing.pickTarget,
			createFieldProxyPickTarget(proxy, depth, existing.material),
		)
		syncPickTargetMaterialState(existing.pickTarget)
		existing.node.visible = visualLayerVisible("field-proxy")
		existing.node.updateMatrix()
		return existing
	}

	const removeFieldParticleRecord = (fieldParticleId: string): void => {
		const record = fieldParticleRecords.get(fieldParticleId)
		if (!record) return
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(record.pickTarget)) {
		setHoveredPickTarget(null)
	}
		if (getPickTargetKey(radialMenuPickTarget) === getPickTargetKey(record.pickTarget)) {
			radialMenuPane.close()
			setRadialMenuPickTarget(null)
		}
		fadingRemovalRecords.push({
			baseOpacity: record.pickTarget.baseOpacity,
			durationMs: REMOVAL_FADE_MS,
			initialScale: record.node.scale.clone(),
			material: record.material,
			object: record.node,
			startedAtMs: performance.now(),
	})
		fieldParticleRecords.delete(fieldParticleId)
		requestRenderLoop(REMOVAL_FADE_MS + 32)
	}

	const removeDarkParticleRecord = (darkParticleId: number): void => {
		const record = darkParticleRecords.get(darkParticleId)
		if (!record) return
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(record.pickTarget)) {
		setHoveredPickTarget(null)
	}
		if (getPickTargetKey(radialMenuPickTarget) === getPickTargetKey(record.pickTarget)) {
			radialMenuPane.close()
			setRadialMenuPickTarget(null)
		}
		fadingRemovalRecords.push({
			baseOpacity: record.pickTarget.baseOpacity,
			durationMs: REMOVAL_FADE_MS,
			initialScale: record.container.scale.clone(),
			material: record.material,
			object: record.container,
			startedAtMs: performance.now(),
	})
		darkParticleRecords.delete(darkParticleId)
		requestRenderLoop(REMOVAL_FADE_MS + 32)
	}

	const buildLabelSignature = (spec: LabelSpec): string => {
		return [
			spec.text,
			spec.depth,
			spec.layer,
			spec.torusRadius.toFixed(4),
			spec.torusTube.toFixed(4),
			spec.offset.toFixed(4),
			spec.color.r.toFixed(4),
			spec.color.g.toFixed(4),
			spec.color.b.toFixed(4),
			spec.fontSize.toFixed(6),
		].join(":")
	}

	const createTorusLabelSpec = (
		spec: Omit<LabelSpec, "fontSize" | "offset" | "text"> &
			Readonly<{text: string | null | undefined}>,
	): LabelSpec | null => {
		if (!labelFont) return null
		const text = normalizeLabelText(spec.text)
		if (!text) return null
		const metrics = resolveBulkTorusLabelMetrics(
			activeRenderSettings,
			spec.torusRadius,
			spec.torusTube,
		)
		return {
			...spec,
			fontSize: metrics.fontSizeMm,
			offset: metrics.surfaceOffsetMm,
			text,
		}
	}

	const createDarkParticleLabelSpec = (
		record: DarkParticleRenderRecord,
	): LabelSpec | null =>
		createTorusLabelSpec({
			anchorObject: record.container,
			color: particleColor(record.snapshot),
			depth: record.snapshot.depth,
			key: `darkParticle:${record.snapshot.darkParticleId}`,
			layer:
				record.snapshot.parentDarkParticleId === null ? "atom" : "matter",
			torusRadius: record.snapshot.torusRadius,
			torusTube: record.snapshot.torusTube,
			text: record.snapshot.label,
		})

	const createOrbitalTorusLabelSpec = (
		record: OrbitalParticleRenderRecord,
	): LabelSpec | null => {
		const toroidal =
			record.snapshot.orbitalParticleKind === "state" ||
			record.snapshot.orbitalParticleKind === "process" ||
			record.snapshot.orbitalParticleKind === "finally"
		if (!toroidal) return null
		const torus = orbitalTorusById.get(record.snapshot.orbitalParticleId)
		if (!torus) {
			throw new Error(
				`Bulk Visual ${record.snapshot.orbitalParticleKind} ${record.snapshot.orbitalParticleId} has no Torus label form`,
			)
		}
		const parent = darkParticleRecords.get(
			record.snapshot.parentDarkParticleId,
		)
		if (!parent) {
			throw new Error(
				`Bulk Visual ${record.snapshot.orbitalParticleKind} ${record.snapshot.orbitalParticleId} has no label parent`,
			)
		}
		return createTorusLabelSpec({
			anchorObject: record.node,
			color: particleColor(record.snapshot),
			depth: parent.snapshot.depth +
				(record.snapshot.orbitalParticleKind === "state" ? 1 : 2),
			key: `orbitalTorus:${record.snapshot.orbitalParticleId}`,
			layer:
				record.snapshot.orbitalParticleKind === "state"
					? "state"
					: "causal",
			torusRadius: torus.radius,
			torusTube: torus.tube,
			text: record.snapshot.label,
		})
	}

	const createFieldProxyTorusLabelSpec = (
		record: FieldProxyRenderRecord,
	): LabelSpec | null => {
		const torus = fieldProxyTorusById.get(record.snapshot.fieldProxyId)
		if (!torus) return null
		const source = fieldParticleRecords.get(
			record.snapshot.fieldParticleId,
		)
		if (!source) {
			throw new Error(
				`Bulk Visual Field proxy ${record.snapshot.fieldProxyId} has no label source ${record.snapshot.fieldParticleId}`,
			)
		}
		const parent = darkParticleRecords.get(
			record.snapshot.parentDarkParticleId,
		)
		if (!parent) {
			throw new Error(
				`Bulk Visual Field proxy ${record.snapshot.fieldProxyId} has no label parent`,
			)
		}
		return createTorusLabelSpec({
			anchorObject: record.node,
			color: particleColor(record.snapshot),
			depth: parent.snapshot.depth + 2,
			key: `fieldProxyTorus:${record.snapshot.fieldProxyId}`,
			layer: "field-proxy",
			torusRadius: torus.radius,
			torusTube: torus.tube,
			text:
				normalizeLabelText(source.snapshot.fieldLabel) ??
				source.snapshot.fieldKey,
		})
	}

	const removeLabelRecord = (key: string): void => {
		const record = labelRecords.get(key)
		if (!record) return
		fadingLabelRemovalRecords.push({
			durationMs: REMOVAL_FADE_MS,
			initialOpacity: record.currentOpacity,
			initialScale: record.container.scale.clone(),
			material: record.material,
			object: record.container,
			startedAtMs: performance.now(),
	})
		labelRecords.delete(key)
		requestRenderLoop(REMOVAL_FADE_MS + 32)
	}

	const upsertLabelRecord = (spec: LabelSpec): void => {
		const signature = buildLabelSignature(spec)
		const existing = labelRecords.get(spec.key)

		if (!existing) {
			const container = new Object3D()
			const visual = createSurfaceLabelNode(spec, labelFont!)
			container.add(visual.container)
			container.frustumCulled = false
			const initialScale = LABEL_INITIAL_SCALE
			container.scale.set(initialScale, initialScale, initialScale)
			container.updateMatrix()
			visual.material.opacity = 0
			spec.anchorObject.add(container)
			labelRecords.set(spec.key, {
				anchorObject: spec.anchorObject,
				container,
				coverCenterX: visual.coverCenterX,
				currentOpacity: visual.material.opacity,
				currentScale: initialScale,
				extents: visual.extents,
				initialCoverPositions: visual.initialCoverPositions,
				initialStencilPositions: visual.initialStencilPositions,
				key: spec.key,
				layer: spec.layer,
				material: visual.material,
				offset: spec.offset,
				torusRadius: spec.torusRadius,
				torusTube: spec.torusTube,
				signature,
				stencilCenterX: visual.stencilCenterX,
				textNode: visual.textNode,
			})
			requestRenderLoop(LABEL_FADE_IN_MS + 32)
			return
	}

		existing.anchorObject = spec.anchorObject
		existing.layer = spec.layer
		existing.offset = spec.offset
		existing.torusRadius = spec.torusRadius
		existing.torusTube = spec.torusTube

		if (existing.signature === signature) return

		const currentOpacity = existing.currentOpacity
		const currentScale = existing.currentScale
		for (const child of existing.container.children) {
			child.parent = null
	}
		existing.container.children = []
		const visual = createSurfaceLabelNode(spec, labelFont!)
		visual.material.opacity = currentOpacity
		existing.coverCenterX = visual.coverCenterX
		existing.extents = visual.extents
		existing.initialCoverPositions = visual.initialCoverPositions
		existing.initialStencilPositions = visual.initialStencilPositions
		existing.material = visual.material
		existing.signature = signature
		existing.container.add(visual.container)
		existing.stencilCenterX = visual.stencilCenterX
		existing.textNode = visual.textNode
		existing.currentScale = currentScale
		existing.container.scale.set(currentScale, currentScale, currentScale)
		existing.container.updateMatrix()
	}

	const syncLabelRecords = (): void => {
		const nextLabelKeys = new Set<string>()

		for (const record of [...darkParticleRecords.values()].sort(
			(left, right) =>
				left.snapshot.depth - right.snapshot.depth ||
				left.snapshot.darkParticleOrder - right.snapshot.darkParticleOrder ||
				left.snapshot.darkParticleId - right.snapshot.darkParticleId,
		)) {
			const spec = createDarkParticleLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const record of [...orbitalParticleRecords.values()].sort(
			(left, right) =>
				left.snapshot.parentDarkParticleId -
					right.snapshot.parentDarkParticleId ||
				left.snapshot.sourceId - right.snapshot.sourceId ||
				left.snapshot.orbitalParticleId.localeCompare(
					right.snapshot.orbitalParticleId,
				),
		)) {
			const spec = createOrbitalTorusLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const record of [...fieldProxyRecords.values()].sort(
			(left, right) =>
				left.snapshot.parentDarkParticleId -
					right.snapshot.parentDarkParticleId ||
				left.snapshot.fieldId - right.snapshot.fieldId ||
				left.snapshot.fieldProxyId.localeCompare(
					right.snapshot.fieldProxyId,
				),
		)) {
			const spec = createFieldProxyTorusLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const key of [...labelRecords.keys()]) {
			if (!nextLabelKeys.has(key)) removeLabelRecord(key)
		}
	}

	/**
	 * Which entities this application must touch, and which disappeared.
	 *
	 * The full-projection path derives this by diffing the incoming
	 * manifestation against the held one. The patch path does not diff at all:
	 * `pkg/visual` already named the entities the change reached, and the
	 * decision arrives with the patch.
	 */
	type SceneApplicationScope = {
		readonly changedDarkParticleIds: ReadonlySet<number>
		readonly changedFieldParticleIds: ReadonlySet<string>
		readonly changedFieldProxyIds: ReadonlySet<string>
		readonly changedOrbitalParticleIds: ReadonlySet<string>
		readonly removedDarkParticleIds: readonly number[]
		readonly removedFieldParticleIds: readonly string[]
		readonly removedFieldProxyIds: readonly string[]
		readonly removedOrbitalParticleIds: readonly string[]
	}

	const applyRenderManifestToScene = (
		nextManifest: BulkManifest,
		sourceStats: BulkVisualRenderManifest["sourceStats"],
		scope: SceneApplicationScope,
	): void => {
		const {
			changedDarkParticleIds,
			changedFieldParticleIds,
			changedFieldProxyIds,
			changedOrbitalParticleIds,
		} = scope

		for (const darkParticle of nextManifest.darkParticles) {
			if (!changedDarkParticleIds.has(darkParticle.darkParticleId)) continue
			upsertDarkParticleRecord(darkParticle)
		}

		for (const darkParticle of nextManifest.darkParticles) {
			if (!changedDarkParticleIds.has(darkParticle.darkParticleId)) continue
			const record = darkParticleRecords.get(darkParticle.darkParticleId)
			if (!record) {
				throw new Error(
					`Bulk Visual Dark particle ${darkParticle.darkParticleId} has no render record`,
				)
			}
			const parentObject = darkParticle.parentDarkParticleId === null
				? workspace
				: darkParticleRecords.get(darkParticle.parentDarkParticleId)?.container
			if (!parentObject) {
				throw new Error(
					`Bulk Visual Dark particle ${darkParticle.darkParticleId} has no render parent ${darkParticle.parentDarkParticleId}`,
				)
			}
			if (record.container.parent !== parentObject) parentObject.add(record.container)
		}

		for (const field of nextManifest.fieldParticles) {
			if (!changedFieldParticleIds.has(field.fieldParticleId)) continue
			const parentDarkParticle = darkParticleRecords.get(field.parentDarkParticleId)
			if (!parentDarkParticle) {
				throw new Error(
					`Bulk Visual Field ${field.fieldParticleId} has no render parent ${field.parentDarkParticleId}`,
				)
			}
			const record = upsertFieldParticleRecord(field, parentDarkParticle.snapshot.depth + 1)
			if (record.node.parent !== parentDarkParticle.container) parentDarkParticle.container.add(record.node)
		}

		for (const removedFieldParticleId of scope.removedFieldParticleIds) removeFieldParticleRecord(removedFieldParticleId)

		for (const removedDarkParticleId of [...scope.removedDarkParticleIds]
			.sort((left, right) => (darkParticleRecords.get(right)?.snapshot.depth ?? 0) - (darkParticleRecords.get(left)?.snapshot.depth ?? 0))) {
			removeDarkParticleRecord(removedDarkParticleId)
		}

		for (const particle of nextManifest.orbitalParticles ?? []) {
			if (!changedOrbitalParticleIds.has(particle.orbitalParticleId)) continue
			const parent = darkParticleRecords.get(particle.parentDarkParticleId)
			if (!parent) {
				throw new Error(
					`Bulk Visual orbital ${particle.orbitalParticleId} has no render parent ${particle.parentDarkParticleId}`,
				)
			}
			const record = upsertOrbitalParticleRecord(
				particle,
				parent.snapshot.depth + 1,
			)
			if (record.node.parent !== parent.container) parent.container.add(record.node)
		}

		for (const proxy of nextManifest.fieldProxies ?? []) {
			if (!changedFieldProxyIds.has(proxy.fieldProxyId)) continue
			const parent = darkParticleRecords.get(proxy.parentDarkParticleId)
			if (!parent) {
				throw new Error(
					`Bulk Visual Field proxy ${proxy.fieldProxyId} has no render parent ${proxy.parentDarkParticleId}`,
				)
			}
			const record = upsertFieldProxyRecord(
				proxy,
				parent.snapshot.depth + 1,
			)
			if (record.node.parent !== parent.container) parent.container.add(record.node)
		}

		syncLineBatchRecords(
			activeTransitionPaths,
			transitionBatchRecords,
			"Transition",
			"transition",
		)
		syncLineBatchRecords(
			activeRelationPaths,
			relationBatchRecords,
			"relation",
			"relation",
		)
		for (const fieldProxyId of scope.removedFieldProxyIds) {
			const record = fieldProxyRecords.get(fieldProxyId)
			if (record) {
				if (
					getPickTargetKey(hoveredPickTarget) ===
					getPickTargetKey(record.pickTarget)
				) setHoveredPickTarget(null)
				if (
					getPickTargetKey(radialMenuPickTarget) ===
					getPickTargetKey(record.pickTarget)
				) {
					radialMenuPane.close()
					setRadialMenuPickTarget(null)
				}
				detachObject(record.node)
			}
			fieldProxyRecords.delete(fieldProxyId)
		}
		for (const orbitalParticleId of scope.removedOrbitalParticleIds) {
			const record = orbitalParticleRecords.get(orbitalParticleId)
			if (record) {
				if (
					getPickTargetKey(hoveredPickTarget) ===
					getPickTargetKey(record.pickTarget)
				) setHoveredPickTarget(null)
				if (
					getPickTargetKey(radialMenuPickTarget) ===
					getPickTargetKey(record.pickTarget)
				) {
					radialMenuPane.close()
					setRadialMenuPickTarget(null)
				}
				detachObject(record.node)
			}
			orbitalParticleRecords.delete(orbitalParticleId)
		}

		refreshParentByDarkParticleId()
		syncLabelRecords()
		syncVisualLayerVisibility()
			refreshPickTargets()
			applyRootViewportFit()
			pruneSurfaceGeometryCaches()
			requestRenderLoop(SCENE_TRANSITION_WAKE_MS)

		options.onStats?.({
			rootSrc: sourceStats.rootSrc,
			darkParticleCount: sourceStats.darkParticleCount,
			fieldParticleCount: sourceStats.fieldParticleCount,
			orbitalParticleCount: sourceStats.orbitalParticleCount,
			transitionChannelCount: sourceStats.transitionChannelCount,
		})
	}

	const applyVisualManifestPatchToScene = (
		projection: BulkVisualRenderManifest,
	): void => {
		assertBulkVisualProjectionBoundary(projection)
		const nextOrbitalSphereRadiusById = new Map(
			projection.orbitalSpheres.map((sphere) => [
				sphere.orbitalParticleId,
				sphere.radius,
			] as const),
		)
		const nextOrbitalTorusById = new Map(
			projection.orbitalTori.map((torus) => [
				torus.orbitalParticleId,
				{radius: torus.radius, tube: torus.tube},
			] as const),
		)
		const nextFieldProxySphereRadiusById = new Map(
			projection.fieldProxySpheres.map((sphere) => [
				sphere.fieldProxyId,
				sphere.radius,
			] as const),
		)
		const nextFieldProxyTorusById = new Map(
			projection.fieldProxyTori.map((torus) => [
				torus.fieldProxyId,
				{radius: torus.radius, tube: torus.tube},
			] as const),
		)
		const nextVisualFieldParticleIdBySourceAddress =
			indexBulkVisualFieldAliases(projection.fieldAliases)
		const nextDarkMaterialById = new Map(
			projection.darkMaterials.map((entry) =>
				[entry.darkParticleId, entry.material] as const
			),
		)
		const nextFieldMaterialById = new Map(
			projection.fieldMaterials.map((entry) =>
				[entry.fieldParticleId, entry.material] as const
			),
		)
		const nextOrbitalMaterialById = new Map(
			projection.orbitalMaterials.map((entry) =>
				[entry.orbitalParticleId, entry.material] as const
			),
		)
		const nextFieldProxyMaterialById = new Map(
			projection.fieldProxyMaterials.map((entry) =>
				[entry.fieldProxyId, entry.material] as const
			),
		)
		const forcedOrbitalIds = new Set([
			...changedBulkVisualShapeIds(
				orbitalSphereRadiusById,
				nextOrbitalSphereRadiusById,
				(left, right) => left === right,
			),
			...changedBulkVisualShapeIds(
				orbitalTorusById,
				nextOrbitalTorusById,
				(left, right) =>
					left.radius === right.radius &&
					left.tube === right.tube,
			),
		])
			const forcedFieldProxyIds = new Set([
				...changedBulkVisualShapeIds(
					fieldProxySphereRadiusById,
					nextFieldProxySphereRadiusById,
				(left, right) => left === right,
			),
			...changedBulkVisualShapeIds(
				fieldProxyTorusById,
				nextFieldProxyTorusById,
					(left, right) =>
						left.radius === right.radius &&
						left.tube === right.tube,
				),
				...changedBulkVisualQuantumMaterialIds(
					fieldProxyMaterialById,
					nextFieldProxyMaterialById,
				),
			])
		activeVisualDarkTorusMeshDetail = projection.darkTorusMeshDetail
		activeVisualEmbeddedTorusMeshDetail =
			projection.embeddedTorusMeshDetail
		activeVisualSphereMeshDetail = projection.sphereMeshDetail
		orbitalSphereRadiusById = nextOrbitalSphereRadiusById
		orbitalTorusById = nextOrbitalTorusById
		fieldProxySphereRadiusById = nextFieldProxySphereRadiusById
		fieldProxyTorusById = nextFieldProxyTorusById
		darkMaterialById = nextDarkMaterialById
		fieldMaterialById = nextFieldMaterialById
		orbitalMaterialById = nextOrbitalMaterialById
		fieldProxyMaterialById = nextFieldProxyMaterialById
		activeTransitionPaths = projection.transitionPaths
		activeRelationPaths = projection.relationPaths
		visualFieldParticleIdBySourceAddress =
			nextVisualFieldParticleIdBySourceAddress
		const scenePatch = sceneProjection.apply(projection.manifest)
		applyRenderManifestToScene(
			projection.manifest,
			projection.sourceStats,
			{
				changedDarkParticleIds: new Set(scenePatch.darkParticleIds),
				changedFieldParticleIds: new Set(scenePatch.fieldParticleIds),
				changedFieldProxyIds: new Set([
					...scenePatch.fieldProxyIds,
					...forcedFieldProxyIds,
				]),
				changedOrbitalParticleIds: new Set([
					...scenePatch.orbitalParticleIds,
					...forcedOrbitalIds,
				]),
				removedDarkParticleIds: scenePatch.removedDarkParticleIds,
				removedFieldParticleIds: scenePatch.removedFieldParticleIds,
				removedFieldProxyIds: scenePatch.removedFieldProxyIds,
				removedOrbitalParticleIds: scenePatch.removedOrbitalParticleIds,
			},
		)
	}

	/**
	 * Applies exactly what one change reached.
	 *
	 * Nothing is diffed here: `pkg/visual` decided which entities the change
	 * touched, so an entity the patch does not name keeps the Mesh, geometry
	 * buffer, material and line buffer it already holds. The manifestation
	 * handed to the scene application carries only the patched entities, and
	 * every loop in it is gated on the same named ids.
	 */
	const applyVisualRenderPatchToScene = (
		patch: BulkVisualRenderPatch,
	): void => {
		for (const entry of patch.orbitalSpheres) {
			orbitalSphereRadiusById.set(entry.orbitalParticleId, entry.radius)
			orbitalTorusById.delete(entry.orbitalParticleId)
		}
		for (const entry of patch.orbitalTori) {
			orbitalTorusById.set(entry.orbitalParticleId, {
				radius: entry.radius,
				tube: entry.tube,
			})
			orbitalSphereRadiusById.delete(entry.orbitalParticleId)
		}
		for (const entry of patch.fieldProxySpheres) {
			fieldProxySphereRadiusById.set(entry.fieldProxyId, entry.radius)
			fieldProxyTorusById.delete(entry.fieldProxyId)
		}
		for (const entry of patch.fieldProxyTori) {
			fieldProxyTorusById.set(entry.fieldProxyId, {
				radius: entry.radius,
				tube: entry.tube,
			})
			fieldProxySphereRadiusById.delete(entry.fieldProxyId)
		}
		for (const entry of patch.darkMaterials) {
			darkMaterialById.set(entry.darkParticleId, entry.material)
		}
		for (const entry of patch.fieldMaterials) {
			fieldMaterialById.set(entry.fieldParticleId, entry.material)
		}
		for (const entry of patch.orbitalMaterials) {
			orbitalMaterialById.set(entry.orbitalParticleId, entry.material)
		}
		for (const entry of patch.fieldProxyMaterials) {
			fieldProxyMaterialById.set(entry.fieldProxyId, entry.material)
		}
		for (const id of patch.removedOrbitalParticleIds) {
			orbitalSphereRadiusById.delete(id)
			orbitalTorusById.delete(id)
			orbitalMaterialById.delete(id)
		}
		for (const id of patch.removedFieldProxyIds) {
			fieldProxySphereRadiusById.delete(id)
			fieldProxyTorusById.delete(id)
			fieldProxyMaterialById.delete(id)
		}
		for (const id of patch.removedDarkParticleIds) {
			darkMaterialById.delete(id)
		}
		for (const id of patch.removedFieldParticleIds) {
			fieldMaterialById.delete(id)
		}

		activeVisualDarkTorusMeshDetail = patch.darkTorusMeshDetail
		activeVisualEmbeddedTorusMeshDetail = patch.embeddedTorusMeshDetail
		activeVisualSphereMeshDetail = patch.sphereMeshDetail
		activeTransitionPaths = mergeVisualBatchPaths(
			activeTransitionPaths,
			patch.transitionPaths,
			patch.removedTransitionBatchIds,
		)
		activeRelationPaths = mergeVisualBatchPaths(
			activeRelationPaths,
			patch.relationPaths,
			patch.removedRelationBatchIds,
		)
		// Aliases arrive whole rather than as a delta, because an alias is a
		// property of the scene's Field projection and not of one entity.
		visualFieldParticleIdBySourceAddress = indexBulkVisualFieldAliases(
			patch.fieldAliases,
		)

		/*
		 * The patched entities are the whole manifestation this application
		 * reads: every loop is gated on the changed ids below, and an entity
		 * the patch omits is neither read nor touched. Channels are carried by
		 * the already-merged line batches, not re-derived here.
		 */
		const patchedManifest = {
			rootSrc: patch.sourceStats.rootSrc,
			darkParticles: [...patch.darkParticles],
			fieldParticles: [...patch.fieldParticles],
			orbitalParticles: [...patch.orbitalParticles],
			fieldProxies: [...patch.fieldProxies],
			// Channels reach the scene as already-merged line batches, which
			// this application reads from `activeTransitionPaths` and
			// `activeRelationPaths` rather than from the manifestation.
			transitionChannels: [],
			relationChannels: [],
		}
		/*
		 * The diff store never saw this change. Telling it what the patch did
		 * keeps a later full projection honest — a stale store would report an
		 * entity as unchanged precisely when the patch had already moved it.
		 */
		sceneProjection.absorb({
			darkParticles: patch.darkParticles,
			fieldParticles: patch.fieldParticles,
			fieldProxies: patch.fieldProxies,
			orbitalParticles: patch.orbitalParticles,
			removedDarkParticleIds: patch.removedDarkParticleIds,
			removedFieldParticleIds: patch.removedFieldParticleIds,
			removedFieldProxyIds: patch.removedFieldProxyIds,
			removedOrbitalParticleIds: patch.removedOrbitalParticleIds,
		})
		applyRenderManifestToScene(
			patchedManifest,
			patch.sourceStats,
			{
				changedDarkParticleIds: new Set(
					patch.darkParticles.map((particle) => particle.darkParticleId),
				),
				changedFieldParticleIds: new Set(
					patch.fieldParticles.map((particle) => particle.fieldParticleId),
				),
				changedFieldProxyIds: new Set(
					patch.fieldProxies.map((proxy) => proxy.fieldProxyId),
				),
				changedOrbitalParticleIds: new Set(
					patch.orbitalParticles.map((particle) => particle.orbitalParticleId),
				),
				removedDarkParticleIds: patch.removedDarkParticleIds,
				removedFieldParticleIds: patch.removedFieldParticleIds,
				removedFieldProxyIds: patch.removedFieldProxyIds,
				removedOrbitalParticleIds: patch.removedOrbitalParticleIds,
			},
		)
	}

	const projectSceneToClientPoint = (manifestPoint: Vector3): { x: number; y: number } | null => {
		const rect = options.canvas.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return null

		const ndc = manifestPoint
			.clone()
			.applyMatrix4(new Matrix4().multiplyMatrices(viewPoint.projectionMatrix, viewPoint.viewMatrix))

		if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null

		return {
			x: rect.left + ((ndc.x + 1) * 0.5) * rect.width,
			y: rect.top + (1 - (ndc.y + 1) * 0.5) * rect.height,
	}
	}

	const resolveProjectedSphereDistancePx = (
		center: Vector3,
		radius: number,
		clientX: number,
		clientY: number,
	): number | null => {
		const centerPoint = projectSceneToClientPoint(center)
		if (!centerPoint) return null

		const cameraForward = viewPoint.getTarget().clone().sub(viewPoint.position).normalize()
		const cameraRight = cameraForward.clone().cross(viewPoint.getUp()).normalize()
		const cameraUp = cameraRight.clone().cross(cameraForward).normalize()
		if (cameraRight.length() <= 1e-6 || cameraUp.length() <= 1e-6) return null

		const rightPoint = projectSceneToClientPoint(center.clone().add(cameraRight.multiplyScalar(radius)))
		const upPoint = projectSceneToClientPoint(center.clone().add(cameraUp.multiplyScalar(radius)))
		if (!rightPoint && !upPoint) return null

		const projectedRadius = Math.max(
			rightPoint ? Math.hypot(rightPoint.x - centerPoint.x, rightPoint.y - centerPoint.y) : 0,
			upPoint ? Math.hypot(upPoint.x - centerPoint.x, upPoint.y - centerPoint.y) : 0,
		)
		if (projectedRadius <= 1e-6) return null

		return Math.max(0, Math.hypot(clientX - centerPoint.x, clientY - centerPoint.y) - projectedRadius)
	}

	const resolveProjectedTorusDistancePx = (
		center: Vector3,
		torusRadius: number,
		torusTube: number,
		clientX: number,
		clientY: number,
	): number | null => {
		const outerRadius = Math.max(0, torusRadius + torusTube)
		const innerRadius = Math.max(0, torusRadius - torusTube)
		const centerPoint = projectSceneToClientPoint(center)
		if (!centerPoint) return null
		const outerEdgeDistance = resolveProjectedSphereDistancePx(center, outerRadius, clientX, clientY)
		if (outerEdgeDistance === null) return null
		const cameraForward = viewPoint.getTarget().clone().sub(viewPoint.position).normalize()
		const cameraRight = cameraForward.clone().cross(viewPoint.getUp()).normalize()
		if (cameraRight.length() <= 1e-6 || innerRadius <= 1e-6) return outerEdgeDistance
		const innerPoint = projectSceneToClientPoint(center.clone().add(cameraRight.multiplyScalar(innerRadius)))
		if (!innerPoint) return outerEdgeDistance
		const distanceFromCenter = Math.hypot(clientX - centerPoint.x, clientY - centerPoint.y)
		const projectedInnerRadius = Math.hypot(innerPoint.x - centerPoint.x, innerPoint.y - centerPoint.y)
		if (distanceFromCenter >= projectedInnerRadius && outerEdgeDistance <= 1e-6) return 0
		return Math.min(outerEdgeDistance, Math.abs(distanceFromCenter - projectedInnerRadius))
	}

	const syncPickTargetsFromScene = (): void => {
		for (const record of darkParticleRecords.values()) {
			record.container.matrixWorld.decompose(
				reusableScenePosition,
				reusableSceneQuaternion,
				reusableInheritedScale,
			)
			record.pickTarget.center.copy(reusableScenePosition)
			if (record.pickTarget.kind === "darkParticle") {
				record.pickTarget.torusRadius = record.snapshot.torusRadius * reusableInheritedScale.x
				record.pickTarget.torusTube = record.snapshot.torusTube * reusableInheritedScale.x
				record.pickTarget.outerRadius =
					(record.snapshot.torusRadius + record.snapshot.torusTube) * reusableInheritedScale.x
			}
	}

		for (const record of fieldParticleRecords.values()) {
			record.node.matrixWorld.decompose(
				reusableScenePosition,
				reusableSceneQuaternion,
				reusableInheritedScale,
			)
			record.pickTarget.center.copy(reusableScenePosition)
			if (record.pickTarget.kind === "fieldParticle") {
				record.pickTarget.sphereRadius = record.snapshot.sphereRadius * reusableInheritedScale.x
				record.pickTarget.outerRadius = record.pickTarget.sphereRadius
			}
	}

		for (const record of orbitalParticleRecords.values()) {
			record.node.matrixWorld.decompose(
				reusableScenePosition,
				reusableSceneQuaternion,
				reusableInheritedScale,
			)
			record.pickTarget.center.copy(reusableScenePosition)
			if (record.pickTarget.kind === "orbitalParticle") {
				if (record.pickTarget.form === "sphere") {
					const radius = orbitalSphereRadiusById.get(
						record.snapshot.orbitalParticleId,
					)
					if (radius === undefined) {
						throw new Error(
							`Bulk Visual orbital ${record.snapshot.orbitalParticleId} has no Sphere pick form`,
						)
					}
					record.pickTarget.sphereRadius =
						radius * reusableInheritedScale.x
					record.pickTarget.outerRadius =
						record.pickTarget.sphereRadius
				} else {
					const torus = orbitalTorusById.get(
						record.snapshot.orbitalParticleId,
					)
					if (!torus) {
						throw new Error(
							`Bulk Visual orbital ${record.snapshot.orbitalParticleId} has no Torus pick form`,
						)
					}
					record.pickTarget.torusRadius =
						torus.radius * reusableInheritedScale.x
					record.pickTarget.torusTube =
						torus.tube * reusableInheritedScale.x
					record.pickTarget.outerRadius =
						record.pickTarget.torusRadius +
						record.pickTarget.torusTube
				}
			}
		}

		for (const record of fieldProxyRecords.values()) {
			record.node.matrixWorld.decompose(
				reusableScenePosition,
				reusableSceneQuaternion,
				reusableInheritedScale,
			)
			record.pickTarget.center.copy(reusableScenePosition)
			if (record.pickTarget.kind === "fieldProxy") {
				if (record.pickTarget.form === "sphere") {
					const radius = fieldProxySphereRadiusById.get(
						record.snapshot.fieldProxyId,
					)
					if (radius === undefined) {
						throw new Error(
							`Bulk Visual Field proxy ${record.snapshot.fieldProxyId} has no Sphere pick form`,
						)
					}
					record.pickTarget.sphereRadius =
						radius * reusableInheritedScale.x
					record.pickTarget.outerRadius =
						record.pickTarget.sphereRadius
				} else {
					const torus = fieldProxyTorusById.get(
						record.snapshot.fieldProxyId,
					)
					if (!torus) {
						throw new Error(
							`Bulk Visual Field proxy ${record.snapshot.fieldProxyId} has no Torus pick form`,
						)
					}
					record.pickTarget.torusRadius =
						torus.radius * reusableInheritedScale.x
					record.pickTarget.torusTube =
						torus.tube * reusableInheritedScale.x
					record.pickTarget.outerRadius =
						record.pickTarget.torusRadius +
						record.pickTarget.torusTube
				}
			}
		}
	}

	const cancelNavigation = (): void => {
		navigationState = null
	}

	const clickFitAxisForViewport = (): BulkViewportFitAxis =>
		viewPoint.aspect >= 1 ? "height" : "width"

	const fitTargetForPickTarget = (target: HoverablePickTarget): { points: Vector3[]; radius: number; target: Vector3 } => {
		if (target.kind === "darkParticle") {
			const record = darkParticleRecords.get(target.darkParticleId)
			if (record) {
				const center = rootDarkParticleSceneCenter(record)
				const bounds = atomVisualFitBounds(record, center)
				return {
					points: [...bounds.points],
					radius: bounds.radius,
					target: center,
				}
			}
			return {
				points: [],
				radius: target.outerRadius,
				target: target.center.clone(),
			}
		}

		const node = target.kind === "fieldParticle"
			? fieldParticleRecords.get(target.fieldParticleId)?.node
			: target.kind === "orbitalParticle"
				? orbitalParticleRecords.get(target.orbitalParticleId)?.node
				: fieldProxyRecords.get(target.fieldProxyId)?.node
		const points = node ? meshViewportFitPoints(node) : []
		const pointRadius = points.reduce(
			(maxRadius, point) => Math.max(maxRadius, point.distanceTo(target.center)),
			target.outerRadius,
		)

		return {
			points,
			radius: pointRadius,
			target: target.center.clone(),
		}
	}

	const fitTargetForPickTargetKey = (targetKey: string): { points: Vector3[]; radius: number; target: Vector3 } | null => {
		const liveTarget = pickTargets.find((target) => getPickTargetKey(target) === targetKey) ?? null
		return liveTarget ? fitTargetForPickTarget(liveTarget) : null
	}

	const resolveNavigationFocusTarget = (): { points: Vector3[]; radius: number; target: Vector3 } | null => {
		if (!navigationState) return null

		if (navigationState.targetKey) {
			const fitTarget = fitTargetForPickTargetKey(navigationState.targetKey)
			if (fitTarget) {
				navigationState.fallbackTarget.copy(fitTarget.target)
				navigationState.fallbackFitRadius = fitTarget.radius
				navigationState.fallbackFitPoints = fitTarget.points.map((point) => point.clone())
			}
		}

		return {
			points: navigationState.fallbackFitPoints,
			radius: navigationState.fallbackFitRadius,
			target: navigationState.fallbackTarget,
		}
	}

	const resolvePickTargetHoverScore = (
		target: HoverablePickTarget,
		clientX: number,
		clientY: number,
	): number | null => {
		if (isBulkSpherePickTarget(target)) {
			return resolveProjectedSphereDistancePx(target.center, target.sphereRadius, clientX, clientY)
		}

		return resolveProjectedTorusDistancePx(
			target.center,
			target.torusRadius,
			target.torusTube,
			clientX,
			clientY,
		)
	}

	const updateManifestationSceneState = (): void => {
		space.updateWorldMatrix()
		syncPickTargetsFromScene()
	}

	const captureViewPose = (): BulkViewPose => ({
		position: viewPoint.position.clone(),
		target: viewPoint.getTarget().clone(),
		up: viewPoint.getUp().clone(),
	})

	const persistCurrentViewPose = (): void => {
		writeStoredBulkViewPose(captureViewPose(), rootFitLockedToViewport)
	}

	window.addEventListener("pagehide", persistCurrentViewPose)
	window.addEventListener("beforeunload", persistCurrentViewPose)

	const applyViewPose = (pose: BulkViewPose): void => {
		viewPoint.position.copy(pose.position)
		viewPoint.getTarget().copy(pose.target)
		viewPoint.getUp().copy(pose.up).normalize()
		viewPoint.update()
	}

	const rootDarkParticleForViewportFit = (): DarkParticleRenderRecord | null => {
		return [...darkParticleRecords.values()]
			.filter((record) => record.snapshot.parentDarkParticleId === null && record.snapshot.depth === 0)
			.sort((left, right) =>
				left.snapshot.darkParticleOrder - right.snapshot.darkParticleOrder ||
				left.snapshot.darkParticleId - right.snapshot.darkParticleId,
			)[0] ?? null
	}

	const applyRootViewportFit = (fitOptions: {force?: boolean} = {}): void => {
		if (!fitOptions.force && !rootFitLockedToViewport) return
		const rootDarkParticle = rootDarkParticleForViewportFit()
		if (rootDarkParticle === null) return
		space.updateWorldMatrix()
		const fitTarget = fitTargetForPickTarget(rootDarkParticle.pickTarget)
		if (!Number.isFinite(fitTarget.radius) || fitTarget.radius <= 1e-6) return
		const pose = resolveBulkViewportFitPose({
			aspect: viewPoint.aspect,
			centerProjectedBounds: false,
			currentPosition: viewPoint.position,
			currentTarget: viewPoint.getTarget(),
			fovRad: viewPoint.fov,
			points: fitTarget.points,
			radius: fitTarget.radius,
			target: fitTarget.target,
			up: viewPoint.getUp(),
		})
		applyViewPose({
			position: pose.position,
			target: pose.target,
			up: viewPoint.getUp().clone(),
		})
		persistCurrentViewPose()
	}

	const disableRootViewportFit = (): void => {
		rootFitLockedToViewport = false
	}

	const applyFocusedViewportFit = (): boolean => {
		if (navigationState || focusedViewportFitTargetKey === null) return false
		viewPoint.alignUpToWorldZ()
		viewPoint.update()
		updateManifestationSceneState()
		space.updateWorldMatrix()
		const fitTarget = fitTargetForPickTargetKey(focusedViewportFitTargetKey)
		if (fitTarget === null) {
			focusedViewportFitTargetKey = null
			return false
		}

		const pose = resolveBulkViewportFitPose({
			aspect: viewPoint.aspect,
			centerProjectedBounds: false,
			currentPosition: viewPoint.position,
			currentTarget: viewPoint.getTarget(),
			fitAxis: clickFitAxisForViewport(),
			fovRad: viewPoint.fov,
			paddingRatio: NAVIGATION_VIEWPORT_FIT_PADDING_RATIO,
			points: fitTarget.points,
			radius: fitTarget.radius,
			target: fitTarget.target,
			up: viewPoint.getUp(),
		})
		applyViewPose({
			position: pose.position,
			target: pose.target,
			up: viewPoint.getUp().clone(),
		})
		persistCurrentViewPose()
		return true
	}

	const atomVisualFitBounds = (
		record: DarkParticleRenderRecord,
		center: Vector3,
		) => resolveOwnedAtomVisualFitBounds(
			record.snapshot.darkParticleId,
			center,
			[
				...(record.torus.visible ? [{
						atomId: record.snapshot.darkParticleId,
						geometry: record.torus.geometry,
						node: record.torus,
					}] : []),
				...[...fieldProxyRecords.values()].filter((proxy) => proxy.node.visible).map((proxy) => ({
					atomId: proxy.snapshot.parentDarkParticleId,
					geometry: proxy.node.geometry,
					node: proxy.node,
				})),
				...[...transitionBatchRecords.values()].filter((batch) => batch.line.visible).map((batch) => ({
					atomId: batch.ownerDarkParticleId,
					geometry: batch.line.geometry,
					node: batch.line,
				})),
				...[...relationBatchRecords.values()].filter((batch) => batch.line.visible).map((batch) => ({
					atomId: batch.ownerDarkParticleId,
					geometry: batch.line.geometry,
					node: batch.line,
				})),
			],
			[
				...[...fieldParticleRecords.values()].filter((field) => field.node.visible).map((field) => ({
					atomId: field.snapshot.parentDarkParticleId,
					node: field.node,
					radius: field.snapshot.sphereRadius,
				})),
					...[...orbitalParticleRecords.values()].filter((particle) => particle.node.visible).map((particle) => ({
						atomId: particle.snapshot.parentDarkParticleId,
						node: particle.node,
						radius: orbitalParticleOuterRadius(
							particle.snapshot.orbitalParticleId,
						),
				})),
		],
	)

	const meshViewportFitPoints = (node: Mesh): Vector3[] => {
		const points: Vector3[] = []
		const positions = getGeometryPositionArray(node.geometry)
		if (positions) {
			for (let index = 0; index < positions.length; index += 3) {
				points.push(new Vector3(
					positions[index] ?? 0,
					positions[index + 1] ?? 0,
					positions[index + 2] ?? 0,
				).applyMatrix4(node.matrixWorld))
			}
		}

		return points
	}

	const rootDarkParticleSceneCenter = (record: DarkParticleRenderRecord): Vector3 => {
		const elements = record.container.matrixWorld.elements
		return new Vector3(elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0)
	}

	const mixViewPose = (start: BulkViewPose, end: BulkViewPose, t: number): BulkViewPose => ({
		position: new Vector3(
			mixScalar(start.position.x, end.position.x, t),
			mixScalar(start.position.y, end.position.y, t),
			mixScalar(start.position.z, end.position.z, t),
		),
		target: new Vector3(
			mixScalar(start.target.x, end.target.x, t),
			mixScalar(start.target.y, end.target.y, t),
			mixScalar(start.target.z, end.target.z, t),
		),
		up: new Vector3(
			mixScalar(start.up.x, end.up.x, t),
			mixScalar(start.up.y, end.up.y, t),
			mixScalar(start.up.z, end.up.z, t),
		).normalize(),
	})

	const pickTargetAtClientPoint = (
		clientX: number,
		clientY: number,
		preferCurrentHover: boolean = false,
	): HoverablePickTarget | null => {
		if (pickTargets.length === 0) return null
		const rect = options.canvas.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return null

		updateManifestationSceneState()

		raycaster.setFromCamera(
			{
				x: ((clientX - rect.left) / rect.width) * 2 - 1,
				y: -((clientY - rect.top) / rect.height) * 2 + 1,
			},
			viewPoint,
		)

		const hits = resolveBulkPickHits(raycaster.ray, pickTargets, { hitPaddingMm: HOVER_PICK_HIT_PADDING_MM })
		const hoverPriorityCandidates: BulkHoverPriorityCandidate[] = []

		for (const hit of hits) {
			const target = hit.target as HoverablePickTarget
			const score = resolvePickTargetHoverScore(target, clientX, clientY)
			if (score === null) continue
			hoverPriorityCandidates.push({ ...hit, score, target })
		}

		const priorityTarget = resolveBulkHoverPriorityTarget({
			candidates: hoverPriorityCandidates,
			currentTarget: preferCurrentHover ? hoveredPickTarget : null,
			hysteresisPx: HOVER_PRIORITY_HYSTERESIS_PX,
			parentByDarkParticleId,
		}) as HoverablePickTarget | null
		if (priorityTarget) return priorityTarget
		if (
			hoveredPickTarget &&
			preferCurrentHover &&
			resolveBulkPickHit(raycaster.ray, hoveredPickTarget, { hitPaddingMm: HOVER_RETENTION_HIT_PADDING_MM })
		) {
			return hoveredPickTarget
		}

		return null
	}

	const pickRadialMenuTargetAtClientPoint = (clientX: number, clientY: number): HoverablePickTarget | null => {
		const directTarget = pickTargetAtClientPoint(clientX, clientY, true)
		if (directTarget) return directTarget

		updateManifestationSceneState()
		let bestTarget: HoverablePickTarget | null = null
		let bestScore = Number.POSITIVE_INFINITY

		for (const target of pickTargets) {
			const score = isBulkSpherePickTarget(target)
				? resolveProjectedSphereDistancePx(target.center, target.sphereRadius, clientX, clientY)
				: resolveProjectedTorusDistancePx(target.center, target.torusRadius, target.torusTube, clientX, clientY)
			if (score === null || score > BULK_RADIAL_MENU_PROJECTED_HIT_PAD_PX || score >= bestScore) continue
			bestScore = score
			bestTarget = target
		}

		return bestTarget
	}

	const radialMenuCenterForTarget = (target: HoverablePickTarget, fallbackClientX?: number, fallbackClientY?: number): {x: number; y: number} | null => {
		const canvasRect = options.canvas.getBoundingClientRect()
		if (canvasRect.width <= 0 || canvasRect.height <= 0) return null
		const fallback = fallbackClientX !== undefined && fallbackClientY !== undefined
			? {x: fallbackClientX, y: fallbackClientY}
			: null
		const centerPoint = projectSceneToClientPoint(target.center) ?? fallback
		if (centerPoint === null) return null
		return {
			x: centerPoint.x - canvasRect.left,
			y: centerPoint.y - canvasRect.top,
		}
	}

	const syncRadialMenuAnchor = (): void => {
		if (radialMenuPickTarget === null) return
		const center = radialMenuCenterForTarget(radialMenuPickTarget)
		if (center === null) return
		radialMenuPane.setCenter(center)
	}

	const openRadialMenuForTarget = (target: HoverablePickTarget, fallbackClientX: number, fallbackClientY: number): void => {
		cancelNavigation()
		updateManifestationSceneState()
		const center = radialMenuCenterForTarget(target, fallbackClientX, fallbackClientY)
		if (center === null) return
		setHoveredPickTarget(target)
		setRadialMenuPickTarget(target)
		radialMenuPane.open(center)
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const closeRadialMenu = (): void => {
		setRadialMenuPickTarget(null)
		radialMenuPane.close()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const closeRadialMenuWithoutSceneAction = (suppressNextClick = true): boolean => {
		if (radialMenuPickTarget === null) return false
		closeRadialMenu()
		clickNavigationSuppressed = suppressNextClick
		isPrimaryPointerDown = false
		return true
	}

	const cancelRadialMenuLongPress = (): void => {
		if (radialMenuLongPress === null) return
		clearTimeout(radialMenuLongPress.timer)
		radialMenuLongPress = null
	}

	const applyNavigationFrame = (timestamp: number): void => {
		if (!navigationState) return
		viewPoint.alignUpToWorldZ()
		updateManifestationSceneState()

		const nextFocus = resolveNavigationFocusTarget()
		if (!nextFocus) {
			navigationState = null
			return
		}

		const nextPose = resolveBulkViewportFitPose({
			aspect: viewPoint.aspect,
			centerProjectedBounds: false,
			currentPosition: navigationState.startPose.position,
			currentTarget: navigationState.startPose.target,
			fitAxis: clickFitAxisForViewport(),
			fovRad: viewPoint.fov,
			paddingRatio: NAVIGATION_VIEWPORT_FIT_PADDING_RATIO,
			points: nextFocus.points,
			radius: nextFocus.radius,
			target: nextFocus.target,
			up: navigationState.startPose.up,
		})

		if (navigationState.startedAt === null) navigationState.startedAt = timestamp
		const linear = clampBulkHudNumber((timestamp - navigationState.startedAt) / FOCUS_FLIGHT_MS, 0, 1)
		const endPose: BulkViewPose = {
			position: nextPose.position,
			target: nextPose.target,
			up: navigationState.startPose.up,
		}
		if (linear >= 1) {
			applyViewPose(endPose)
			navigationState = null
			persistCurrentViewPose()
			return
		}
		applyViewPose(mixViewPose(navigationState.startPose, endPose, easeOutCubic(linear)))
	}

	const focusTarget = (target: HoverablePickTarget): void => {
		rootFitLockedToViewport = false
		focusedViewportFitTargetKey = getPickTargetKey(target)
		viewPoint.alignUpToWorldZ()
		viewPoint.update()
		updateManifestationSceneState()
		space.updateWorldMatrix()
		const fitTarget = fitTargetForPickTarget(target)
		lastAnimationTimestamp = 0
		navigationState = {
			fallbackFitPoints: fitTarget.points.map((point) => point.clone()),
			fallbackFitRadius: fitTarget.radius,
			fallbackTarget: fitTarget.target.clone(),
			startedAt: null,
			startPose: captureViewPose(),
			targetKey: getPickTargetKey(target),
		}
		requestRenderLoop(SCENE_TRANSITION_WAKE_MS)
	}

	const spawnImpulseParticle = (message: unknown): boolean => {
		if (!isRecord(message) || typeof message.part !== "string" || typeof message.op !== "string" || typeof message.ts !== "number") return false
		if (!new Set(["inflaton", "graviton", "photon", "gluon", "higgs", "z", "w+", "w-"]).has(message.part)) return false

		let targetObject: Object3D | null = null
		let targetScaleMm = 0
		const atomDarkParticleId = forceAtomDarkParticleId(message.path)
		const value = isRecord(message.value) ? message.value : null
		const sourceId = forcePositiveInteger(value?.processId) ?? forcePositiveInteger(value?.reactionId)
			if (sourceId !== null) {
				const record = [...orbitalParticleRecords.values()].find((candidate) => candidate.snapshot.sourceId === sourceId)
				targetObject = record?.node ?? null
				targetScaleMm = record
					? orbitalParticleOuterRadius(record.snapshot.orbitalParticleId)
					: targetScaleMm
		}
		if (!targetObject && message.part === "photon" && typeof message.value === "string" && atomDarkParticleId !== null) {
			const record = [...orbitalParticleRecords.values()].find((candidate) =>
				candidate.snapshot.parentDarkParticleId === atomDarkParticleId &&
				candidate.snapshot.orbitalParticleKind === "state" &&
				candidate.snapshot.label === message.value &&
				candidate.snapshot.orbitalParticleId.endsWith("/root"),
				)
				targetObject = record?.node ?? null
				targetScaleMm = record
					? orbitalParticleOuterRadius(record.snapshot.orbitalParticleId)
					: targetScaleMm
		}
		if (!targetObject && message.part === "gluon" && atomDarkParticleId !== null) {
			const fields = resolveForceFieldsPayload(message.value)
			const firstFieldId = fields ? resolveForceFieldId(Object.keys(fields)[0] ?? "") : null
			if (firstFieldId !== null) {
				const visualFieldParticleId =
					visualFieldParticleIdBySourceAddress.get(
						bulkVisualFieldSourceAddress(
							atomDarkParticleId,
							firstFieldId,
						),
					)
				const record = visualFieldParticleId
					? fieldParticleRecords.get(visualFieldParticleId)
					: [...fieldParticleRecords.values()].find((candidate) =>
						candidate.parentDarkParticleId ===
							atomDarkParticleId &&
						candidate.snapshot.fieldId === firstFieldId,
					)
				targetObject = record?.node ?? null
				targetScaleMm = record?.snapshot.sphereRadius ?? targetScaleMm
			}
		}
		if (!targetObject && atomDarkParticleId !== null) {
			const record = darkParticleRecords.get(atomDarkParticleId)
			targetObject = record?.container ?? null
			targetScaleMm = record?.snapshot.torusTube ?? targetScaleMm
		}
		if (!targetObject) {
			const record = [...darkParticleRecords.values()].find((candidate) => candidate.snapshot.parentDarkParticleId === null)
			targetObject = record?.container ?? null
			targetScaleMm = record?.snapshot.torusTube ?? targetScaleMm
		}

		space.updateWorldMatrix()
		const target = targetObject
			? readObjectScenePosition(targetObject, new Vector3()).clone()
			: viewPoint.getTarget().clone()
		const radius = resolveForceImpulseRadius(targetScaleMm)
		const part = message as unknown as Particle
		const law = resolveForceImpulseVisual(part)
		const timing = resolveForceImpulseTiming(part, Date.now())
		if (timing === null) return false
		const node = new Mesh(
			getSphereSurfaceGeometry(radius),
			new MeshBasicMaterial({color: new Color(...law.color)}),
		)
		const targetOffset = new Vector3(...law.targetOffset).multiplyScalar(radius)
		target.add(targetOffset)
		const start = target.clone().add(new Vector3(
			(law.startOffset[0] - law.targetOffset[0]) * radius,
			(law.startOffset[1] - law.targetOffset[1]) * radius,
			(law.startOffset[2] - law.targetOffset[2]) * radius,
		))
		node.position.copy(start)
		node.updateMatrix()
		space.add(node)
		impulseRecords.push({
			node,
			start,
			target,
			startedAtMs: performance.now() - timing.elapsedMs,
			durationMs: law.durationMs,
		})
		requestRenderLoop(timing.remainingMs + 32)
		return true
	}

	const updateAnimatedRecords = (deltaMs: number): boolean => {
		let hasPendingMotion = false
		let detachedSurface = false
		const positionFactor = computeLerpFactor(deltaMs, POSITION_SMOOTHING_MS)
		const scaleFactor = computeLerpFactor(deltaMs, SCALE_SMOOTHING_MS)

		for (const record of darkParticleRecords.values()) {
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			const nextX = mixScalar(record.container.position.x, record.targetLocalPosition.x, positionFactor)
			const nextY = mixScalar(record.container.position.y, record.targetLocalPosition.y, positionFactor)
			const nextZ = mixScalar(record.container.position.z, record.targetLocalPosition.z, positionFactor)
			record.container.position.set(nextX, nextY, nextZ)
			if (Math.abs(record.container.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
			if (Math.abs(record.container.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
			if (Math.abs(record.container.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (record.currentTransitionScale !== 1) hasPendingMotion = true
			applyDarkParticleRecordScale(record)
			record.container.updateMatrix()
		}

		for (const record of fieldParticleRecords.values()) {
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			const nextX = mixScalar(record.node.position.x, record.targetLocalPosition.x, positionFactor)
			const nextY = mixScalar(record.node.position.y, record.targetLocalPosition.y, positionFactor)
			const nextZ = mixScalar(record.node.position.z, record.targetLocalPosition.z, positionFactor)
			record.node.position.set(nextX, nextY, nextZ)
			if (Math.abs(record.node.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
			if (Math.abs(record.node.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
			if (Math.abs(record.node.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (record.currentTransitionScale !== 1) hasPendingMotion = true
			applyFieldParticleRecordScale(record)
			record.node.updateMatrix()
		}

		for (const record of orbitalParticleRecords.values()) {
			record.node.position.set(
				mixScalar(record.node.position.x, record.targetLocalPosition.x, positionFactor),
				mixScalar(record.node.position.y, record.targetLocalPosition.y, positionFactor),
				mixScalar(record.node.position.z, record.targetLocalPosition.z, positionFactor),
			)
			if (record.node.position.distanceTo(record.targetLocalPosition) > 0.01) hasPendingMotion = true
			record.node.updateMatrix()
		}

		if (impulseRecords.length > 0) {
			const now = performance.now()
			for (let index = impulseRecords.length - 1; index >= 0; index--) {
				const record = impulseRecords[index]!
				const linear = Math.min(
					1,
					Math.max(0, (now - record.startedAtMs) / record.durationMs),
				)
				const progress = easeOutCubic(linear)
				record.node.position.set(
					mixScalar(record.start.x, record.target.x, progress),
					mixScalar(record.start.y, record.target.y, progress),
					mixScalar(record.start.z, record.target.z, progress),
				)
				;(record.node.material as MeshBasicMaterial).color.a =
					0.94 * (1 - linear)
				record.node.updateMatrix()
				if (linear >= 1) {
					detachObject(record.node)
					impulseRecords.splice(index, 1)
					detachedSurface = true
				} else {
					hasPendingMotion = true
				}
			}
		}

		if (fadingRemovalRecords.length > 0) {
			const now = performance.now()
			for (
				let index = fadingRemovalRecords.length - 1;
				index >= 0;
				index -= 1
			) {
				const record = fadingRemovalRecords[index]!
				const linearProgress = Math.min(
					1,
					Math.max(0, (now - record.startedAtMs) / record.durationMs),
				)
				const progress = easeOutCubic(linearProgress)
				const fadeScale =
					mixScalar(1, REMOVAL_SCALE_MULTIPLIER, progress)
				record.material.opacity = record.baseOpacity * (1 - progress)
				record.object.scale.set(
					record.initialScale.x * fadeScale,
					record.initialScale.y * fadeScale,
					record.initialScale.z * fadeScale,
				)
				record.object.updateMatrix()
				if (linearProgress >= 1) {
					detachObject(record.object)
					fadingRemovalRecords.splice(index, 1)
					detachedSurface = true
					continue
				}
				hasPendingMotion = true
			}
		}

		for (const record of labelRecords.values()) {
			const nextScale = mixScalar(record.currentScale, 1, scaleFactor)
			const nextOpacity = mixScalar(
				record.currentOpacity,
				1,
				computeLerpFactor(deltaMs, LABEL_FADE_IN_MS),
			)
			record.currentScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			record.currentOpacity =
				Math.abs(nextOpacity - 1) <= 1e-3 ? 1 : nextOpacity
			record.container.scale.set(
				record.currentScale,
				record.currentScale,
				record.currentScale,
			)
			record.material.opacity = record.currentOpacity
			record.container.updateMatrix()
			if (
				record.currentScale !== 1 ||
				record.currentOpacity !== 1
			) {
				hasPendingMotion = true
			}
		}

		if (fadingLabelRemovalRecords.length > 0) {
			const now = performance.now()
			for (
				let index = fadingLabelRemovalRecords.length - 1;
				index >= 0;
				index -= 1
			) {
				const record = fadingLabelRemovalRecords[index]!
				const linearProgress = Math.min(
					1,
					Math.max(0, (now - record.startedAtMs) / record.durationMs),
				)
				const progress = easeOutCubic(linearProgress)
				const fadeScale =
					mixScalar(1, REMOVAL_SCALE_MULTIPLIER, progress)
				record.material.opacity =
					record.initialOpacity * (1 - progress)
				record.object.scale.set(
					record.initialScale.x * fadeScale,
					record.initialScale.y * fadeScale,
					record.initialScale.z * fadeScale,
				)
				record.object.updateMatrix()
				if (linearProgress >= 1) {
					detachObject(record.object)
					fadingLabelRemovalRecords.splice(index, 1)
					continue
				}
				hasPendingMotion = true
			}
		}

		if (detachedSurface) pruneSurfaceGeometryCaches()
		return hasPendingMotion
	}

	const updateLabelTrackers = (): void => {
		const cameraPos = viewPoint.position

		for (const tracker of labelRecords.values()) {
			tracker.anchorObject.matrixWorld.decompose(
				reusableScenePosition,
				reusableSceneQuaternion,
				reusableInheritedScale,
			)
			const inheritedScale = renderLocalLength(1, reusableInheritedScale.x)
			const torusRadius = tracker.torusRadius
			const torusTube = tracker.torusTube
			const offset = tracker.offset
			const normal = reusableLabelNormal
			const right = reusableLabelRight
			const labelPos = reusableLabelPos

			// Горизонтальное направление от центра объекта к XY-проекции камеры.
			// Метка следует за камерой по экватору (вращается азимутально), но не поднимается
			// по меридиану — вертикальная позиция камеры игнорируется.
			const toCameraXy = reusableLabelToCamera
				.copy(cameraPos)
				.sub(reusableScenePosition)
			const majorDir = reusableMajorDir.set(toCameraXy.x, toCameraXy.y, 0)
			if (majorDir.length() < 1e-6) majorDir.set(1, 0, 0)
			else majorDir.normalize()

			// Нормаль всегда горизонтальная (вдоль majorDir), независимо от высоты камеры.
			normal.copy(majorDir)
			// Касательная вдоль параллели = поворот majorDir на 90° в XY.
			right.set(-majorDir.y, majorDir.x, 0).normalize()

			// Метка на внешнем экваторе тубы, `outerRing = torusRadius + torusTube + offset`.
			const outerRing = torusRadius + torusTube + offset
			labelPos
				.copy(reusableScenePosition)
				.add(reusableScaledOffset.copy(majorDir).multiplyScalar(renderLocalLength(outerRing, inheritedScale)))
			const curveRadiusMm = Math.max(outerRing, 1e-6)

			// Вектор "вверх" — вертикаль сцены; метка не наклоняется с камерой.
			const up = reusableLabelUp.set(0, 0, 1)

			// Строим ориентацию из базиса.
			const matrix = reusableLabelMatrix
			const e = matrix.elements
			e[0] = right.x
			e[1] = right.y
			e[2] = right.z
			e[3] = 0
			e[4] = up.x
			e[5] = up.y
			e[6] = up.z
			e[7] = 0
			e[8] = normal.x
			e[9] = normal.y
			e[10] = normal.z
			e[11] = 0
			e[12] = 0
			e[13] = 0
			e[14] = 0
			e[15] = 1
			const curveQuaternion = reusableLabelCurveQuaternion.setFromRotationMatrix(matrix)

			const fitScale = resolveSurfaceFitScale({
				curveRadiusMm,
				extents: tracker.extents,
				limits: SURFACE_ARC_LIMITS,
				minScale: MIN_SURFACE_LABEL_FIT_SCALE,
			})

			if (tracker.container.parent !== tracker.anchorObject) tracker.anchorObject.add(tracker.container)
			const manifestedLabelScale = renderLocalLength(tracker.currentScale, inheritedScale)
			reusableLabelCurveInheritedScale.set(manifestedLabelScale, manifestedLabelScale, manifestedLabelScale)
			reusableLabelCurveSceneMatrix.compose(labelPos, curveQuaternion, reusableLabelCurveInheritedScale)
			reusableLabelCurveLocalMatrix.multiplyMatrices(
				reusableAnchorInverseMatrix.copy(tracker.anchorObject.matrixWorld).invert(),
				reusableLabelCurveSceneMatrix,
			)
			reusableLabelCurveLocalMatrix.decompose(
				tracker.container.position,
				tracker.container.quaternion,
				tracker.container.scale,
			)
			tracker.material.opacity = tracker.currentOpacity
			bendTextAroundEquator({
				geometry: tracker.textNode.stencilGeometry,
				initialPositions: tracker.initialStencilPositions,
				centerX: tracker.stencilCenterX,
				scale: fitScale,
				curveRadius: curveRadiusMm,
			})
			bendTextAroundEquator({
				geometry: tracker.textNode.coverGeometry,
				initialPositions: tracker.initialCoverPositions,
				centerX: tracker.coverCenterX,
				scale: fitScale,
				curveRadius: curveRadiusMm,
			})
			tracker.container.updateMatrix()
		}
	}

	const handleCanvasMouseDown = (event: MouseEvent): void => {
		cancelNavigation()
		cancelRadialMenuLongPress()
		if (event.button !== 0) return
		disableRootViewportFit()
		isPrimaryPointerDown = true
		pointerDownX = event.clientX
		pointerDownY = event.clientY
		clickNavigationSuppressed = false
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const handleCanvasMouseMove = (event: MouseEvent): void => {
		if (isPrimaryPointerDown) {
			if (clickNavigationSuppressed) return
			if (Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > 6) {
				clickNavigationSuppressed = true
			}
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
			return
		}

		if (radialMenuPickTarget !== null) {
			setHoveredPickTarget(null)
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
			return
		}

		setHoveredPickTarget(pickTargetAtClientPoint(event.clientX, event.clientY, true))
	}

	const handleCanvasMouseUp = (event: MouseEvent): void => {
		isPrimaryPointerDown = false
		handleCanvasMouseMove(event)
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const resetCanvasPointerState = (): void => {
		isPrimaryPointerDown = false
		cancelRadialMenuLongPress()
		setHoveredPickTarget(null)
	}

	const wakeRenderFromDocumentMouseMove = (event: MouseEvent): void => {
		if (event.buttons === 0) return
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const wakeRenderFromDocumentMouseUp = (): void => {
		isPrimaryPointerDown = false
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const wakeRenderFromCanvasWheel = (): void => {
		disableRootViewportFit()
		cancelNavigation()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const wakeRenderFromCanvasTouch = (): void => {
		disableRootViewportFit()
		cancelNavigation()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const canvasTouchForTap = (event: TouchEvent): Touch | null => {
		const state = touchTapState
		if (state === null) return event.changedTouches[0] ?? null
		for (const touch of Array.from(event.changedTouches)) {
			if (touch.identifier === state.touchId) return touch
		}
		return null
	}

	const resetCanvasTouchTap = (): void => {
		touchTapState = null
		isPrimaryPointerDown = false
	}

	const handleCanvasTouchStartForNavigation = (event: TouchEvent): void => {
		if (event.touches.length !== 1 || event.changedTouches.length === 0) {
			resetCanvasTouchTap()
			return
		}
		const touch = event.changedTouches[0]!
		touchTapState = {
			cancelled: false,
			startX: touch.clientX,
			startY: touch.clientY,
			touchId: touch.identifier,
		}
		isPrimaryPointerDown = true
		clickNavigationSuppressed = false
		pointerDownX = touch.clientX
		pointerDownY = touch.clientY
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const handleCanvasTouchMoveForNavigation = (event: TouchEvent): void => {
		const state = touchTapState
		if (state === null) return
		const touch = canvasTouchForTap(event)
		if (touch === null) return
		if (Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) > BULK_TOUCH_TAP_MOVE_PX) {
			state.cancelled = true
			clickNavigationSuppressed = true
		}
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const handleCanvasTouchEndForNavigation = (event: TouchEvent): void => {
		const state = touchTapState
		if (state === null) return
		const touch = canvasTouchForTap(event)
		if (touch === null) return
		resetCanvasTouchTap()
		if (radialMenuPickTarget !== null) {
			if (!state.cancelled && !clickNavigationSuppressed && Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) <= BULK_TOUCH_TAP_MOVE_PX) {
				cancelRadialMenuLongPress()
				closeRadialMenuWithoutSceneAction(false)
				event.preventDefault()
				event.stopImmediatePropagation()
			}
			clickNavigationSuppressed = false
			return
		}
		if (state.cancelled || clickNavigationSuppressed || radialMenuPickTarget !== null) {
			clickNavigationSuppressed = false
			return
		}
		if (Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) > BULK_TOUCH_TAP_MOVE_PX) return
		cancelRadialMenuLongPress()
		const hitTarget = pickTargetAtClientPoint(touch.clientX, touch.clientY, true)
		if (!hitTarget) {
			focusedViewportFitTargetKey = null
			return
		}
		event.preventDefault()
		event.stopImmediatePropagation()
		setHoveredPickTarget(hitTarget)
		focusTarget(hitTarget)
	}

	const handleCanvasTouchCancelForNavigation = (event: TouchEvent): void => {
		if (canvasTouchForTap(event) === null) return
		resetCanvasTouchTap()
		clickNavigationSuppressed = false
	}

	const handleCanvasClick = (event: MouseEvent): void => {
		if (event.button !== 0) return
		isPrimaryPointerDown = false
		if (clickNavigationSuppressed) {
			clickNavigationSuppressed = false
			return
		}
		if (closeRadialMenuWithoutSceneAction(false)) {
			event.preventDefault()
			event.stopImmediatePropagation()
			return
		}
		const hitTarget = hoveredPickTarget ?? pickTargetAtClientPoint(event.clientX, event.clientY, true)
		if (!hitTarget) {
			focusedViewportFitTargetKey = null
			return
		}

		focusTarget(hitTarget)
	}

	const handleCanvasContextMenu = (event: MouseEvent): void => {
		if (event.defaultPrevented) return
		event.preventDefault()
		event.stopImmediatePropagation()
		let hitTarget: HoverablePickTarget | null = null
		try {
			hitTarget = pickRadialMenuTargetAtClientPoint(event.clientX, event.clientY)
		} catch (error) {
			console.warn("[bulk/web] radial menu target lookup failed", error)
		}
		if (!hitTarget) {
			setHoveredPickTarget(null)
			closeRadialMenu()
			return
		}
		clickNavigationSuppressed = true
		openRadialMenuForTarget(hitTarget, event.clientX, event.clientY)
	}

	const handleCanvasTouchStartForRadialMenu = (event: TouchEvent): void => {
		cancelRadialMenuLongPress()
		const hasOpenRadialMenu = radialMenuPickTarget !== null
		if (event.touches.length !== 1) {
			if (!hasOpenRadialMenu) closeRadialMenu()
			return
		}
		const touch = event.changedTouches[0]
		if (touch === undefined) return
		const hitTarget = pickRadialMenuTargetAtClientPoint(touch.clientX, touch.clientY)
		if (!hitTarget) {
			if (!hasOpenRadialMenu) {
				setHoveredPickTarget(null)
				closeRadialMenu()
			}
			return
		}
		radialMenuLongPress = {
			startX: touch.clientX,
			startY: touch.clientY,
			target: hitTarget,
			touchId: touch.identifier,
			timer: setTimeout(() => {
				const pending = radialMenuLongPress
				if (pending === null) return
				radialMenuLongPress = null
				isPrimaryPointerDown = false
				clickNavigationSuppressed = true
				openRadialMenuForTarget(pending.target, pending.startX, pending.startY)
			}, BULK_RADIAL_MENU_LONG_PRESS_MS),
		}
	}

	const handleCanvasTouchMoveForRadialMenu = (event: TouchEvent): void => {
		if (radialMenuLongPress === null) return
		for (const touch of Array.from(event.changedTouches)) {
			if (touch.identifier !== radialMenuLongPress.touchId) continue
			if (
				Math.hypot(
					touch.clientX - radialMenuLongPress.startX,
					touch.clientY - radialMenuLongPress.startY,
				) > BULK_RADIAL_MENU_LONG_PRESS_MOVE_PX
			) {
				cancelRadialMenuLongPress()
			}
			return
		}
	}

	const handleCanvasTouchEndForRadialMenu = (event: TouchEvent): void => {
		if (radialMenuLongPress === null) return
		for (const touch of Array.from(event.changedTouches)) {
			if (touch.identifier === radialMenuLongPress.touchId) {
				cancelRadialMenuLongPress()
				return
			}
		}
	}

	options.canvas.addEventListener("mousedown", handleCanvasMouseDown)
	options.canvas.addEventListener("mousemove", handleCanvasMouseMove)
	options.canvas.addEventListener("mouseup", handleCanvasMouseUp)
	options.canvas.addEventListener("mouseleave", resetCanvasPointerState)
	options.canvas.addEventListener("click", handleCanvasClick)
	options.canvas.addEventListener("contextmenu", handleCanvasContextMenu, true)
	options.canvas.addEventListener("wheel", wakeRenderFromCanvasWheel, { passive: true })
	options.canvas.addEventListener("touchstart", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchmove", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchend", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchcancel", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchstart", handleCanvasTouchStartForNavigation, { passive: true })
	window.addEventListener("touchmove", handleCanvasTouchMoveForNavigation, {capture: true, passive: true})
	window.addEventListener("touchend", handleCanvasTouchEndForNavigation, {capture: true, passive: false})
	window.addEventListener("touchcancel", handleCanvasTouchCancelForNavigation, true)
	options.canvas.addEventListener("touchstart", handleCanvasTouchStartForRadialMenu, { passive: true })
	window.addEventListener("touchmove", handleCanvasTouchMoveForRadialMenu, {capture: true, passive: true})
	window.addEventListener("touchend", handleCanvasTouchEndForRadialMenu, true)
	window.addEventListener("touchcancel", handleCanvasTouchEndForRadialMenu, true)
	document.addEventListener("mousemove", wakeRenderFromDocumentMouseMove)
	document.addEventListener("mouseup", wakeRenderFromDocumentMouseUp)

	const animate = (timestamp: number): void => {
		if (disposed) return
		frameHandle = 0
		const deltaMs = lastAnimationTimestamp > 0 ? timestamp - lastAnimationTimestamp : 16
		lastAnimationTimestamp = timestamp

		const hasPendingMotion = updateAnimatedRecords(deltaMs)
		updateManifestationSceneState()
		applyNavigationFrame(timestamp)
		syncRadialMenuAnchor()

		updateLabelTrackers()
		hudRuntime.flushPendingRender()
		space.updateWorldMatrix()
		syncViewportClipPlanes()
		// Node View — самостоятельный HUD-режим. Не тратим GPU на 3D-мир,
		// который полностью закрыт нодовым холстом; при возврате в Space он
		// снова рендерится без пересборки данных.
		space.visible = !document.documentElement.classList.contains("metafor-node-view-active")
		renderer.renderFrame(space, hudRuntime.overlay, viewPoint)
		if (shouldContinueBulkRenderLoop({
			navigationActive: navigationState !== null,
			pendingMotion: hasPendingMotion,
			timestamp,
			wakeUntilMs: renderWakeUntilMs,
		})) {
			frameHandle = requestAnimationFrame(animate)
		} else {
			lastAnimationTimestamp = 0
		}
	}

	hudRuntime = new BulkViewportHudRuntime(options.canvas, renderer, viewPoint, uiFont, requestRenderLoop)
	hudRuntime.handleSize(options.width, options.height)
	hudRuntime.addSurface(radialMenuPane, ({w, h}) => ({x: 0, y: 0, w, h}), {zIndex: BULK_RADIAL_MENU_HUD_Z})
	requestRenderLoop()

	return {
		dispose() {
			disposed = true
			window.removeEventListener("pagehide", persistCurrentViewPose)
			window.removeEventListener("beforeunload", persistCurrentViewPose)
			cancelAnimationFrame(frameHandle)
			options.canvas.removeEventListener("mousedown", handleCanvasMouseDown)
			options.canvas.removeEventListener("mousemove", handleCanvasMouseMove)
			options.canvas.removeEventListener("mouseup", handleCanvasMouseUp)
			options.canvas.removeEventListener("mouseleave", resetCanvasPointerState)
			options.canvas.removeEventListener("click", handleCanvasClick)
			options.canvas.removeEventListener("contextmenu", handleCanvasContextMenu, true)
			options.canvas.removeEventListener("wheel", wakeRenderFromCanvasWheel)
			options.canvas.removeEventListener("touchstart", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchmove", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchend", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchcancel", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchstart", handleCanvasTouchStartForNavigation)
			window.removeEventListener("touchmove", handleCanvasTouchMoveForNavigation, true)
			window.removeEventListener("touchend", handleCanvasTouchEndForNavigation, true)
			window.removeEventListener("touchcancel", handleCanvasTouchCancelForNavigation, true)
			options.canvas.removeEventListener("touchstart", handleCanvasTouchStartForRadialMenu)
			window.removeEventListener("touchmove", handleCanvasTouchMoveForRadialMenu, true)
			window.removeEventListener("touchend", handleCanvasTouchEndForRadialMenu, true)
			window.removeEventListener("touchcancel", handleCanvasTouchEndForRadialMenu, true)
			document.removeEventListener("mousemove", wakeRenderFromDocumentMouseMove)
			document.removeEventListener("mouseup", wakeRenderFromDocumentMouseUp)
				cancelRadialMenuLongPress()
				setRadialMenuPickTarget(null)
				setHoveredPickTarget(null)
				for (const record of transitionBatchRecords.values()) {
					releaseLineBatchRecord(record)
				}
				for (const record of relationBatchRecords.values()) {
					releaseLineBatchRecord(record)
				}
				for (const record of fieldProxyRecords.values()) detachObject(record.node)
				for (const record of orbitalParticleRecords.values()) detachObject(record.node)
				for (const record of impulseRecords) detachObject(record.node)
			transitionBatchRecords.clear()
			relationBatchRecords.clear()
				fieldProxyRecords.clear()
				orbitalParticleRecords.clear()
				impulseRecords.length = 0
				releaseRenderGeometryCache(
					sphereSurfaceCache,
					invalidateGeometry,
				)
				releaseRenderGeometryCache(
					torusSurfaceCache,
					invalidateGeometry,
				)
				hudRuntime.dispose()
				viewPoint.dispose()
		},
		handleForce(_channel: string, _message: unknown) {
			spawnImpulseParticle(_message)
		},
		setSize(width: number, height: number) {
			const viewportSizeChanged = Math.abs(width - rootFitViewportWidth) > 0.5 || Math.abs(height - rootFitViewportHeight) > 0.5
			rootFitViewportWidth = width
			rootFitViewportHeight = height
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
			if (rootFitLockedToViewport) applyRootViewportFit({force: viewportSizeChanged})
			else if (viewportSizeChanged) applyFocusedViewportFit()
			hudRuntime.handleSize(width, height)
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
		},
		setVisualLayers(layers: readonly BulkVisualLayer[] | null) {
			activeVisualLayers = layers === null ? null : new Set(layers)
			syncVisualLayerVisibility()
			refreshPickTargets()
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
		},
		applyVisualManifestPatch(projection: BulkVisualRenderManifest) {
			applyVisualManifestPatchToScene(projection)
		},
		applyVisualRenderPatch(patch: BulkVisualRenderPatch) {
			applyVisualRenderPatchToScene(patch)
		},
		hud: hudRuntime,
	}
}
