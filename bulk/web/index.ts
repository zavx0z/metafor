import type {
	BulkDarkParticle,
	BulkFieldParticle,
	BulkFieldParticleKind,
	BulkFieldProxy,
	BulkManifest,
	BulkOrbitalParticle,
	BulkRelationChannel,
	BulkTransitionChannel,
} from "@metafor/types/bulk/manifest"
import type {
	BulkViewportController,
	BulkViewportFitAxis,
	BulkViewportOptions,
	BulkViewportStats,
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
	FieldParticleBillboardMode,
	FieldParticleBillboardRecord,
} from "@metafor/types/bulk/hud"
import type { BulkLayoutSettings, BulkRenderSettings } from "@metafor/types/bulk/settings"
import type { SurfaceArcLimits, TextExtents } from "@metafor/types/bulk/text"
import { normalizeBulkLayoutSettings } from "@bulk/gravity/layout"
import {
	DEFAULT_BULK_SETTINGS,
	bulkLayoutConfig,
	normalizeBulkRenderSettings,
	toBulkLevelGeometrySettings,
	toLevelSettings,
} from "bulk/settings"
import {
	createLevelResolver,
	resolveOuterRadiusFromSphereRadius,
} from "@bulk/gravity/level"
import type { LevelResolver } from "@metafor/types/bulk/level"
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
	resolveBulkHoverPriorityTarget,
	resolveBulkPickHit,
	resolveBulkPickHits,
	resolveBulkViewportFitPose,
} from "../web-navigation"
import type { BulkHoverPriorityCandidate, BulkPickTarget } from "@metafor/types/bulk/viewport"
import {BulkSceneStore} from "../scene"
import { isDepthLabelVisible, isDarkParticleLabelVisible } from "../label-visibility"
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
import { computeLerpFactor, easeOutCubic, getDistanceToSegmentPx, mixScalar } from "./math"
import { resolveForceFieldId, resolveForceFieldsPayload } from "@metafor/types/force/fields"

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()
const sphereSurfaceCache = new Map<string, BufferGeometry>()
const LABEL_TEXT_COLOR = new Color(1, 1, 1)
const COSMOS_ORBIT_RAD_PER_MS = (Math.PI * 2) / 180_000
const COSMOS_AXIS_RAD_PER_MS = (Math.PI * 2) / 90_000

type OrbitalParticleRenderRecord = {
	node: LineSegments
	material: LineGlowMaterial
	snapshot: BulkOrbitalParticle
	targetLocalPosition: Vector3
}

type TransitionChannelRenderRecord = {
	line: LineSegments
	material: LineGlowMaterial
	snapshot: BulkTransitionChannel
}

type FieldProxyRenderRecord = {
	node: LineSegments
	material: LineGlowMaterial
	snapshot: BulkFieldProxy
}

type RelationChannelRenderRecord = {
	line: LineSegments
	material: LineGlowMaterial
	snapshot: BulkRelationChannel
}

type ImpulseRenderRecord = {
	node: Mesh
	start: Vector3
	target: Vector3
	startedAtMs: number
	durationMs: number
}
const FIELD_GLOW_ALPHA = 0.1
const FIELD_GLOW_INTENSITY = 0.8
const FIELD_OPACITY_MULTIPLIER = 0.9
const FIELD_BILLBOARD_PIXEL_WIDTH = 240
const FIELD_BILLBOARD_PIXEL_HEIGHT = FIELD_BILLBOARD_PIXEL_WIDTH
const FIELD_BILLBOARD_BORDER_RADIUS_PX = 6
const FIELD_BILLBOARD_TITLE_PAD_X_PX = 10
const FIELD_BILLBOARD_TITLE_Y_PX = 8
const FIELD_BILLBOARD_TITLE_FONT_PX = 12
const FIELD_BILLBOARD_TITLE_Z_MM = 0.7
const NAVIGATION_VIEWPORT_FIT_PADDING_RATIO = 1.25
const FIELD_LABEL_TITLE_MORPH_START_DISTANCE_RATIO = 4
const FIELD_LABEL_TITLE_MORPH_END_DISTANCE_RATIO = 2
const BULK_RADIAL_MENU_SECTOR_COUNT = 12
const BULK_RADIAL_MENU_SIZE_PX = 296
const BULK_RADIAL_MENU_INNER_SIZE_PX = 150
const BULK_RADIAL_MENU_LONG_PRESS_MS = 560
const BULK_RADIAL_MENU_LONG_PRESS_MOVE_PX = 10
const BULK_RADIAL_MENU_PROJECTED_HIT_PAD_PX = 48
const BULK_RADIAL_MENU_HUD_Z = 10
const BULK_TOUCH_TAP_MOVE_PX = 14
let activeLayoutSettings: BulkLayoutSettings = { ...DEFAULT_BULK_SETTINGS.layout }
let activeRenderSettings: BulkRenderSettings = { ...DEFAULT_BULK_SETTINGS.render }
let levelResolver: LevelResolver = createLevelResolver(
	toLevelSettings(activeLayoutSettings, activeRenderSettings),
)

const rebuildLevelResolver = (): void => {
	levelResolver = createLevelResolver(toLevelSettings(activeLayoutSettings, activeRenderSettings))
}

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

const getViewportConfig = () => bulkLayoutConfig.viewport
const getTorusFallback = () => getViewportConfig().torusFallbackMm
const getWorkspaceBaseZ = (): number => getViewportConfig().levelsMm.elbow
const getFloorZ = (): number => getViewportConfig().levelsMm.floor

/**
 * Возвращает surface-aware отступ подписи в мм.
 *
 * `surfaceOffsetMm` из `LevelLabel` задан в canonical-масштабе уровня (через `levelScale`).
 * При отклонении фактического внешнего радиуса снимка от canonical результат пропорционально
 * масштабируется, чтобы отступ визуально соответствовал размеру поверхности.
 */
const resolveSurfaceOffsetMm = (depth: number, outerRadiusMm: number): number => {
	const canonicalGeometry = levelResolver.getGeometry(depth)
	const label = levelResolver.getLabel(depth)
	const canonicalOuter = Math.max(canonicalGeometry.outerRadiusMm, 1e-6)
	const surfaceScale = outerRadiusMm > 0 ? outerRadiusMm / canonicalOuter : 1
	return Math.max(0, label.surfaceOffsetMm * surfaceScale)
}

let activeDarkParticleId: number | null = null

const isLabelDepthVisible = (depth: number): boolean =>
	isDepthLabelVisible({
		baseDepth: activeRenderSettings.baseDepth,
		depth,
		labelVisibleLevels: activeRenderSettings.labelVisibleLevels,
	})

const isDarkParticleLabelDepthVisible = (darkParticleId: number, depth: number): boolean =>
	isDarkParticleLabelVisible({
		baseDepth: activeRenderSettings.baseDepth,
		depth,
		isActiveDarkParticle: activeDarkParticleId === darkParticleId,
		labelVisibleLevels: activeRenderSettings.labelVisibleLevels,
	})

const getTorusDetail = (
	_radius: number,
	_tube: number,
	depth: number,
): { radialSegments: number; tubularSegments: number } => {
	const detail = levelResolver.getDetail(depth)
	return {
		radialSegments: detail.torusRadialSegments,
		tubularSegments: detail.torusTubularSegments,
	}
}

const getSphereDetail = (_radius: number, depth: number): { widthSegments: number; heightSegments: number } => {
	const detail = levelResolver.getDetail(depth)
	return {
		widthSegments: detail.sphereWidthSegments,
		heightSegments: detail.sphereHeightSegments,
	}
}

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

const forceActorDarkParticleId = (value: unknown): number | null => {
	const actorId = forcePositiveInteger(value)
	if (actorId === null) return null
	const darkParticleId = actorId * 2
	return Number.isSafeInteger(darkParticleId) ? darkParticleId : null
}

const forceFieldParticleKind = (value: unknown): BulkFieldParticleKind | null => {
	const kind = forceString(value)
	if (kind === "string" || kind === "number" || kind === "boolean" || kind === "array" || kind === "enum") return kind
	return kind === null ? null : "other"
}

const forceFieldParticleColor = (kind: BulkFieldParticleKind): {colorR: number; colorG: number; colorB: number} => {
	if (kind === "string") return {colorR: 1, colorG: 0.08, colorB: 0.58}
	if (kind === "number") return {colorR: 1, colorG: 0.88, colorB: 0}
	if (kind === "boolean") return {colorR: 0, colorG: 0.9, colorB: 1}
	if (kind === "enum") return {colorR: 0.58, colorG: 0.32, colorB: 1}
	if (kind === "array") return {colorR: 1, colorG: 0.42, colorB: 0}
	return {colorR: 1, colorG: 0.16, colorB: 0.16}
}

const forceEnumValueText = (values: unknown): string | null => {
	if (!Array.isArray(values)) return null
	const variants = values.map((item) => forceString(item)).filter((item): item is string => item !== null)
	return variants.length === 0 ? null : variants.join(" / ")
}

const forceValueText = (value: unknown): string | null => {
	if (value === null || value === undefined) return null
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	if (Array.isArray(value)) return value.map((item) => forceValueText(item) ?? "").join(", ")
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
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

const compactFieldBillboardText = (value: string | null | undefined): string => {
	if (value === null || value === undefined) return "null"
	const text = value.replace(/\s+/g, " ").trim()
	if (text.length === 0) return "\"\""
	return text.length <= 96 ? text : `${text.slice(0, 93)}...`
}

const smoothUnit = (value: number): number => {
	const t = Math.min(1, Math.max(0, value))
	return t * t * (3 - 2 * t)
}

const resolveFieldLabelTitleMorph = (cameraDistanceMm: number, sphereRadiusMm: number): number => {
	if (!Number.isFinite(cameraDistanceMm) || sphereRadiusMm <= 1e-6) return 0
	const ratio = cameraDistanceMm / sphereRadiusMm
	const range = FIELD_LABEL_TITLE_MORPH_START_DISTANCE_RATIO - FIELD_LABEL_TITLE_MORPH_END_DISTANCE_RATIO
	if (range <= 1e-6) return ratio <= FIELD_LABEL_TITLE_MORPH_END_DISTANCE_RATIO ? 1 : 0
	return smoothUnit((FIELD_LABEL_TITLE_MORPH_START_DISTANCE_RATIO - ratio) / range)
}

const morphTextGeometryToPlane = ({
	centerX,
	curveRadius,
	curveScale,
	geometry,
	initialPositions,
	mix,
	scale,
}: {
	centerX: number
	curveRadius: number
	curveScale: number
	geometry: BufferGeometry
	initialPositions: Float32Array
	mix: number
	scale: number
}): void => {
	const positions = getGeometryPositionArray(geometry)
	if (!positions || positions.length === 0) return
	const safeRadius = Math.max(Math.abs(curveRadius), 1e-6)
	const t = Math.min(1, Math.max(0, mix))

	for (let i = 0; i < initialPositions.length; i += 3) {
		const initialX = initialPositions[i] ?? 0
		const initialY = initialPositions[i + 1] ?? 0
		const arcOffset = (initialX - centerX) * curveScale
		const angle = arcOffset / safeRadius
		const curvedX = Math.sin(angle) * safeRadius
		const curvedY = initialY * curveScale
		const curvedZ = (Math.cos(angle) - 1) * safeRadius
		const flatX = (initialX - centerX) * scale
		const flatY = initialY * scale

		positions[i] = mixScalar(curvedX, flatX, t)
		positions[i + 1] = mixScalar(curvedY, flatY, t)
		positions[i + 2] = mixScalar(curvedZ, 0, t)
	}

	const attribute = geometry.attributes.position
	if (attribute) attribute.needsUpdate = true
}

const setQuaternionNlerp = (target: Quaternion, from: Quaternion, to: Quaternion, mix: number): void => {
	const t = Math.min(1, Math.max(0, mix))
	const dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w
	const toSign = dot < 0 ? -1 : 1
	target.set(
		mixScalar(from.x, to.x * toSign, t),
		mixScalar(from.y, to.y * toSign, t),
		mixScalar(from.z, to.z * toSign, t),
		mixScalar(from.w, to.w * toSign, t),
	).normalize()
}

class FieldParticleBillboardSurface extends UiSurface {
	#field: BulkFieldParticle
	#mode: FieldParticleBillboardMode = "summary"
	readonly #metaMaterial = new TextMaterial({color: new Color(0.58, 0.66, 0.78)})
	readonly #keyMaterial = new TextMaterial({color: new Color(0.74, 0.84, 0.94)})
	readonly #valueMaterial = new TextMaterial({color: new Color(1, 0.92, 0.74)})

	constructor(field: BulkFieldParticle) {
		super({bgColor: null, borderColor: null})
		this.#field = {...field}
		this.referenceHeight = FIELD_BILLBOARD_PIXEL_HEIGHT
	}

	setField(field: BulkFieldParticle): void {
		this.#field = {...field}
		this.requestRender()
	}

	setMode(mode: FieldParticleBillboardMode): void {
		if (this.#mode === mode) return
		this.#mode = mode
		this.requestRender()
	}

	protected render(): void {
		const field = this.#field
		if (this.#mode === "summary") {
			this.drawTextCentered(compactFieldBillboardText(field.valueText), this.rectW / 2, this.rectH / 2, {
				clip: false,
				fontPx: 18,
				material: this.#valueMaterial,
				maxWidthPx: Math.max(1, this.rectW - 20),
				z: Z.TEXT,
			})
			return
		}

		const padX = 10
		const valueX = padX + 36
		const contentW = Math.max(1, this.rectW - padX - 8)

		this.drawRoundedRect(0, 0, this.rectW, this.rectH, {
			radius: FIELD_BILLBOARD_BORDER_RADIUS_PX,
			fill: new Color(0.012, 0.016, 0.024, 0.82),
			border: new Color(0.34, 0.42, 0.54, 0.72),
			borderWidth: 1,
			z: Z.CONTAINER,
		})
		this.drawText(`id:${field.fieldParticleId} field:${field.fieldId} parent:${field.parentDarkParticleId}`, padX, 28, {
			clip: false,
			fontPx: 8,
			material: this.#metaMaterial,
			maxWidthPx: contentW,
			z: Z.TEXT,
		})
		this.#drawPair("key", field.fieldKey, padX, valueX, 48, contentW - 36)
		this.#drawPair("type", field.fieldParticleKind, padX, valueX, 68, contentW - 36)
		this.#drawPair("value", compactFieldBillboardText(field.valueText), padX, valueX, 88, contentW - 36, this.#valueMaterial)
	}

	#drawPair(
		label: string,
		value: string,
		labelX: number,
		valueX: number,
		y: number,
		valueW: number,
		valueMaterial = this.#keyMaterial,
	): void {
		this.drawText(label, labelX, y, {
			clip: false,
			fontPx: 8,
			material: this.#metaMaterial,
			maxWidthPx: 30,
			z: Z.TEXT,
		})
		this.drawText(value, valueX, y, {
			clip: false,
			fontPx: 9,
			material: valueMaterial,
			maxWidthPx: Math.max(1, valueW),
			z: Z.TEXT,
		})
	}
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

const readObjectWorldPosition = (object: Object3D, target: Vector3): Vector3 => {
	const elements = object.matrixWorld.elements
	return target.set(elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0)
}

const resolveFieldParticlePeerLevelMetrics = (
	record: FieldParticleRenderRecord,
	_parentDarkParticleRecord: DarkParticleRenderRecord | undefined,
): { metricDepth: number; metricRadius: number } => {
	const metricDepth = record.depth
	return {
			metricDepth,
			metricRadius: resolveOuterRadiusFromSphereRadius(
				metricDepth,
			toBulkLevelGeometrySettings(activeLayoutSettings),
				record.snapshot.sphereRadius,
			),
	}
}

/**
 * Характеристический радиус параллели surface для canonical выбора font-size.
 *
 * Для тора — большой экваториальный радиус: `torusRadius + torusTube + offset`.
 * Для сферы — полный радиус + offset.
 */
const resolveCanonicalCurveRadius = (spec: LabelSpec): number => {
	if (spec.kind === "darkParticle") {
		return Math.max(spec.torusRadius + spec.torusTube + spec.offset, 1e-6)
	}
	return Math.max(spec.sphereRadius + spec.offset, 1e-6)
}

const createSurfaceLabelNode = (spec: LabelSpec, font: TrueTypeFont): SurfaceLabelVisual => {
	const baseFontSize = levelResolver.getLabel(spec.metricDepth).fontSizeMm
	const label = createSurfaceLabel({
		text: spec.text,
		font,
		baseFontSize,
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

const sampleTorusPoint = (radius: number, tube: number, u: number, v: number): [number, number, number] => [
	(radius + tube * Math.cos(v)) * Math.cos(u),
	(radius + tube * Math.cos(v)) * Math.sin(u),
	tube * Math.sin(v),
]

const wrapAngle = (angle: number): number => {
	const tau = Math.PI * 2
	const wrapped = angle % tau
	return wrapped >= 0 ? wrapped : wrapped + tau
}

const sampleTiltedLongitudinalPoint = (
	radius: number,
	tube: number,
	baseV: number,
	u: number,
	twistTurns: number,
): [number, number, number] => {
	return sampleTorusPoint(radius, tube, u, wrapAngle(baseV + u * twistTurns))
}

const createQuadTorusWireframeGeometry = (
	radius: number,
	tube: number,
	radialSegments: number,
	tubularSegments: number,
): BufferGeometry => {
	const lines: number[] = []
	const pushPoint = (point: [number, number, number]): void => {
		lines.push(point[0], point[1], point[2])
	}
	const longitudinalTurnCount = Math.round(
		(radialSegments * activeRenderSettings.torusCrossRingRotationDeg) / 360,
	)

	for (let j = 0; j < radialSegments; j += 1) {
		const baseV = (j / radialSegments) * Math.PI * 2
		for (let i = 0; i < tubularSegments; i += 1) {
			const uA = (i / tubularSegments) * Math.PI * 2
			const uB = ((i + 1) / tubularSegments) * Math.PI * 2
			pushPoint(sampleTiltedLongitudinalPoint(radius, tube, baseV, uA, longitudinalTurnCount))
			pushPoint(sampleTiltedLongitudinalPoint(radius, tube, baseV, uB, longitudinalTurnCount))
	}
	}

	const wireframeGeometry = new BufferGeometry()
	wireframeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3))
	return wireframeGeometry
}

const getTorusWireframeGeometry = (radius: number, tube: number, depth: number): BufferGeometry => {
	const detail = getTorusDetail(radius, tube, depth)
	const key = `${radius}:${tube}:${detail.radialSegments}:${detail.tubularSegments}:${activeRenderSettings.torusCrossRingRotationDeg}`
	const cached = torusWireframeCache.get(key)
	if (cached) return cached

	const wireframe = createQuadTorusWireframeGeometry(
		radius,
		tube,
		detail.radialSegments,
		detail.tubularSegments,
	)
	torusWireframeCache.set(key, wireframe)
	return wireframe
}

const getSphereWireframeGeometry = (radius: number, depth: number): BufferGeometry => {
	const detail = getSphereDetail(radius, depth)
	const key = `${radius}:${detail.widthSegments}:${detail.heightSegments}`
	const cached = sphereWireframeCache.get(key)
	if (cached) return cached

	const wireframe = new SphereGeometry({
		radius,
		widthSegments: detail.widthSegments,
		heightSegments: detail.heightSegments,
	}).toWireframe()
	sphereWireframeCache.set(key, wireframe)
	return wireframe
}

const getSphereSurfaceGeometry = (radius: number, depth: number): BufferGeometry => {
	const detail = getSphereDetail(radius, depth)
	const key = `${radius}:${detail.widthSegments}:${detail.heightSegments}`
	const cached = sphereSurfaceCache.get(key)
	if (cached) return cached
	const geometry = new SphereGeometry({radius, ...detail})
	sphereSurfaceCache.set(key, geometry)
	return geometry
}

const createDarkParticleMaterial = (darkParticle: BulkDarkParticle): LineGlowMaterial =>
	new LineGlowMaterial(resolveDarkParticleVisualState(darkParticle))

const mixColor = (left: Color, right: Color, amount: number): Color =>
	new Color(
		left.r + (right.r - left.r) * amount,
		left.g + (right.g - left.g) * amount,
		left.b + (right.b - left.b) * amount,
		left.a + (right.a - left.a) * amount,
	)

const brightenColor = (color: Color, amount: number): Color => mixColor(color, new Color(1, 1, 1, color.a), amount)

const resolveDarkParticleVisualState = (darkParticle: BulkDarkParticle): { color: Color; glowColor: Color; glowIntensity: number; opacity: number } => {
	const baseColor = particleColor(darkParticle)
	const root = darkParticle.parentDarkParticleId === null
	const glowIntensity = root ? 0.95 : darkParticle.darkParticleKind === "wimp" ? 0.58 : 0.36
	const opacity = activeRenderSettings.wireframeOpacity * (
		root ? 1.25 : darkParticle.darkParticleKind === "wimp" ? 0.52 : 0.32
	)
	if (darkParticle.activity === "active") {
		return {
			color: mixColor(baseColor, new Color(1, 1, 1), 0.18),
			glowColor: glowColor(baseColor, 0.18),
			glowIntensity: glowIntensity * 1.25,
			opacity: Math.min(1, opacity * 1.08),
	}
	}
	if (darkParticle.activity === "inactive") {
		return {
			color: mixColor(mixColor(baseColor, new Color(1, 1, 1), 0.24), ROOT_BACKGROUND, 0.28),
			glowColor: glowColor(mixColor(baseColor, new Color(1, 1, 1), 0.3), 0.08),
			glowIntensity: glowIntensity * 0.35,
			opacity: opacity * 0.58,
	}
	}
	return {
		color: baseColor,
		glowColor: glowColor(baseColor),
		glowIntensity,
		opacity,
	}
}

const createFieldParticleMaterial = (fieldParticle: BulkFieldParticle): LineGlowMaterial => {
	const color = particleColor(fieldParticle)
	return new LineGlowMaterial({
		color,
		glowIntensity: FIELD_GLOW_INTENSITY,
		glowColor: glowColor(color, FIELD_GLOW_ALPHA),
		opacity: Math.min(1, activeRenderSettings.wireframeOpacity * FIELD_OPACITY_MULTIPLIER),
	})
}

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

export const createBulkViewport = async (options: BulkViewportOptions): Promise<BulkViewportWithHud> => {
	const renderer = new Renderer()
	await renderer.init(options.canvas)
	if (!renderer.canvas) {
		throw new Error("Не удалось инициализировать WebGPU canvas в bulk viewport")
	}

	renderer.setPixelRatio(window.devicePixelRatio || 1)
	renderer.setSize(options.width, options.height)
	activeRenderSettings = normalizeBulkRenderSettings(activeRenderSettings)
	activeLayoutSettings = normalizeBulkLayoutSettings(activeLayoutSettings)
	rebuildLevelResolver()
	const uiFont = await TrueTypeFont.fromUrl("/engine-static/JetBrainsMono-Bold.ttf")
	const labelFont = uiFont
	const viewportConfig = getViewportConfig()
	const raycaster = new Raycaster()
	const space = new Space()
	space.background = ROOT_BACKGROUND.clone()
	space.add(createWorkspaceGrid())

	const workspace = new Object3D()
	workspace.position.set(0, 0, getWorkspaceBaseZ())
	workspace.updateMatrix()
	space.add(workspace)

	const labelsLayer = new Object3D()
	labelsLayer.frustumCulled = false
	labelsLayer.updateMatrix()
	space.add(labelsLayer)

	const fieldBillboardsLayer = new Object3D()
	fieldBillboardsLayer.frustumCulled = false
	fieldBillboardsLayer.updateMatrix()
	space.add(fieldBillboardsLayer)

	let pickTargets: HoverablePickTarget[] = []
	let hoveredPickTarget: HoverablePickTarget | null = null
	let radialMenuPickTarget: HoverablePickTarget | null = null
	let manifest: BulkManifest | null = null
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
	let animationSuspended = false
	const darkParticleRecords = new Map<number, DarkParticleRenderRecord>()
	const fieldParticleRecords = new Map<string, FieldParticleRenderRecord>()
	const orbitalParticleRecords = new Map<string, OrbitalParticleRenderRecord>()
	const transitionChannelRecords = new Map<string, TransitionChannelRenderRecord>()
	const fieldProxyRecords = new Map<string, FieldProxyRenderRecord>()
	const relationChannelRecords = new Map<string, RelationChannelRenderRecord>()
	const impulseRecords: ImpulseRenderRecord[] = []
	const sceneProjection = new BulkSceneStore()
	const fieldParticleBillboardRecords = new Map<string, FieldParticleBillboardRecord>()
	const fadingRemovalRecords: FadingRemovalRecord[] = []
	const labelRecords = new Map<string, LabelRenderRecord>()
	const fadingLabelRemovalRecords: FadingLabelRemovalRecord[] = []
	const reusableWorldPosition = new Vector3()
	const reusableWorldScale = new Vector3()
	const reusableWorldQuaternion = new Quaternion()
	const reusableLabelNormal = new Vector3()
	const reusableLabelRight = new Vector3()
	const reusableLabelPos = new Vector3()
	const reusableLabelUp = new Vector3()
	const reusableBillboardNormal = new Vector3()
	const reusableBillboardRight = new Vector3()
	const reusableBillboardUp = new Vector3()
	const reusableBillboardMatrix = new Matrix4()
	const reusableLabelToCamera = new Vector3()
	const reusableMajorDir = new Vector3()
	const reusableTubeCenter = new Vector3()
	const reusableScaledOffset = new Vector3()
	const reusableLabelMatrix = new Matrix4()
	const reusableLabelCurveQuaternion = new Quaternion()
	const reusableLabelCurveWorldMatrix = new Matrix4()
	const reusableLabelCurveWorldScale = new Vector3()
	const reusableLabelCurveLocalMatrix = new Matrix4()
	const reusableLabelCurveLocalPosition = new Vector3()
	const reusableLabelCurveLocalQuaternion = new Quaternion()
	const reusableLabelCurveLocalScale = new Vector3()
	const reusableLabelTitleLocalPosition = new Vector3()
	const reusableLabelTitleQuaternion = new Quaternion()
	const reusableBillboardInverseMatrix = new Matrix4()
	const reusableCosmosAxis = new Vector3(0, 0, 1)
	const reusableCosmosSpin = new Quaternion()

	const viewPoint = new ViewPoint({
		element: options.canvas,
		fov: viewportConfig.camera.fovRad,
		near: viewportConfig.camera.near,
		far: viewportConfig.camera.far,
		position: viewportConfig.camera.position,
		target: viewportConfig.camera.target,
	})
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
	const manifestUiCanvas = {
		canvas: options.canvas,
		renderer,
		requestRender: () => requestRenderLoop(INPUT_RENDER_WAKE_MS),
		uiRectToFramebufferClipBounds: (
			xMin: number,
			yMin: number,
			xMax: number,
			yMax: number,
		): [number, number, number, number] => {
			const dpr = window.devicePixelRatio || 1
			return [
				Math.min(xMin, xMax) * dpr,
				Math.min(yMin, yMax) * dpr,
				Math.max(xMin, xMax) * dpr,
				Math.max(yMin, yMax) * dpr,
			]
		},
	} as unknown as UiRuntime
	let hudRuntime: BulkViewportHudRuntime

	const resetHoverMaterial = (target: HoverablePickTarget): void => {
		target.material.color.copy(target.baseColor)
		target.material.glowIntensity = target.baseGlowIntensity
		target.material.opacity = target.baseOpacity
		if (target.baseGlowColor) {
			if (target.material.glowColor) target.material.glowColor.copy(target.baseGlowColor)
			else target.material.glowColor = target.baseGlowColor.clone()
			return
	}

		target.material.glowColor = null
	}

	const applyHoverMaterial = (target: HoverablePickTarget): void => {
		const hoverColor = brightenColor(target.baseColor, 0.24)
		const hoverGlowColor = brightenColor(target.baseGlowColor ?? target.baseColor, 0.34)
		hoverGlowColor.a = Math.max(target.baseGlowColor?.a ?? 0.12, 0.16)
		target.material.color.copy(hoverColor)
		target.material.glowIntensity = Math.max(target.baseGlowIntensity * 1.35, target.baseGlowIntensity + 0.24)
		target.material.opacity = Math.min(1, target.baseOpacity + 0.08)
		if (target.material.glowColor) target.material.glowColor.copy(hoverGlowColor)
		else target.material.glowColor = hoverGlowColor
	}

	const getPickTargetKey = (target: BulkPickTarget | null): string | null => {
		if (!target) return null
		return target.kind === "fieldParticle" ? `fieldParticle:${target.fieldParticleId}` : `darkParticle:${target.darkParticleId}`
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
		const scale = record.baseTorusScale * record.currentTransitionScale
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

	const refreshFieldParticleRecordOrientation = (record: FieldParticleRenderRecord): void => {
		const qBase = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
		const tiltRad = (-activeRenderSettings.torusCrossRingRotationDeg * Math.PI) / 180
		const u = Math.atan2(record.snapshot.localY, record.snapshot.localX)
		const radialAxis = new Vector3(Math.cos(u), Math.sin(u), 0)
		const qTilt = new Quaternion().setFromAxisAngle(radialAxis, tiltRad)
		record.node.quaternion.multiplyQuaternions(qTilt, qBase)
		record.node.updateMatrix()
	}

	const refreshPickTargets = (): void => {
		pickTargets = [
			...[...darkParticleRecords.values()]
				.filter((record) => record.snapshot.darkParticleKind !== "axion")
				.sort(
					(left, right) =>
						left.snapshot.depth - right.snapshot.depth ||
						left.snapshot.darkParticleOrder - right.snapshot.darkParticleOrder ||
						left.snapshot.darkParticleId - right.snapshot.darkParticleId,
				)
				.map((record) => record.pickTarget),
			...[...fieldParticleRecords.values()]
				.sort(
					(left, right) =>
						left.depth - right.depth ||
						left.snapshot.fieldId - right.snapshot.fieldId ||
						left.snapshot.fieldParticleId.localeCompare(right.snapshot.fieldParticleId),
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
		record.torus.geometry = getTorusWireframeGeometry(
			record.snapshot.torusRadius || getTorusFallback().radius,
			record.snapshot.torusTube || getTorusFallback().tube,
			record.snapshot.depth,
		)
		const visual = resolveDarkParticleVisualState(record.snapshot)
		record.torus.visible = record.snapshot.darkParticleKind !== "axion"
		record.pickTarget.baseColor.copy(visual.color)
		record.pickTarget.baseGlowColor = visual.glowColor.clone()
		record.pickTarget.baseGlowIntensity = visual.glowIntensity
		record.pickTarget.baseOpacity = visual.opacity
		syncPickTargetMaterialState(record.pickTarget)
	}

	const refreshFieldParticleRecordGeometryAndMaterial = (record: FieldParticleRenderRecord): void => {
		record.node.geometry = getSphereWireframeGeometry(record.snapshot.sphereRadius, record.depth)
		const color = particleColor(record.snapshot)
		record.pickTarget.baseColor.copy(color)
		record.pickTarget.baseGlowColor = glowColor(color, FIELD_GLOW_ALPHA)
		record.pickTarget.baseGlowIntensity = FIELD_GLOW_INTENSITY
		record.pickTarget.baseOpacity = Math.min(1, activeRenderSettings.wireframeOpacity * FIELD_OPACITY_MULTIPLIER)
		syncPickTargetMaterialState(record.pickTarget)
	}

	const createDarkParticleRecord = (darkParticle: BulkDarkParticle): DarkParticleRenderRecord => {
		const material = createDarkParticleMaterial(darkParticle)
		const torus = new LineSegments(
			getTorusWireframeGeometry(
				darkParticle.torusRadius || getTorusFallback().radius,
				darkParticle.torusTube || getTorusFallback().tube,
				darkParticle.depth,
			),
			material,
		)
		torus.visible = darkParticle.darkParticleKind !== "axion"
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
			torusRadius: darkParticle.torusRadius * darkParticle.torusScale,
			torusTube: darkParticle.torusTube * darkParticle.torusScale,
			outerRadius: (darkParticle.torusRadius + darkParticle.torusTube) * darkParticle.torusScale,
			material,
			baseColor: material.color.clone(),
			baseGlowColor: material.glowColor?.clone() ?? null,
			baseGlowIntensity: material.glowIntensity,
			baseOpacity: material.opacity,
	}

		const record: DarkParticleRenderRecord = {
			baseTorusScale: darkParticle.torusScale,
			container,
			cosmosOrbitAngle: 0,
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
		const material = createFieldParticleMaterial(field)
		const node = new LineSegments(getSphereWireframeGeometry(field.sphereRadius, depth), material)
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
			baseGlowColor: material.glowColor?.clone() ?? null,
			baseGlowIntensity: material.glowIntensity,
			baseOpacity: material.opacity,
	}

		const record: FieldParticleRenderRecord = {
			cosmosOrbitAngle: 0,
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
		refreshFieldParticleRecordOrientation(record)
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
			existing.baseTorusScale *
			existing.currentTransitionScale
		const nextLocalOuterRadius = (darkParticle.torusRadius + darkParticle.torusTube) * darkParticle.torusScale
		const geometryChanged =
			Math.abs(existing.snapshot.torusRadius - darkParticle.torusRadius) > 1e-6 ||
			Math.abs(existing.snapshot.torusTube - darkParticle.torusTube) > 1e-6 ||
			Math.abs(existing.baseTorusScale - darkParticle.torusScale) > 1e-6 ||
			existing.snapshot.depth !== darkParticle.depth

		existing.snapshot = { ...darkParticle }
		existing.baseTorusScale = darkParticle.torusScale
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

		refreshFieldParticleRecordOrientation(existing)
		refreshFieldParticleRecordGeometryAndMaterial(existing)
		applyFieldParticleRecordScale(existing)
		return existing
	}

	const orbitalMaterialVisual = (particle: BulkOrbitalParticle): {color: Color; glowColor: Color; glowIntensity: number} => {
		const isState = particle.orbitalParticleKind === "state"
		const alpha = isState
			? particle.current ? 0.82 : particle.active ? 0.3 : 0.015
			: particle.current ? 0.82 : particle.active ? 0.5 : 0.16
		const glowAlpha = isState
			? particle.current ? 0.34 : particle.active ? 0.1 : 0.002
			: particle.current ? 0.34 : particle.active ? 0.16 : 0.035
		return {
			color: new Color(particle.colorR, particle.colorG, particle.colorB, alpha),
			glowColor: new Color(particle.colorR, particle.colorG, particle.colorB, glowAlpha),
			glowIntensity: isState
				? particle.current ? 1.9 : particle.active ? 1.05 : 0.08
				: particle.current ? 1.9 : particle.active ? 1.15 : 0.42,
		}
	}

	const upsertOrbitalParticleRecord = (particle: BulkOrbitalParticle, depth: number): OrbitalParticleRenderRecord => {
		const existing = orbitalParticleRecords.get(particle.orbitalParticleId)
		const visual = orbitalMaterialVisual(particle)
		if (!existing) {
			const material = new LineGlowMaterial({...visual, opacity: 1})
			const node = new LineSegments(getSphereWireframeGeometry(particle.sphereRadius, depth), material)
			node.position.set(particle.localX, particle.localY, particle.localZ)
			node.updateMatrix()
			const record = {
				node,
				material,
				snapshot: {...particle, relatedStateIds: [...particle.relatedStateIds]},
				targetLocalPosition: new Vector3(particle.localX, particle.localY, particle.localZ),
			}
			orbitalParticleRecords.set(particle.orbitalParticleId, record)
			return record
		}
		existing.snapshot = {...particle, relatedStateIds: [...particle.relatedStateIds]}
		existing.targetLocalPosition.set(particle.localX, particle.localY, particle.localZ)
		existing.node.geometry = getSphereWireframeGeometry(particle.sphereRadius, depth)
		existing.material.color.copy(visual.color)
		existing.material.glowColor?.copy(visual.glowColor)
		existing.material.glowIntensity = visual.glowIntensity
		return existing
	}

	const transitionGeometry = (channel: BulkTransitionChannel): BufferGeometry => {
		const from = orbitalParticleRecords.get(channel.fromOrbitalParticleId)?.snapshot
		const to = orbitalParticleRecords.get(channel.toOrbitalParticleId)?.snapshot
		const geometry = new BufferGeometry()
		if (!from || !to) {
			geometry.setAttribute("position", new BufferAttribute(new Float32Array(), 3))
			return geometry
		}
		const dx = to.localX - from.localX
		const dy = to.localY - from.localY
		const length = Math.max(1, Math.hypot(dx, dy))
		const bend = Math.min(length * 0.32, Math.max(from.sphereRadius, to.sphereRadius) * 5)
		const nx = -dy / length
		const ny = dx / length
		const segments = 24
		const positions: number[] = []
		let previous: [number, number, number] | null = null
		for (let index = 0; index <= segments; index++) {
			const t = index / segments
			const curve = Math.sin(Math.PI * t)
			const point: [number, number, number] = [
				from.localX + dx * t + nx * bend * curve,
				from.localY + dy * t + ny * bend * curve,
				from.localZ + (to.localZ - from.localZ) * t + Math.sin(Math.PI * 2 * t) * bend * 0.16,
			]
			if (previous) positions.push(...previous, ...point)
			previous = point
		}
		geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3))
		return geometry
	}

	const upsertTransitionChannelRecord = (channel: BulkTransitionChannel): TransitionChannelRenderRecord => {
		const existing = transitionChannelRecords.get(channel.transitionChannelId)
		const color = particleColor(channel)
		if (!existing) {
			const material = new LineGlowMaterial({
				color: new Color(color.r, color.g, color.b, channel.active ? 0.82 : 0.008),
				glowColor: new Color(color.r, color.g, color.b, channel.active ? 0.3 : 0),
				glowIntensity: channel.active ? 2.15 : 0.06,
				opacity: 1,
			})
			const line = new LineSegments(transitionGeometry(channel), material)
			line.updateMatrix()
			const record = {line, material, snapshot: {...channel, conditionIds: [...channel.conditionIds], conditionFieldIds: [...channel.conditionFieldIds]}}
			transitionChannelRecords.set(channel.transitionChannelId, record)
			return record
		}
		existing.snapshot = {...channel, conditionIds: [...channel.conditionIds], conditionFieldIds: [...channel.conditionFieldIds]}
		existing.line.geometry = transitionGeometry(channel)
		existing.material.color.setRGBA(color.r, color.g, color.b, channel.active ? 0.82 : 0.008)
		existing.material.glowColor?.setRGBA(color.r, color.g, color.b, channel.active ? 0.3 : 0)
		existing.material.glowIntensity = channel.active ? 2.15 : 0.06
		return existing
	}

	const orientFieldProxy = (record: FieldProxyRenderRecord): void => {
		const state = orbitalParticleRecords.get(record.snapshot.stateOrbitalParticleId)?.snapshot
		if (!state) return
		const normal = new Vector3(
			record.snapshot.localX - state.localX,
			record.snapshot.localY - state.localY,
			record.snapshot.localZ - state.localZ,
		).normalize()
		const angle = Math.acos(Math.max(-1, Math.min(1, normal.z)))
		const axis = new Vector3(-normal.y, normal.x, 0)
		if (axis.length() <= 1e-6) axis.set(1, 0, 0)
		else axis.normalize()
		record.node.quaternion.setFromAxisAngle(axis, angle)
		record.node.updateMatrix()
	}

	const upsertFieldProxyRecord = (proxy: BulkFieldProxy, depth: number): FieldProxyRenderRecord => {
		const existing = fieldProxyRecords.get(proxy.fieldProxyId)
		const active = orbitalParticleRecords.get(proxy.stateOrbitalParticleId)?.snapshot.active ?? false
		const color = new Color(proxy.colorR, proxy.colorG, proxy.colorB, active ? 0.26 : 0.004)
		const glow = new Color(proxy.colorR, proxy.colorG, proxy.colorB, active ? 0.12 : 0)
		if (!existing) {
			const material = new LineGlowMaterial({color, glowColor: glow, glowIntensity: active ? 1.4 : 0.04, opacity: 1})
			const node = new LineSegments(
				getTorusWireframeGeometry(proxy.ringRadius, Math.max(0.45, proxy.ringRadius * 0.14), depth),
				material,
			)
			node.position.set(proxy.localX, proxy.localY, proxy.localZ)
			const record = {node, material, snapshot: {...proxy}}
			fieldProxyRecords.set(proxy.fieldProxyId, record)
			orientFieldProxy(record)
			return record
		}
		existing.snapshot = {...proxy}
		existing.material.color.copy(color)
		existing.material.glowColor?.copy(glow)
		existing.material.glowIntensity = active ? 1.4 : 0.04
		existing.node.geometry = getTorusWireframeGeometry(proxy.ringRadius, Math.max(0.45, proxy.ringRadius * 0.14), depth)
		existing.node.position.set(proxy.localX, proxy.localY, proxy.localZ)
		orientFieldProxy(existing)
		return existing
	}

	const relationEndpointPosition = (kind: BulkRelationChannel["fromKind"], id: string): Vector3 | null => {
		if (kind === "field") {
			const field = fieldParticleRecords.get(id)?.snapshot
			return field ? new Vector3(field.localX, field.localY, field.localZ) : null
		}
		if (kind === "field-proxy") {
			const proxy = fieldProxyRecords.get(id)?.snapshot
			return proxy ? new Vector3(proxy.localX, proxy.localY, proxy.localZ) : null
		}
		const orbital = orbitalParticleRecords.get(id)?.snapshot
		return orbital ? new Vector3(orbital.localX, orbital.localY, orbital.localZ) : null
	}

	const relationGeometry = (channel: BulkRelationChannel): BufferGeometry => {
		const from = relationEndpointPosition(channel.fromKind, channel.fromId)
		const to = relationEndpointPosition(channel.toKind, channel.toId)
		const geometry = new BufferGeometry()
		if (!from || !to) {
			geometry.setAttribute("position", new BufferAttribute(new Float32Array(), 3))
			return geometry
		}
		const delta = to.clone().sub(from)
		const length = Math.max(1, delta.length())
		const axis = delta.clone().normalize()
		const side = new Vector3(0, 0, 1).sub(axis.clone().multiplyScalar(axis.z))
		if (side.length() <= 1e-6) side.set(1, 0, 0)
		else side.normalize()
		const center = from.clone().add(to).multiplyScalar(0.5)
		const major = delta.clone().multiplyScalar(0.5)
		const minor = side.multiplyScalar(Math.min(length * 0.23, 180))
		const positions: number[] = []
		for (const half of [1, -1]) {
			let previous: Vector3 | null = null
			for (let index = 0; index <= 32; index += 1) {
				const angle = Math.PI * index / 32
				const point = center.clone()
					.add(major.clone().multiplyScalar(-Math.cos(angle)))
					.add(minor.clone().multiplyScalar(Math.sin(angle) * half))
				if (previous) positions.push(previous.x, previous.y, previous.z, point.x, point.y, point.z)
				previous = point
			}
		}
		geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3))
		return geometry
	}

	const upsertRelationChannelRecord = (channel: BulkRelationChannel): RelationChannelRenderRecord => {
		const existing = relationChannelRecords.get(channel.relationChannelId)
		const color = new Color(channel.colorR, channel.colorG, channel.colorB, channel.active ? 0.78 : 0.006)
		if (!existing) {
			const material = new LineGlowMaterial({
				color,
				glowColor: new Color(channel.colorR, channel.colorG, channel.colorB, channel.active ? 0.26 : 0),
				glowIntensity: channel.active ? 1.9 : 0.05,
				opacity: 1,
			})
			const line = new LineSegments(relationGeometry(channel), material)
			line.updateMatrix()
			const record = {line, material, snapshot: {...channel}}
			relationChannelRecords.set(channel.relationChannelId, record)
			return record
		}
		existing.snapshot = {...channel}
		existing.line.geometry = relationGeometry(channel)
		existing.material.color.copy(color)
		existing.material.glowColor?.setRGBA(channel.colorR, channel.colorG, channel.colorB, channel.active ? 0.26 : 0)
		existing.material.glowIntensity = channel.active ? 1.9 : 0.05
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

	const darkParticleRecordMatchesForceWimp = (darkParticleId: number, wimp: string): boolean => {
		const darkParticleRecord = darkParticleRecords.get(darkParticleId)
		return darkParticleRecord?.snapshot.src === wimp || darkParticleRecord?.snapshot.metaSrc === wimp
	}

	const fieldParticleRecordMatchesForceAddress = (record: FieldParticleRenderRecord, wimp: string, fieldId: number): boolean => {
		if (!darkParticleRecordMatchesForceWimp(record.parentDarkParticleId, wimp)) return false
		return record.snapshot.fieldId === fieldId
	}

	const fieldParticleRecordMatchesForceActorAddress = (record: FieldParticleRenderRecord, actorDarkParticleId: number, fieldId: number): boolean => {
		if (record.parentDarkParticleId !== actorDarkParticleId) return false
		return record.snapshot.fieldId === fieldId
	}

	const syncForceChangedFieldParticleRecords = (): void => {
		refreshPickTargets()
		syncLabelRecords()
		syncFieldParticleBillboardRecords()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const applyHiggsReplaceFieldParticlePatch = (record: FieldParticleRenderRecord, patch: Record<string, unknown>): void => {
		const next = {...record.snapshot}
		const key = forceString(patch.key)
		const label = forceString(patch.label)
		const kind = forceFieldParticleKind(patch.type)
		const enumText = forceEnumValueText(patch.values)

		if (key !== null) next.fieldKey = key
		if (label !== null) next.fieldLabel = label
		else if (key !== null) next.fieldLabel = key
		if (kind !== null) next.fieldParticleKind = kind
		if (enumText !== null) next.valueText = enumText

		const color = forceFieldParticleColor(next.fieldParticleKind)
		next.colorR = color.colorR
		next.colorG = color.colorG
		next.colorB = color.colorB

		record.snapshot = next
		refreshFieldParticleRecordGeometryAndMaterial(record)
		applyFieldParticleRecordScale(record)
	}

	const applyHiggsFieldsForce = (message: unknown): boolean => {
		if (!isRecord(message) || message.part !== "higgs") return false
		const wimp = forceString(message.path)
		const fields = resolveForceFieldsPayload(message.value)
		if (wimp === null || fields === null) return false

		let changed = false
		for (const [address, rawPatch] of Object.entries(fields)) {
			const fieldId = resolveForceFieldId(address)
			if (fieldId === null) continue
			const records = [...fieldParticleRecords.values()].filter((record) => fieldParticleRecordMatchesForceAddress(record, wimp, fieldId))
			if (message.op === "remove") {
				for (const record of records) {
					removeFieldParticleRecord(record.snapshot.fieldParticleId)
					changed = true
				}
				continue
			}

			if (message.op !== "replace" || !isRecord(rawPatch)) continue
			for (const record of records) {
				applyHiggsReplaceFieldParticlePatch(record, rawPatch)
				changed = true
			}
		}

		if (changed) syncForceChangedFieldParticleRecords()
		return changed
	}

	const applyGluonFieldsForce = (message: unknown): boolean => {
		if (!isRecord(message) || message.part !== "gluon") return false
		const actorDarkParticleId = forceActorDarkParticleId(message.path)
		const fields = resolveForceFieldsPayload(message.value)
		if (actorDarkParticleId === null || fields === null) return false

		let changed = false
		for (const [address, rawValue] of Object.entries(fields)) {
			const fieldId = resolveForceFieldId(address)
			if (fieldId === null) continue
			const records = [...fieldParticleRecords.values()].filter((record) => fieldParticleRecordMatchesForceActorAddress(record, actorDarkParticleId, fieldId))
			if (message.op !== "replace" && message.op !== "remove") continue
			for (const record of records) {
				record.snapshot = {
					...record.snapshot,
					valueText: message.op === "remove" ? null : forceValueText(rawValue),
				}
				refreshFieldParticleRecordGeometryAndMaterial(record)
				applyFieldParticleRecordScale(record)
				changed = true
			}
		}

		if (changed) syncForceChangedFieldParticleRecords()
		return changed
	}

	const resolveFieldBillboardSize = (
		field: BulkFieldParticle,
		worldScale = 1,
	): {widthMm: number; heightMm: number; pixelScale: number} => {
		const sphereRadiusMm = Math.max(0.5, field.sphereRadius * Math.max(Math.abs(worldScale), 1e-6))
		const radiusRatio = FIELD_BILLBOARD_BORDER_RADIUS_PX / FIELD_BILLBOARD_PIXEL_WIDTH
		const cornerDenominator = 1 / Math.SQRT2 - radiusRatio * (Math.SQRT2 - 1)
		const sideMm = sphereRadiusMm / Math.max(cornerDenominator, 1e-6)
		return {
			widthMm: sideMm,
			heightMm: sideMm,
			pixelScale: sideMm / FIELD_BILLBOARD_PIXEL_WIDTH,
		}
	}

	const buildFieldBillboardSignature = (
		field: BulkFieldParticle,
		size: {widthMm: number; heightMm: number; pixelScale: number},
	): string => [
		field.fieldParticleId,
		field.parentDarkParticleId,
		field.fieldKey,
		field.fieldLabel,
		field.fieldId,
		field.fieldParticleKind,
		field.valueText ?? "<null>",
		field.colorR.toFixed(4),
		field.colorG.toFixed(4),
		field.colorB.toFixed(4),
		size.widthMm.toFixed(4),
		size.heightMm.toFixed(4),
		size.pixelScale.toFixed(6),
	].join(":")

	const applyFieldParticleBillboardSurfaceRect = (record: FieldParticleBillboardRecord): void => {
		record.surface.setRect(
			{x: 0, y: 0, w: FIELD_BILLBOARD_PIXEL_WIDTH, h: FIELD_BILLBOARD_PIXEL_HEIGHT},
			record.pixelScale,
			uiFont,
		)
		record.surface.node.position.set(-record.widthMm / 2, record.heightMm / 2, 0)
		record.surface.node.updateMatrix()
	}

	const removeFieldParticleBillboardRecord = (fieldParticleId: string): void => {
		const record = fieldParticleBillboardRecords.get(fieldParticleId)
		if (!record) return
		record.surface.dispose()
		detachObject(record.container)
		fieldParticleBillboardRecords.delete(fieldParticleId)
	}

	const upsertFieldParticleBillboardRecord = (fieldRecord: FieldParticleRenderRecord): void => {
		const field = fieldRecord.snapshot
		const size = resolveFieldBillboardSize(field)
		const signature = buildFieldBillboardSignature(field, size)
		const existing = fieldParticleBillboardRecords.get(field.fieldParticleId)

		if (!existing) {
			const surface = new FieldParticleBillboardSurface(field)
			surface.attachCanvas(manifestUiCanvas)
			surface.setFramebufferClipSpace("screen")
			const container = new Object3D()
			container.name = `FieldBillboard:${field.fieldParticleId}`
			container.frustumCulled = false
			container.add(surface.node)
			fieldBillboardsLayer.add(container)
			const record: FieldParticleBillboardRecord = {
				anchorObject: fieldRecord.node,
				container,
				fieldParticleId: field.fieldParticleId,
				heightMm: size.heightMm,
				pixelScale: size.pixelScale,
				signature,
				surface,
				widthMm: size.widthMm,
			}
			fieldParticleBillboardRecords.set(field.fieldParticleId, record)
			applyFieldParticleBillboardSurfaceRect(record)
			return
		}

		existing.anchorObject = fieldRecord.node
		existing.heightMm = size.heightMm
		existing.pixelScale = size.pixelScale
		existing.widthMm = size.widthMm
		applyFieldParticleBillboardSurfaceRect(existing)

		if (existing.signature === signature) return
		existing.signature = signature
		existing.surface.setField(field)
		existing.surface.flushPendingRender()
	}

	const resizeFieldBillboardToWorldSphere = (
		tracker: FieldParticleBillboardRecord,
		field: BulkFieldParticle,
		worldScale: number,
	): void => {
		const size = resolveFieldBillboardSize(field, worldScale)
		if (
			Math.abs(tracker.widthMm - size.widthMm) <= 1e-4 &&
			Math.abs(tracker.heightMm - size.heightMm) <= 1e-4 &&
			Math.abs(tracker.pixelScale - size.pixelScale) <= 1e-6
		) {
			return
		}
		tracker.widthMm = size.widthMm
		tracker.heightMm = size.heightMm
		tracker.pixelScale = size.pixelScale
		applyFieldParticleBillboardSurfaceRect(tracker)
	}

	const syncFieldParticleBillboardRecords = (): void => {
		const nextFieldParticleIds = new Set<string>()
		for (const record of [...fieldParticleRecords.values()].sort(
			(left, right) =>
				left.depth - right.depth ||
				left.snapshot.fieldId - right.snapshot.fieldId ||
				left.snapshot.fieldParticleId.localeCompare(right.snapshot.fieldParticleId),
		)) {
			nextFieldParticleIds.add(record.snapshot.fieldParticleId)
			upsertFieldParticleBillboardRecord(record)
		}
		for (const fieldParticleId of [...fieldParticleBillboardRecords.keys()]) {
			if (!nextFieldParticleIds.has(fieldParticleId)) removeFieldParticleBillboardRecord(fieldParticleId)
		}
	}

	const buildLabelSignature = (spec: LabelSpec): string => {
		const label = levelResolver.getLabel(spec.metricDepth)
		const surfaceOffsetMm = resolveSurfaceOffsetMm(spec.metricDepth, spec.metricRadius)
		return [
			spec.text,
			spec.depth,
			spec.metricDepth,
			spec.metricRadius.toFixed(4),
			spec.torusRadius.toFixed(4),
			spec.torusTube.toFixed(4),
			spec.sphereRadius.toFixed(4),
			spec.offset.toFixed(4),
			spec.color.r.toFixed(4),
			spec.color.g.toFixed(4),
			spec.color.b.toFixed(4),
			label.fontSizeMm.toFixed(6),
			surfaceOffsetMm.toFixed(6),
		].join(":")
	}

	const createDarkParticleLabelSpec = (record: DarkParticleRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (record.snapshot.darkParticleKind === "axion") return null
		if (!isDarkParticleLabelDepthVisible(record.snapshot.darkParticleId, record.snapshot.depth)) return null
		const text = normalizeLabelText(record.snapshot.label)
		if (!text) return null

		const metricRadius = record.snapshot.torusRadius + record.snapshot.torusTube
		const offset = resolveSurfaceOffsetMm(record.snapshot.depth, metricRadius)

		return {
			anchorObject: record.container,
			color: particleColor(record.snapshot),
			depth: record.snapshot.depth,
			key: `darkParticle:${record.snapshot.darkParticleId}`,
			kind: "darkParticle",
			metricDepth: record.snapshot.depth,
			metricRadius,
			offset,
			torusRadius: record.snapshot.torusRadius,
			torusTube: record.snapshot.torusTube,
			sphereRadius: 0,
			text,
	}
	}

	const createFieldParticleLabelSpec = (record: FieldParticleRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (!isLabelDepthVisible(record.depth)) return null
		const text =
			normalizeLabelText(record.snapshot.fieldLabel) ?? normalizeLabelText(record.snapshot.fieldKey)
		if (!text) return null

		const sphereRadiusMm = record.snapshot.sphereRadius
		const parentDarkParticleRecord = darkParticleRecords.get(record.parentDarkParticleId)
		const { metricDepth, metricRadius } = resolveFieldParticlePeerLevelMetrics(record, parentDarkParticleRecord)
		const offset = resolveSurfaceOffsetMm(metricDepth, metricRadius)

		return {
			anchorObject: record.node,
			color: particleColor(record.snapshot),
			depth: record.depth,
			key: `fieldParticle:${record.snapshot.fieldParticleId}`,
			kind: "fieldParticle",
			metricDepth,
			metricRadius,
			offset,
			torusRadius: 0,
			torusTube: 0,
			sphereRadius: sphereRadiusMm,
			text,
	}
	}

	const createOrbitalParticleLabelSpec = (record: OrbitalParticleRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (record.snapshot.orbitalParticleKind === "state" &&
			record.snapshot.sleeveRootStateId !== record.snapshot.sourceId &&
			!record.snapshot.current) return null
		const parent = darkParticleRecords.get(record.snapshot.parentDarkParticleId)
		const depth = (parent?.snapshot.depth ?? 0) + 1
		if (!isLabelDepthVisible(depth)) return null
		const text = normalizeLabelText(record.snapshot.label)
		if (!text) return null
		return {
			anchorObject: record.node,
			color: particleColor(record.snapshot),
			depth,
			key: `orbitalParticle:${record.snapshot.orbitalParticleId}`,
			kind: "orbitalParticle",
			metricDepth: depth,
			metricRadius: record.snapshot.sphereRadius,
			offset: resolveSurfaceOffsetMm(depth, record.snapshot.sphereRadius),
			torusRadius: 0,
			torusTube: 0,
			sphereRadius: record.snapshot.sphereRadius,
			text,
		}
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
			labelsLayer.add(container)
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
				kind: spec.kind,
				material: visual.material,
				offset: spec.offset,
				torusRadius: spec.torusRadius,
				torusTube: spec.torusTube,
				signature,
				sphereRadius: spec.sphereRadius,
				stencilCenterX: visual.stencilCenterX,
				textNode: visual.textNode,
			})
			requestRenderLoop(LABEL_FADE_IN_MS + 32)
			return
	}

		existing.anchorObject = spec.anchorObject
		existing.kind = spec.kind
		existing.offset = spec.offset
		existing.torusRadius = spec.torusRadius
		existing.torusTube = spec.torusTube
		existing.sphereRadius = spec.sphereRadius

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

		for (const record of [...fieldParticleRecords.values()].sort(
			(left, right) =>
				left.depth - right.depth ||
				left.snapshot.fieldId - right.snapshot.fieldId ||
				left.snapshot.fieldParticleId.localeCompare(right.snapshot.fieldParticleId),
		)) {
			const spec = createFieldParticleLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const record of orbitalParticleRecords.values()) {
			const spec = createOrbitalParticleLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const key of [...labelRecords.keys()]) {
			if (!nextLabelKeys.has(key)) removeLabelRecord(key)
	}
	}

	const refreshSceneForSettings = (): void => {
		for (const record of darkParticleRecords.values()) {
			refreshDarkParticleRecordGeometryAndMaterial(record)
			applyDarkParticleRecordScale(record)
	}

		for (const record of fieldParticleRecords.values()) {
			refreshFieldParticleRecordOrientation(record)
			refreshFieldParticleRecordGeometryAndMaterial(record)
			applyFieldParticleRecordScale(record)
		}

		for (const record of orbitalParticleRecords.values()) {
			const parent = darkParticleRecords.get(record.snapshot.parentDarkParticleId)
			const visual = orbitalMaterialVisual(record.snapshot)
			record.node.geometry = getSphereWireframeGeometry(record.snapshot.sphereRadius, (parent?.snapshot.depth ?? 0) + 1)
			record.material.color.copy(visual.color)
			record.material.glowColor?.copy(visual.glowColor)
			record.material.glowIntensity = visual.glowIntensity
		}
		for (const record of fieldProxyRecords.values()) orientFieldProxy(record)
		for (const record of transitionChannelRecords.values()) record.line.geometry = transitionGeometry(record.snapshot)
		for (const record of relationChannelRecords.values()) record.line.geometry = relationGeometry(record.snapshot)

		syncLabelRecords()
		syncFieldParticleBillboardRecords()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const applyManifestPatchToScene = (nextManifest: BulkManifest): void => {
		manifest = nextManifest
		const patch = sceneProjection.apply(nextManifest)
		const changedDarkParticleIds = new Set(patch.darkParticleIds)
		const changedFieldParticleIds = new Set(patch.fieldParticleIds)
		const changedOrbitalParticleIds = new Set(patch.orbitalParticleIds)
		const changedTransitionChannelIds = new Set(patch.transitionChannelIds)
		const changedFieldProxyIds = new Set(patch.fieldProxyIds)
		const changedRelationChannelIds = new Set(patch.relationChannelIds)

		for (const darkParticle of nextManifest.darkParticles) {
			if (!changedDarkParticleIds.has(darkParticle.darkParticleId)) continue
			upsertDarkParticleRecord(darkParticle)
		}

		for (const darkParticle of nextManifest.darkParticles) {
			if (!changedDarkParticleIds.has(darkParticle.darkParticleId)) continue
			const record = darkParticleRecords.get(darkParticle.darkParticleId)
			if (!record) continue
			const parentObject = darkParticle.parentDarkParticleId
				? darkParticleRecords.get(darkParticle.parentDarkParticleId)?.container ?? workspace
				: workspace
			if (record.container.parent !== parentObject) parentObject.add(record.container)
	}

		for (const field of nextManifest.fieldParticles) {
			if (!changedFieldParticleIds.has(field.fieldParticleId)) continue
			const parentDarkParticle = darkParticleRecords.get(field.parentDarkParticleId)
			if (!parentDarkParticle) continue
			const record = upsertFieldParticleRecord(field, parentDarkParticle.snapshot.depth + 1)
			if (record.node.parent !== parentDarkParticle.container) parentDarkParticle.container.add(record.node)
	}

		for (const removedFieldParticleId of patch.removedFieldParticleIds) removeFieldParticleRecord(removedFieldParticleId)

		for (const removedDarkParticleId of patch.removedDarkParticleIds
			.sort((left, right) => (darkParticleRecords.get(right)?.snapshot.depth ?? 0) - (darkParticleRecords.get(left)?.snapshot.depth ?? 0))) {
			removeDarkParticleRecord(removedDarkParticleId)
		}

		for (const particle of nextManifest.orbitalParticles ?? []) {
			if (!changedOrbitalParticleIds.has(particle.orbitalParticleId)) continue
			const parent = darkParticleRecords.get(particle.parentDarkParticleId)
			if (!parent) continue
			const record = upsertOrbitalParticleRecord(particle, parent.snapshot.depth + 1)
			if (record.node.parent !== parent.container) parent.container.add(record.node)
		}

		for (const proxy of nextManifest.fieldProxies ?? []) {
			if (!changedFieldProxyIds.has(proxy.fieldProxyId) && !changedOrbitalParticleIds.has(proxy.stateOrbitalParticleId)) continue
			const parent = darkParticleRecords.get(proxy.parentDarkParticleId)
			if (!parent) continue
			const record = upsertFieldProxyRecord(proxy, parent.snapshot.depth + 1)
			if (record.node.parent !== parent.container) parent.container.add(record.node)
		}

		for (const channel of nextManifest.transitionChannels ?? []) {
			if (!changedTransitionChannelIds.has(channel.transitionChannelId) &&
				!changedOrbitalParticleIds.has(channel.fromOrbitalParticleId) &&
				!changedOrbitalParticleIds.has(channel.toOrbitalParticleId)) continue
			const parent = darkParticleRecords.get(channel.parentDarkParticleId)
			if (!parent) continue
			const record = upsertTransitionChannelRecord(channel)
			if (record.line.parent !== parent.container) parent.container.add(record.line)
		}

		for (const channel of nextManifest.relationChannels ?? []) {
			if (!changedRelationChannelIds.has(channel.relationChannelId) &&
				!(channel.fromKind === "field" && changedFieldParticleIds.has(channel.fromId)) &&
				!(channel.toKind === "field" && changedFieldParticleIds.has(channel.toId)) &&
				!(channel.fromKind === "field-proxy" && changedFieldProxyIds.has(channel.fromId)) &&
				!(channel.toKind === "field-proxy" && changedFieldProxyIds.has(channel.toId)) &&
				!(channel.fromKind === "orbital" && changedOrbitalParticleIds.has(channel.fromId)) &&
				!(channel.toKind === "orbital" && changedOrbitalParticleIds.has(channel.toId))) continue
			const parent = darkParticleRecords.get(channel.parentDarkParticleId)
			if (!parent) continue
			const record = upsertRelationChannelRecord(channel)
			if (record.line.parent !== parent.container) parent.container.add(record.line)
		}

		for (const transitionChannelId of patch.removedTransitionChannelIds) {
			const record = transitionChannelRecords.get(transitionChannelId)
			if (record) detachObject(record.line)
			transitionChannelRecords.delete(transitionChannelId)
		}
		for (const relationChannelId of patch.removedRelationChannelIds) {
			const record = relationChannelRecords.get(relationChannelId)
			if (record) detachObject(record.line)
			relationChannelRecords.delete(relationChannelId)
		}
		for (const fieldProxyId of patch.removedFieldProxyIds) {
			const record = fieldProxyRecords.get(fieldProxyId)
			if (record) detachObject(record.node)
			fieldProxyRecords.delete(fieldProxyId)
		}
		for (const orbitalParticleId of patch.removedOrbitalParticleIds) {
			const record = orbitalParticleRecords.get(orbitalParticleId)
			if (record) detachObject(record.node)
			orbitalParticleRecords.delete(orbitalParticleId)
		}

		refreshParentByDarkParticleId()
		refreshPickTargets()
		syncLabelRecords()
		syncFieldParticleBillboardRecords()
		applyRootViewportFit()
		requestRenderLoop(SCENE_TRANSITION_WAKE_MS)

		options.onStats?.({
			rootSrc: nextManifest.rootSrc,
			darkParticleCount: nextManifest.darkParticles.length,
			fieldParticleCount: nextManifest.fieldParticles.length,
			orbitalParticleCount: nextManifest.orbitalParticles?.length ?? 0,
			transitionChannelCount: nextManifest.transitionChannels?.length ?? 0,
		})
	}

	const projectWorldToClientPoint = (manifestPoint: Vector3): { x: number; y: number } | null => {
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

	const resolveProjectedWireframeDistancePx = (
		geometry: BufferGeometry,
		center: Vector3,
		clientX: number,
		clientY: number,
	): number | null => {
		const positions = getGeometryPositionArray(geometry)
		if (!positions || positions.length < 6) return null

		let bestDistance = Number.POSITIVE_INFINITY

		for (let index = 0; index <= positions.length - 6; index += 6) {
			const startPoint = projectWorldToClientPoint(
				new Vector3(
					center.x + (positions[index] ?? 0),
					center.y + (positions[index + 1] ?? 0),
					center.z + (positions[index + 2] ?? 0),
				),
			)
			const endPoint = projectWorldToClientPoint(
				new Vector3(
					center.x + (positions[index + 3] ?? 0),
					center.y + (positions[index + 4] ?? 0),
					center.z + (positions[index + 5] ?? 0),
				),
			)
			if (!startPoint || !endPoint) continue

			bestDistance = Math.min(
				bestDistance,
				getDistanceToSegmentPx(clientX, clientY, startPoint.x, startPoint.y, endPoint.x, endPoint.y),
			)
	}

		return Number.isFinite(bestDistance) ? bestDistance : null
	}

	const resolveProjectedSphereDistancePx = (
		center: Vector3,
		radius: number,
		clientX: number,
		clientY: number,
	): number | null => {
		const centerPoint = projectWorldToClientPoint(center)
		if (!centerPoint) return null

		const cameraForward = viewPoint.getTarget().clone().sub(viewPoint.position).normalize()
		const cameraRight = cameraForward.clone().cross(viewPoint.getUp()).normalize()
		const cameraUp = cameraRight.clone().cross(cameraForward).normalize()
		if (cameraRight.length() <= 1e-6 || cameraUp.length() <= 1e-6) return null

		const rightPoint = projectWorldToClientPoint(center.clone().add(cameraRight.multiplyScalar(radius)))
		const upPoint = projectWorldToClientPoint(center.clone().add(cameraUp.multiplyScalar(radius)))
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
		const centerPoint = projectWorldToClientPoint(center)
		if (!centerPoint) return null
		const outerEdgeDistance = resolveProjectedSphereDistancePx(center, outerRadius, clientX, clientY)
		if (outerEdgeDistance === null) return null
		const cameraForward = viewPoint.getTarget().clone().sub(viewPoint.position).normalize()
		const cameraRight = cameraForward.clone().cross(viewPoint.getUp()).normalize()
		if (cameraRight.length() <= 1e-6 || innerRadius <= 1e-6) return outerEdgeDistance
		const innerPoint = projectWorldToClientPoint(center.clone().add(cameraRight.multiplyScalar(innerRadius)))
		if (!innerPoint) return outerEdgeDistance
		const distanceFromCenter = Math.hypot(clientX - centerPoint.x, clientY - centerPoint.y)
		const projectedInnerRadius = Math.hypot(innerPoint.x - centerPoint.x, innerPoint.y - centerPoint.y)
		if (distanceFromCenter >= projectedInnerRadius && outerEdgeDistance <= 1e-6) return 0
		return Math.min(outerEdgeDistance, Math.abs(distanceFromCenter - projectedInnerRadius))
	}

	const syncPickTargetsFromScene = (): void => {
		for (const record of darkParticleRecords.values()) {
			record.container.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			record.pickTarget.center.copy(reusableWorldPosition)
			if (record.pickTarget.kind === "darkParticle") {
				record.pickTarget.torusRadius = record.snapshot.torusRadius * reusableWorldScale.x
				record.pickTarget.torusTube = record.snapshot.torusTube * reusableWorldScale.x
				record.pickTarget.outerRadius =
					(record.snapshot.torusRadius + record.snapshot.torusTube) * reusableWorldScale.x
			}
	}

		for (const record of fieldParticleRecords.values()) {
			record.node.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			record.pickTarget.center.copy(reusableWorldPosition)
			if (record.pickTarget.kind === "fieldParticle") {
				record.pickTarget.sphereRadius = record.snapshot.sphereRadius * reusableWorldScale.x
				record.pickTarget.outerRadius = record.pickTarget.sphereRadius
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
			return {
				points: record ? darkParticleRecordViewportFitPoints(record) : [],
				radius: target.outerRadius,
				target: target.center.clone(),
			}
		}

		const record = fieldParticleRecords.get(target.fieldParticleId)
		const points = record ? fieldParticleRecordViewportFitPoints(record) : []
		const pointRadius = points.reduce(
			(maxRadius, point) => Math.max(maxRadius, point.distanceTo(target.center)),
			target.sphereRadius,
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
		if (target.kind === "fieldParticle") {
			return resolveProjectedSphereDistancePx(target.center, target.sphereRadius, clientX, clientY)
		}

		return resolveProjectedWireframeDistancePx(
			getTorusWireframeGeometry(target.torusRadius, target.torusTube, target.depth),
			target.center,
			clientX,
			clientY,
		)
	}

	const updateSceneWorldState = (): void => {
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
		const rootCenter = rootDarkParticleWorldCenter(rootDarkParticle)
		const rootPoints = darkParticleRecordViewportFitPoints(rootDarkParticle)
		const rootOuterRadius = rootPoints.reduce(
			(maxRadius, point) => Math.max(maxRadius, point.distanceTo(rootCenter)),
			(rootDarkParticle.snapshot.torusRadius + rootDarkParticle.snapshot.torusTube) * rootDarkParticle.baseTorusScale,
		)
		if (!Number.isFinite(rootOuterRadius) || rootOuterRadius <= 1e-6) return
		const pose = resolveBulkViewportFitPose({
			aspect: viewPoint.aspect,
			currentPosition: viewPoint.position,
			currentTarget: viewPoint.getTarget(),
			fovRad: viewPoint.fov,
			points: rootPoints,
			radius: rootOuterRadius,
			target: rootCenter,
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
		updateSceneWorldState()
		updateFieldBillboardTrackers()
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

	const darkParticleRecordViewportFitPoints = (
		record: DarkParticleRenderRecord,
	): Vector3[] => {
		const positions = getGeometryPositionArray(record.torus.geometry)
		if (!positions || positions.length === 0) return []
		const pointCount = Math.floor(positions.length / 3)
		const vertexStep = Math.max(1, Math.floor(pointCount / 720))
		const points: Vector3[] = []

		for (let vertex = 0; vertex < pointCount; vertex += vertexStep) {
			const index = vertex * 3
			const point = new Vector3(
				positions[index] ?? 0,
				positions[index + 1] ?? 0,
				positions[index + 2] ?? 0,
			).applyMatrix4(record.torus.matrixWorld)
			if (Math.abs(record.currentTransitionScale - 1) > 1e-6) {
				const center = rootDarkParticleWorldCenter(record)
				point.sub(center).multiplyScalar(1 / record.currentTransitionScale).add(center)
			}
			points.push(point)
		}

		return points
	}

	const fieldParticleRecordViewportFitPoints = (
		record: FieldParticleRenderRecord,
	): Vector3[] => {
		const points: Vector3[] = []
		const positions = getGeometryPositionArray(record.node.geometry)
		if (positions) {
			for (let index = 0; index < positions.length; index += 3) {
				points.push(new Vector3(
					positions[index] ?? 0,
					positions[index + 1] ?? 0,
					positions[index + 2] ?? 0,
				).applyMatrix4(record.node.matrixWorld))
			}
		}

		const billboard = fieldParticleBillboardRecords.get(record.snapshot.fieldParticleId)
		if (!billboard) return points
		const halfWidth = billboard.widthMm / 2
		const halfHeight = billboard.heightMm / 2
		points.push(
			new Vector3(-halfWidth, -halfHeight, 0).applyMatrix4(billboard.container.matrixWorld),
			new Vector3(halfWidth, -halfHeight, 0).applyMatrix4(billboard.container.matrixWorld),
			new Vector3(-halfWidth, halfHeight, 0).applyMatrix4(billboard.container.matrixWorld),
			new Vector3(halfWidth, halfHeight, 0).applyMatrix4(billboard.container.matrixWorld),
		)
		return points
	}

	const rootDarkParticleWorldCenter = (record: DarkParticleRenderRecord): Vector3 => {
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

		updateSceneWorldState()

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

		updateSceneWorldState()
		let bestTarget: HoverablePickTarget | null = null
		let bestScore = Number.POSITIVE_INFINITY

		for (const target of pickTargets) {
			const score = target.kind === "fieldParticle"
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
		const centerPoint = projectWorldToClientPoint(target.center) ?? fallback
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
		updateSceneWorldState()
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
		updateSceneWorldState()

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
		updateSceneWorldState()
		updateFieldBillboardTrackers()
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
		if (!isRecord(message) || typeof message.part !== "string") return false
		if (!new Set(["photon", "gluon", "higgs", "z", "w+", "w-"]).has(message.part)) return false

		let targetObject: Object3D | null = null
		const actorDarkParticleId = forceActorDarkParticleId(message.path)
		const value = isRecord(message.value) ? message.value : null
		const sourceId = forcePositiveInteger(value?.processId) ?? forcePositiveInteger(value?.reactionId)
		if (sourceId !== null) {
			targetObject = [...orbitalParticleRecords.values()].find((record) => record.snapshot.sourceId === sourceId)?.node ?? null
		}
		if (!targetObject && message.part === "photon" && typeof message.value === "string" && actorDarkParticleId !== null) {
			targetObject = [...orbitalParticleRecords.values()].find((record) =>
				record.snapshot.parentDarkParticleId === actorDarkParticleId &&
				record.snapshot.orbitalParticleKind === "state" &&
				record.snapshot.label === message.value &&
				record.snapshot.orbitalParticleId.endsWith("/root"),
			)?.node ?? null
		}
		if (!targetObject && message.part === "gluon" && actorDarkParticleId !== null) {
			const fields = resolveForceFieldsPayload(message.value)
			const firstFieldId = fields ? resolveForceFieldId(Object.keys(fields)[0] ?? "") : null
			if (firstFieldId !== null) targetObject = [...fieldParticleRecords.values()].find((record) =>
				record.parentDarkParticleId === actorDarkParticleId && record.snapshot.fieldId === firstFieldId,
			)?.node ?? null
		}
		if (!targetObject && actorDarkParticleId !== null) targetObject = darkParticleRecords.get(actorDarkParticleId)?.container ?? null
		if (!targetObject) targetObject = [...darkParticleRecords.values()].find((record) => record.snapshot.parentDarkParticleId === null)?.container ?? null
		if (!targetObject) return false

		space.updateWorldMatrix()
		const target = readObjectWorldPosition(targetObject, new Vector3()).clone()
		const parent = actorDarkParticleId === null ? null : darkParticleRecords.get(actorDarkParticleId)
		const radius = Math.max(4, Math.min(14, (parent?.snapshot.torusTube ?? 60) * 0.08))
		const colors: Record<string, Color> = {
			photon: new Color(1, 0.94, 0.28, 0.94),
			gluon: new Color(0.2, 1, 0.58, 0.94),
			higgs: new Color(1, 0.52, 0.18, 0.94),
			z: new Color(0.68, 0.42, 1, 0.94),
			"w+": new Color(0.24, 0.92, 1, 0.94),
			"w-": new Color(1, 0.22, 0.28, 0.94),
		}
		const node = new Mesh(
			getSphereSurfaceGeometry(radius, 0),
			new MeshBasicMaterial({color: colors[message.part] ?? new Color(1, 1, 1, 0.94)}),
		)
		const start = target.clone().add(new Vector3(radius * 5, -radius * 3, radius * 8))
		node.position.copy(start)
		node.updateMatrix()
		space.add(node)
		impulseRecords.push({node, start, target, startedAtMs: performance.now(), durationMs: 900})
		requestRenderLoop(950)
		return true
	}

	const updateAnimatedRecords = (deltaMs: number): boolean => {
		let hasPendingMotion = false
		const freezeCosmosPose = activeRenderSettings.animationEnabled && animationSuspended
		const positionFactor = computeLerpFactor(deltaMs, POSITION_SMOOTHING_MS)
		const scaleFactor = computeLerpFactor(deltaMs, SCALE_SMOOTHING_MS)

		for (const record of darkParticleRecords.values()) {
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			if (!freezeCosmosPose) {
				const nextX = mixScalar(record.container.position.x, record.targetLocalPosition.x, positionFactor)
				const nextY = mixScalar(record.container.position.y, record.targetLocalPosition.y, positionFactor)
				const nextZ = mixScalar(record.container.position.z, record.targetLocalPosition.z, positionFactor)
				record.container.position.set(nextX, nextY, nextZ)
				if (Math.abs(record.container.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
				if (Math.abs(record.container.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
				if (Math.abs(record.container.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
			}
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (record.currentTransitionScale !== 1) hasPendingMotion = true
			applyDarkParticleRecordScale(record)
			record.container.updateMatrix()
		}

		for (const record of fieldParticleRecords.values()) {
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			if (!freezeCosmosPose) {
				const nextX = mixScalar(record.node.position.x, record.targetLocalPosition.x, positionFactor)
				const nextY = mixScalar(record.node.position.y, record.targetLocalPosition.y, positionFactor)
				const nextZ = mixScalar(record.node.position.z, record.targetLocalPosition.z, positionFactor)
				record.node.position.set(nextX, nextY, nextZ)
				if (Math.abs(record.node.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
				if (Math.abs(record.node.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
				if (Math.abs(record.node.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
			}
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (record.currentTransitionScale !== 1) hasPendingMotion = true
			applyFieldParticleRecordScale(record)
			record.node.updateMatrix()
		}

		for (const record of orbitalParticleRecords.values()) {
			if (!freezeCosmosPose) {
				record.node.position.set(
					mixScalar(record.node.position.x, record.targetLocalPosition.x, positionFactor),
					mixScalar(record.node.position.y, record.targetLocalPosition.y, positionFactor),
					mixScalar(record.node.position.z, record.targetLocalPosition.z, positionFactor),
				)
				if (record.node.position.distanceTo(record.targetLocalPosition) > 0.01) hasPendingMotion = true
			}
			record.node.updateMatrix()
		}

		if (impulseRecords.length > 0) {
			const now = performance.now()
			for (let index = impulseRecords.length - 1; index >= 0; index--) {
				const record = impulseRecords[index]!
				const linear = Math.min(1, Math.max(0, (now - record.startedAtMs) / record.durationMs))
				const progress = easeOutCubic(linear)
				record.node.position.set(
					mixScalar(record.start.x, record.target.x, progress),
					mixScalar(record.start.y, record.target.y, progress),
					mixScalar(record.start.z, record.target.z, progress),
				)
				;(record.node.material as MeshBasicMaterial).color.a = 0.94 * (1 - linear)
				record.node.updateMatrix()
				if (linear >= 1) {
					detachObject(record.node)
					impulseRecords.splice(index, 1)
				} else hasPendingMotion = true
			}
		}

		if (fadingRemovalRecords.length > 0) {
			const now = performance.now()
			for (let index = fadingRemovalRecords.length - 1; index >= 0; index -= 1) {
				const record = fadingRemovalRecords[index]!
				const linearProgress = Math.min(1, Math.max(0, (now - record.startedAtMs) / record.durationMs))
				const progress = easeOutCubic(linearProgress)
				const fadeScale = mixScalar(1, REMOVAL_SCALE_MULTIPLIER, progress)
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
			record.currentScale = Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			record.currentOpacity = Math.abs(nextOpacity - 1) <= 1e-3 ? 1 : nextOpacity
			record.container.scale.set(record.currentScale, record.currentScale, record.currentScale)
			record.material.opacity = record.currentOpacity
			record.container.updateMatrix()
			if (record.currentScale !== 1 || record.currentOpacity !== 1) hasPendingMotion = true
		}

		if (fadingLabelRemovalRecords.length > 0) {
			const now = performance.now()
			for (let index = fadingLabelRemovalRecords.length - 1; index >= 0; index -= 1) {
				const record = fadingLabelRemovalRecords[index]!
				const linearProgress = Math.min(1, Math.max(0, (now - record.startedAtMs) / record.durationMs))
				const progress = easeOutCubic(linearProgress)
				const fadeScale = mixScalar(1, REMOVAL_SCALE_MULTIPLIER, progress)
				record.material.opacity = record.initialOpacity * (1 - progress)
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

		return hasPendingMotion
	}

	const updateCosmosAnimation = (deltaMs: number): boolean => {
		if (!activeRenderSettings.animationEnabled || animationSuspended || deltaMs <= 0) return false

		const orbitStep = COSMOS_ORBIT_RAD_PER_MS * deltaMs
		const axisStep = COSMOS_AXIS_RAD_PER_MS * deltaMs

		for (const record of darkParticleRecords.values()) {
			const direction = record.snapshot.depth % 2 === 0 ? 1 : -1
			const depthFactor = 1 / Math.max(1, record.snapshot.depth + 1)
			const orbitRadius = Math.hypot(record.targetLocalPosition.x, record.targetLocalPosition.y)
			record.cosmosOrbitAngle = wrapAngle(record.cosmosOrbitAngle + orbitStep * direction * depthFactor)
			if (orbitRadius > 1e-6) {
				const baseAngle = Math.atan2(record.targetLocalPosition.y, record.targetLocalPosition.x)
				record.container.position.set(
					Math.cos(baseAngle + record.cosmosOrbitAngle) * orbitRadius,
					Math.sin(baseAngle + record.cosmosOrbitAngle) * orbitRadius,
					record.targetLocalPosition.z,
				)
			}
			record.torus.rotation.z = wrapAngle(record.torus.rotation.z + axisStep * direction)
			record.torus.updateMatrix()
			record.container.updateMatrix()
		}

		for (const record of fieldParticleRecords.values()) {
			const direction = record.depth % 2 === 0 ? 1 : -1
			const orbitRadius = Math.hypot(record.targetLocalPosition.x, record.targetLocalPosition.y)
			record.cosmosOrbitAngle = wrapAngle(record.cosmosOrbitAngle + orbitStep * direction)
			if (orbitRadius > 1e-6) {
				const baseAngle = Math.atan2(record.targetLocalPosition.y, record.targetLocalPosition.x)
				record.node.position.set(
					Math.cos(baseAngle + record.cosmosOrbitAngle) * orbitRadius,
					Math.sin(baseAngle + record.cosmosOrbitAngle) * orbitRadius,
					record.targetLocalPosition.z,
				)
			}
			reusableCosmosSpin.setFromAxisAngle(reusableCosmosAxis, axisStep * 1.35 * direction)
			record.node.quaternion.premultiply(reusableCosmosSpin).normalize()
			record.node.updateMatrix()
		}

		return darkParticleRecords.size > 0 || fieldParticleRecords.size > 0
	}

	const updateLabelTrackers = (): void => {
		const cameraPos = viewPoint.position

		for (const tracker of labelRecords.values()) {
			tracker.anchorObject.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			const worldScale = Math.max(Math.abs(reusableWorldScale.x), 1e-6)
			const torusRadius = tracker.torusRadius * worldScale
			const torusTube = tracker.torusTube * worldScale
			const sphereRadius = tracker.sphereRadius * worldScale
			const offset = tracker.offset * worldScale
			const normal = reusableLabelNormal
			const right = reusableLabelRight
			const labelPos = reusableLabelPos
			let curveRadiusMm: number

			// Горизонтальное направление от центра объекта к XY-проекции камеры.
			// Метка следует за камерой по экватору (вращается азимутально), но не поднимается
			// по меридиану — вертикальная позиция камеры игнорируется.
			const toCameraXy = reusableLabelToCamera
				.copy(cameraPos)
				.sub(reusableWorldPosition)
			const cameraDistanceMm = toCameraXy.length()
			const majorDir = reusableMajorDir.set(toCameraXy.x, toCameraXy.y, 0)
			if (majorDir.length() < 1e-6) majorDir.set(1, 0, 0)
			else majorDir.normalize()

			// Нормаль всегда горизонтальная (вдоль majorDir), независимо от высоты камеры.
			normal.copy(majorDir)
			// Касательная вдоль параллели = поворот majorDir на 90° в XY.
			right.set(-majorDir.y, majorDir.x, 0).normalize()

			if (tracker.kind === "darkParticle") {
				// Метка на внешнем экваторе тубы, `outerRing = torusRadius + torusTube + offset`.
				const outerRing = torusRadius + torusTube + offset
				labelPos
					.copy(reusableWorldPosition)
					.add(reusableScaledOffset.copy(majorDir).multiplyScalar(outerRing))
				curveRadiusMm = Math.max(outerRing, 1e-6)
			} else {
				// Метка на горизонтальном поясе сферы, `radius = sphereRadius + offset`.
				const beltRadius = sphereRadius + offset
				labelPos
					.copy(reusableWorldPosition)
					.add(reusableScaledOffset.copy(majorDir).multiplyScalar(beltRadius))
				curveRadiusMm = Math.max(beltRadius, 1e-6)
			}

			// Вектор "вверх" — мировая вертикаль; метка не наклоняется с камерой.
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

			let surfaceTitleAmount = 0
			let fieldBillboard: FieldParticleBillboardRecord | undefined
			if (tracker.kind === "fieldParticle") {
				const fieldParticleId = tracker.key.slice("fieldParticle:".length)
				fieldBillboard = fieldParticleRecords.has(fieldParticleId) ? fieldParticleBillboardRecords.get(fieldParticleId) : undefined
				if (fieldBillboard !== undefined) {
					surfaceTitleAmount = resolveFieldLabelTitleMorph(cameraDistanceMm, Math.max(sphereRadius, 1e-6))
				}
			}

			if (fieldBillboard !== undefined && surfaceTitleAmount > 0) {
				if (tracker.container.parent !== fieldBillboard.container) {
					fieldBillboard.container.add(tracker.container)
				}

				const titleHeightMm = FIELD_BILLBOARD_TITLE_FONT_PX * fieldBillboard.pixelScale
				const textHeightMm = Math.max(tracker.extents.ascenderMm + tracker.extents.descenderMm, 1e-6)
				const maxTitleWidthMm = Math.max(
					1e-6,
					(FIELD_BILLBOARD_PIXEL_WIDTH - FIELD_BILLBOARD_TITLE_PAD_X_PX * 2) * fieldBillboard.pixelScale,
				)
				const titleScale = Math.min(
					titleHeightMm / textHeightMm,
					maxTitleWidthMm / Math.max(tracker.extents.widthMm, 1e-6),
				)
				const animatedTitleScale = titleScale * tracker.currentScale
				const titleLocalY =
					fieldBillboard.heightMm / 2 -
					(FIELD_BILLBOARD_TITLE_Y_PX + FIELD_BILLBOARD_TITLE_FONT_PX) * fieldBillboard.pixelScale

				reusableLabelCurveWorldScale.set(tracker.currentScale, tracker.currentScale, tracker.currentScale)
				reusableLabelCurveWorldMatrix.compose(labelPos, curveQuaternion, reusableLabelCurveWorldScale)
				reusableLabelCurveLocalMatrix.multiplyMatrices(
					reusableBillboardInverseMatrix.copy(fieldBillboard.container.matrixWorld).invert(),
					reusableLabelCurveWorldMatrix,
				)
				reusableLabelCurveLocalMatrix.decompose(
					reusableLabelCurveLocalPosition,
					reusableLabelCurveLocalQuaternion,
					reusableLabelCurveLocalScale,
				)
				reusableLabelTitleLocalPosition.set(0, titleLocalY, FIELD_BILLBOARD_TITLE_Z_MM)
				reusableLabelTitleQuaternion.identity()

				tracker.container.position.set(
					mixScalar(reusableLabelCurveLocalPosition.x, reusableLabelTitleLocalPosition.x, surfaceTitleAmount),
					mixScalar(reusableLabelCurveLocalPosition.y, reusableLabelTitleLocalPosition.y, surfaceTitleAmount),
					mixScalar(reusableLabelCurveLocalPosition.z, reusableLabelTitleLocalPosition.z, surfaceTitleAmount),
				)
				setQuaternionNlerp(
					tracker.container.quaternion,
					reusableLabelCurveLocalQuaternion,
					reusableLabelTitleQuaternion,
					surfaceTitleAmount,
				)
				tracker.container.scale.set(
					mixScalar(reusableLabelCurveLocalScale.x, animatedTitleScale, surfaceTitleAmount),
					mixScalar(reusableLabelCurveLocalScale.y, animatedTitleScale, surfaceTitleAmount),
					mixScalar(reusableLabelCurveLocalScale.z, animatedTitleScale, surfaceTitleAmount),
				)
				tracker.material.opacity = tracker.currentOpacity
				morphTextGeometryToPlane({
					geometry: tracker.textNode.stencilGeometry,
					initialPositions: tracker.initialStencilPositions,
					centerX: tracker.stencilCenterX,
					curveScale: fitScale,
					curveRadius: curveRadiusMm,
					mix: surfaceTitleAmount,
					scale: 1,
				})
				morphTextGeometryToPlane({
					geometry: tracker.textNode.coverGeometry,
					initialPositions: tracker.initialCoverPositions,
					centerX: tracker.coverCenterX,
					curveScale: fitScale,
					curveRadius: curveRadiusMm,
					mix: surfaceTitleAmount,
					scale: 1,
				})
				tracker.container.updateMatrix()
				continue
			}

			if (tracker.container.parent !== labelsLayer) {
				labelsLayer.add(tracker.container)
			}
			tracker.container.position.copy(labelPos)
			tracker.container.quaternion.copy(curveQuaternion)
			tracker.container.scale.set(tracker.currentScale, tracker.currentScale, tracker.currentScale)
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

	const updateFieldBillboardTrackers = (): void => {
		const cameraPos = viewPoint.position

		for (const tracker of fieldParticleBillboardRecords.values()) {
			tracker.anchorObject.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			const fieldRecord = fieldParticleRecords.get(tracker.fieldParticleId)
			const worldScale = Math.max(Math.abs(reusableWorldScale.x), 1e-6)
			const normal = reusableBillboardNormal.copy(cameraPos).sub(reusableWorldPosition)
			const cameraDistanceMm = normal.length()
			if (cameraDistanceMm <= 1e-6) normal.set(0, -1, 0)
			normal.normalize()
			if (fieldRecord) {
				const sphereRadiusMm = Math.max(0.5, fieldRecord.snapshot.sphereRadius * worldScale)
				tracker.surface.setMode(
					resolveFieldLabelTitleMorph(cameraDistanceMm, sphereRadiusMm) > 0 ? "surface" : "summary",
				)
				resizeFieldBillboardToWorldSphere(tracker, fieldRecord.snapshot, worldScale)
			}

			let up = reusableBillboardUp.set(0, 0, 1)
			const right = reusableBillboardRight.crossVectors(up, normal)
			if (right.length() <= 1e-6) {
				up = reusableBillboardUp.set(0, 1, 0)
				right.crossVectors(up, normal)
			}
			right.normalize()
			up.crossVectors(normal, right).normalize()

			tracker.container.position
				.copy(reusableWorldPosition)

			const matrix = reusableBillboardMatrix
			const e = matrix.elements
			e[0] = right.x; e[1] = right.y; e[2] = right.z; e[3] = 0
			e[4] = up.x; e[5] = up.y; e[6] = up.z; e[7] = 0
			e[8] = normal.x; e[9] = normal.y; e[10] = normal.z; e[11] = 0
			e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1

			tracker.container.quaternion.setFromRotationMatrix(matrix)
			tracker.container.updateMatrix()
		}
	}

	const flushFieldParticleBillboardSurfaces = (): void => {
		for (const tracker of fieldParticleBillboardRecords.values()) tracker.surface.flushPendingRender()
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
	const calculateActiveDarkParticleRecord = (): DarkParticleRenderRecord | null => {
		const cameraPos = viewPoint.position
		let bestRecord: DarkParticleRenderRecord | null = null
		let bestNormalizedDistance = Number.POSITIVE_INFINITY

		for (const record of darkParticleRecords.values()) {
			const dist = cameraPos.distanceTo(record.pickTarget.center)
			if (dist < record.pickTarget.outerRadius * 1.3) {
				const normalizedDistance = dist / Math.max(record.pickTarget.outerRadius, 1e-6)
				if (
					!bestRecord ||
					record.snapshot.depth > bestRecord.snapshot.depth ||
					(
						record.snapshot.depth === bestRecord.snapshot.depth &&
						(
							normalizedDistance < bestNormalizedDistance - 1e-6 ||
							(
								Math.abs(normalizedDistance - bestNormalizedDistance) <= 1e-6 &&
								record.snapshot.darkParticleId < bestRecord.snapshot.darkParticleId
							)
						)
					)
				) {
					bestRecord = record
					bestNormalizedDistance = normalizedDistance
				}
			}
		}

		return bestRecord
	}

	const animate = (timestamp: number): void => {
		if (disposed) return
		frameHandle = 0
		const deltaMs = lastAnimationTimestamp > 0 ? timestamp - lastAnimationTimestamp : 16
		lastAnimationTimestamp = timestamp

		const hasPendingMotion = updateAnimatedRecords(deltaMs)
		const hasCosmosMotion = updateCosmosAnimation(deltaMs)
		updateSceneWorldState()
		applyNavigationFrame(timestamp)
		syncRadialMenuAnchor()

		const activeDarkParticleRecord = calculateActiveDarkParticleRecord()
		const nextBaseDepth = activeDarkParticleRecord?.snapshot.depth ?? -1
		const nextActiveDarkParticleId = activeDarkParticleRecord?.snapshot.darkParticleId ?? null
		if (
			nextBaseDepth !== activeRenderSettings.baseDepth ||
			nextActiveDarkParticleId !== activeDarkParticleId
		) {
			activeRenderSettings.baseDepth = nextBaseDepth
			activeDarkParticleId = nextActiveDarkParticleId
			syncLabelRecords()
		}

		updateFieldBillboardTrackers()
		updateLabelTrackers()
		flushFieldParticleBillboardSurfaces()
		hudRuntime.flushPendingRender()
		space.updateWorldMatrix()
		renderer.renderFrame(space, hudRuntime.overlay, viewPoint)
		if (navigationState || hasPendingMotion || hasCosmosMotion || timestamp < renderWakeUntilMs) {
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
			for (const fieldParticleId of [...fieldParticleBillboardRecords.keys()]) removeFieldParticleBillboardRecord(fieldParticleId)
			for (const record of transitionChannelRecords.values()) detachObject(record.line)
			for (const record of relationChannelRecords.values()) detachObject(record.line)
			for (const record of fieldProxyRecords.values()) detachObject(record.node)
			for (const record of orbitalParticleRecords.values()) detachObject(record.node)
			for (const record of impulseRecords) detachObject(record.node)
			transitionChannelRecords.clear()
			relationChannelRecords.clear()
			fieldProxyRecords.clear()
			orbitalParticleRecords.clear()
			impulseRecords.length = 0
			hudRuntime.dispose()
			viewPoint.dispose()
		},
		handleForce(_channel: string, _message: unknown) {
			applyHiggsFieldsForce(_message)
			applyGluonFieldsForce(_message)
			spawnImpulseParticle(_message)
		},
		setAnimationSuspended(suspended: boolean) {
			if (animationSuspended === suspended) return
			animationSuspended = suspended
			lastAnimationTimestamp = 0
			if (!suspended && activeRenderSettings.animationEnabled) requestRenderLoop()
		},
		setLayoutSettings(settings: Partial<BulkLayoutSettings>) {
			activeLayoutSettings = normalizeBulkLayoutSettings({
				...activeLayoutSettings,
				...settings,
			})
			rebuildLevelResolver()
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			sphereSurfaceCache.clear()
			refreshSceneForSettings()
		},
		setRenderSettings(settings: Partial<BulkRenderSettings>) {
			const nextBaseDepth = settings.baseDepth !== undefined ? settings.baseDepth : activeRenderSettings.baseDepth
			const wasCosmosMotionEnabled = activeRenderSettings.animationEnabled
			activeRenderSettings = normalizeBulkRenderSettings({
				...activeRenderSettings,
				...settings,
				baseDepth: nextBaseDepth,
			})
			if (wasCosmosMotionEnabled && !activeRenderSettings.animationEnabled) {
				for (const record of darkParticleRecords.values()) record.cosmosOrbitAngle = 0
				for (const record of fieldParticleRecords.values()) record.cosmosOrbitAngle = 0
			}
			rebuildLevelResolver()
			if (settings.baseDepth !== undefined) activeDarkParticleId = null
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			sphereSurfaceCache.clear()
			refreshSceneForSettings()
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
		applyManifestPatch(nextManifest: BulkManifest) {
			applyManifestPatchToScene(nextManifest)
		},
		hud: hudRuntime,
	}
}
