import { MetaFor } from "../../../metafor.ts"
import {
	openDbInstanceSqlite,
	openDbMaterializationWriter,
	openDbSqliteBackend,
	readDbWorldSnapshot,
	resetDbInstanceSqlite,
	writeDbWorldSnapshot,
} from "../../../pkg/db/index.ts"
import type { DbParticleKind, DbWorldSnapshot } from "../../../pkg/db/index.ts"
import { readDarkParticleModel } from "../../../pkg/sqlite/dark.ts"
import { getMetaDB, relation } from "../../../pkg/sqlite/index.ts"
import { matter } from "../../../dark/dark.ts"
import { readMetaDsl } from "../../../dark/load.ts"
import { disposeMetaDbContext } from "../../../dark/load.context.ts"
import { Axion, Fuzzy, Macho, Wimp } from "../../../dark/strong/index.ts"
import type { MatterParticlePlan } from "../../../dark/types/dark.ts"
import { dark$ } from "../../../dark/store.ts"
import type { DarkParticle } from "../../../dark/types/shared.ts"

type MaterializeMessage = {
	type: "materialize"
	src: string
	dbFilename: string
	instanceDbFilename: string
}

type DarkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<MaterializeMessage>) => void) | null
	postMessage(message: unknown): void
}

const darkWorker = globalThis as DarkWorkerScope

const SHELL_RADIUS = 0.2
const SHELL_TUBE = 0.14
const FIELD_SPHERE_RADIUS = 0.05
const FIELD_RING_RADIUS = 0.12
const FIELD_RING_HEIGHT = 0.07

const particleKindOrder: Record<DbParticleKind, number> = {
	wimp: 0,
	fuzzy: 1,
	axion: 2,
	macho: 3,
}

const particleColorByKind: Record<DbParticleKind, { r: number; g: number; b: number }> = {
	wimp: { r: 0.42, g: 0.45, b: 0.98 },
	fuzzy: { r: 1.0, g: 0.72, b: 0.22 },
	axion: { r: 0.95, g: 0.48, b: 0.95 },
	macho: { r: 0.38, g: 0.94, b: 0.66 },
}

const fieldPalette = [
	{ r: 0.98, g: 0.47, b: 0.47 },
	{ r: 0.47, g: 0.81, b: 0.98 },
	{ r: 0.98, g: 0.83, b: 0.47 },
	{ r: 0.64, g: 0.98, b: 0.55 },
	{ r: 0.88, g: 0.67, b: 0.98 },
	{ r: 0.98, g: 0.62, b: 0.78 },
] as const

const isTopologyFieldType = (type: string): boolean =>
	type === "enum" || type === "array" || type.startsWith("enum<") || type.startsWith("array<")

if (typeof globalThis !== "undefined") {
	;(globalThis as typeof globalThis & { MetaFor?: typeof MetaFor }).MetaFor = MetaFor
}

const resetDarkRuntime = (): void => {
	dark$.meta.clear()
	dark$.fields.clear()
	dark$.particles.clear()
	disposeMetaDbContext()
}

const collectChildMetaSrcs = (plans: MatterParticlePlan[]): string[] => {
	const discovered = new Set<string>()
	const queue = [...plans]

	while (queue.length > 0) {
		const plan = queue.shift()
		if (!plan) continue

		if (plan.kind === "wimp") discovered.add(plan.src)
		if (Array.isArray(plan.children) && plan.children.length > 0) {
			queue.push(...plan.children)
		}
	}

	return [...discovered]
}

const detectParticleKind = (particle: DarkParticle): DbParticleKind => {
	if (particle instanceof Wimp) return "wimp"
	if (particle instanceof Fuzzy) return "fuzzy"
	if (particle instanceof Axion) return "axion"
	return "macho"
}

const compareParticles = (left: DarkParticle, right: DarkParticle): number => {
	const leftKind = detectParticleKind(left)
	const rightKind = detectParticleKind(right)
	if (particleKindOrder[leftKind] !== particleKindOrder[rightKind]) {
		return particleKindOrder[leftKind] - particleKindOrder[rightKind]
	}

	const leftLabel = left instanceof Wimp ? left.src : `${leftKind}:${left.id}`
	const rightLabel = right instanceof Wimp ? right.src : `${rightKind}:${right.id}`
	return leftLabel.localeCompare(rightLabel)
}

const formatFieldValue = (value: unknown): string | null => {
	if (value === undefined || value === null) return null
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	if (Array.isArray(value)) return `[${value.length} items]`
	if (typeof value === "object") return "{...}"
	return String(value)
}

const computeChildShellScale = (depth: number): number => Math.max(0.2, 0.52 - depth * 0.1)

const computeChildLocalPosition = (
	childIndex: number,
	childCount: number,
	depth: number,
): { x: number; y: number; z: number } => {
	if (childCount <= 1) {
		return { x: 0, y: 0, z: depth === 1 ? 0.08 : 0 }
	}

	const angle = (childIndex / childCount) * Math.PI * 2 - Math.PI / 2
	const radius = Math.max(0.11, 0.18 - depth * 0.015)
	const zAmplitude = Math.max(0.03, 0.08 - depth * 0.01)

	return {
		x: Math.cos(angle) * radius,
		y: Math.sin(angle) * radius * 0.76,
		z: Math.sin(angle * 2) * zAmplitude,
	}
}

const computeRootLocalPosition = (
	rootIndex: number,
	rootCount: number,
): { x: number; y: number; z: number } => {
	if (rootCount <= 1) {
		return { x: 0, y: 0, z: 0.22 }
	}

	const center = (rootCount - 1) / 2
	const offset = rootIndex - center

	return {
		x: offset * 0.9,
		y: 0.18 + Math.abs(offset) * 0.08,
		z: 0.22,
	}
}

const computeFieldLocalPosition = (
	fieldIndex: number,
	fieldCount: number,
): { x: number; y: number; z: number } => {
	if (fieldCount <= 1) {
		return { x: 0, y: 0, z: 0.04 }
	}

	const angle = (fieldIndex / fieldCount) * Math.PI * 2 - Math.PI / 2
	const orbitLayer = Math.floor(fieldIndex / 6)
	const radius = FIELD_RING_RADIUS + orbitLayer * 0.04
	const zBand = (orbitLayer % 2 === 0 ? 1 : -1) * FIELD_RING_HEIGHT

	return {
		x: Math.cos(angle) * radius,
		y: Math.sin(angle) * radius * 0.72,
		z: zBand + Math.sin(angle * 2) * 0.03,
	}
}

const createDbWorldSnapshot = (rootSrc: string): DbWorldSnapshot => {
	const particles: DbWorldSnapshot["particles"] = []
	const fields: DbWorldSnapshot["fields"] = []
	const roots = [...dark$.particles.values()].filter((particle) => particle.parent === null).sort(compareParticles)

	const visitParticle = (
		particle: DarkParticle,
		parentParticleId: string | null,
		depth: number,
		shellOrder: number,
		siblingCount: number,
	): void => {
		const kind = detectParticleKind(particle)
		const localPosition =
			depth === 0 ? computeRootLocalPosition(shellOrder, siblingCount) : computeChildLocalPosition(shellOrder, siblingCount, depth)
		const color = particleColorByKind[kind]
		const label = particle instanceof Wimp ? particle.src : kind

		particles.push({
			particleId: particle.id,
			parentParticleId,
			kind,
			src: particle instanceof Wimp ? particle.src : null,
			metaSrc: particle instanceof Wimp ? particle.meta?.src ?? particle.src : null,
			label,
			depth,
			shellOrder,
			localX: localPosition.x,
			localY: localPosition.y,
			localZ: localPosition.z,
			shellScale: depth === 0 ? 1 : computeChildShellScale(depth),
			shellRadius: SHELL_RADIUS,
			shellTube: SHELL_TUBE,
			colorR: color.r,
			colorG: color.g,
			colorB: color.b,
		})

		if (particle instanceof Wimp && particle.fields) {
			const ordinaryFields = Object.values(particle.fields).filter((field) => !isTopologyFieldType(field.schema.type))

			ordinaryFields.forEach((field, fieldOrder) => {
				const fieldColor = fieldPalette[fieldOrder % fieldPalette.length]!
				const position = computeFieldLocalPosition(fieldOrder, ordinaryFields.length)
				fields.push({
					id: field.id,
					particleId: particle.id,
					fieldKey: field.key,
					fieldLabel: field.schema.label ?? field.key,
					fieldOrder,
					valueText: formatFieldValue(field.value),
					localX: position.x,
					localY: position.y,
					localZ: position.z,
					sphereRadius: FIELD_SPHERE_RADIUS,
					colorR: fieldColor.r,
					colorG: fieldColor.g,
					colorB: fieldColor.b,
				})
			})
		}

		const childParticles = [...particle.children].sort(compareParticles)
		childParticles.forEach((child, childIndex) => {
			visitParticle(child, particle.id, depth + 1, childIndex, childParticles.length)
		})
	}

	roots.forEach((root, rootIndex) => {
		visitParticle(root, null, 0, rootIndex, roots.length)
	})

	return {
		rootSrc,
		particles,
		fields,
	}
}

const canonicalizeMetaGraph = async (dbFilename: string, rootSrc: string): Promise<ReturnType<typeof getMetaDB>> => {
	const metaDb = getMetaDB(dbFilename)
	const loaded = new Set<string>()
	const queue = [rootSrc]

	while (queue.length > 0) {
		const src = queue.shift()
		if (!src || loaded.has(src)) continue

		const dsl = await readMetaDsl(src)
		relation(metaDb, dsl, src)
		loaded.add(src)

		const particleModel = readDarkParticleModel(metaDb, src)
		for (const childSrc of collectChildMetaSrcs(particleModel.particles)) {
			if (!loaded.has(childSrc)) queue.push(childSrc)
		}
	}

	return metaDb
}

darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "ready" })

darkWorker.onmessage = (event: MessageEvent<MaterializeMessage>) => {
	const message = event.data
	if (message.type !== "materialize") return

	void (async () => {
		const { src, dbFilename, instanceDbFilename } = message
		darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "started", src })

		let backend: ReturnType<typeof openDbSqliteBackend> | null = null
		let metaDb: ReturnType<typeof getMetaDB> | null = null
		let instanceDb: ReturnType<typeof openDbInstanceSqlite> | null = null
		try {
			resetDarkRuntime()
			backend = openDbSqliteBackend({ filename: dbFilename })
			await backend.reset()
			metaDb = await canonicalizeMetaGraph(dbFilename, src)
			instanceDb = openDbInstanceSqlite({ filename: instanceDbFilename })
			resetDbInstanceSqlite(instanceDb)

			const writer = openDbMaterializationWriter(backend)
			await matter(new Wimp({ src, parent: null }), undefined, { dbWriter: writer, sqliteDb: metaDb })
			await backend.flush()

			const snapshot = createDbWorldSnapshot(src)
			writeDbWorldSnapshot(instanceDb, snapshot)
			darkWorker.postMessage({
				type: "instance-snapshot",
				src,
				snapshot: readDbWorldSnapshot(instanceDb, src),
			})

			darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "done", src })
		} catch (error) {
			darkWorker.postMessage({
				type: "worker-status",
				worker: "dark",
				status: "error",
				src,
				error: error instanceof Error ? error.message : String(error),
			})
		} finally {
			resetDarkRuntime()
			metaDb?.close()
			instanceDb?.close()
			await backend?.close()
		}
	})()
}
