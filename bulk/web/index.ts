import type { DbFieldOrbitRow, DbFieldValueKind, DbParticleShellRow, DbWorldRows } from "@bulk/gravity/layout"
import {
	appWebLayoutConfig,
	DEFAULT_APP_WEB_LAYOUT_SETTINGS,
	DEFAULT_APP_WEB_RENDER_SETTINGS,
	normalizeAppWebLayoutSettings,
	type AppWebLayoutSettings,
	normalizeAppWebRenderSettings,
	type AppWebRenderSettings,
	toLevelGeometrySettings,
	toLevelSettings,
} from "../../app/web/settings.ts"
import {
	createLevelResolver,
	resolveOuterRadiusFromSphereRadius,
	type LevelResolver,
} from "@bulk/gravity/level"
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	GLTFLoader,
	GridHelper,
	LineGlowMaterial,
	LineSegments,
	Light,
	Matrix4,
	Object3D,
	Quaternion,
	Renderer,
	SkinnedMesh,
	Space,
	SphereGeometry,
	Text,
	TextMaterial,
	TrueTypeFont,
	AnimationMixer,
	Raycaster,
	Vector3,
	ViewPoint,
} from "@metafor/engine"
import {
	HUD,
	VirtualInput,
	handleActiveInputKey,
	insertActiveInputText,
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
	resolveBulkViewportFocusPose,
	type BulkPickTarget,
	type BulkHoverPriorityCandidate,
} from "../web-navigation"
import { isDepthLabelVisible, isShellLabelVisible } from "../label-visibility"
import {
	bendTextAroundEquator,
	createSurfaceLabel,
	resolveSurfaceFitScale,
	type SurfaceArcLimits,
	type TextExtents,
} from "@bulk/gravity/text"

/** Краткая статистика текущего world-а, которую viewport отдаёт в UI. */
export interface BulkViewportStats {
	fieldCount: number
	rootSrc?: string
	shellCount: number
}

/** Публичный API bulk viewport для `app/web`. */
export interface BulkViewportController {
	dispose(): void
	handleForce(_channel: string, _message: unknown): void
	setAnimationSuspended(suspended: boolean): void
	setLayoutSettings(settings: Partial<AppWebLayoutSettings>): void
	setRenderSettings(settings: Partial<AppWebRenderSettings>): void
	setSize(width: number, height: number): void
	applyWorld(world: DbWorldRows): void
	readonly hud: BulkViewportHudController
}

/** HUD-слой поверх того же renderer/space, что и bulk viewport. */
export interface BulkViewportHudController {
	readonly canvas: HTMLCanvasElement
	readonly renderer: Renderer
	readonly inputProxy: VirtualInput | null
	addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts?: UiSurfaceLayerOpts): void
	clearSurfaceRect(surface: UiSurfaceNode): void
	relayout(): void
	requestRender(): void
	setFocused(surface: UiSurfaceNode | null): void
	setSurfaceRect(surface: UiSurfaceNode, rect: UiSurfaceRect): UiSurfaceRect | null
	surfaceFrame(surface: UiSurfaceNode): {rect: UiSurfaceRect; bounds: {w: number; h: number}} | null
}

type BulkViewportOptions = {
	canvas: HTMLCanvasElement
	height: number
	onStats?: (stats: BulkViewportStats) => void
	width: number
}

import {
	FOCUS_ANCHOR_SMOOTHING_MS,
	FOCUS_POSITION_SMOOTHING_MS,
	FOCUS_RADIUS_SMOOTHING_MS,
	FOCUS_SETTLE_DISTANCE_MM,
	FOCUS_TARGET_SMOOTHING_MS,
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

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()
const LABEL_TEXT_COLOR = new Color(1, 1, 1)
const COSMOS_ORBIT_RAD_PER_MS = (Math.PI * 2) / 180_000
const COSMOS_AXIS_RAD_PER_MS = (Math.PI * 2) / 90_000
const ANTHROPOMORPH_BOT_MODEL_URL = "/models/bots.glb"
const ANTHROPOMORPH_BOT_SCALE_MM = 260
const ANTHROPOMORPH_BOT_STAGE_X_MM = 0
const ANTHROPOMORPH_BOT_STAGE_Y_MM = 0
const ANTHROPOMORPH_BOT_STAGE_Z_MM = 0
const ANTHROPOMORPH_BOT_RENDER_WAKE_MS = 3000
let activeLayoutSettings: AppWebLayoutSettings = { ...DEFAULT_APP_WEB_LAYOUT_SETTINGS }
let activeRenderSettings: AppWebRenderSettings = { ...DEFAULT_APP_WEB_RENDER_SETTINGS }
let levelResolver: LevelResolver = createLevelResolver(
	toLevelSettings(activeLayoutSettings, activeRenderSettings),
)

const rebuildLevelResolver = (): void => {
	levelResolver = createLevelResolver(toLevelSettings(activeLayoutSettings, activeRenderSettings))
}

type HoverablePickTarget = BulkPickTarget & {
	baseColor: Color
	baseGlowColor: Color | null
	baseGlowIntensity: number
	baseOpacity: number
	material: LineGlowMaterial
}

type ViewNavigationState = {
	fallbackFocusRadius: number
	fallbackTarget: Vector3
	smoothedFocusRadius: number
	smoothedTarget: Vector3
	targetKey: string | null
}

type ShellRenderRecord = {
	baseShellScale: number
	container: Object3D
	cosmosOrbitAngle: number
	currentTransitionScale: number
	material: LineGlowMaterial
	pickTarget: HoverablePickTarget
	snapshot: DbParticleShellRow
	targetLocalPosition: Vector3
	torus: LineSegments
}

type FieldRenderRecord = {
	cosmosOrbitAngle: number
	currentTransitionScale: number
	depth: number
	material: LineGlowMaterial
	node: LineSegments
	parentParticleId: string
	pickTarget: HoverablePickTarget
	snapshot: DbFieldOrbitRow
	targetLocalPosition: Vector3
}

type FadingRemovalRecord = {
	baseOpacity: number
	durationMs: number
	initialScale: Vector3
	material: LineGlowMaterial
	object: Object3D
	startedAtMs: number
}

type SurfaceLabelVisual = {
	container: Object3D
	coverCenterX: number
	extents: TextExtents
	initialCoverPositions: Float32Array
	initialStencilPositions: Float32Array
	material: TextMaterial
	stencilCenterX: number
	textNode: Text
}

type LabelRenderRecord = {
	anchorObject: Object3D
	container: Object3D
	coverCenterX: number
	currentOpacity: number
	currentScale: number
	extents: TextExtents
	initialCoverPositions: Float32Array
	initialStencilPositions: Float32Array
	key: string
	kind: "shell" | "field"
	material: TextMaterial
	offset: number
	shellRadius: number
	shellTube: number
	signature: string
	sphereRadius: number
	stencilCenterX: number
	textNode: Text
}

type LabelSpec = {
	anchorObject: Object3D
	color: Color
	depth: number
	key: string
	kind: "shell" | "field"
	metricDepth: number
	metricRadius: number
	offset: number
	shellRadius: number
	shellTube: number
	sphereRadius: number
	text: string
}

type FadingLabelRemovalRecord = {
	durationMs: number
	initialOpacity: number
	initialScale: Vector3
	material: TextMaterial
	object: Object3D
	startedAtMs: number
}

const getViewportConfig = () => appWebLayoutConfig.viewport
const getShellFallback = () => getViewportConfig().shellFallbackMm
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

let activeShellParticleId: string | null = null

const isLabelDepthVisible = (depth: number): boolean =>
	isDepthLabelVisible({
		baseDepth: activeRenderSettings.baseDepth,
		depth,
		labelVisibleLevels: activeRenderSettings.labelVisibleLevels,
	})

const isShellLabelDepthVisible = (particleId: string, depth: number): boolean =>
	isShellLabelVisible({
		baseDepth: activeRenderSettings.baseDepth,
		depth,
		isActiveShell: activeShellParticleId === particleId,
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

const particleColor = (row: { colorR: number; colorG: number; colorB: number }): Color =>
	new Color(row.colorR, row.colorG, row.colorB)

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

const getGeometryPositionArray = (geometry: BufferGeometry): Float32Array | null => {
	const positions = geometry.attributes.position?.array
	return positions instanceof Float32Array ? positions : null
}

const detachObject = (object: Object3D): void => {
	if (!object.parent) return
	object.parent.children = object.parent.children.filter((child) => child !== object)
	object.parent = null
}

const readObjectWorldPosition = (object: Object3D, target: Vector3): Vector3 => {
	const elements = object.matrixWorld.elements
	return target.set(elements[12] ?? 0, elements[13] ?? 0, elements[14] ?? 0)
}

const resolveFieldPeerLevelMetrics = (
	record: FieldRenderRecord,
	_parentShellRecord: ShellRenderRecord | undefined,
): { metricDepth: number; metricRadius: number } => {
	const metricDepth = record.depth
	return {
		metricDepth,
		metricRadius: resolveOuterRadiusFromSphereRadius(
			metricDepth,
			toLevelGeometrySettings(activeLayoutSettings),
			record.snapshot.sphereRadius,
		),
	}
}

/**
 * Характеристический радиус параллели surface для canonical выбора font-size.
 *
 * Для тора — большой экваториальный радиус: `shellRadius + shellTube + offset`.
 * Для сферы — полный радиус + offset.
 */
const resolveCanonicalCurveRadius = (spec: LabelSpec): number => {
	if (spec.kind === "shell") {
		return Math.max(spec.shellRadius + spec.shellTube + spec.offset, 1e-6)
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

const createShellMaterial = (shell: DbParticleShellRow): LineGlowMaterial =>
	new LineGlowMaterial(resolveShellVisualState(shell))

const mixColor = (left: Color, right: Color, amount: number): Color =>
	new Color(
		left.r + (right.r - left.r) * amount,
		left.g + (right.g - left.g) * amount,
		left.b + (right.b - left.b) * amount,
		left.a + (right.a - left.a) * amount,
	)

const brightenColor = (color: Color, amount: number): Color => mixColor(color, new Color(1, 1, 1, color.a), amount)

const resolveShellVisualState = (shell: DbParticleShellRow): { color: Color; glowColor: Color; glowIntensity: number; opacity: number } => {
	const baseColor = particleColor(shell)
	const glowIntensity = shell.kind === "wimp" ? 1.4 : 1.15
	const opacity = activeRenderSettings.wireframeOpacity
	if (shell.activity === "active") {
		return {
			color: mixColor(baseColor, new Color(1, 1, 1), 0.18),
			glowColor: glowColor(baseColor, 0.18),
			glowIntensity: glowIntensity * 1.25,
			opacity: Math.min(1, opacity * 1.08),
		}
	}
	if (shell.activity === "inactive") {
		return {
			color: mixColor(mixColor(baseColor, new Color(1, 1, 1), 0.24), ROOT_BACKGROUND, 0.28),
			glowColor: glowColor(mixColor(baseColor, new Color(1, 1, 1), 0.3), 0.08),
			glowIntensity: glowIntensity * 0.35,
			opacity,
		}
	}
	return {
		color: baseColor,
		glowColor: glowColor(baseColor),
		glowIntensity,
		opacity,
	}
}

const createFieldMaterial = (orbit: DbFieldOrbitRow): LineGlowMaterial => {
	const color = particleColor(orbit)
	return new LineGlowMaterial({
		color,
		glowIntensity: 1,
		glowColor: glowColor(color, 0.12),
		opacity: activeRenderSettings.wireframeOpacity * 0.95,
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

const createAnthropomorphBotLight = (color: Color, intensity: number, position: Vector3): Light => {
	const light = new Light(color, intensity)
	light.position.copy(position)
	light.updateMatrix()
	return light
}

type BulkHudSurfaceSlot = {
	surface: UiSurfaceNode
	layout: UiSurfaceLayoutFn
	rect: UiSurfaceRect
	rectOverride?: UiSurfaceRect
	pixelScale?: number
	order: number
	zIndex: number
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
	#width = 1
	#height = 1
	#pixelScale = 1
	#focused: UiSurfaceNode | null = null
	#pressedSlot: BulkHudSurfaceSlot | null = null
	#hoveredSlot: BulkHudSurfaceSlot | null = null
	#activeTouchId: number | null = null
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
	readonly #handleWindowBlur = (): void => this.setFocused(null)
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
		this.#surfaces.push({
			surface,
			layout,
			rect,
			order: this.#surfaceOrder++,
			zIndex: opts.zIndex ?? 0,
		})
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
		if (!visible) return

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
		this.#surfaces.sort((a, b) => a.zIndex - b.zIndex || a.order - b.order)
		for (const slot of this.#surfaces) this.#hud.add(slot.surface.node)
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
		return new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === "mouseup" ? 0 : 1,
			clientX: touch.clientX,
			clientY: touch.clientY,
			screenX: touch.screenX,
			screenY: touch.screenY,
		})
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

	#onWheel(event: WheelEvent): void {
		const local = this.#localCoords(event)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) return
		event.preventDefault()
		this.#claimPointerEvent(event)
		slot.surface.onWheel?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onMouseMove(event: MouseEvent): void {
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
		this.inputProxy?.focus()
		this.#positionInputProxy(event.clientX, event.clientY)
		this.setFocused(slot.surface)
		this.#pressedSlot = slot
		slot.surface.onPointerDown?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onMouseUp(event: MouseEvent): void {
		const slot = this.#pressedSlot
		if (slot === null) return
		this.#pressedSlot = null
		this.#activeTouchId = null
		this.#claimPointerEvent(event)
		const local = this.#localCoords(event)
		slot.surface.onPointerUp?.(event, local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onClick(event: MouseEvent): void {
		const local = this.#localCoords(event)
		const clickedHud = this.#surfaceAt(local.x, local.y) !== undefined
		if (!this.#claimNextClick && !clickedHud) return
		this.#claimNextClick = false
		event.preventDefault()
		this.#claimPointerEvent(event)
	}

	#onTouchStart(event: TouchEvent): void {
		if (this.#activeTouchId !== null || event.changedTouches.length === 0) return
		const touch = event.changedTouches[0]!
		const local = this.#localCoordsFromTouch(touch)
		const slot = this.#surfaceAt(local.x, local.y)
		if (slot === undefined) {
			this.setFocused(null)
			return
		}
		event.preventDefault()
		this.#claimPointerEvent(event)
		this.#positionInputProxy(touch.clientX, touch.clientY)
		this.setFocused(slot.surface)
		this.#pressedSlot = slot
		this.#activeTouchId = touch.identifier
		slot.surface.onPointerDown?.(this.#mouseEventFromTouch("mousedown", touch), local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onTouchMove(event: TouchEvent): void {
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
		const touch = this.#changedTouch(event)
		const slot = this.#pressedSlot
		if (touch === null || slot === null) return
		this.#pressedSlot = null
		this.#activeTouchId = null
		event.preventDefault()
		this.#claimPointerEvent(event)
		const local = this.#localCoordsFromTouch(touch)
		slot.surface.onPointerUp?.(this.#mouseEventFromTouch("mouseup", touch), local.x - slot.rect.x, local.y - slot.rect.y)
	}

	#onTouchCancel(event: TouchEvent): void {
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

function isBulkHudKeyFallbackTarget(target: EventTarget | null, canvas: HTMLCanvasElement): boolean {
	if (target === null || target === window || target === document || target === document.body || target === document.documentElement) return true
	if (target === canvas) return true
	if (!(target instanceof HTMLElement)) return false
	if (target.closest("textarea,input,select,[contenteditable='true']") !== null) return false
	return target === canvas.parentElement || target.contains(canvas)
}

export const createBulkViewport = async (options: BulkViewportOptions): Promise<BulkViewportController> => {
	const renderer = new Renderer()
	await renderer.init(options.canvas)
	if (!renderer.canvas) {
		throw new Error("Не удалось инициализировать WebGPU canvas в bulk viewport")
	}

	renderer.setPixelRatio(window.devicePixelRatio || 1)
	renderer.setSize(options.width, options.height)
	activeRenderSettings = normalizeAppWebRenderSettings(activeRenderSettings)
	activeLayoutSettings = normalizeAppWebLayoutSettings(activeLayoutSettings)
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

	let pickTargets: HoverablePickTarget[] = []
	let hoveredPickTarget: HoverablePickTarget | null = null
	let world: DbWorldRows | null = null
	let parentByParticleId = new Map<string, string | null>()
	let clickNavigationSuppressed = false
	let isPrimaryPointerDown = false
	let navigationState: ViewNavigationState | null = null
	let pointerDownX = 0
	let pointerDownY = 0
	let disposed = false
	let frameHandle = 0
	let renderWakeUntilMs = 0
	let lastAnimationTimestamp = 0
	let animationSuspended = false
	let anthropomorphBotRoot: Object3D | null = null
	let anthropomorphBotMixer: AnimationMixer | null = null
	let anthropomorphBotSkinnedMeshes: SkinnedMesh[] = []

	const shellRecords = new Map<string, ShellRenderRecord>()
	const fieldRecords = new Map<string, FieldRenderRecord>()
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
	const reusableLabelToCamera = new Vector3()
	const reusableMajorDir = new Vector3()
	const reusableTubeCenter = new Vector3()
	const reusableScaledOffset = new Vector3()
	const reusableLabelMatrix = new Matrix4()
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

	const requestRenderLoop = (wakeMs: number = 0): void => {
		if (disposed) return
		if (wakeMs > 0) renderWakeUntilMs = Math.max(renderWakeUntilMs, performance.now() + wakeMs)
		if (frameHandle !== 0) return
		frameHandle = requestAnimationFrame(animate)
	}
	let hudRuntime: BulkViewportHudRuntime

	const loadAnthropomorphBots = async (): Promise<void> => {
		try {
			const gltf = await new GLTFLoader().load(ANTHROPOMORPH_BOT_MODEL_URL)
			if (disposed) return

			const root = gltf.space
			root.position.set(ANTHROPOMORPH_BOT_STAGE_X_MM, ANTHROPOMORPH_BOT_STAGE_Y_MM, getFloorZ() + ANTHROPOMORPH_BOT_STAGE_Z_MM)
			root.rotation.z = Math.PI
			root.scale.set(ANTHROPOMORPH_BOT_SCALE_MM, ANTHROPOMORPH_BOT_SCALE_MM, ANTHROPOMORPH_BOT_SCALE_MM)
			const skinnedMeshes: SkinnedMesh[] = []
			root.traverse((object) => {
				object.frustumCulled = false
				if (object instanceof SkinnedMesh) skinnedMeshes.push(object)
			})
			root.updateMatrix()
			space.add(root)

			const keyLight = createAnthropomorphBotLight(new Color(1, 0.96, 0.86), 2.6, new Vector3(2600, -2600, 3600))
			const fillLight = createAnthropomorphBotLight(new Color(0.45, 0.76, 1), 1.35, new Vector3(-2200, 1800, 2400))
			space.add(keyLight)
			space.add(fillLight)

			if (gltf.animations.length > 0) {
				const mixer = new AnimationMixer(root)
				const modelRoot = root.children[0] ?? root
				gltf.animations.forEach((clip, index) => {
					const localRoot = modelRoot.children[index] ?? root
					mixer.clipAction(clip, localRoot).play()
				})
				anthropomorphBotMixer = mixer
			}

			anthropomorphBotRoot = root
			requestRenderLoop(ANTHROPOMORPH_BOT_RENDER_WAKE_MS)
			anthropomorphBotSkinnedMeshes = skinnedMeshes
		} catch (error) {
			console.warn("[bulk/web] Failed to load anthropomorph bots", error)
		}
	}

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
		return target.kind === "field" ? `field:${target.fieldId}` : `shell:${target.particleId}`
	}

	const syncPickTargetMaterialState = (target: HoverablePickTarget): void => {
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(target)) applyHoverMaterial(target)
		else resetHoverMaterial(target)
	}

	const setHoveredPickTarget = (target: HoverablePickTarget | null): void => {
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(target)) return
		if (hoveredPickTarget) resetHoverMaterial(hoveredPickTarget)
		hoveredPickTarget = target
		if (hoveredPickTarget) applyHoverMaterial(hoveredPickTarget)
		options.canvas.style.cursor = hoveredPickTarget ? "pointer" : ""
		requestRenderLoop()
	}

	const clampTransitionScale = (value: number): number => {
		if (!Number.isFinite(value) || value <= 1e-6) return 1
		return Math.max(0.05, Math.min(20, value))
	}

	const applyShellRecordScale = (record: ShellRenderRecord): void => {
		const scale = record.baseShellScale * record.currentTransitionScale
		record.container.scale.set(scale, scale, scale)
		record.container.updateMatrix()
	}

	const applyFieldRecordScale = (record: FieldRenderRecord): void => {
		record.node.scale.set(
			record.currentTransitionScale,
			record.currentTransitionScale,
			record.currentTransitionScale,
		)
		record.node.updateMatrix()
	}

	const refreshFieldRecordOrientation = (record: FieldRenderRecord): void => {
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
			...[...shellRecords.values()]
				.sort(
					(left, right) =>
						left.snapshot.depth - right.snapshot.depth ||
						left.snapshot.shellOrder - right.snapshot.shellOrder ||
						left.snapshot.particleId.localeCompare(right.snapshot.particleId),
				)
				.map((record) => record.pickTarget),
			...[...fieldRecords.values()]
				.sort(
					(left, right) =>
						left.depth - right.depth ||
						left.snapshot.fieldOrder - right.snapshot.fieldOrder ||
						left.snapshot.id.localeCompare(right.snapshot.id),
				)
				.map((record) => record.pickTarget),
		]
	}

	const refreshParentByParticleId = (): void => {
		parentByParticleId = new Map(
			[...shellRecords.values()].map((record) => [
				record.snapshot.particleId,
				record.snapshot.parentParticleId,
			]),
		)
	}

	const refreshShellRecordGeometryAndMaterial = (record: ShellRenderRecord): void => {
		record.torus.geometry = getTorusWireframeGeometry(
			record.snapshot.shellRadius || getShellFallback().radius,
			record.snapshot.shellTube || getShellFallback().tube,
			record.snapshot.depth,
		)
		const visual = resolveShellVisualState(record.snapshot)
		record.pickTarget.baseColor.copy(visual.color)
		record.pickTarget.baseGlowColor = visual.glowColor.clone()
		record.pickTarget.baseGlowIntensity = visual.glowIntensity
		record.pickTarget.baseOpacity = visual.opacity
		syncPickTargetMaterialState(record.pickTarget)
	}

	const refreshFieldRecordGeometryAndMaterial = (record: FieldRenderRecord): void => {
		record.node.geometry = getSphereWireframeGeometry(record.snapshot.sphereRadius, record.depth)
		const color = particleColor(record.snapshot)
		record.pickTarget.baseColor.copy(color)
		record.pickTarget.baseGlowColor = glowColor(color, 0.12)
		record.pickTarget.baseGlowIntensity = 1
		record.pickTarget.baseOpacity = activeRenderSettings.wireframeOpacity * 0.95
		syncPickTargetMaterialState(record.pickTarget)
	}

	const createShellRecord = (shell: DbParticleShellRow): ShellRenderRecord => {
		const material = createShellMaterial(shell)
		const torus = new LineSegments(
			getTorusWireframeGeometry(
				shell.shellRadius || getShellFallback().radius,
				shell.shellTube || getShellFallback().tube,
				shell.depth,
			),
			material,
		)
		torus.updateMatrix()

		const container = new Object3D()
		container.position.set(shell.localX, shell.localY, shell.localZ)
		container.add(torus)

		const pickTarget: HoverablePickTarget = {
			kind: "shell",
			particleId: shell.particleId,
			parentParticleId: shell.parentParticleId,
			depth: shell.depth,
			center: new Vector3(
				workspace.position.x + shell.localX,
				workspace.position.y + shell.localY,
				workspace.position.z + shell.localZ,
			),
			shellRadius: shell.shellRadius * shell.shellScale,
			shellTube: shell.shellTube * shell.shellScale,
			outerRadius: (shell.shellRadius + shell.shellTube) * shell.shellScale,
			material,
			baseColor: material.color.clone(),
			baseGlowColor: material.glowColor?.clone() ?? null,
			baseGlowIntensity: material.glowIntensity,
			baseOpacity: material.opacity,
		}

		const record: ShellRenderRecord = {
			baseShellScale: shell.shellScale,
			container,
			cosmosOrbitAngle: 0,
			currentTransitionScale: 1,
			material,
			pickTarget,
			snapshot: { ...shell },
			targetLocalPosition: new Vector3(shell.localX, shell.localY, shell.localZ),
			torus,
		}
		applyShellRecordScale(record)
		refreshShellRecordGeometryAndMaterial(record)
		container.updateMatrix()
		return record
	}

	const createFieldRecord = (field: DbFieldOrbitRow, depth: number): FieldRenderRecord => {
		const material = createFieldMaterial(field)
		const node = new LineSegments(getSphereWireframeGeometry(field.sphereRadius, depth), material)
		node.position.set(field.localX, field.localY, field.localZ)

		const pickTarget: HoverablePickTarget = {
			kind: "field",
			particleId: field.particleId,
			fieldId: field.id,
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

		const record: FieldRenderRecord = {
			cosmosOrbitAngle: 0,
			currentTransitionScale: 1,
			depth,
			material,
			node,
			parentParticleId: field.particleId,
			pickTarget,
			snapshot: { ...field },
			targetLocalPosition: new Vector3(field.localX, field.localY, field.localZ),
		}
		applyFieldRecordScale(record)
		refreshFieldRecordOrientation(record)
		refreshFieldRecordGeometryAndMaterial(record)
		node.updateMatrix()
		return record
	}

	const upsertShellRecord = (shell: DbParticleShellRow): ShellRenderRecord => {
		const existing = shellRecords.get(shell.particleId)
		if (!existing) {
			const created = createShellRecord(shell)
			shellRecords.set(shell.particleId, created)
			return created
		}

		const previousLocalOuterRadius =
			(existing.snapshot.shellRadius + existing.snapshot.shellTube) *
			existing.baseShellScale *
			existing.currentTransitionScale
		const nextLocalOuterRadius = (shell.shellRadius + shell.shellTube) * shell.shellScale
		const geometryChanged =
			Math.abs(existing.snapshot.shellRadius - shell.shellRadius) > 1e-6 ||
			Math.abs(existing.snapshot.shellTube - shell.shellTube) > 1e-6 ||
			Math.abs(existing.baseShellScale - shell.shellScale) > 1e-6 ||
			existing.snapshot.depth !== shell.depth

		existing.snapshot = { ...shell }
		existing.baseShellScale = shell.shellScale
		existing.targetLocalPosition.set(shell.localX, shell.localY, shell.localZ)
		if (existing.pickTarget.kind === "shell") {
			existing.pickTarget.parentParticleId = shell.parentParticleId
		}
		existing.pickTarget.depth = shell.depth

		if (geometryChanged && nextLocalOuterRadius > 1e-6) {
			existing.currentTransitionScale = clampTransitionScale(previousLocalOuterRadius / nextLocalOuterRadius)
		}

		refreshShellRecordGeometryAndMaterial(existing)
		applyShellRecordScale(existing)
		return existing
	}

	const upsertFieldRecord = (field: DbFieldOrbitRow, depth: number): FieldRenderRecord => {
		const existing = fieldRecords.get(field.id)
		if (!existing) {
			const created = createFieldRecord(field, depth)
			fieldRecords.set(field.id, created)
			return created
		}

		const previousLocalRadius = existing.snapshot.sphereRadius * existing.currentTransitionScale
		const geometryChanged =
			Math.abs(existing.snapshot.sphereRadius - field.sphereRadius) > 1e-6 ||
			existing.depth !== depth ||
			existing.snapshot.fieldValueKind !== field.fieldValueKind

		existing.snapshot = { ...field }
		existing.depth = depth
		existing.parentParticleId = field.particleId
		existing.targetLocalPosition.set(field.localX, field.localY, field.localZ)
		existing.pickTarget.particleId = field.particleId
		existing.pickTarget.depth = depth

		if (geometryChanged && field.sphereRadius > 1e-6) {
			existing.currentTransitionScale = clampTransitionScale(previousLocalRadius / field.sphereRadius)
		}

		refreshFieldRecordOrientation(existing)
		refreshFieldRecordGeometryAndMaterial(existing)
		applyFieldRecordScale(existing)
		return existing
	}

	const removeFieldRecord = (fieldId: string): void => {
		const record = fieldRecords.get(fieldId)
		if (!record) return
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(record.pickTarget)) {
			setHoveredPickTarget(null)
		}
		fadingRemovalRecords.push({
			baseOpacity: record.pickTarget.baseOpacity,
			durationMs: REMOVAL_FADE_MS,
			initialScale: record.node.scale.clone(),
			material: record.material,
			object: record.node,
			startedAtMs: performance.now(),
		})
		fieldRecords.delete(fieldId)
		requestRenderLoop(REMOVAL_FADE_MS + 32)
	}

	const removeShellRecord = (particleId: string): void => {
		const record = shellRecords.get(particleId)
		if (!record) return
		if (getPickTargetKey(hoveredPickTarget) === getPickTargetKey(record.pickTarget)) {
			setHoveredPickTarget(null)
		}
		fadingRemovalRecords.push({
			baseOpacity: record.pickTarget.baseOpacity,
			durationMs: REMOVAL_FADE_MS,
			initialScale: record.container.scale.clone(),
			material: record.material,
			object: record.container,
			startedAtMs: performance.now(),
		})
		shellRecords.delete(particleId)
		requestRenderLoop(REMOVAL_FADE_MS + 32)
	}

	const buildLabelSignature = (spec: LabelSpec): string => {
		const label = levelResolver.getLabel(spec.metricDepth)
		const surfaceOffsetMm = resolveSurfaceOffsetMm(spec.metricDepth, spec.metricRadius)
		return [
			spec.text,
			spec.depth,
			spec.metricDepth,
			spec.metricRadius.toFixed(4),
			spec.shellRadius.toFixed(4),
			spec.shellTube.toFixed(4),
			spec.sphereRadius.toFixed(4),
			spec.offset.toFixed(4),
			spec.color.r.toFixed(4),
			spec.color.g.toFixed(4),
			spec.color.b.toFixed(4),
			label.fontSizeMm.toFixed(6),
			surfaceOffsetMm.toFixed(6),
		].join(":")
	}

	const createShellLabelSpec = (record: ShellRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (!isShellLabelDepthVisible(record.snapshot.particleId, record.snapshot.depth)) return null
		const text = normalizeLabelText(record.snapshot.label)
		if (!text) return null

		const metricRadius = record.snapshot.shellRadius + record.snapshot.shellTube
		const offset = resolveSurfaceOffsetMm(record.snapshot.depth, metricRadius)

		return {
			anchorObject: record.container,
			color: particleColor(record.snapshot),
			depth: record.snapshot.depth,
			key: `shell:${record.snapshot.particleId}`,
			kind: "shell",
			metricDepth: record.snapshot.depth,
			metricRadius,
			offset,
			shellRadius: record.snapshot.shellRadius,
			shellTube: record.snapshot.shellTube,
			sphereRadius: 0,
			text,
		}
	}

	const createFieldLabelSpec = (record: FieldRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (!isLabelDepthVisible(record.depth)) return null
		const text =
			normalizeLabelText(record.snapshot.fieldLabel) ?? normalizeLabelText(record.snapshot.fieldKey)
		if (!text) return null

		const sphereRadiusMm = record.snapshot.sphereRadius
		const parentShellRecord = shellRecords.get(record.parentParticleId)
		const { metricDepth, metricRadius } = resolveFieldPeerLevelMetrics(record, parentShellRecord)
		const offset = resolveSurfaceOffsetMm(metricDepth, metricRadius)

		return {
			anchorObject: record.node,
			color: particleColor(record.snapshot),
			depth: record.depth,
			key: `field:${record.snapshot.id}`,
			kind: "field",
			metricDepth,
			metricRadius,
			offset,
			shellRadius: 0,
			shellTube: 0,
			sphereRadius: sphereRadiusMm,
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
				shellRadius: spec.shellRadius,
				shellTube: spec.shellTube,
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
		existing.shellRadius = spec.shellRadius
		existing.shellTube = spec.shellTube
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

		for (const record of [...shellRecords.values()].sort(
			(left, right) =>
				left.snapshot.depth - right.snapshot.depth ||
				left.snapshot.shellOrder - right.snapshot.shellOrder ||
				left.snapshot.particleId.localeCompare(right.snapshot.particleId),
		)) {
			const spec = createShellLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const record of [...fieldRecords.values()].sort(
			(left, right) =>
				left.depth - right.depth ||
				left.snapshot.fieldOrder - right.snapshot.fieldOrder ||
				left.snapshot.id.localeCompare(right.snapshot.id),
		)) {
			const spec = createFieldLabelSpec(record)
			if (!spec) continue
			nextLabelKeys.add(spec.key)
			upsertLabelRecord(spec)
		}

		for (const key of [...labelRecords.keys()]) {
			if (!nextLabelKeys.has(key)) removeLabelRecord(key)
		}
	}

	const refreshSceneForSettings = (): void => {
		for (const record of shellRecords.values()) {
			refreshShellRecordGeometryAndMaterial(record)
			applyShellRecordScale(record)
		}

		for (const record of fieldRecords.values()) {
			refreshFieldRecordOrientation(record)
			refreshFieldRecordGeometryAndMaterial(record)
			applyFieldRecordScale(record)
		}

		syncLabelRecords()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const applyWorldRowsToScene = (nextWorld: DbWorldRows): void => {
		world = nextWorld

		const nextShellIds = new Set<string>()
		const nextFieldIds = new Set<string>()

		for (const shell of nextWorld.particles) {
			nextShellIds.add(shell.particleId)
			upsertShellRecord(shell)
		}

		for (const shell of nextWorld.particles) {
			const record = shellRecords.get(shell.particleId)
			if (!record) continue
			const parentObject = shell.parentParticleId
				? shellRecords.get(shell.parentParticleId)?.container ?? workspace
				: workspace
			parentObject.add(record.container)
		}

		for (const field of nextWorld.fields) {
			const parentShell = shellRecords.get(field.particleId)
			if (!parentShell) continue
			nextFieldIds.add(field.id)
			const record = upsertFieldRecord(field, parentShell.snapshot.depth + 1)
			parentShell.container.add(record.node)
		}

		for (const staleFieldId of [...fieldRecords.keys()]) {
			if (!nextFieldIds.has(staleFieldId)) removeFieldRecord(staleFieldId)
		}

		for (const staleShellId of [...shellRecords.values()]
			.sort((left, right) => right.snapshot.depth - left.snapshot.depth)
			.map((record) => record.snapshot.particleId)) {
			if (!nextShellIds.has(staleShellId)) removeShellRecord(staleShellId)
		}

		refreshParentByParticleId()
		refreshPickTargets()
		syncLabelRecords()
		requestRenderLoop(SCENE_TRANSITION_WAKE_MS)

		options.onStats?.({
			rootSrc: nextWorld.rootSrc,
			shellCount: nextWorld.particles.length,
			fieldCount: nextWorld.fields.length,
		})
	}

	const projectWorldToClientPoint = (worldPoint: Vector3): { x: number; y: number } | null => {
		const rect = options.canvas.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return null

		const ndc = worldPoint
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

	const syncPickTargetsFromScene = (): void => {
		for (const record of shellRecords.values()) {
			record.container.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			record.pickTarget.center.copy(reusableWorldPosition)
			if (record.pickTarget.kind === "shell") {
				record.pickTarget.shellRadius = record.snapshot.shellRadius * reusableWorldScale.x
				record.pickTarget.shellTube = record.snapshot.shellTube * reusableWorldScale.x
				record.pickTarget.outerRadius =
					(record.snapshot.shellRadius + record.snapshot.shellTube) * reusableWorldScale.x
			}
		}

		for (const record of fieldRecords.values()) {
			record.node.matrixWorld.decompose(
				reusableWorldPosition,
				reusableWorldQuaternion,
				reusableWorldScale,
			)
			record.pickTarget.center.copy(reusableWorldPosition)
			if (record.pickTarget.kind === "field") {
				record.pickTarget.sphereRadius = record.snapshot.sphereRadius * reusableWorldScale.x
				record.pickTarget.outerRadius = record.pickTarget.sphereRadius
			}
		}
	}

	const cancelNavigation = (): void => {
		navigationState = null
	}

	const resolveNavigationFocusTarget = (deltaMs: number): { focusRadius: number; target: Vector3 } | null => {
		if (!navigationState) return null

		if (navigationState.targetKey) {
			const liveTarget = pickTargets.find((target) => getPickTargetKey(target) === navigationState!.targetKey) ?? null
			if (liveTarget) {
				navigationState.fallbackTarget.copy(liveTarget.center)
				navigationState.fallbackFocusRadius = liveTarget.outerRadius
			}
		}

		const anchorFactor = computeLerpFactor(deltaMs, FOCUS_ANCHOR_SMOOTHING_MS)
		navigationState.smoothedTarget.set(
			mixScalar(navigationState.smoothedTarget.x, navigationState.fallbackTarget.x, anchorFactor),
			mixScalar(navigationState.smoothedTarget.y, navigationState.fallbackTarget.y, anchorFactor),
			mixScalar(navigationState.smoothedTarget.z, navigationState.fallbackTarget.z, anchorFactor),
		)
		if (navigationState.smoothedTarget.distanceTo(navigationState.fallbackTarget) <= 0.01) {
			navigationState.smoothedTarget.copy(navigationState.fallbackTarget)
		}

		const radiusFactor = computeLerpFactor(deltaMs, FOCUS_RADIUS_SMOOTHING_MS)
		const nextFocusRadius = mixScalar(
			navigationState.smoothedFocusRadius,
			navigationState.fallbackFocusRadius,
			radiusFactor,
		)
		navigationState.smoothedFocusRadius =
			Math.abs(nextFocusRadius - navigationState.fallbackFocusRadius) <= 0.01
				? navigationState.fallbackFocusRadius
				: nextFocusRadius

		return {
			focusRadius: navigationState.smoothedFocusRadius,
			target: navigationState.smoothedTarget,
		}
	}

	const resolvePickTargetHoverScore = (
		target: HoverablePickTarget,
		clientX: number,
		clientY: number,
	): number | null => {
		if (target.kind === "field") {
			return resolveProjectedSphereDistancePx(target.center, target.sphereRadius, clientX, clientY)
		}

		return resolveProjectedWireframeDistancePx(
			getTorusWireframeGeometry(target.shellRadius, target.shellTube, target.depth),
			target.center,
			clientX,
			clientY,
		)
	}

	const updateSceneWorldState = (): void => {
		space.updateWorldMatrix()
		syncPickTargetsFromScene()
	}

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
			parentByParticleId,
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

	const applyNavigationFrame = (deltaMs: number): void => {
		if (!navigationState) return
		viewPoint.alignUpToWorldZ()

		const nextFocus = resolveNavigationFocusTarget(deltaMs)
		if (!nextFocus) {
			navigationState = null
			return
		}

		const nextPose = resolveBulkViewportFocusPose({
			currentPosition: viewPoint.position,
			currentTarget: viewPoint.getTarget(),
			nextTarget: nextFocus.target,
			focusRadius: nextFocus.focusRadius,
			fovRad: viewPoint.fov,
		})
		const positionFactor = computeLerpFactor(deltaMs, FOCUS_POSITION_SMOOTHING_MS)
		const targetFactor = computeLerpFactor(deltaMs, FOCUS_TARGET_SMOOTHING_MS)
		const currentTarget = viewPoint.getTarget()
		viewPoint.position.set(
			mixScalar(viewPoint.position.x, nextPose.position.x, positionFactor),
			mixScalar(viewPoint.position.y, nextPose.position.y, positionFactor),
			mixScalar(viewPoint.position.z, nextPose.position.z, positionFactor),
		)
		currentTarget.set(
			mixScalar(currentTarget.x, nextPose.target.x, targetFactor),
			mixScalar(currentTarget.y, nextPose.target.y, targetFactor),
			mixScalar(currentTarget.z, nextPose.target.z, targetFactor),
		)
		const positionSettled = viewPoint.position.distanceTo(nextPose.position) <= FOCUS_SETTLE_DISTANCE_MM
		const targetSettled = currentTarget.distanceTo(nextPose.target) <= FOCUS_SETTLE_DISTANCE_MM
		if (positionSettled && targetSettled) {
			viewPoint.position.copy(nextPose.position)
			currentTarget.copy(nextPose.target)
			navigationState = null
		}
		viewPoint.update()
	}

	const focusTarget = (target: HoverablePickTarget): void => {
		viewPoint.alignUpToWorldZ()
		viewPoint.update()
		navigationState = {
			fallbackFocusRadius: target.outerRadius,
			fallbackTarget: target.center.clone(),
			smoothedFocusRadius: target.outerRadius,
			smoothedTarget: target.center.clone(),
			targetKey: getPickTargetKey(target),
		}
		requestRenderLoop(SCENE_TRANSITION_WAKE_MS)
	}

	const updateAnimatedRecords = (deltaMs: number): boolean => {
		let hasPendingMotion = false
		const freezeCosmosPose = activeRenderSettings.animationEnabled && animationSuspended
		const positionFactor = computeLerpFactor(deltaMs, POSITION_SMOOTHING_MS)
		const scaleFactor = computeLerpFactor(deltaMs, SCALE_SMOOTHING_MS)

		for (const record of shellRecords.values()) {
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
			applyShellRecordScale(record)
			record.container.updateMatrix()
		}

		for (const record of fieldRecords.values()) {
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
			applyFieldRecordScale(record)
			record.node.updateMatrix()
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

		for (const record of shellRecords.values()) {
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

		for (const record of fieldRecords.values()) {
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

		return shellRecords.size > 0 || fieldRecords.size > 0
	}

	const updateAnthropomorphBotAnimation = (deltaMs: number): boolean => {
		if (!activeRenderSettings.animationEnabled || animationSuspended || deltaMs <= 0) return false
		if (anthropomorphBotMixer === null) return false
		anthropomorphBotMixer.update(deltaMs / 1000)
		return true
	}

	const updateAnthropomorphBotSkinning = (): void => {
		for (const mesh of anthropomorphBotSkinnedMeshes) {
			mesh.skeleton.update()
		}
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
			const shellRadius = tracker.shellRadius * worldScale
			const shellTube = tracker.shellTube * worldScale
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
			const majorDir = reusableMajorDir.set(toCameraXy.x, toCameraXy.y, 0).normalize()
			if (majorDir.length() < 1e-6) majorDir.set(1, 0, 0)

			// Нормаль всегда горизонтальная (вдоль majorDir), независимо от высоты камеры.
			normal.copy(majorDir)
			// Касательная вдоль параллели = поворот majorDir на 90° в XY.
			right.set(-majorDir.y, majorDir.x, 0).normalize()

			if (tracker.kind === "shell") {
				// Метка на внешнем экваторе тубы, `outerRing = shellRadius + shellTube + offset`.
				const outerRing = shellRadius + shellTube + offset
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

			// Устанавливаем позицию
			tracker.container.position.copy(labelPos)

			// Строим ориентацию из базиса
			const matrix = reusableLabelMatrix
			const e = matrix.elements
			e[0] = right.x; e[1] = right.y; e[2] = right.z; e[3] = 0
			e[4] = up.x;    e[5] = up.y;    e[6] = up.z;    e[7] = 0
			e[8] = normal.x; e[9] = normal.y; e[10] = normal.z; e[11] = 0
			e[12] = 0;      e[13] = 0;      e[14] = 0;      e[15] = 1

			tracker.container.quaternion.setFromRotationMatrix(matrix)

			const fitScale = resolveSurfaceFitScale({
				curveRadiusMm,
				extents: tracker.extents,
				limits: SURFACE_ARC_LIMITS,
				minScale: MIN_SURFACE_LABEL_FIT_SCALE,
			})

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
		if (event.button !== 0) return
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

		setHoveredPickTarget(pickTargetAtClientPoint(event.clientX, event.clientY, true))
	}

	const handleCanvasMouseUp = (event: MouseEvent): void => {
		isPrimaryPointerDown = false
		handleCanvasMouseMove(event)
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const resetCanvasPointerState = (): void => {
		isPrimaryPointerDown = false
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
		cancelNavigation()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const wakeRenderFromCanvasTouch = (): void => {
		cancelNavigation()
		requestRenderLoop(INPUT_RENDER_WAKE_MS)
	}

	const handleCanvasClick = (event: MouseEvent): void => {
		if (event.button !== 0) return
		isPrimaryPointerDown = false
		if (clickNavigationSuppressed) {
			clickNavigationSuppressed = false
			return
		}
		const hitTarget = hoveredPickTarget ?? pickTargetAtClientPoint(event.clientX, event.clientY, true)
		if (!hitTarget) return

		focusTarget(hitTarget)
	}

	options.canvas.addEventListener("mousedown", handleCanvasMouseDown)
	options.canvas.addEventListener("mousemove", handleCanvasMouseMove)
	options.canvas.addEventListener("mouseup", handleCanvasMouseUp)
	options.canvas.addEventListener("mouseleave", resetCanvasPointerState)
	options.canvas.addEventListener("click", handleCanvasClick)
	options.canvas.addEventListener("wheel", wakeRenderFromCanvasWheel, { passive: true })
	options.canvas.addEventListener("touchstart", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchmove", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchend", wakeRenderFromCanvasTouch, { passive: true })
	options.canvas.addEventListener("touchcancel", wakeRenderFromCanvasTouch, { passive: true })
	document.addEventListener("mousemove", wakeRenderFromDocumentMouseMove)
	document.addEventListener("mouseup", wakeRenderFromDocumentMouseUp)

	const calculateActiveShellRecord = (): ShellRenderRecord | null => {
		const cameraPos = viewPoint.position
		let bestRecord: ShellRenderRecord | null = null
		let bestNormalizedDistance = Number.POSITIVE_INFINITY

		for (const record of shellRecords.values()) {
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
								record.snapshot.particleId.localeCompare(bestRecord.snapshot.particleId) < 0
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
		const hasBotMotion = updateAnthropomorphBotAnimation(deltaMs)
		updateSceneWorldState()
		applyNavigationFrame(deltaMs)

		const activeShellRecord = calculateActiveShellRecord()
		const nextBaseDepth = activeShellRecord?.snapshot.depth ?? -1
		const nextActiveShellParticleId = activeShellRecord?.snapshot.particleId ?? null
		if (
			nextBaseDepth !== activeRenderSettings.baseDepth ||
			nextActiveShellParticleId !== activeShellParticleId
		) {
			activeRenderSettings.baseDepth = nextBaseDepth
			activeShellParticleId = nextActiveShellParticleId
			syncLabelRecords()
		}

		updateLabelTrackers()
		hudRuntime.flushPendingRender()
		space.updateWorldMatrix()
		updateAnthropomorphBotSkinning()
		renderer.renderFrame(space, hudRuntime.overlay, viewPoint)
		if (navigationState || hasPendingMotion || hasCosmosMotion || hasBotMotion || timestamp < renderWakeUntilMs) {
			frameHandle = requestAnimationFrame(animate)
		}
	}

	hudRuntime = new BulkViewportHudRuntime(options.canvas, renderer, viewPoint, uiFont, requestRenderLoop)
	hudRuntime.handleSize(options.width, options.height)
	void loadAnthropomorphBots()
	requestRenderLoop()

	return {
		dispose() {
			disposed = true
			cancelAnimationFrame(frameHandle)
			options.canvas.removeEventListener("mousedown", handleCanvasMouseDown)
			options.canvas.removeEventListener("mousemove", handleCanvasMouseMove)
			options.canvas.removeEventListener("mouseup", handleCanvasMouseUp)
			options.canvas.removeEventListener("mouseleave", resetCanvasPointerState)
			options.canvas.removeEventListener("click", handleCanvasClick)
			options.canvas.removeEventListener("wheel", wakeRenderFromCanvasWheel)
			options.canvas.removeEventListener("touchstart", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchmove", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchend", wakeRenderFromCanvasTouch)
			options.canvas.removeEventListener("touchcancel", wakeRenderFromCanvasTouch)
			document.removeEventListener("mousemove", wakeRenderFromDocumentMouseMove)
			document.removeEventListener("mouseup", wakeRenderFromDocumentMouseUp)
			setHoveredPickTarget(null)
			if (anthropomorphBotRoot !== null) detachObject(anthropomorphBotRoot)
			anthropomorphBotRoot = null
			anthropomorphBotMixer = null
			anthropomorphBotSkinnedMeshes = []
			hudRuntime.dispose()
			viewPoint.dispose()
		},
		handleForce(_channel: string, _message: unknown) {
			return
		},
		setAnimationSuspended(suspended: boolean) {
			if (animationSuspended === suspended) return
			animationSuspended = suspended
			lastAnimationTimestamp = 0
			if (!suspended && activeRenderSettings.animationEnabled) requestRenderLoop()
		},
		setLayoutSettings(settings: Partial<AppWebLayoutSettings>) {
			activeLayoutSettings = normalizeAppWebLayoutSettings({
				...activeLayoutSettings,
				...settings,
			})
			rebuildLevelResolver()
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			refreshSceneForSettings()
		},
		setRenderSettings(settings: Partial<AppWebRenderSettings>) {
			const nextBaseDepth = settings.baseDepth !== undefined ? settings.baseDepth : activeRenderSettings.baseDepth
			const wasCosmosMotionEnabled = activeRenderSettings.animationEnabled
			activeRenderSettings = normalizeAppWebRenderSettings({
				...activeRenderSettings,
				...settings,
				baseDepth: nextBaseDepth,
			})
			if (wasCosmosMotionEnabled && !activeRenderSettings.animationEnabled) {
				for (const record of shellRecords.values()) record.cosmosOrbitAngle = 0
				for (const record of fieldRecords.values()) record.cosmosOrbitAngle = 0
			}
			rebuildLevelResolver()
			if (settings.baseDepth !== undefined) activeShellParticleId = null
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			refreshSceneForSettings()
		},
		setSize(width: number, height: number) {
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
			hudRuntime.handleSize(width, height)
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
		},
		applyWorld(nextWorld: DbWorldRows) {
			applyWorldRowsToScene(nextWorld)
		},
		hud: hudRuntime,
	}
}
