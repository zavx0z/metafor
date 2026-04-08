import { MetaFor } from "../../../metafor.ts"
import { openDbMaterializationWriter, openDbSqliteBackend } from "../../../pkg/db/index.ts"
import { readDarkParticleModel } from "../../../pkg/sqlite/dark.ts"
import { getMetaDB, relation } from "../../../pkg/sqlite/index.ts"
import { matter } from "../../../dark/dark.ts"
import { readMetaDsl } from "../../../dark/load.ts"
import { disposeMetaDbContext } from "../../../dark/load.context.ts"
import { Wimp } from "../../../dark/strong/index.ts"
import type { MatterParticlePlan } from "../../../dark/types/dark.ts"
import { dark$ } from "../../../dark/store.ts"

type MaterializeMessage = {
	type: "materialize"
	src: string
	dbFilename: string
}

type DarkWorkerScope = typeof globalThis & {
	onmessage: ((event: MessageEvent<MaterializeMessage>) => void) | null
	postMessage(message: unknown): void
}

const darkWorker = globalThis as DarkWorkerScope

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
		const { src, dbFilename } = message
		darkWorker.postMessage({ type: "worker-status", worker: "dark", status: "started", src })

		let backend: ReturnType<typeof openDbSqliteBackend> | null = null
		let metaDb: ReturnType<typeof getMetaDB> | null = null
		try {
			resetDarkRuntime()
			backend = openDbSqliteBackend({ filename: dbFilename })
			await backend.reset()
			metaDb = await canonicalizeMetaGraph(dbFilename, src)

			const writer = openDbMaterializationWriter(backend)
			await matter(new Wimp({ src, parent: null }), undefined, { dbWriter: writer, sqliteDb: metaDb })
			await backend.flush()

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
