import {
	Color,
	Mesh,
	MeshBasicMaterial,
	Scene,
	SphereGeometry,
	TorusGeometry,
	Vector3,
	ViewPoint,
	WebGPURenderer,
} from "../vendor/web-gpu-engine/src/WebGPUEngine.ts"

type BulkWorkerInitMessage = {
	type: "init"
	canvas: OffscreenCanvas
	width: number
	height: number
}

type BulkWorkerResizeMessage = {
	type: "resize"
	width: number
	height: number
}

type BulkWorkerProtocolMessage = {
	type: "protocol"
	channel: string
	message: unknown
}

type BulkWorkerMessage = BulkWorkerInitMessage | BulkWorkerResizeMessage | BulkWorkerProtocolMessage

type BulkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<BulkWorkerMessage>) => void) | null
	postMessage(message: unknown): void
	requestAnimationFrame?: (callback: FrameRequestCallback) => number
	cancelAnimationFrame?: (handle: number) => void
}

const bulkWorker = globalThis as BulkWorkerScope
const requestNextFrame =
	typeof bulkWorker.requestAnimationFrame === "function"
		? bulkWorker.requestAnimationFrame.bind(bulkWorker)
		: (callback: FrameRequestCallback) =>
				setTimeout(() => callback(performance.now()), 16) as unknown as number
const cancelNextFrame =
	typeof bulkWorker.cancelAnimationFrame === "function"
		? bulkWorker.cancelAnimationFrame.bind(bulkWorker)
		: (handle: number) => clearTimeout(handle)

let renderer: WebGPURenderer | null = null
let scene: Scene | null = null
let viewPoint: ViewPoint | null = null
let torus: Mesh | null = null
let sphereAlpha: Mesh | null = null
let sphereBeta: Mesh | null = null
let logicalWidth = 1
let logicalHeight = 1
let gravityExcitation = 0
let gravityAddCount = 0
let torusMaterial: MeshBasicMaterial | null = null
let sphereAlphaMaterial: MeshBasicMaterial | null = null
let sphereBetaMaterial: MeshBasicMaterial | null = null

const TORUS_RADIUS = 0.2
const TORUS_TUBE = 0.14
const SPHERE_RADIUS = 0.14
const TORUS_CENTER_Z = 1

const rgbaColor = (r: number, g: number, b: number, a: number): Color =>
	new Color((r / 255) * a, (g / 255) * a, (b / 255) * a)

const blendColor = (base: Color, highlight: Color, t: number): Color =>
	new Color(
		base.r + (highlight.r - base.r) * t,
		base.g + (highlight.g - base.g) * t,
		base.b + (highlight.b - base.b) * t,
	)

const updateSize = (width: number, height: number): void => {
	logicalWidth = Math.max(1, Math.floor(width))
	logicalHeight = Math.max(1, Math.floor(height))

	if (!renderer || !viewPoint) return

	renderer.setSize(logicalWidth, logicalHeight)
	viewPoint.setAspectRatio(logicalWidth / logicalHeight)
	renderScene()
}

const renderScene = (): void => {
	if (!renderer || !scene || !viewPoint || !torus || !sphereAlpha || !sphereBeta) return
	torus.updateMatrix()
	sphereAlpha.updateMatrix()
	sphereBeta.updateMatrix()
	renderer.render(scene, viewPoint)
}

const handleProtocol = (message: unknown): void => {
	if (!message || typeof message !== "object") return
	const patches = (message as { patches?: unknown }).patches
	if (!Array.isArray(patches)) return

	const addCount = patches.filter(
		(patch) =>
			patch &&
			typeof patch === "object" &&
			(patch as { op?: unknown }).op === "add" &&
			typeof (patch as { path?: unknown }).path === "string",
	).length

	if (addCount === 0) return

	gravityAddCount += addCount
	gravityExcitation = Math.min(gravityExcitation + addCount * 1.5, 24)
	if (torusMaterial && sphereAlphaMaterial && sphereBetaMaterial) {
		const heat = Math.min(1, gravityExcitation / 12)
		torusMaterial.color = blendColor(rgbaColor(104, 109, 251, 0.54), rgbaColor(255, 189, 115, 0.72), heat)
		sphereAlphaMaterial.color = blendColor(rgbaColor(252, 70, 70, 0.8), rgbaColor(255, 230, 138, 0.9), heat)
		sphereBetaMaterial.color = blendColor(rgbaColor(70, 252, 70, 0.8), rgbaColor(114, 219, 255, 0.9), heat)
		renderScene()
	}

	bulkWorker.postMessage({
		type: "bulk-stats",
		gravityAddCount,
	})
}

const initRenderer = async (message: BulkWorkerInitMessage): Promise<void> => {
	renderer = new WebGPURenderer()
	await renderer.init({ canvas: message.canvas })
	if (!renderer.canvas) {
		throw new Error("Не удалось инициализировать WebGPU canvas в bulk worker")
	}

	renderer.setSize(message.width, message.height)
	scene = new Scene()
	scene.background = new Color(0.1, 0.1, 0.1)
	viewPoint = new ViewPoint({
		element: renderer.canvas,
		fov: (2 * Math.PI) / 5,
		near: 0.1,
		far: 1000,
	})
	viewPoint.setAspectRatio(message.width / message.height)

	torusMaterial = new MeshBasicMaterial({
		color: rgbaColor(104, 109, 251, 0.54),
		wireframe: true,
	})
	torus = new Mesh(
		new TorusGeometry({ radius: TORUS_RADIUS, tube: TORUS_TUBE }),
		torusMaterial,
	)
	torus.position.set(0, 0, TORUS_CENTER_Z)

	sphereAlphaMaterial = new MeshBasicMaterial({
		color: rgbaColor(252, 70, 70, 0.8),
		wireframe: true,
	})
	sphereAlpha = new Mesh(
		new SphereGeometry({ radius: SPHERE_RADIUS }),
		sphereAlphaMaterial,
	)
	sphereAlpha.position.set(TORUS_RADIUS, 0, TORUS_CENTER_Z)

	sphereBetaMaterial = new MeshBasicMaterial({
		color: rgbaColor(70, 252, 70, 0.8),
		wireframe: true,
	})
	sphereBeta = new Mesh(
		new SphereGeometry({ radius: SPHERE_RADIUS }),
		sphereBetaMaterial,
	)
	sphereBeta.position.set(-TORUS_RADIUS, 0, TORUS_CENTER_Z)

	scene.add(torus)
	scene.add(sphereAlpha)
	scene.add(sphereBeta)

	gravityExcitation = 0
	gravityAddCount = 0
	updateSize(message.width, message.height)
	renderScene()
	bulkWorker.postMessage({ type: "worker-status", worker: "bulk", status: "ready" })
}

bulkWorker.onmessage = (event: MessageEvent<BulkWorkerMessage>) => {
	const message = event.data

	if (message.type === "init") {
		void initRenderer(message).catch((error) => {
			bulkWorker.postMessage({
				type: "worker-status",
				worker: "bulk",
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			})
		})
		return
	}

	if (message.type === "resize") {
		updateSize(message.width, message.height)
		return
	}

	if (message.type === "protocol") {
		handleProtocol(message.message)
	}
}
