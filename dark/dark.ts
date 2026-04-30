import type { MatterContinuation, MatterEntry, MatterLayerResult, MatterParticlePlan, MatterWimpResult } from "@dark/types/dark"
import type { DarkParticle } from "@dark/types"
import { emitAdd, emitBarrier } from "@dark/gravity/channel.ts"
import type { DbMaterializationWriter } from "store/db"
import { StoreMetaSqlite } from "@store/meta/sqlite"
import { Axion, Fuzzy, Macho, materializeFields, Meta, resolveWimpContinuation, Wimp } from "@dark/strong"
import { loadMeta } from "./load.ts"
import { dark$ } from "./store"

interface MatterOptions {
  dbWriter?: DbMaterializationWriter
  onMaterializedStep?: (step: MatterMaterializationStep) => Promise<void> | void
  suppressGravityBarrier?: boolean
  sqliteDb?: unknown
}

interface RuntimeMetaMaterialization {
  meta: Meta
  particles: MatterParticlePlan[]
}

export interface MatterMaterializationStep {
  kind: "layer" | "root"
  layerWimps: MatterLayerResult
  wimp: Wimp
}

/**
 * Клонирует временный пакет данных для дочернего `Wimp`.
 *
 * Значения копируются, чтобы временный пакет не разделял изменяемые данные между ветвями,
 * а ссылки `source` сохранялись как объектные ссылки на уже собранные поля родителя.
 */
const cloneContinuation = (continuation: MatterContinuation): MatterContinuation => {
  const cloned: MatterContinuation = {}

  if (continuation.fieldInits !== undefined) {
    cloned.fieldInits = continuation.fieldInits.map((fieldInit) => {
      const nextFieldInit: typeof fieldInit = {
        key: fieldInit.key,
        value: structuredClone(fieldInit.value),
      }

      if (fieldInit.source !== undefined) nextFieldInit.source = fieldInit.source
      return nextFieldInit
    })
  }

  if (continuation.mass !== undefined) cloned.mass = structuredClone(continuation.mass)

  return cloned
}

/**
 * Как только частица создана, dark сразу фиксирует её связи в `dark$`.
 */
const registerParticle = (particle: DarkParticle, parent: DarkParticle): void => {
  const info = `[dark] register particle: ${particle.constructor.name} (id: ${particle.id.slice(0, 8)}) -> parent: ${parent.constructor.name}`
  console.log(info)
  
  if (typeof self !== "undefined" && "postMessage" in self) {
    self.postMessage({ type: "log", message: info })
  }

  parent.children.add(particle)
  if (parent instanceof Fuzzy) parent.branch.set(particle, particle)
  dark$.particles.set(particle.id, particle)
}

const findMetaBySrc = (src: string): Meta | undefined => {
  for (const meta of dark$.meta.values()) {
    if (meta.src === src) return meta
  }

  return undefined
}

const registerMeta = (meta: Meta): Meta => {
  const existing = findMetaBySrc(meta.src)
  if (existing) return existing

  dark$.meta.set(meta.id, meta)
  for (const field of Object.values(meta.fields)) {
    dark$.fields.set(field.id, field)
  }

  return meta
}

const readRuntimeMeta = async (src: string, sqliteDb: unknown): Promise<RuntimeMetaMaterialization> => {
  if (!sqliteDb) {
    throw new Error(
      `Dark runtime requires prepared SQLite / ORM context for "${src}"; canonicalization must happen in load before dark traversal`,
    )
  }

  const particleModel = await StoreMetaSqlite.open(sqliteDb as any).then((store) => store.readDarkParticleModel(src))
  if (!particleModel) {
    throw new Error(`Dark runtime meta "${src}" is not canonicalized in SQLite store`)
  }
  return {
    meta: new Meta(particleModel.meta),
    particles: particleModel.particles,
  }
}

/**
 * Дочерние топологические узлы всегда попадают в следующий шаг обхода уже с реальным родителем.
 */
const appendChildEntries = (frontier: MatterEntry[], plan: MatterParticlePlan, parent: DarkParticle): void => {
  if (!Array.isArray(plan.children) || plan.children.length === 0) return
  frontier.push(...plan.children.map((child) => ({ plan: child, parent })))
}

/**
 * Обрабатывает обычную запись текущего топологического слоя.
 *
 * На этом шаге dark больше не распознаёт topology по AST-ноду:
 * он просто materialize-ит уже подготовленные particle rows из canonical SQLite-слоя.
 */
const processMatterParticle = (
  entry: MatterEntry,
  fields: Wimp["fields"],
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
): void => {
  switch (entry.plan.kind) {
    case "wimp": {
      const continuation = cloneContinuation(
        resolveWimpContinuation(
          {
            ...(entry.plan.fieldsBinding !== undefined ? { fieldsBinding: entry.plan.fieldsBinding } : {}),
            ...(entry.plan.massBinding !== undefined ? { massBinding: entry.plan.massBinding } : {}),
          },
          fields,
        ),
      )
      const wimp = new Wimp({ src: entry.plan.src, parent: entry.parent })
      wimps.push([wimp, continuation])
      registerParticle(wimp, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, wimp)
      return
    }
    case "fuzzy": {
      const fuzzy = new Fuzzy({ parent: entry.parent })
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, fuzzy)
      return
    }
    case "axion": {
      const axion = new Axion({ parent: entry.parent })
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, axion)
      return
    }
    case "macho": {
      const macho = new Macho({ parent: entry.parent })
      registerParticle(macho, entry.parent)
      appendChildEntries(nextFrontier, entry.plan, macho)
      return
    }
  }
}

/**
 * Явный послойный проход одной меты.
 *
 * На первом `next()` генератор инициализирует корневой `Wimp`, затем обрабатывает первый слой
 * уже подготовленного particle-plan и yield-ит только те `Wimp`, которые были обнаружены именно на этом шаге.
 */
export async function* matterMeta(
  wimp: Wimp,
  continuation?: MatterContinuation,
  options: MatterOptions = {},
): AsyncGenerator<MatterLayerResult, void> {
  const runtimeMeta = await readRuntimeMeta(wimp.src, options.sqliteDb)
  const meta = registerMeta(runtimeMeta.meta)

  wimp.meta = meta
  if (options.dbWriter) {
    await options.dbWriter.saveMetaBundle(wimp.toDbMetaBundle())
  }
  wimp.fields = materializeFields(wimp, meta.fields, continuation?.fieldInits)
  wimp.mass = continuation?.mass
  dark$.particles.set(wimp.id, wimp)
  if (options.dbWriter) {
    await options.dbWriter.saveWimpBundle(wimp.toDbBundle())
    emitAdd(wimp.id)
  }
  await options.onMaterializedStep?.({
    kind: "root",
    layerWimps: [],
    wimp,
  })

  if (runtimeMeta.particles.length === 0) return

  let frontier = runtimeMeta.particles.map((plan): MatterEntry => ({ plan, parent: wimp }))

  while (frontier.length > 0) {
    const currentLayer = frontier
    const nextFrontier: MatterEntry[] = []
    const levelWimps: MatterLayerResult = []

    frontier = nextFrontier

    for (const entry of currentLayer) {
      processMatterParticle(entry, wimp.fields, nextFrontier, levelWimps)
    }

    await options.onMaterializedStep?.({
      kind: "layer",
      layerWimps: levelWimps,
      wimp,
    })
    yield levelWimps
  }
}

/**
 * Публичный entrypoint Dark.
 *
 * `matter()` отвечает за outer orchestration:
 * - canonicalize одной meta через load/sqlite boundary,
 * - вызвать single-meta `matterMeta()`,
 * - рекурсивно пройти дочерние `Wimp`,
 * - один раз опубликовать barrier на верхнем вызове.
 */
export async function matter(
  wimp: Wimp,
  continuation?: MatterContinuation,
  options: MatterOptions = {},
): Promise<void> {
  const sqlite = options.sqliteDb ? { db: options.sqliteDb } : await loadMeta(wimp.src)
  if (!sqlite) {
    throw new Error(`Canonical SQLite context is unavailable for "${wimp.src}"`)
  }

  const shouldEmitGravityBarrier = options.suppressGravityBarrier !== true
  const nestedOptions = shouldEmitGravityBarrier ? { ...options, suppressGravityBarrier: true } : options
  const generator = matterMeta(wimp, continuation, {
    ...options,
    sqliteDb: sqlite.db,
  })

  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await matter(childWimp, childContinuation, nestedOptions)
    }
  }

  if (shouldEmitGravityBarrier) {
    emitBarrier()
  }
}
