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
import { readDarkParticleModel, type DarkMetaParticleModel } from "../../../pkg/sqlite/dark.ts"
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

const toBindingPaths = (binding: unknown): string[] => {
	if (!binding) return []
	if (typeof binding === "string") return binding.startsWith("/") ? [binding] : []
	if (typeof binding !== "object") return []

	const data = "data" in binding ? binding.data : undefined
	if (typeof data === "string") return [data]
	return Array.isArray(data) ? data.filter((path): path is string => typeof path === "string") : []
}

const extractTopologyFieldKey = (path: string): string | null => {
	const prefix = path.startsWith("/value/")
		? "/value/"
		: path.startsWith("/fields/")
			? "/fields/"
			: path.startsWith("/mass/")
				? "/mass/"
				: null
	if (!prefix) return null

	const [fieldKey] = path
		.slice(prefix.length)
		.split("/")
		.filter((segment) => segment.length > 0)
	if (!fieldKey || fieldKey.startsWith("[")) return null
	return fieldKey
}

const resolveTopologyFieldLabel = (ownerWimp: Wimp, plan: MatterParticlePlan | undefined): string | null => {
	if (!plan || plan.kind === "wimp") return null

	const binding =
		plan.kind === "macho"
			? plan.collectionBinding
			: plan.kind === "axion"
				? plan.predicateBinding
				: plan.predicateBinding

	for (const path of toBindingPaths(binding)) {
		const fieldKey = extractTopologyFieldKey(path)
		if (!fieldKey) continue

		const fieldSchema = ownerWimp.meta?.fields[fieldKey]?.schema
		if (fieldSchema) return fieldSchema.label ?? fieldKey
		return fieldKey
	}

	return null
}

const createFieldDescriptors = (particle: Wimp): DbWorldParticleDescriptor["fields"] =>
	Object.values(particle.fields ?? {})
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

const createRuntimeParticleDescriptor = (
	particle: DarkParticle,
	particleModelsBySrc: Map<string, DarkMetaParticleModel>,
	ownerWimp: Wimp,
	plan?: MatterParticlePlan,
): DbWorldParticleDescriptor => {
	const kind = detectParticleKind(particle)
	const color = particleColorByKind[kind]

	if (particle instanceof Wimp) {
		const particleModel = particleModelsBySrc.get(particle.src)
		const continuationPlans = Array.isArray(plan?.children) ? plan.children : []
		const ownPlans = particleModel?.particles ?? []
		const actualChildren = [...particle.children]
		const continuationCount = Math.min(continuationPlans.length, actualChildren.length)
		const continuationChildren = actualChildren.slice(0, continuationCount)
		const ownChildren = actualChildren.slice(continuationCount)

		return {
			particleId: particle.id,
			kind,
			src: particle.src,
			metaSrc: particle.meta?.src ?? particle.src,
			label: typeof particle.name === "string" ? particle.name : particle.src,
			colorR: color.r,
			colorG: color.g,
			colorB: color.b,
			fields: createFieldDescriptors(particle),
			children: [
				...continuationChildren.map((child, index) =>
					createRuntimeParticleDescriptor(child, particleModelsBySrc, particle, continuationPlans[index]),
				),
				...ownChildren.map((child, index) =>
					createRuntimeParticleDescriptor(child, particleModelsBySrc, particle, ownPlans[index]),
				),
			],
		}
	}

	const topologyPlans = Array.isArray(plan?.children) ? plan.children : []
	return {
		particleId: particle.id,
		kind,
		src: null,
		metaSrc: null,
		label: resolveTopologyFieldLabel(ownerWimp, plan) ?? kind,
		colorR: color.r,
		colorG: color.g,
		colorB: color.b,
		fields: [],
		children: [...particle.children].map((child, index) =>
			createRuntimeParticleDescriptor(child, particleModelsBySrc, ownerWimp, topologyPlans[index]),
		),
	}
}

const createDbWorldSnapshot = (
	rootSrc: string,
	particleModelsBySrc: Map<string, DarkMetaParticleModel>,
	layoutSettings: Partial<AppWebLayoutSettings> = {},
): DbWorldSnapshot => {
	const roots = [...dark$.particles.values()].filter((particle) => particle.parent === null)
	return scaleDbWorldSnapshotToRootOuterDiameter(
		createDbWorldSnapshotFromParticleDescriptors(
			rootSrc,
			roots.map((particle) => {
				if (!(particle instanceof Wimp)) {
					throw new Error(`Root particle "${particle.id}" must be Wimp to build instance snapshot`)
				}
				return createRuntimeParticleDescriptor(particle, particleModelsBySrc, particle)
			}),
			layoutSettings,
		),
		undefined,
		layoutSettings,
	)
}

const publishInstanceSnapshot = (
	src: string,
	instanceDb: ReturnType<typeof openDbInstanceSqlite>,
	particleModelsBySrc: Map<string, DarkMetaParticleModel>,
	layoutSettings: Partial<AppWebLayoutSettings> = {},
): void => {
	const snapshot = createDbWorldSnapshot(src, particleModelsBySrc, layoutSettings)
	writeDbWorldSnapshot(instanceDb, snapshot)
	darkWorker.postMessage({
		type: "instance-snapshot",
		src,
		snapshot: readDbWorldSnapshot(instanceDb, src),
	})
}

const canonicalizeMetaGraph = async (
	dbFilename: string,
	rootSrc: string,
): Promise<{
	metaDb: ReturnType<typeof getMetaDB>
	particleModelsBySrc: Map<string, DarkMetaParticleModel>
}> => {
	const metaDb = getMetaDB(dbFilename)
	const particleModelsBySrc = new Map<string, DarkMetaParticleModel>()
	const loaded = new Set<string>()
	const queue = [rootSrc]

	while (queue.length > 0) {
		const src = queue.shift()
		if (!src || loaded.has(src)) continue

		const dsl = await readMetaDsl(src)
		relation(metaDb, dsl, src)
		loaded.add(src)

		const particleModel = readDarkParticleModel(metaDb, src)
		particleModelsBySrc.set(src, particleModel)
		for (const childSrc of collectChildMetaSrcs(particleModel.particles)) {
			if (!loaded.has(childSrc)) queue.push(childSrc)
		}
	}

	return { metaDb, particleModelsBySrc }
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
			const canonicalized = await canonicalizeMetaGraph(dbFilename, src)
			metaDb = canonicalized.metaDb
			instanceDb = openDbInstanceSqlite({ filename: instanceDbFilename })
			resetDbInstanceSqlite(instanceDb)

			const writer = openDbMaterializationWriter(backend)
			const emitSnapshot = (): void => {
				if (!instanceDb) return
				publishInstanceSnapshot(src, instanceDb, canonicalized.particleModelsBySrc, layoutSettings)
			}
			await matter(new Wimp({ src, parent: null }), undefined, {
				dbWriter: writer,
				sqliteDb: metaDb,
				onMaterializedStep: emitSnapshot,
			})
			await backend.flush()
			emitSnapshot()

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
