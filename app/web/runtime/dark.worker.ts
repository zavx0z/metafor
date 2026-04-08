import { MetaFor } from "../../../metafor.ts"
import {
	openDbInstanceSqlite,
	openDbMaterializationWriter,
	openDbSqliteBackend,
	readDbWorldSnapshot,
	resetDbInstanceSqlite,
	writeDbWorldSnapshot,
} from "../../../pkg/db/index.ts"
import type { DbFieldValueKind, DbParticleKind, DbWorldSnapshot } from "../../../pkg/db/index.ts"
import { readDarkParticleModel } from "../../../pkg/sqlite/dark.ts"
import { getMetaDB, relation } from "../../../pkg/sqlite/index.ts"
import { matter } from "../../../dark/dark.ts"
import { readMetaDsl } from "../../../dark/load.ts"
import { disposeMetaDbContext } from "../../../dark/load.context.ts"
import { Axion, Fuzzy, Macho, Wimp } from "../../../dark/strong/index.ts"
import type { MatterParticlePlan } from "../../../dark/types/dark.ts"
import { dark$ } from "../../../dark/store.ts"
import type { DarkParticle } from "../../../dark/types/shared.ts"
import type { AppWebLayoutSettings } from "../settings.ts"
import {
	createDbWorldSnapshotFromParticleDescriptors,
	scaleDbWorldSnapshotToRootOuterDiameter,
	type DbWorldParticleDescriptor,
} from "./instance-layout.ts"

type MaterializeMessage = {
	type: "materialize"
	src: string
	dbFilename: string
	instanceDbFilename: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

type DarkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<MaterializeMessage>) => void) | null
	postMessage(message: unknown): void
}

const darkWorker = globalThis as DarkWorkerScope

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

const fieldColorByKind: Record<DbFieldValueKind, { r: number; g: number; b: number }> = {
	number: { r: 135 / 255, g: 206 / 255, b: 235 / 255 },
	text: { r: 71 / 255, g: 189 / 255, b: 116 / 255 },
	bool: { r: 191 / 255, g: 200 / 255, b: 209 / 255 },
	other: { r: 255 / 255, g: 209 / 255, b: 117 / 255 },
}

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

const detectFieldValueKind = (type: string): DbFieldValueKind => {
	if (type === "number") return "number"
	if (type === "string") return "text"
	if (type === "boolean") return "bool"
	return "other"
}

const createParticleDescriptor = (particle: DarkParticle): DbWorldParticleDescriptor => {
	const kind = detectParticleKind(particle)
	const color = particleColorByKind[kind]
	const label = particle instanceof Wimp ? particle.src : kind

	const fields =
		particle instanceof Wimp && particle.fields
			? Object.values(particle.fields)
					.filter((field) => !isTopologyFieldType(field.schema.type))
					.map((field) => {
						const fieldValueKind = detectFieldValueKind(field.schema.type)
						const fieldColor = fieldColorByKind[fieldValueKind]
						return {
							id: field.id,
							fieldKey: field.key,
							fieldLabel: field.schema.label ?? field.key,
							fieldValueKind,
							valueText: formatFieldValue(field.value),
							colorR: fieldColor.r,
							colorG: fieldColor.g,
							colorB: fieldColor.b,
						}
					})
			: []

	return {
		particleId: particle.id,
		kind,
		src: particle instanceof Wimp ? particle.src : null,
		metaSrc: particle instanceof Wimp ? particle.meta?.src ?? particle.src : null,
		label,
		colorR: color.r,
		colorG: color.g,
		colorB: color.b,
		fields,
		children: [...particle.children].sort(compareParticles).map(createParticleDescriptor),
	}
}

const createDbWorldSnapshot = (rootSrc: string, layoutSettings: Partial<AppWebLayoutSettings> = {}): DbWorldSnapshot => {
	const roots = [...dark$.particles.values()].filter((particle) => particle.parent === null).sort(compareParticles)
	return scaleDbWorldSnapshotToRootOuterDiameter(
		createDbWorldSnapshotFromParticleDescriptors(rootSrc, roots.map(createParticleDescriptor), layoutSettings),
	)
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
			const { src, dbFilename, instanceDbFilename, layoutSettings } = message
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

			const snapshot = createDbWorldSnapshot(src, layoutSettings)
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
