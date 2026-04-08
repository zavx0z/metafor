import type { DbFieldOrbitSnapshot, DbParticleShellSnapshot, DbWorldSnapshot } from "../pkg/db/index.ts"
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	GridHelper,
	LineGlowMaterial,
	LineSegments,
	Object3D,
	Renderer,
	Scene,
	SphereGeometry,
	TorusGeometry,
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
const TORUS_RADIUS = 0.2
const TORUS_TUBE = 0.14
const GRID_SIZE = 8
const GRID_DIVISIONS = 16
const VIEWPOINT_POSITION = { x: 2, y: -1.5, z: 1.5 }
const VIEWPOINT_TARGET = { x: 0, y: 0, z: 1 }
const GRID_CENTER_COLOR = 0x444444
const GRID_COLOR = 0x888888
const WORKSPACE_BASE_Z = 1

const torusWireframeCache = new Map<string, BufferGeometry>()
const sphereWireframeCache = new Map<string, BufferGeometry>()

const createColor = (r: number, g: number, b: number): Color => new Color(r, g, b)

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

const getTorusWireframeGeometry = (radius: number, tube: number): BufferGeometry => {
	const key = `${radius}:${tube}`
	const cached = torusWireframeCache.get(key)
	if (cached) return cached

	const wireframe = createWireframeGeometry(
		new TorusGeometry({
			radius,
			tube,
		}),
	)
	torusWireframeCache.set(key, wireframe)
	return wireframe
}

const getSphereWireframeGeometry = (radius: number): BufferGeometry => {
	const key = String(radius)
	const cached = sphereWireframeCache.get(key)
	if (cached) return cached

	const wireframe = createWireframeGeometry(
		new SphereGeometry({
			radius,
		}),
	)
	sphereWireframeCache.set(key, wireframe)
	return wireframe
}

const createShellMaterial = (shell: DbParticleShellSnapshot): LineGlowMaterial =>
	new LineGlowMaterial({
		color: createColor(shell.colorR, shell.colorG, shell.colorB),
		glowIntensity: shell.kind === "wimp" ? 1.4 : 1.15,
		glowColor: new Color(1, 1, 1, 0.12),
		opacity: 0.9,
	})

const createFieldMaterial = (orbit: DbFieldOrbitSnapshot): LineGlowMaterial =>
	new LineGlowMaterial({
		color: createColor(orbit.colorR, orbit.colorG, orbit.colorB),
		glowIntensity: 1,
		glowColor: new Color(1, 1, 1, 0.1),
		opacity: 0.85,
	})

const createFieldNode = (orbit: DbFieldOrbitSnapshot): LineSegments => {
	const sphere = new LineSegments(
		getSphereWireframeGeometry(orbit.sphereRadius),
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
		getTorusWireframeGeometry(shell.shellRadius || TORUS_RADIUS, shell.shellTube || TORUS_TUBE),
		createShellMaterial(shell),
	)
	torus.updateMatrix()
	container.add(torus)

	for (const field of fieldsByParticleId.get(shell.particleId) ?? []) {
		container.add(createFieldNode(field))
	}

	for (const child of childrenByParentId.get(shell.particleId) ?? []) {
		container.add(createShellNode(child, childrenByParentId, fieldsByParticleId))
	}

	return container
}

const createWorkspaceGrid = (): GridHelper => {
	const grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_CENTER_COLOR, GRID_COLOR)
	grid.updateMatrix()
	return grid
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
	nextScene.add(workspace)

	return nextScene
}

const createEmptyScene = (): Scene => {
	const nextScene = new Scene()
	nextScene.background = ROOT_BACKGROUND.clone()
	nextScene.add(createWorkspaceGrid())
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

	let scene = createEmptyScene()

	const viewPoint = new ViewPoint({
		element: options.canvas,
		fov: (2 * Math.PI) / 5,
		near: 0.1,
		far: 100,
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
		setSize(width: number, height: number) {
			renderer.setPixelRatio(window.devicePixelRatio || 1)
			renderer.setSize(width, height)
			viewPoint.setAspectRatio(width / height)
		},
		setSnapshot(snapshot: DbWorldSnapshot) {
			scene = createSceneFromSnapshot(snapshot)
			scene.updateWorldMatrix()
			options.onStats?.({
				rootSrc: snapshot.rootSrc,
				shellCount: snapshot.particles.length,
				fieldCount: snapshot.fields.length,
			})
		},
	}
}
