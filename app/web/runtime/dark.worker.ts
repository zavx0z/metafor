import { MetaFor } from "../../../metafor.ts"
import { openDbSqliteBackend } from "store/db"
import {force} from "store"
import {
	createMirroredActorStore,
	createSqliteDbActorStore,
	type DbActorStore,
	type DbFieldValueKind,
	type DbParticleKind,
} from "@store/actor"
import { StoreWimpSqlite, type MatterRelationParticle } from "@store/wimp/sqlite"
import { SQL } from "bun"
import { matter } from "../../../dark/dark.ts"
import { projectStoreMatterParticles, fillGravityMatter } from "@dark/gravity"
import { loadMeta } from "../../../dark/load.ts"
import { disposeMetaDbContext } from "../../../dark/load.context.ts"
import { Axion, Fuzzy, Macho, Wimp } from "../../../dark/strong/index.ts"
import type { MatterParticlePlan } from "../../../dark/types/dark.ts"
import { dark$ } from "../../../dark/store.ts"
import type { DarkParticle } from "../../../dark/types/shared.ts"
import type { AppWebLayoutSettings } from "../settings.ts"
import { streamDbWorldRows, type DbWorldParticleDescriptor } from "@bulk/gravity/layout"

interface DarkMetaParticleModel {
	particles: MatterRelationParticle[]
}

type MaterializeMessage = {
	type: "materialize"
	src: string
	dbFilename: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

type RelayoutMessage = {
	type: "relayout"
	src: string
	layoutSettings?: Partial<AppWebLayoutSettings>
}

type DarkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<MaterializeMessage | RelayoutMessage>) => void) | null
	postMessage(message: unknown): void
}

const darkWorker = globalThis as DarkWorkerScope
const forceChannel = force
const dbSyncChannel = {
	postMessage(message: unknown) {
		forceChannel.postMessage({ parts: [{ part: "graviton", op: "replace", path: "/db-sync", value: message }] })
	},
	close() {},
} as BroadcastChannel
let actorStore: DbActorStore | null = null

const ensureActorStore = (dbFilename: string): DbActorStore => {
	if (!actorStore) {
		const local = createSqliteDbActorStore({ filename: dbFilename })
		actorStore = createMirroredActorStore(local, dbSyncChannel, "dark")
	}
	return actorStore
}

const closeActorStore = async (): Promise<void> => {
	if (!actorStore) return
	try {
		await actorStore.close()
	} catch {
		// ignore close failures — store may already be closed
	}
	actorStore = null
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
		const ownPlans = particleModel ? projectStoreMatterParticles(particleModel.particles) : []
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

const cloneFieldDescriptor = (
	field: DbWorldParticleDescriptor["fields"][number],
): DbWorldParticleDescriptor["fields"][number] => ({ ...field })

const cloneParticleDescriptor = (descriptor: DbWorldParticleDescriptor): DbWorldParticleDescriptor => ({
	...descriptor,
	fields: descriptor.fields.map((field) => cloneFieldDescriptor(field)),
	children: descriptor.children.map((child) => cloneParticleDescriptor(child)),
})

const createRuntimeParticleDescriptors = (
	particleModelsBySrc: Map<string, DarkMetaParticleModel>,
): DbWorldParticleDescriptor[] =>
	[...dark$.particles.values()]
		.filter((particle) => particle.parent === null)
		.map((particle) => {
			if (!(particle instanceof Wimp)) {
				throw new Error(`Root particle "${particle.id}" must be Wimp to build actor world`)
			}
			return createRuntimeParticleDescriptor(particle, particleModelsBySrc, particle)
		})

const publishStructuralSignal = async (
	src: string,
	descriptorRoots: DbWorldParticleDescriptor[],
	layoutSettings: Partial<AppWebLayoutSettings>,
	dbFilename: string,
): Promise<void> => {
	const store = ensureActorStore(dbFilename)

	// Layout сразу пишет per-row в `store`, который через mirror публикует sync-events
	// в единый force channel — server потом мирорит их в WS клиентам.
	await streamDbWorldRows(
		src,
		descriptorRoots.map((descriptor) => cloneParticleDescriptor(descriptor)),
		layoutSettings,
		store,
	)

	// Барьер: «всё применено, можно перерисовывать».
	forceChannel.postMessage({
		parts: [{ part: "graviton", op: "test", path: "/structural", value: { rootSrc: src, scope: { kind: "world" } } }],
	})
}

let currentRootSrc: string | null = null
let currentDescriptorRoots: DbWorldParticleDescriptor[] = []
let currentDbFilename: string | null = null

const canonicalizeMetaGraph = async (
	dbFilename: string,
	rootSrc: string,
): Promise<{
	metaDb: SQL
	metaStore: StoreWimpSqlite
	particleModelsBySrc: Map<string, DarkMetaParticleModel>
}> => {
	const metaDb = new SQL(dbFilename === ":memory:" ? "sqlite::memory:" : `sqlite://${dbFilename}`)
	await metaDb.unsafe("PRAGMA foreign_keys = ON;")
	const metaStore = await StoreWimpSqlite.open(metaDb)
	const particleModelsBySrc = new Map<string, DarkMetaParticleModel>()
	const loaded = new Set<string>()
	const queue = [rootSrc]

	while (queue.length > 0) {
		const src = queue.shift()
		if (!src || loaded.has(src)) continue

		const dsl = await loadMeta(src)
		const wimp = await metaStore.create(src, dsl.create)
		const relations = await fillGravityMatter(wimp, dsl)
		loaded.add(src)

		const particleModel: DarkMetaParticleModel = { particles: relations }
		particleModelsBySrc.set(src, particleModel)
		for (const childSrc of collectChildMetaSrcs(projectStoreMatterParticles(particleModel.particles))) {
			if (!loaded.has(childSrc)) queue.push(childSrc)
		}
	}

	return { metaDb, metaStore, particleModelsBySrc }
}

darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "ready" })

darkWorker.onmessage = (event: MessageEvent<MaterializeMessage | RelayoutMessage>) => {
	const message = event.data
	if (message.type === "relayout") {
		void (async () => {
			const { src, layoutSettings } = message
			darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "started", src })

			try {
				if (!currentRootSrc || currentDescriptorRoots.length === 0) {
					throw new Error("Cannot relayout before initial materialization")
				}
				if (src !== currentRootSrc) {
					throw new Error(`Relayout source mismatch: expected "${currentRootSrc}", got "${src}"`)
				}
				if (!currentDbFilename) {
					throw new Error("Cannot relayout before initial materialization (no dbFilename)")
				}

				await publishStructuralSignal(src, currentDescriptorRoots, layoutSettings ?? {}, currentDbFilename)
				darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "done", src })
			} catch (error) {
				darkWorker.postMessage({
					type: "worker-status",
					worker: "dark",
					status: "error",
					src,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		})()
		return
	}

	if (message.type !== "materialize") return

	void (async () => {
			const { src, dbFilename, layoutSettings } = message
		darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "started", src })

		let backend: ReturnType<typeof openDbSqliteBackend> | null = null
		let metaDb: SQL | null = null
		try {
			resetDarkRuntime()
			currentRootSrc = null
			currentDescriptorRoots = []
			currentDbFilename = dbFilename
			await closeActorStore()
			backend = openDbSqliteBackend({ filename: dbFilename })
			await backend.reset()
			const canonicalized = await canonicalizeMetaGraph(dbFilename, src)
			metaDb = canonicalized.metaDb

			const emitSnapshot = async (): Promise<void> => {
				const descriptorRoots = createRuntimeParticleDescriptors(canonicalized.particleModelsBySrc)
				currentRootSrc = src
				currentDescriptorRoots = descriptorRoots.map((descriptor) => cloneParticleDescriptor(descriptor))
				const roots = currentDescriptorRoots
				await publishStructuralSignal(src, roots, layoutSettings ?? {}, dbFilename)
			}
			await matter(src)
			await backend.flush()
			await emitSnapshot()

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
			await backend?.close()
		}
	})()
}
