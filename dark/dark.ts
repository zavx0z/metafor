import type { MetaDSL, NodeType } from "index.ts"
import type { MatterContinuation, MatterEntry, MatterLayerResult, MatterParticlePlan, MatterWimpResult } from "@dark/types/dark"
import type { DarkParticle } from "@dark/types"
import { emitAdd, emitBarrier } from "@dark/gravity/channel.ts"
import type { SharedDbMaterializationWriter } from "@shared/db"
import { Axion, Fuzzy, Macho, materializeFields, Meta, resolveWimpContinuation, Wimp } from "@dark/strong"
import { ensureMetaCanonicalized, loadMetaAST } from "./load.ts"
import { dark$ } from "./store"
import { readDarkMetaParticles } from "./sqlite.ts"

interface MatterOptions {
  sharedDbWriter?: SharedDbMaterializationWriter
  suppressGravityBarrier?: boolean
}

interface RuntimeMetaMaterialization {
  meta: Meta
  particles: MatterParticlePlan[]
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

const toMetaMass = (mass: MetaDSL["mass"] | undefined): MetaDSL["mass"] | undefined =>
  mass && Object.keys(mass).length > 0 ? structuredClone(mass) : undefined

const createContinuationSrc = (expr: string | undefined, value: string | number): string => {
  if (!expr) return String(value)

  const escaped = expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${escaped}\``)([value]))
}

const resolveAstMetaBranchSrcs = (ast: MetaDSL, value: Exclude<MetaDSL["matter"], undefined>[number] extends infer T ? T : never): string[] => {
  const node = value as { src: string | { data?: string | string[]; expr?: string } }
  if (typeof node.src === "string") return [node.src]
  if (!node.src || typeof node.src !== "object") return []

  const paths =
    "data" in node.src && node.src.data !== undefined ? (Array.isArray(node.src.data) ? node.src.data : [node.src.data]) : []
  const firstPath = paths[0]
  if (!firstPath || !firstPath.startsWith("/value/")) return []

  const fieldKey = firstPath.slice("/value/".length)
  const field = ast.fields?.[fieldKey]
  if (!field || field.type !== "enum") return []

  return (field.values ?? []).map((variant) => createContinuationSrc(node.src.expr, variant))
}

const projectAstChildren = (ast: MetaDSL, children: NodeType[] | undefined): MatterParticlePlan[] | undefined => {
  if (!Array.isArray(children) || children.length === 0) return
  return children.flatMap((child) => projectAstNode(ast, child))
}

const projectAstNode = (ast: MetaDSL, node: NodeType): MatterParticlePlan[] => {
  if (node.type === "meta") {
    const metaNode = node as {
      src: string | { data?: string | string[]; expr?: string }
      child?: NodeType[]
    } & {
      fields?: { data?: string | string[]; expr?: string } | string | boolean
      mass?: { data?: string | string[]; expr?: string } | string | boolean
    }
    const childPlans = projectAstChildren(ast, metaNode.child)

    if (typeof metaNode.src === "string") {
      return [
        {
          kind: "wimp",
          src: metaNode.src,
          ...(metaNode.fields !== undefined ? { fieldsBinding: metaNode.fields } : {}),
          ...(metaNode.mass !== undefined ? { massBinding: metaNode.mass } : {}),
          ...(childPlans ? { children: childPlans } : {}),
        },
      ]
    }

    return [
      {
        kind: "fuzzy",
        fuzzyKind: "dynamic-meta",
        children: resolveAstMetaBranchSrcs(ast, node).map((src) => ({
          kind: "wimp",
          src,
          ...(metaNode.fields !== undefined ? { fieldsBinding: metaNode.fields } : {}),
          ...(metaNode.mass !== undefined ? { massBinding: metaNode.mass } : {}),
          ...(childPlans ? { children: childPlans } : {}),
        })),
      },
    ]
  }

  if (node.type === "cond") {
    const conditionNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const thenPlans = conditionNode.child?.[0] ? projectAstNode(ast, conditionNode.child[0]) : []
    const elsePlans = conditionNode.child?.[1] ? projectAstNode(ast, conditionNode.child[1]) : []
    return [
      {
        kind: "fuzzy",
        fuzzyKind: "cond",
        predicateBinding: conditionNode.expr !== undefined ? { data: conditionNode.data, expr: conditionNode.expr } : { data: conditionNode.data },
        ...(thenPlans.length > 0 || elsePlans.length > 0 ? { children: [...thenPlans, ...elsePlans] } : {}),
      },
    ]
  }

  if (node.type === "log") {
    const logicalNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const childPlans = projectAstChildren(ast, logicalNode.child)
    return [
      {
        kind: "axion",
        predicateBinding: logicalNode.expr !== undefined ? { data: logicalNode.data, expr: logicalNode.expr } : { data: logicalNode.data },
        ...(childPlans ? { children: childPlans } : {}),
      },
    ]
  }

  if (node.type === "map") {
    const mapNode = node as { data: string; child?: NodeType[] }
    const childPlans = projectAstChildren(ast, mapNode.child)
    return [
      {
        kind: "macho",
        collectionBinding: { data: mapNode.data },
        ...(childPlans ? { children: childPlans } : {}),
      },
    ]
  }

  return []
}

const createAstRuntimeMeta = (src: string, ast: MetaDSL): RuntimeMetaMaterialization => ({
  meta: new Meta({
    src,
    name: ast.name,
    fieldSchemas: ast.fields,
    superposition: ast.superposition,
    processes: ast.processes,
    reactions: ast.reactions,
    matter: ast.matter,
    bulk: ast.bulk,
    mass: toMetaMass(ast.mass),
  }),
  particles: (ast.matter ?? []).flatMap((node) => projectAstNode(ast, node)),
})

const readRuntimeMeta = async (src: string): Promise<RuntimeMetaMaterialization> => {
  const sqlite = await ensureMetaCanonicalized(src)
  if (sqlite) {
    return readDarkMetaParticles(sqlite.db as any, src)
  }

  return createAstRuntimeMeta(src, await loadMetaAST(src))
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
            fieldsBinding: entry.plan.fieldsBinding,
            massBinding: entry.plan.massBinding,
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
  const runtimeMeta = await readRuntimeMeta(wimp.src)
  const meta = registerMeta(runtimeMeta.meta)

  wimp.meta = meta
  if (options.sharedDbWriter) {
    await options.sharedDbWriter.saveMetaBundle(wimp.toSharedDbMetaBundle())
  }
  wimp.fields = materializeFields(wimp, meta.fields, continuation?.fieldInits)
  wimp.mass = continuation?.mass
  dark$.particles.set(wimp.id, wimp)
  if (options.sharedDbWriter) {
    await options.sharedDbWriter.saveWimpBundle(wimp.toSharedDbBundle())
    emitAdd(wimp.id)
  }

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

    yield levelWimps
  }
}

/**
 * Полностью собирает `Wimp` и рекурсивно проходит все обнаруженные дочерние меты.
 *
 * @param wimp Корневой `Wimp`, который нужно полностью собрать.
 * @param continuation Временный пакет данных, который должен быть применён к этому `Wimp` перед обходом.
 * @returns Promise, завершающийся после полного рекурсивного обхода и сборки дочерних мет.
 */
export async function matter(wimp: Wimp, continuation?: MatterContinuation, options: MatterOptions = {}) {
  const shouldEmitGravityBarrier = options.suppressGravityBarrier !== true
  const nestedOptions = shouldEmitGravityBarrier ? { ...options, suppressGravityBarrier: true } : options
  const generator = matterMeta(wimp, continuation, options)
  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await matter(childWimp, childContinuation, nestedOptions)
    }
  }

  if (shouldEmitGravityBarrier) {
    emitBarrier()
  }
}
