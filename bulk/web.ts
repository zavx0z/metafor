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
	BufferAttribute,
	BufferGeometry,
	Color,
	AxesHelper,
	GridHelper,
	LineGlowMaterial,
	LineSegments,
	Object3D,
	Renderer,
	Scene,
	SphereGeometry,
	Text,
	TextMaterial,
	TrueTypeFont,
	Vector3,
	ViewPoint,
} from "@metafor/engine"

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
const TORUS_BASE_DETAIL_SIZE = 500
const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_DETAIL_SIZE = 100
const SPHERE_BASE_WIDTH_SEGMENTS = 8
const SPHERE_BASE_HEIGHT_SEGMENTS = 6
const SPHERE_MAX_WIDTH_SEGMENTS = 64
const SPHERE_MAX_HEIGHT_SEGMENTS = 48

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()
let activeLayoutSettings: AppWebLayoutSettings = { ...DEFAULT_APP_WEB_LAYOUT_SETTINGS }
let activeRenderSettings: AppWebRenderSettings = { ...DEFAULT_APP_WEB_RENDER_SETTINGS }

type SurfaceLabelTracker = {
	labelNode: Object3D
	localX: number
	localY: number
}

const getViewportConfig = () => appWebLayoutConfig.viewport
const getShellFallback = () => getViewportConfig().shellFallbackMm
const getWorkspaceBaseZ = (): number => getViewportConfig().levelsMm.elbow
const getFloorZ = (): number => getViewportConfig().levelsMm.floor

const getDepthDetailMultiplier = (depth: number): number => {
	if (!Number.isFinite(depth) || depth <= 0) return 1
	return 1 / Math.pow(activeRenderSettings.detailLevelMultiplier, depth)
}

const getLabelFontSizeMm = (depth: number): number => {
	if (!Number.isFinite(depth) || depth <= 0) return activeRenderSettings.labelFontSizeMm
	return Math.max(
		1,
		activeRenderSettings.labelFontSizeMm / Math.pow(activeLayoutSettings.levelSizeMultiplier, depth),
	)
}

const isLabelDepthVisible = (depth: number): boolean => depth + 1 <= activeRenderSettings.labelVisibleLevels

const getTorusDetail = (
	_radius: number,
	_tube: number,
	depth: number,
): { radialSegments: number; tubularSegments: number } => {
	const multiplier = activeRenderSettings.detailDensityFactor * getDepthDetailMultiplier(depth)
	return {
		radialSegments: Math.max(
			3,
			Math.round(
				Math.min(activeRenderSettings.torusRadialSegments * multiplier, TORUS_MAX_SEGMENTS),
			),
		),
		tubularSegments: Math.max(
			3,
			Math.round(
				Math.min(activeRenderSettings.torusTubularSegments * multiplier, TORUS_MAX_SEGMENTS),
			),
		),
	}
}

const getSphereDetail = (_radius: number, depth: number): { widthSegments: number; heightSegments: number } => {
	const multiplier = activeRenderSettings.detailDensityFactor * getDepthDetailMultiplier(depth)
	return {
		widthSegments: Math.max(
			3,
			Math.round(
				Math.min(SPHERE_BASE_WIDTH_SEGMENTS * multiplier, SPHERE_MAX_WIDTH_SEGMENTS),
			),
		),
		heightSegments: Math.max(
			2,
			Math.round(
				Math.min(SPHERE_BASE_HEIGHT_SEGMENTS * multiplier, SPHERE_MAX_HEIGHT_SEGMENTS),
			),
		),
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

const wrapTextGeometryAroundEquator = (geometry: BufferGeometry, curveRadius: number): void => {
	const positions = getGeometryPositionArray(geometry)
	if (!positions || positions.length === 0) return

	let minX = Number.POSITIVE_INFINITY
	let maxX = Number.NEGATIVE_INFINITY
	let minY = Number.POSITIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY

	for (let index = 0; index < positions.length; index += 3) {
		const x = positions[index] ?? 0
		const y = positions[index + 1] ?? 0
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}

	const centerX = (minX + maxX) / 2
	const centerY = (minY + maxY) / 2
	const safeRadius = Math.max(curveRadius, 1)

	for (let index = 0; index < positions.length; index += 3) {
		const arcOffset = (positions[index] ?? 0) - centerX
		const verticalOffset = (positions[index + 1] ?? 0) - centerY
		const angle = arcOffset / safeRadius

		positions[index] = Math.cos(angle) * safeRadius
		positions[index + 1] = Math.sin(angle) * safeRadius
		positions[index + 2] = verticalOffset
	}
}

const createSurfaceLabelNode = (
	text: string,
	font: TrueTypeFont,
	depth: number,
	curveRadius: number,
	color: Color,
): Object3D => {
	const label = new Text(
		text,
		font,
		getLabelFontSizeMm(depth),
		new TextMaterial({ color: color.clone() }),
	)
	wrapTextGeometryAroundEquator(label.stencilGeometry, curveRadius)
	wrapTextGeometryAroundEquator(label.coverGeometry, curveRadius)
	label.frustumCulled = false
	label.updateMatrix()

	const container = new Object3D()
	container.add(label)
	container.updateMatrix()
	return container
}

const createWireframeGeometry = (geometry: BufferGeometry): BufferGeometry => {
	const indices = geometry.index?.array
	const positions = geometry.attributes.position?.array
	if (!indices || !positions) {
		throw new Error("Wireframe geometry requires indexed position data")
	}

	const lines: number[] = []
	for (let i = 0; i < indices.length; i += 3) {
		const a = Number(indices[i]!) * 3
		const b = Number(indices[i + 1]!) * 3
		const c = Number(indices[i + 2]!) * 3

		lines.push(positions[a]!, positions[a + 1]!, positions[a + 2]!)
		lines.push(positions[b]!, positions[b + 1]!, positions[b + 2]!)
		lines.push(positions[b]!, positions[b + 1]!, positions[b + 2]!)
		lines.push(positions[c]!, positions[c + 1]!, positions[c + 2]!)
		lines.push(positions[c]!, positions[c + 1]!, positions[c + 2]!)
		lines.push(positions[a]!, positions[a + 1]!, positions[a + 2]!)
	}

	const wireframeGeometry = new BufferGeometry()
	wireframeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3))
	return wireframeGeometry
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
		(radialSegments * activeLayoutSettings.torusCrossRingRotationDeg) / 360,
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
	const key = `${radius}:${tube}:${detail.radialSegments}:${detail.tubularSegments}:${activeLayoutSettings.torusCrossRingRotationDeg}`
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

	const wireframe = createWireframeGeometry(
		new SphereGeometry({
			radius,
			widthSegments: detail.widthSegments,
			heightSegments: detail.heightSegments,
		}),
	)
	sphereWireframeCache.set(key, wireframe)
	return wireframe
}

const createShellMaterial = (shell: DbParticleShellSnapshot): LineGlowMaterial =>
	new LineGlowMaterial({
		color: THEME_PRIMARY.clone(),
		glowIntensity: shell.kind === "wimp" ? 1.4 : 1.15,
		glowColor: THEME_PRIMARY_GLOW.clone(),
		opacity: 0.9,
	})

const createFieldMaterial = (orbit: DbFieldOrbitSnapshot): LineGlowMaterial => {
	const theme = getFieldThemeColor(orbit.fieldValueKind)
	return new LineGlowMaterial({
		color: theme.color.clone(),
		glowIntensity: 1,
		glowColor: theme.glowColor.clone(),
		opacity: 0.85,
	})
}

type SceneBuildContext = {
	childrenByParentId: Map<string | null, DbParticleShellSnapshot[]>
	fieldsByParticleId: Map<string, DbFieldOrbitSnapshot[]>
	font: TrueTypeFont | null
	labelTrackers: SurfaceLabelTracker[]
	workspace: Object3D
}

const attachFieldLabel = (
	context: SceneBuildContext,
	orbit: DbFieldOrbitSnapshot,
	orbitDepth: number,
	absoluteX: number,
	absoluteY: number,
	absoluteZ: number,
): void => {
	if (!context.font) return
	if (!isLabelDepthVisible(orbitDepth)) return

	const labelText = normalizeLabelText(orbit.fieldLabel) ?? normalizeLabelText(orbit.fieldKey)
	if (!labelText) return

	const theme = getFieldThemeColor(orbit.fieldValueKind)
	const surfaceAnchorRadiusMm = orbit.sphereRadius + activeRenderSettings.labelSurfaceOffsetMm
	const labelNode = createSurfaceLabelNode(
		labelText,
		context.font,
		orbitDepth,
		surfaceAnchorRadiusMm,
		theme.color,
	)
	labelNode.position.set(absoluteX, absoluteY, absoluteZ)
	labelNode.frustumCulled = false
	labelNode.updateMatrix()
	context.workspace.add(labelNode)
	context.labelTrackers.push({
		labelNode,
		localX: absoluteX,
		localY: absoluteY,
	})
}

const createFieldNode = (
	orbit: DbFieldOrbitSnapshot,
	depth: number,
	absoluteX: number,
	absoluteY: number,
	absoluteZ: number,
	context: SceneBuildContext,
): LineSegments => {
	const sphere = new LineSegments(
		getSphereWireframeGeometry(orbit.sphereRadius, depth),
		createFieldMaterial(orbit),
	)
	sphere.position.set(orbit.localX, orbit.localY, orbit.localZ)
	sphere.updateMatrix()
	attachFieldLabel(context, orbit, depth, absoluteX, absoluteY, absoluteZ)
	return sphere
}

const attachShellLabel = (
	context: SceneBuildContext,
	shell: DbParticleShellSnapshot,
	absoluteX: number,
	absoluteY: number,
	absoluteZ: number,
): void => {
	if (!context.font) return
	if (!isLabelDepthVisible(shell.depth)) return

	const labelText = normalizeLabelText(shell.label)
	if (!labelText) return

	const surfaceAnchorRadiusMm =
		shell.shellRadius + shell.shellTube + activeRenderSettings.labelSurfaceOffsetMm
	const labelNode = createSurfaceLabelNode(
		labelText,
		context.font,
		shell.depth,
		surfaceAnchorRadiusMm,
		THEME_PRIMARY,
	)
	labelNode.position.set(absoluteX, absoluteY, absoluteZ)
	labelNode.frustumCulled = false
	labelNode.updateMatrix()
	context.workspace.add(labelNode)
	context.labelTrackers.push({
		labelNode,
		localX: absoluteX,
		localY: absoluteY,
	})
}

const createShellNode = (
	shell: DbParticleShellSnapshot,
	context: SceneBuildContext,
	parentX: number,
	parentY: number,
	parentZ: number,
): Object3D => {
	const absoluteX = parentX + shell.localX
	const absoluteY = parentY + shell.localY
	const absoluteZ = parentZ + shell.localZ
	const container = new Object3D()
	container.position.set(shell.localX, shell.localY, shell.localZ)
	container.scale.set(shell.shellScale, shell.shellScale, shell.shellScale)
	container.updateMatrix()

	const torus = new LineSegments(
		getTorusWireframeGeometry(
			shell.shellRadius || getShellFallback().radius,
			shell.shellTube || getShellFallback().tube,
			shell.depth,
		),
		createShellMaterial(shell),
	)
	torus.updateMatrix()
	container.add(torus)
	attachShellLabel(context, shell, absoluteX, absoluteY, absoluteZ)

	for (const field of context.fieldsByParticleId.get(shell.particleId) ?? []) {
		container.add(createFieldNode(field, shell.depth + 1, absoluteX + field.localX, absoluteY + field.localY, absoluteZ + field.localZ, context))
	}

	for (const child of context.childrenByParentId.get(shell.particleId) ?? []) {
		container.add(createShellNode(child, context, absoluteX, absoluteY, absoluteZ))
	}

	return container
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

const createWorkspaceAxes = (): AxesHelper => {
	const axes = new AxesHelper(getViewportConfig().axesSizeMm)
	axes.position.z = getWorkspaceBaseZ()
	axes.frustumCulled = false
	axes.updateMatrix()
	return axes
}

type SceneBuildResult = {
	labelTrackers: SurfaceLabelTracker[]
	scene: Scene
	workspace: Object3D | null
}

const createSceneFromSnapshot = (snapshot: DbWorldSnapshot, font: TrueTypeFont | null): SceneBuildResult => {
	const nextScene = new Scene()
	nextScene.background = ROOT_BACKGROUND.clone()

	const childrenByParentId = new Map<string | null, DbParticleShellSnapshot[]>()
	const fieldsByParticleId = new Map<string, DbFieldOrbitSnapshot[]>()

	for (const shell of snapshot.particles) {
		const children = childrenByParentId.get(shell.parentParticleId) ?? []
		children.push(shell)
		childrenByParentId.set(shell.parentParticleId, children)
	}

	for (const group of childrenByParentId.values()) {
		group.sort((left, right) => left.shellOrder - right.shellOrder || left.particleId.localeCompare(right.particleId))
	}

	for (const orbit of snapshot.fields) {
		const fields = fieldsByParticleId.get(orbit.particleId) ?? []
		fields.push(orbit)
		fieldsByParticleId.set(orbit.particleId, fields)
	}

	for (const group of fieldsByParticleId.values()) {
		group.sort((left, right) => left.fieldOrder - right.fieldOrder || left.id.localeCompare(right.id))
	}

	const workspace = new Object3D()
	workspace.position.set(0, 0, getWorkspaceBaseZ())
	workspace.updateMatrix()
	const labelTrackers: SurfaceLabelTracker[] = []
	const buildContext: SceneBuildContext = {
		childrenByParentId,
		fieldsByParticleId,
		font,
		labelTrackers,
		workspace,
	}

	for (const root of childrenByParentId.get(null) ?? []) {
		workspace.add(createShellNode(root, buildContext, 0, 0, 0))
	}

	nextScene.add(createWorkspaceGrid())
	nextScene.add(createWorkspaceAxes())
	nextScene.add(workspace)

	return { scene: nextScene, labelTrackers, workspace }
}

const createEmptyScene = (): SceneBuildResult => {
	const nextScene = new Scene()
	nextScene.background = ROOT_BACKGROUND.clone()
	nextScene.add(createWorkspaceGrid())
	nextScene.add(createWorkspaceAxes())
	return { scene: nextScene, labelTrackers: [], workspace: null }
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

	let sceneState = createEmptyScene()
	let scene = sceneState.scene
	let labelTrackers = sceneState.labelTrackers
	let workspace = sceneState.workspace
	let snapshot: DbWorldSnapshot | null = null
	const viewportConfig = getViewportConfig()

	const viewPoint = new ViewPoint({
		element: options.canvas,
		fov: viewportConfig.camera.fovRad,
		near: viewportConfig.camera.near,
		far: viewportConfig.camera.far,
		position: viewportConfig.camera.position,
		target: viewportConfig.camera.target,
	})
	viewPoint.setAspectRatio(options.width / options.height)

	const rebuildScene = (): void => {
		sceneState = snapshot ? createSceneFromSnapshot(snapshot, labelFont) : createEmptyScene()
		scene = sceneState.scene
		labelTrackers = sceneState.labelTrackers
		workspace = sceneState.workspace
		scene.updateWorldMatrix()
	}

	const updateLabelTrackers = (): void => {
		if (!workspace) return
		const cameraLocal = new Vector3(
			viewPoint.position.x - workspace.position.x,
			viewPoint.position.y - workspace.position.y,
			viewPoint.position.z - workspace.position.z,
		)
		for (const tracker of labelTrackers) {
			const deltaX = cameraLocal.x - tracker.localX
			const deltaY = cameraLocal.y - tracker.localY
			if (Math.hypot(deltaX, deltaY) <= 1e-6) continue
			tracker.labelNode.rotation.z = Math.atan2(deltaY, deltaX)
			tracker.labelNode.updateMatrix()
		}
	}

	let disposed = false
	let frameHandle = 0

	const animate = (): void => {
		if (disposed) return
		frameHandle = requestAnimationFrame(animate)
		updateLabelTrackers()
		scene.updateWorldMatrix()
		renderer.render(scene, viewPoint)
	}

	animate()

	return {
		dispose() {
			disposed = true
			cancelAnimationFrame(frameHandle)
			viewPoint.dispose()
		},
		handleProtocol(_channel: string, _message: unknown) {
			return
		},
		setLayoutSettings(settings: Partial<AppWebLayoutSettings>) {
			activeLayoutSettings = normalizeAppWebLayoutSettings(settings)
			torusWireframeCache.clear()
			rebuildScene()
		},
		setRenderSettings(settings: Partial<AppWebRenderSettings>) {
			activeRenderSettings = normalizeAppWebRenderSettings(settings)
			torusWireframeCache.clear()
			sphereWireframeCache.clear()
			rebuildScene()
		},
		setSize(width: number, height: number) {
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
		},
		setSnapshot(nextSnapshot: DbWorldSnapshot) {
			snapshot = nextSnapshot
			rebuildScene()
			options.onStats?.({
				rootSrc: nextSnapshot.rootSrc,
				shellCount: nextSnapshot.particles.length,
				fieldCount: nextSnapshot.fields.length,
			})
		},
	}
}
