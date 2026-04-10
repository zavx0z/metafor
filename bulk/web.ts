import type { DbFieldOrbitSnapshot, DbFieldValueKind, DbParticleShellSnapshot, DbWorldSnapshot } from "../pkg/db/index.ts"
import {
	appWebLayoutConfig,
	DEFAULT_APP_WEB_LAYOUT_SETTINGS,
	DEFAULT_APP_WEB_RENDER_SETTINGS,
	normalizeAppWebLayoutSettings,
	type AppWebLayoutSettings,
	normalizeAppWebRenderSettings,
	type AppWebRenderSettings,
} from "../app/web/settings.ts"
import {
	resolveAppWebLevelMetrics,
	resolveAppWebOuterRadiusFromFieldSphereRadius,
} from "../app/web/level.ts"
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	GridHelper,
	LineGlowMaterial,
	LineSegments,
	Matrix4,
	Object3D,
	Quaternion,
	Renderer,
	Scene,
	SphereGeometry,
	Text,
	TextMaterial,
	TrueTypeFont,
	Raycaster,
	Vector3,
	ViewPoint,
} from "@metafor/engine"
import {
	resolveBulkHoverPriorityTarget,
	resolveBulkPickHit,
	resolveBulkPickHits,
	resolveBulkViewportFocusPose,
	type BulkPickTarget,
	type BulkHoverPriorityCandidate,
} from "./web-navigation"

/** Краткая статистика текущего snapshot-а, которую viewport отдаёт в UI. */
export interface BulkViewportStats {
	fieldCount: number
	rootSrc?: string
	shellCount: number
}

/** Публичный API bulk viewport для `app/web`. */
export interface BulkViewportController {
	dispose(): void
	handleProtocol(_channel: string, _message: unknown): void
	setLayoutSettings(settings: Partial<AppWebLayoutSettings>): void
	setRenderSettings(settings: Partial<AppWebRenderSettings>): void
	setSize(width: number, height: number): void
	setSnapshot(snapshot: DbWorldSnapshot): void
}

type BulkViewportOptions = {
	canvas: HTMLCanvasElement
	height: number
	onStats?: (stats: BulkViewportStats) => void
	width: number
}

const ROOT_BACKGROUND = new Color(0.035, 0.05, 0.075)
const THEME_PRIMARY = new Color(135 / 255, 206 / 255, 235 / 255)
const THEME_PRIMARY_GLOW = new Color(225 / 255, 243 / 255, 250 / 255, 0.14)
const THEME_SECONDARY = new Color(71 / 255, 189 / 255, 116 / 255)
const THEME_SECONDARY_GLOW = new Color(209 / 255, 239 / 255, 220 / 255, 0.12)
const THEME_TERTIARY = new Color(191 / 255, 200 / 255, 209 / 255)
const THEME_TERTIARY_GLOW = new Color(229 / 255, 233 / 255, 237 / 255, 0.12)
const THEME_WARNING = new Color(255 / 255, 209 / 255, 117 / 255)
const THEME_WARNING_GLOW = new Color(255 / 255, 244 / 255, 221 / 255, 0.12)
const HOVER_PRIORITY_HYSTERESIS_PX = 2.5
const HOVER_PICK_HIT_PADDING_MM = 10
const HOVER_RETENTION_HIT_PADDING_MM = 14
const INPUT_RENDER_WAKE_MS = 180
const SCENE_TRANSITION_WAKE_MS = 420
const POSITION_SMOOTHING_MS = 120
const SCALE_SMOOTHING_MS = 140
const REMOVAL_FADE_MS = 150
const REMOVAL_SCALE_MULTIPLIER = 0.9
const LABEL_FADE_IN_MS = 120
const LABEL_INITIAL_SCALE = 0.94
const MAX_UV_LABEL_SPAN_RAD = Math.PI * 0.8
const MIN_UV_LABEL_HEIGHT_FIT_SCALE = 0.05
const MIN_UV_LABEL_FIT_SCALE = 0.12
const MIN_SURFACE_LABEL_TEXT_SCALE = 0.2
const FOCUS_POSITION_SMOOTHING_MS = 130
const FOCUS_TARGET_SMOOTHING_MS = 115
const FOCUS_ANCHOR_SMOOTHING_MS = 150
const FOCUS_RADIUS_SMOOTHING_MS = 170
const FOCUS_SETTLE_DISTANCE_MM = 0.35

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()
let activeLayoutSettings: AppWebLayoutSettings = { ...DEFAULT_APP_WEB_LAYOUT_SETTINGS }
let activeRenderSettings: AppWebRenderSettings = { ...DEFAULT_APP_WEB_RENDER_SETTINGS }

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
	currentTransitionScale: number
	material: LineGlowMaterial
	pickTarget: HoverablePickTarget
	snapshot: DbParticleShellSnapshot
	targetLocalPosition: Vector3
	torus: LineSegments
}

type FieldRenderRecord = {
	currentTransitionScale: number
	depth: number
	material: LineGlowMaterial
	node: LineSegments
	parentParticleId: string
	pickTarget: HoverablePickTarget
	snapshot: DbFieldOrbitSnapshot
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
	coverCenter: TextGeometryCenter
	container: Object3D
	initialCoverPositions: Float32Array
	initialStencilPositions: Float32Array
	maxTextWidth: number
	material: TextMaterial
	stencilCenter: TextGeometryCenter
	textNode: Text
}

type LabelRenderRecord = {
	anchorObject: Object3D
	coverCenter: TextGeometryCenter
	container: Object3D
	currentOpacity: number
	currentScale: number
	initialCoverPositions: Float32Array
	initialStencilPositions: Float32Array
	key: string
	kind: "shell" | "field"
	maxTextWidth: number
	material: TextMaterial
	offset: number
	shellRadius: number
	shellTube: number
	signature: string
	sphereRadius: number
	stencilCenter: TextGeometryCenter
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

type TextGeometryCenter = {
	centerX: number
	centerY: number
	width: number
}

const getViewportConfig = () => appWebLayoutConfig.viewport
const getShellFallback = () => getViewportConfig().shellFallbackMm
const getWorkspaceBaseZ = (): number => getViewportConfig().levelsMm.elbow
const getFloorZ = (): number => getViewportConfig().levelsMm.floor

const getLevelMetrics = (depth: number, outerRadiusMm?: number) =>
	resolveAppWebLevelMetrics({
		depth,
		layoutSettings: activeLayoutSettings,
		renderSettings: activeRenderSettings,
		...(outerRadiusMm !== undefined && { outerRadiusMm }),
	})

const isLabelDepthVisible = (depth: number): boolean => getLevelMetrics(depth).isLabelVisible

const getTorusDetail = (
	_radius: number,
	_tube: number,
	depth: number,
): { radialSegments: number; tubularSegments: number } => {
	const metrics = getLevelMetrics(depth)
	return {
		radialSegments: metrics.torusRadialSegments ?? 3,
		tubularSegments: metrics.torusTubularSegments ?? 3,
	}
}

const getSphereDetail = (_radius: number, depth: number): { widthSegments: number; heightSegments: number } => {
	const metrics = getLevelMetrics(depth)
	return {
		widthSegments: metrics.sphereWidthSegments ?? 3,
		heightSegments: metrics.sphereHeightSegments ?? 2,
	}
}

const getFieldThemeColor = (fieldValueKind: DbFieldValueKind): { color: Color; glowColor: Color } => {
	switch (fieldValueKind) {
		case "number":
			return { color: THEME_PRIMARY, glowColor: THEME_PRIMARY_GLOW }
		case "text":
			return { color: THEME_SECONDARY, glowColor: THEME_SECONDARY_GLOW }
		case "bool":
			return { color: THEME_TERTIARY, glowColor: THEME_TERTIARY_GLOW }
		default:
			return { color: THEME_WARNING, glowColor: THEME_WARNING_GLOW }
	}
}

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

type SurfaceLabelProjection =
	| {
			baseCosLatitude: number
			baseSinLatitude: number
			kind: "sphere"
			radius: number
	  }
	| {
			baseCosLatitude: number
			baseSinLatitude: number
			kind: "torus"
			majorRadius: number
			minorRadius: number
	  }

const resolveTextGeometryCenter = (
	initialPositions: Float32Array,
): TextGeometryCenter | null => {
	if (initialPositions.length === 0) return null

	let minX = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY

	for (let index = 0; index < initialPositions.length; index += 3) {
		const x = initialPositions[index] ?? 0
		const y = initialPositions[index + 1] ?? 0
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}

	if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
		return null
	}

	return {
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2,
		width: Math.max(0, maxX - minX),
	}
}

const markGeometryPositionsDirty = (geometry: BufferGeometry): void => {
	if (geometry.attributes.position) geometry.attributes.position.needsUpdate = true
}

const resolveSurfaceLabelTextScale = (spec: LabelSpec, maxTextWidth: number): number => {
	if (!(maxTextWidth > 0)) return 1
	const surfaceCurveRadius = spec.kind === "shell"
		? Math.max(Math.abs(spec.shellRadius - (spec.shellTube + spec.offset)), 1e-6)
		: Math.max(spec.sphereRadius + spec.offset, 1e-6)
	const maxSurfaceTextWidth = Math.max(1e-6, surfaceCurveRadius * MAX_UV_LABEL_SPAN_RAD)
	return Math.max(MIN_SURFACE_LABEL_TEXT_SCALE, Math.min(1, maxSurfaceTextWidth / maxTextWidth))
}

const resolveFieldPeerLevelMetrics = (
	record: FieldRenderRecord,
	parentShellRecord: ShellRenderRecord | undefined,
): { metricDepth: number; metricRadius: number } => {
	if (parentShellRecord) {
		return {
			metricDepth: parentShellRecord.snapshot.depth,
			metricRadius: parentShellRecord.snapshot.shellRadius + parentShellRecord.snapshot.shellTube,
		}
	}

	const metricDepth = Math.max(0, record.depth - 1)
	return {
		metricDepth,
		metricRadius: resolveAppWebOuterRadiusFromFieldSphereRadius({
			depth: metricDepth,
			fieldSphereRadiusMm: record.snapshot.sphereRadius,
			layoutSettings: activeLayoutSettings,
		}),
	}
}

const resolveUvLabelFitScale = (baseCurveRadius: number, maxTextWidth: number): number => {
	if (!(maxTextWidth > 0)) return 1
	const safeBaseRadius = Math.max(Math.abs(baseCurveRadius), 0.1)
	const maxArcWidth = safeBaseRadius * MAX_UV_LABEL_SPAN_RAD
	return Math.max(MIN_UV_LABEL_FIT_SCALE, Math.min(1, maxArcWidth / maxTextWidth))
}

const resolveUvLabelHeightFitScale = (fitScale: number): number => {
	return Math.max(MIN_UV_LABEL_HEIGHT_FIT_SCALE, Math.min(1, fitScale))
}

const projectTextGeometryOntoSphere = (
	geometry: BufferGeometry,
	initialPositions: Float32Array,
	center: TextGeometryCenter,
	radius: number,
	baseCosLatitude: number,
	baseSinLatitude: number,
	fitScale: number,
): void => {
	const positions = getGeometryPositionArray(geometry)
	if (!positions || positions.length === 0) return

	const safeRadius = Math.max(radius, 1e-6)
	const baseParallelRadius = Math.max(Math.abs(safeRadius * baseCosLatitude), 1e-6)
	const heightFitScale = resolveUvLabelHeightFitScale(fitScale)

	for (let index = 0; index < initialPositions.length; index += 3) {
		const arcOffset = ((initialPositions[index] ?? 0) - center.centerX) * fitScale
		const verticalOffset = ((initialPositions[index + 1] ?? 0) - center.centerY) * heightFitScale
		const deltaLongitude = arcOffset / baseParallelRadius
		const deltaLatitude = verticalOffset / safeRadius
		const sinDeltaLongitude = Math.sin(deltaLongitude)
		const cosDeltaLongitude = Math.cos(deltaLongitude)
		const cosDeltaLatitude = Math.cos(deltaLatitude)
		const sinDeltaLatitude = Math.sin(deltaLatitude)
		const cosLatitude = baseCosLatitude * cosDeltaLatitude - baseSinLatitude * sinDeltaLatitude
		const sinLatitude = baseSinLatitude * cosDeltaLatitude + baseCosLatitude * sinDeltaLatitude
		const parallelRadius = safeRadius * cosLatitude
		const radialDelta = parallelRadius * cosDeltaLongitude - safeRadius * baseCosLatitude
		const verticalDelta = safeRadius * sinLatitude - safeRadius * baseSinLatitude

		positions[index] = parallelRadius * sinDeltaLongitude
		positions[index + 1] = -radialDelta * baseSinLatitude + verticalDelta * baseCosLatitude
		positions[index + 2] = radialDelta * baseCosLatitude + verticalDelta * baseSinLatitude
	}

	markGeometryPositionsDirty(geometry)
}

const projectTextGeometryOntoTorus = (
	geometry: BufferGeometry,
	initialPositions: Float32Array,
	center: TextGeometryCenter,
	majorRadius: number,
	minorRadius: number,
	baseCosLatitude: number,
	baseSinLatitude: number,
	fitScale: number,
): void => {
	const positions = getGeometryPositionArray(geometry)
	if (!positions || positions.length === 0) return

	const safeMajorRadius = Math.max(majorRadius, 1e-6)
	const safeMinorRadius = Math.max(minorRadius, 1e-6)
	const centerCircleRadius = Math.max(safeMajorRadius + safeMinorRadius * baseCosLatitude, 1e-6)
	const safeCenterCircleRadius = Math.max(Math.abs(centerCircleRadius), 1e-6)
	const heightFitScale = resolveUvLabelHeightFitScale(fitScale)

	for (let index = 0; index < initialPositions.length; index += 3) {
		const arcOffset = ((initialPositions[index] ?? 0) - center.centerX) * fitScale
		const verticalOffset = ((initialPositions[index + 1] ?? 0) - center.centerY) * heightFitScale
		const deltaU = arcOffset / safeCenterCircleRadius
		const deltaV = verticalOffset / safeMinorRadius
		const sinDeltaU = Math.sin(deltaU)
		const cosDeltaU = Math.cos(deltaU)
		const cosDeltaV = Math.cos(deltaV)
		const sinDeltaV = Math.sin(deltaV)
		const cosLatitude = baseCosLatitude * cosDeltaV - baseSinLatitude * sinDeltaV
		const sinLatitude = baseSinLatitude * cosDeltaV + baseCosLatitude * sinDeltaV
		const circleRadius = Math.max(safeMajorRadius + safeMinorRadius * cosLatitude, 1e-6)
		const radialDelta = circleRadius * cosDeltaU - centerCircleRadius
		const verticalDelta = safeMinorRadius * sinLatitude - safeMinorRadius * baseSinLatitude

		positions[index] = circleRadius * sinDeltaU
		positions[index + 1] = -radialDelta * baseSinLatitude + verticalDelta * baseCosLatitude
		positions[index + 2] = radialDelta * baseCosLatitude + verticalDelta * baseSinLatitude
	}

	markGeometryPositionsDirty(geometry)
}

const applySurfaceLabelProjection = (
	textNode: Text,
	initialStencilPositions: Float32Array,
	initialCoverPositions: Float32Array,
	stencilCenter: TextGeometryCenter,
	coverCenter: TextGeometryCenter,
	maxTextWidth: number,
	projection: SurfaceLabelProjection,
): void => {
	if (projection.kind === "sphere") {
		const fitScale = resolveUvLabelFitScale(projection.radius * projection.baseCosLatitude, maxTextWidth)
		projectTextGeometryOntoSphere(
			textNode.stencilGeometry,
			initialStencilPositions,
			stencilCenter,
			projection.radius,
			projection.baseCosLatitude,
			projection.baseSinLatitude,
			fitScale,
		)
		projectTextGeometryOntoSphere(
			textNode.coverGeometry,
			initialCoverPositions,
			coverCenter,
			projection.radius,
			projection.baseCosLatitude,
			projection.baseSinLatitude,
			fitScale,
		)
		return
	}

	const fitScale = resolveUvLabelFitScale(
		projection.majorRadius + projection.minorRadius * projection.baseCosLatitude,
		maxTextWidth,
	)
	projectTextGeometryOntoTorus(
		textNode.stencilGeometry,
		initialStencilPositions,
		stencilCenter,
		projection.majorRadius,
		projection.minorRadius,
		projection.baseCosLatitude,
		projection.baseSinLatitude,
		fitScale,
	)
	projectTextGeometryOntoTorus(
		textNode.coverGeometry,
		initialCoverPositions,
		coverCenter,
		projection.majorRadius,
		projection.minorRadius,
		projection.baseCosLatitude,
		projection.baseSinLatitude,
		fitScale,
	)
}

const createSurfaceLabelNode = (
	spec: LabelSpec,
	font: TrueTypeFont,
): SurfaceLabelVisual => {
	const baseFontSize =
		getLevelMetrics(spec.metricDepth, spec.metricRadius).labelFontSizeMm ?? activeRenderSettings.labelFontSizeMm
	const createLabel = (fontSize: number): Text =>
		new Text(
			spec.text,
			font,
			fontSize,
			new TextMaterial({ color: spec.color.clone(), opacity: 1 }),
		)

	let label = createLabel(baseFontSize)
	let initialStencilPositions = new Float32Array(getGeometryPositionArray(label.stencilGeometry) ?? [])
	let initialCoverPositions = new Float32Array(getGeometryPositionArray(label.coverGeometry) ?? [])
	let stencilCenter = resolveTextGeometryCenter(initialStencilPositions) ?? { centerX: 0, centerY: 0, width: 0 }
	let coverCenter = resolveTextGeometryCenter(initialCoverPositions) ?? { centerX: 0, centerY: 0, width: 0 }
	let maxTextWidth = Math.max(stencilCenter.width, coverCenter.width)
	const surfaceTextScale = resolveSurfaceLabelTextScale(spec, maxTextWidth)

	if (surfaceTextScale < 0.999) {
		label = createLabel(baseFontSize * surfaceTextScale)
		initialStencilPositions = new Float32Array(getGeometryPositionArray(label.stencilGeometry) ?? [])
		initialCoverPositions = new Float32Array(getGeometryPositionArray(label.coverGeometry) ?? [])
		stencilCenter = resolveTextGeometryCenter(initialStencilPositions) ?? { centerX: 0, centerY: 0, width: 0 }
		coverCenter = resolveTextGeometryCenter(initialCoverPositions) ?? { centerX: 0, centerY: 0, width: 0 }
		maxTextWidth = Math.max(stencilCenter.width, coverCenter.width)
	}

	label.frustumCulled = false
	label.updateMatrix()

	const container = new Object3D()
	container.add(label)
	container.updateMatrix()
	return {
		coverCenter,
		container,
		initialCoverPositions,
		initialStencilPositions,
		maxTextWidth,
		material: label.material,
		stencilCenter,
		textNode: label,
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

const createShellMaterial = (shell: DbParticleShellSnapshot): LineGlowMaterial =>
	new LineGlowMaterial({
		color: THEME_PRIMARY.clone(),
		glowIntensity: shell.kind === "wimp" ? 1.4 : 1.15,
		glowColor: THEME_PRIMARY_GLOW.clone(),
		opacity: activeRenderSettings.wireframeOpacity,
	})

const createFieldMaterial = (orbit: DbFieldOrbitSnapshot): LineGlowMaterial => {
	const theme = getFieldThemeColor(orbit.fieldValueKind)
	return new LineGlowMaterial({
		color: theme.color.clone(),
		glowIntensity: 1,
		glowColor: theme.glowColor.clone(),
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
	const labelFont = await TrueTypeFont.fromUrl("/engine-static/JetBrainsMono-Bold.ttf").catch(() => null)
	const viewportConfig = getViewportConfig()
	const raycaster = new Raycaster()
	const scene = new Scene()
	scene.background = ROOT_BACKGROUND.clone()
	scene.add(createWorkspaceGrid())

	const workspace = new Object3D()
	workspace.position.set(0, 0, getWorkspaceBaseZ())
	workspace.updateMatrix()
	scene.add(workspace)

	const labelsLayer = new Object3D()
	labelsLayer.frustumCulled = false
	labelsLayer.updateMatrix()
	scene.add(labelsLayer)

	let pickTargets: HoverablePickTarget[] = []
	let hoveredPickTarget: HoverablePickTarget | null = null
	let snapshot: DbWorldSnapshot | null = null
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
		target.material.color.copy(THEME_WARNING)
		target.material.glowIntensity = Math.max(target.baseGlowIntensity * 1.6, target.baseGlowIntensity + 0.45)
		target.material.opacity = Math.min(1, target.baseOpacity + 0.08)
		if (target.material.glowColor) target.material.glowColor.copy(THEME_WARNING_GLOW)
		else target.material.glowColor = THEME_WARNING_GLOW.clone()
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

	const mixScalar = (from: number, to: number, progress: number): number => from + (to - from) * progress

	const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3)

	const computeLerpFactor = (deltaMs: number, smoothingMs: number): number => {
		if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0
		return 1 - Math.exp(-deltaMs / Math.max(1, smoothingMs))
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
		record.pickTarget.baseColor.copy(THEME_PRIMARY)
		record.pickTarget.baseGlowColor = THEME_PRIMARY_GLOW.clone()
		record.pickTarget.baseGlowIntensity = record.snapshot.kind === "wimp" ? 1.4 : 1.15
		record.pickTarget.baseOpacity = activeRenderSettings.wireframeOpacity
		syncPickTargetMaterialState(record.pickTarget)
	}

	const refreshFieldRecordGeometryAndMaterial = (record: FieldRenderRecord): void => {
		record.node.geometry = getSphereWireframeGeometry(record.snapshot.sphereRadius, record.depth)
		const theme = getFieldThemeColor(record.snapshot.fieldValueKind)
		record.pickTarget.baseColor.copy(theme.color)
		record.pickTarget.baseGlowColor = theme.glowColor.clone()
		record.pickTarget.baseGlowIntensity = 1
		record.pickTarget.baseOpacity = activeRenderSettings.wireframeOpacity * 0.95
		syncPickTargetMaterialState(record.pickTarget)
	}

	const createShellRecord = (shell: DbParticleShellSnapshot): ShellRenderRecord => {
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

	const createFieldRecord = (field: DbFieldOrbitSnapshot, depth: number): FieldRenderRecord => {
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

	const upsertShellRecord = (shell: DbParticleShellSnapshot): ShellRenderRecord => {
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

	const upsertFieldRecord = (field: DbFieldOrbitSnapshot, depth: number): FieldRenderRecord => {
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
		const metrics = getLevelMetrics(spec.metricDepth, spec.metricRadius)
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
			(metrics.labelFontSizeMm ?? activeRenderSettings.labelFontSizeMm).toFixed(6),
			(metrics.labelSurfaceOffsetMm ?? activeRenderSettings.labelSurfaceOffsetMm).toFixed(6),
		].join(":")
	}

	const createShellLabelSpec = (record: ShellRenderRecord): LabelSpec | null => {
		if (!labelFont) return null
		if (!isLabelDepthVisible(record.snapshot.depth)) return null
		const text = normalizeLabelText(record.snapshot.label)
		if (!text) return null

		const metricRadius = record.snapshot.shellRadius + record.snapshot.shellTube
		const metrics = getLevelMetrics(record.snapshot.depth, metricRadius)

		return {
			anchorObject: record.container,
			color: THEME_PRIMARY.clone(),
			depth: record.snapshot.depth,
			key: `shell:${record.snapshot.particleId}`,
			kind: "shell",
			metricDepth: record.snapshot.depth,
			metricRadius,
			offset: metrics.labelSurfaceOffsetMm ?? activeRenderSettings.labelSurfaceOffsetMm,
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
		const metrics = getLevelMetrics(metricDepth, metricRadius)

		return {
			anchorObject: record.node,
			color: getFieldThemeColor(record.snapshot.fieldValueKind).color.clone(),
			depth: record.depth,
			key: `field:${record.snapshot.id}`,
			kind: "field",
			metricDepth,
			metricRadius,
			offset: metrics.labelSurfaceOffsetMm ?? activeRenderSettings.labelSurfaceOffsetMm,
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
			container.scale.set(LABEL_INITIAL_SCALE, LABEL_INITIAL_SCALE, LABEL_INITIAL_SCALE)
			container.updateMatrix()
			visual.material.opacity = 0
			labelsLayer.add(container)
			labelRecords.set(spec.key, {
				anchorObject: spec.anchorObject,
				coverCenter: visual.coverCenter,
				container,
				currentOpacity: 0,
				currentScale: LABEL_INITIAL_SCALE,
				initialCoverPositions: visual.initialCoverPositions,
				initialStencilPositions: visual.initialStencilPositions,
				key: spec.key,
				kind: spec.kind,
				maxTextWidth: visual.maxTextWidth,
				material: visual.material,
				offset: spec.offset,
				shellRadius: spec.shellRadius,
				shellTube: spec.shellTube,
				signature,
				sphereRadius: spec.sphereRadius,
				stencilCenter: visual.stencilCenter,
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
		existing.coverCenter = visual.coverCenter
		existing.initialCoverPositions = visual.initialCoverPositions
		existing.initialStencilPositions = visual.initialStencilPositions
		existing.maxTextWidth = visual.maxTextWidth
		existing.material = visual.material
		existing.signature = signature
		existing.container.add(visual.container)
		existing.stencilCenter = visual.stencilCenter
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

	const applySnapshotToScene = (nextSnapshot: DbWorldSnapshot): void => {
		snapshot = nextSnapshot

		const nextShellIds = new Set<string>()
		const nextFieldIds = new Set<string>()

		for (const shell of nextSnapshot.particles) {
			nextShellIds.add(shell.particleId)
			upsertShellRecord(shell)
		}

		for (const shell of nextSnapshot.particles) {
			const record = shellRecords.get(shell.particleId)
			if (!record) continue
			const parentObject = shell.parentParticleId
				? shellRecords.get(shell.parentParticleId)?.container ?? workspace
				: workspace
			parentObject.add(record.container)
		}

		for (const field of nextSnapshot.fields) {
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
			rootSrc: nextSnapshot.rootSrc,
			shellCount: nextSnapshot.particles.length,
			fieldCount: nextSnapshot.fields.length,
		})
	}

	const getDistanceToSegmentPx = (
		pointX: number,
		pointY: number,
		startX: number,
		startY: number,
		endX: number,
		endY: number,
	): number => {
		const dx = endX - startX
		const dy = endY - startY
		const lengthSq = dx * dx + dy * dy
		if (lengthSq <= 1e-6) return Math.hypot(pointX - startX, pointY - startY)
		const projection = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSq))
		const closestX = startX + dx * projection
		const closestY = startY + dy * projection
		return Math.hypot(pointX - closestX, pointY - closestY)
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
		scene.updateWorldMatrix()
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
		const positionFactor = computeLerpFactor(deltaMs, POSITION_SMOOTHING_MS)
		const scaleFactor = computeLerpFactor(deltaMs, SCALE_SMOOTHING_MS)

		for (const record of shellRecords.values()) {
			const nextX = mixScalar(record.container.position.x, record.targetLocalPosition.x, positionFactor)
			const nextY = mixScalar(record.container.position.y, record.targetLocalPosition.y, positionFactor)
			const nextZ = mixScalar(record.container.position.z, record.targetLocalPosition.z, positionFactor)
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			record.container.position.set(nextX, nextY, nextZ)
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (Math.abs(record.container.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
			if (Math.abs(record.container.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
			if (Math.abs(record.container.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
			if (record.currentTransitionScale !== 1) hasPendingMotion = true
			applyShellRecordScale(record)
			record.container.updateMatrix()
		}

		for (const record of fieldRecords.values()) {
			const nextX = mixScalar(record.node.position.x, record.targetLocalPosition.x, positionFactor)
			const nextY = mixScalar(record.node.position.y, record.targetLocalPosition.y, positionFactor)
			const nextZ = mixScalar(record.node.position.z, record.targetLocalPosition.z, positionFactor)
			const nextScale = mixScalar(record.currentTransitionScale, 1, scaleFactor)
			record.node.position.set(nextX, nextY, nextZ)
			record.currentTransitionScale =
				Math.abs(nextScale - 1) <= 1e-3 ? 1 : nextScale
			if (Math.abs(record.node.position.x - record.targetLocalPosition.x) > 0.01) hasPendingMotion = true
			if (Math.abs(record.node.position.y - record.targetLocalPosition.y) > 0.01) hasPendingMotion = true
			if (Math.abs(record.node.position.z - record.targetLocalPosition.z) > 0.01) hasPendingMotion = true
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
			const nextOpacity = mixScalar(record.currentOpacity, 1, computeLerpFactor(deltaMs, LABEL_FADE_IN_MS))
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
			let projection: SurfaceLabelProjection

			if (tracker.kind === "shell") {
				// Вектор от центра тора к камере
				const toCamera = reusableLabelToCamera.copy(cameraPos).sub(reusableWorldPosition)
				// Направление основного радиуса (в плоскости XY)
				const majorDir = reusableMajorDir.set(toCamera.x, toCamera.y, 0).normalize()
				if (majorDir.length() < 1e-6) majorDir.set(1, 0, 0)
				
				// Центр "трубы" под камерой
				const tubeCenter = reusableTubeCenter.copy(reusableWorldPosition).add(
					reusableScaledOffset.copy(majorDir).multiplyScalar(shellRadius),
				)
				
				// Нормаль от центра трубы к камере
				normal.copy(cameraPos).sub(tubeCenter).normalize()
				// Позиция на поверхности трубы с учетом отступа
				labelPos.copy(tubeCenter).add(
					reusableScaledOffset.copy(normal).multiplyScalar(shellTube + offset),
				)
				
				// Вектор "вправо" (касательная к основной окружности бублика)
				right.set(-majorDir.y, majorDir.x, 0).normalize()

				projection = {
					baseCosLatitude: Math.max(-1, Math.min(1, normal.dot(majorDir))),
					baseSinLatitude: Math.max(-1, Math.min(1, normal.z)),
					kind: "torus",
					majorRadius: shellRadius,
					minorRadius: shellTube + offset,
				}
			} else {
				// Для сферы строим локальные параллели/меридианы относительно мировой оси Z.
				normal.copy(cameraPos).sub(reusableWorldPosition).normalize()
				labelPos.copy(reusableWorldPosition).add(
					reusableScaledOffset.copy(normal).multiplyScalar(sphereRadius + offset),
				)
				
				right.set(0, 0, 1).cross(normal)
				if (right.length() < 1e-6) right.set(1, 0, 0).cross(normal)
				right.normalize()

				projection = {
					baseCosLatitude: Math.max(0, Math.hypot(normal.x, normal.y)),
					baseSinLatitude: Math.max(-1, Math.min(1, normal.z)),
					kind: "sphere",
					radius: sphereRadius + offset,
				}
			}

			// Вектор "вверх" (перпендикулярен нормали и направлению "вправо")
			const up = reusableLabelUp.crossVectors(normal, right).normalize()

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

			applySurfaceLabelProjection(
				tracker.textNode,
				tracker.initialStencilPositions,
				tracker.initialCoverPositions,
				tracker.stencilCenter,
				tracker.coverCenter,
				tracker.maxTextWidth,
				projection,
			)

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

	const calculateActiveDepth = (): number => {
		const cameraPos = viewPoint.position
		let bestDepth = -1

		for (const record of shellRecords.values()) {
			const dist = cameraPos.distanceTo(record.pickTarget.center)
			if (dist < record.pickTarget.outerRadius * 1.3) {
				bestDepth = Math.max(bestDepth, record.snapshot.depth)
			}
		}

		return bestDepth
	}

	const animate = (timestamp: number): void => {
		if (disposed) return
		frameHandle = 0
		const deltaMs = lastAnimationTimestamp > 0 ? timestamp - lastAnimationTimestamp : 16
		lastAnimationTimestamp = timestamp

		const hasPendingMotion = updateAnimatedRecords(deltaMs)
		updateSceneWorldState()
		applyNavigationFrame(deltaMs)

		const nextBaseDepth = calculateActiveDepth()
		if (nextBaseDepth !== activeRenderSettings.baseDepth) {
			activeRenderSettings.baseDepth = nextBaseDepth
			syncLabelRecords()
		}

		updateLabelTrackers()
		scene.updateWorldMatrix()
		renderer.render(scene, viewPoint)
		if (navigationState || hasPendingMotion || timestamp < renderWakeUntilMs) {
			frameHandle = requestAnimationFrame(animate)
		}
	}

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
			viewPoint.dispose()
		},
		handleProtocol(_channel: string, _message: unknown) {
			return
		},
		setLayoutSettings(settings: Partial<AppWebLayoutSettings>) {
			activeLayoutSettings = normalizeAppWebLayoutSettings({
				...activeLayoutSettings,
				...settings,
			})
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			refreshSceneForSettings()
		},
		setRenderSettings(settings: Partial<AppWebRenderSettings>) {
			const nextBaseDepth = settings.baseDepth !== undefined ? settings.baseDepth : activeRenderSettings.baseDepth
			activeRenderSettings = normalizeAppWebRenderSettings({
				...activeRenderSettings,
				...settings,
				baseDepth: nextBaseDepth,
			})
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			refreshSceneForSettings()
		},
		setSize(width: number, height: number) {
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
			requestRenderLoop(INPUT_RENDER_WAKE_MS)
		},
		setSnapshot(nextSnapshot: DbWorldSnapshot) {
			applySnapshotToScene(nextSnapshot)
		},
	}
}
