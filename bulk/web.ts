import type { DbFieldOrbitSnapshot, DbFieldValueKind, DbParticleShellSnapshot, DbWorldSnapshot } from "../pkg/db/index.ts"
import {
	DEFAULT_APP_WEB_RENDER_SETTINGS,
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
	ViewPoint,
} from "@metafor/engine"

export interface BulkViewportStats {
	fieldCount: number
	rootSrc?: string
	shellCount: number
}

export interface BulkViewportController {
	dispose(): void
	handleProtocol(_channel: string, _message: unknown): void
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

// Engine contract for MetaFor visualization: Z-up, 1 world unit = 1 mm.
const ROOT_BACKGROUND = new Color(0.035, 0.05, 0.075)
const TORUS_RADIUS = 200
const TORUS_TUBE = 140
const GRID_SIZE = 8000
const GRID_DIVISIONS = 16
const AXES_SIZE = 1000
const FLOOR_Z_MM = 0
const ELBOW_Z_MM = 1100
const EYE_Z_MM = 1650
const VIEWPOINT_POSITION = { x: 3975.6752784123818, y: -2981.756458809286, z: EYE_Z_MM }
const VIEWPOINT_TARGET = { x: 0, y: 0, z: ELBOW_Z_MM }
const GRID_CENTER_COLOR = 0x444444
const GRID_COLOR = 0x888888
const WORKSPACE_BASE_Z = ELBOW_Z_MM
const THEME_PRIMARY = new Color(135 / 255, 206 / 255, 235 / 255)
const THEME_PRIMARY_GLOW = new Color(225 / 255, 243 / 255, 250 / 255, 0.14)
const THEME_SECONDARY = new Color(71 / 255, 189 / 255, 116 / 255)
const THEME_SECONDARY_GLOW = new Color(209 / 255, 239 / 255, 220 / 255, 0.12)
const THEME_TERTIARY = new Color(191 / 255, 200 / 255, 209 / 255)
const THEME_TERTIARY_GLOW = new Color(229 / 255, 233 / 255, 237 / 255, 0.12)
const THEME_WARNING = new Color(255 / 255, 209 / 255, 117 / 255)
const THEME_WARNING_GLOW = new Color(255 / 255, 244 / 255, 221 / 255, 0.12)
const TORUS_BASE_DETAIL_SIZE = 500
const TORUS_BASE_RADIAL_SEGMENTS = 12
const TORUS_BASE_TUBULAR_SEGMENTS = 12
const TORUS_MAX_SEGMENTS = 96
const SPHERE_BASE_DETAIL_SIZE = 100
const SPHERE_BASE_WIDTH_SEGMENTS = 8
const SPHERE_BASE_HEIGHT_SEGMENTS = 6
const SPHERE_MAX_WIDTH_SEGMENTS = 64
const SPHERE_MAX_HEIGHT_SEGMENTS = 48

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()
let activeRenderSettings: AppWebRenderSettings = { ...DEFAULT_APP_WEB_RENDER_SETTINGS }

const getDepthDetailMultiplier = (depth: number): number => {
	if (!Number.isFinite(depth) || depth <= 0) return 1
	return 1 / Math.pow(activeRenderSettings.detailLevelMultiplier, depth)
}

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
				Math.min(TORUS_BASE_RADIAL_SEGMENTS * multiplier, TORUS_MAX_SEGMENTS),
			),
		),
		tubularSegments: Math.max(
			3,
			Math.round(
				Math.min(TORUS_BASE_TUBULAR_SEGMENTS * multiplier, TORUS_MAX_SEGMENTS),
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

const createQuadTorusWireframeGeometry = (
	radius: number,
	tube: number,
	radialSegments: number,
	tubularSegments: number,
): BufferGeometry => {
	const positions: number[] = []
	for (let j = 0; j <= radialSegments; j += 1) {
		for (let i = 0; i <= tubularSegments; i += 1) {
			const u = (i / tubularSegments) * Math.PI * 2
			const v = (j / radialSegments) * Math.PI * 2
			const x = (radius + tube * Math.cos(v)) * Math.cos(u)
			const y = (radius + tube * Math.cos(v)) * Math.sin(u)
			const z = tube * Math.sin(v)
			positions.push(x, y, z)
		}
	}

	const rowSize = tubularSegments + 1
	const lines: number[] = []
	const pushVertex = (index: number): void => {
		const offset = index * 3
		lines.push(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!)
	}

	for (let j = 0; j <= radialSegments; j += 1) {
		for (let i = 0; i < tubularSegments; i += 1) {
			const a = j * rowSize + i
			const b = a + 1
			pushVertex(a)
			pushVertex(b)
		}
	}

	for (let j = 0; j < radialSegments; j += 1) {
		for (let i = 0; i <= tubularSegments; i += 1) {
			const a = j * rowSize + i
			const b = a + rowSize
			pushVertex(a)
			pushVertex(b)
		}
	}

	const wireframeGeometry = new BufferGeometry()
	wireframeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(lines), 3))
	return wireframeGeometry
}

const getTorusWireframeGeometry = (radius: number, tube: number, depth: number): BufferGeometry => {
	const detail = getTorusDetail(radius, tube, depth)
	const key = `${radius}:${tube}:${detail.radialSegments}:${detail.tubularSegments}`
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

const createFieldNode = (orbit: DbFieldOrbitSnapshot, depth: number): LineSegments => {
	const sphere = new LineSegments(
		getSphereWireframeGeometry(orbit.sphereRadius, depth),
		createFieldMaterial(orbit),
	)
	sphere.position.set(orbit.localX, orbit.localY, orbit.localZ)
	sphere.updateMatrix()
	return sphere
}

const createShellNode = (
	shell: DbParticleShellSnapshot,
	childrenByParentId: Map<string | null, DbParticleShellSnapshot[]>,
	fieldsByParticleId: Map<string, DbFieldOrbitSnapshot[]>,
): Object3D => {
	const container = new Object3D()
	container.position.set(shell.localX, shell.localY, shell.localZ)
	container.scale.set(shell.shellScale, shell.shellScale, shell.shellScale)
	container.updateMatrix()

	const torus = new LineSegments(
		getTorusWireframeGeometry(shell.shellRadius || TORUS_RADIUS, shell.shellTube || TORUS_TUBE, shell.depth),
		createShellMaterial(shell),
	)
	torus.updateMatrix()
	container.add(torus)

	for (const field of fieldsByParticleId.get(shell.particleId) ?? []) {
		container.add(createFieldNode(field, shell.depth + 1))
	}

	for (const child of childrenByParentId.get(shell.particleId) ?? []) {
		container.add(createShellNode(child, childrenByParentId, fieldsByParticleId))
	}

	return container
}

const createWorkspaceGrid = (): GridHelper => {
	const grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_COLOR)
	grid.position.z = FLOOR_Z_MM
	grid.frustumCulled = false
	grid.updateMatrix()
	return grid
}

const createWorkspaceAxes = (): AxesHelper => {
	const axes = new AxesHelper(AXES_SIZE)
	axes.position.z = WORKSPACE_BASE_Z
	axes.frustumCulled = false
	axes.updateMatrix()
	return axes
}

const createSceneFromSnapshot = (snapshot: DbWorldSnapshot): Scene => {
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
	workspace.position.set(0, 0, WORKSPACE_BASE_Z)
	workspace.updateMatrix()

	for (const root of childrenByParentId.get(null) ?? []) {
		workspace.add(createShellNode(root, childrenByParentId, fieldsByParticleId))
	}

	nextScene.add(createWorkspaceGrid())
	nextScene.add(createWorkspaceAxes())
	nextScene.add(workspace)

	return nextScene
}

const createEmptyScene = (): Scene => {
	const nextScene = new Scene()
	nextScene.background = ROOT_BACKGROUND.clone()
	nextScene.add(createWorkspaceGrid())
	nextScene.add(createWorkspaceAxes())
	return nextScene
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

	let scene = createEmptyScene()
	let snapshot: DbWorldSnapshot | null = null

	const viewPoint = new ViewPoint({
		element: options.canvas,
		fov: (2 * Math.PI) / 5,
		near: 10,
		far: 100000,
		position: VIEWPOINT_POSITION,
		target: VIEWPOINT_TARGET,
	})
	viewPoint.setAspectRatio(options.width / options.height)

	let disposed = false
	let frameHandle = 0

	const animate = (): void => {
		if (disposed) return
		frameHandle = requestAnimationFrame(animate)
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
		setRenderSettings(settings: Partial<AppWebRenderSettings>) {
			activeRenderSettings = normalizeAppWebRenderSettings(settings)
			if (snapshot) {
				scene = createSceneFromSnapshot(snapshot)
				scene.updateWorldMatrix()
			}
		},
		setSize(width: number, height: number) {
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
		},
		setSnapshot(nextSnapshot: DbWorldSnapshot) {
			snapshot = nextSnapshot
			scene = createSceneFromSnapshot(nextSnapshot)
			scene.updateWorldMatrix()
			options.onStats?.({
				rootSrc: nextSnapshot.rootSrc,
				shellCount: nextSnapshot.particles.length,
				fieldCount: nextSnapshot.fields.length,
			})
		},
	}
}
