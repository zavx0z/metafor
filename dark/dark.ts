import type { NodeType } from "@metafor/dsl"
import type {
  MatterEntry,
  MatterContinuation,
  MatterLayerResult,
  MatterNodeEntry,
  MatterAST,
  MatterWimpResult,
} from "@dark/types/dark"
import type { DarkParticle } from "@dark/types"
import { resolveContinuationSources } from "@dark/gravity"
import { Axion, Fuzzy, Macho, materializeFields, resolveWimpContinuation, type Meta, Wimp } from "@dark/strong"
import { loadMeta, loadMetaAST } from "./load.ts"
import { dark$ } from "./store"

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

const resolveRegisteredMeta = async (src: string): Promise<Meta> => {
  const existing = findMetaBySrc(src)
  if (existing) return existing

  return registerMeta(await loadMeta(src))
}

/**
 * Дочерние топологические узлы всегда попадают в следующий шаг обхода уже с реальным родителем.
 */
const appendChildEntries = (frontier: MatterEntry[], node: NodeType, parent: DarkParticle): void => {
  if (!("child" in node && Array.isArray(node.child))) return
  frontier.push(...node.child.map((child): MatterNodeEntry => ({ kind: "node", node: child, parent })))
}

/**
 * Обрабатывает обычную запись текущего топологического слоя.
 *
 * На этом шаге dark:
 * - понимает, нужна ли частица для текущего узла;
 * - создаёт не-Wimp частицы текущей меты;
 * - для meta-узлов создаёт пустые `Wimp` и временные пакеты данных к ним;
 * - сразу делает wiring в `dark$`;
 * - сразу формирует дочерние ветви следующего шага обхода и результат текущего слоя.
 */
const processMatterNode = (
  entry: MatterNodeEntry,
  ast: MatterAST,
  fields: Wimp["fields"],
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
): void => {
  switch (entry.node.type) {
    case "meta":
      if (typeof entry.node.src === "string") {
        const continuation = cloneContinuation(resolveWimpContinuation(entry.node, fields))
        const wimp = new Wimp({ src: entry.node.src, parent: entry.parent })
        wimps.push([wimp, continuation])
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        return
      }

      const fuzzy = new Fuzzy({ parent: entry.parent })
      registerParticle(fuzzy, entry.parent)

      const continuation = resolveWimpContinuation(entry.node, fields)
      for (const src of resolveContinuationSources(entry.node, ast.fields)) {
        nextFrontier.push({
          kind: "continuation",
          node: entry.node,
          parent: fuzzy,
          src,
          continuation: cloneContinuation(continuation),
        })
      }

      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return
    case "cond": {
      const fuzzy = new Fuzzy({ parent: entry.parent })
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return
    }
    case "log": {
      const axion = new Axion({ parent: entry.parent })
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.node, axion)
      return
    }
    case "map": {
      const macho = new Macho({ parent: entry.parent })
      registerParticle(macho, entry.parent)
      appendChildEntries(nextFrontier, entry.node, macho)
      return
    }
    default:
      appendChildEntries(nextFrontier, entry.node, entry.parent)
      return
  }
}

/**
 * Явный послойный проход одной меты.
 *
 * На первом `next()` генератор инициализирует корневой `Wimp`, затем обрабатывает первый слой
 * и yield-ит только те `Wimp`, которые были обнаружены именно на этом шаге.
 *
 * Остальные частицы (`Fuzzy`, `Axion`, `Macho`) не возвращаются наружу:
 * вся информация о них сразу складывается в `dark$`.
 *
 * Даже если на уровне не появился ни один новый `Wimp`, pipeline всё равно yield-ит
 * пустой массив, чтобы снаружи не терялась граница между слоями прохода.
 *
 * @param wimp Корневой `Wimp` текущей меты, который должен быть собран.
 * @param continuation Временный пакет данных, пришедший от родительского шага обхода.
 * @returns Асинхронный поток по слоям из обнаруженных дочерних `Wimp` и их временных пакетов данных.
 */
export async function* matterMeta(
  wimp: Wimp,
  continuation?: MatterContinuation,
): AsyncGenerator<MatterLayerResult, void> {
  const meta = await resolveRegisteredMeta(wimp.src)
  const ast = await loadMetaAST(meta.src)
  /**
   * `Wimp` получает ссылку на канонический `Meta`,
   * а instance-level поля materialize-ятся уже из `MetaField`.
   */
  wimp.meta = meta
  wimp.fields = materializeFields(wimp, meta.fields, continuation?.fieldInits)
  /**
   * `Wimp` получает локальные ORM-поля.
   * Если временный пакет пришёл от родителя, его `FieldInit` важнее локальных `default` текущей меты.
   * Более сложное объединение связанных полей остаётся отдельным следующим шагом.
   */
  wimp.mass = continuation?.mass
  dark$.particles.set(wimp.id, wimp)

  if (!ast.matter) return

  /**
   * Очередь обхода хранит только текущий слой.
   * Это важно: временный пакет данных остаётся переходным механизмом и не оседает в `Wimp`.
   */
  let frontier = Array.from(ast.matter, (node): MatterEntry => ({ kind: "node", node, parent: wimp }))

  while (frontier.length > 0) {
    const currentLayer = frontier
    const nextFrontier: MatterEntry[] = []
    const levelWimps: MatterLayerResult = []

    frontier = nextFrontier

    for (const entry of currentLayer) {
      if (entry.kind === "continuation") {
        /**
         * Обрабатывает уже разрешённую динамическую мету как выбранный `src` для нового `Wimp`.
         * Сам `Wimp` здесь тоже остаётся пустым: временный пакет данных применяется позже,
         * когда загрузится его собственная мета.
         */
        const wimp = new Wimp({ src: entry.src, parent: entry.parent })
        levelWimps.push([wimp, cloneContinuation(entry.continuation)])
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        continue
      }

      processMatterNode(entry, ast, wimp.fields, nextFrontier, levelWimps)
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
export async function matter(wimp: Wimp, continuation?: MatterContinuation) {
  const generator = matterMeta(wimp, continuation)
  for await (const wimps of generator) {
    for (const [childWimp, childContinuation] of wimps) {
      await matter(childWimp, childContinuation)
    }
  }
}
