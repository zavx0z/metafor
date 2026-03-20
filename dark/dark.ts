import { Fuzzy, Wimp } from "@dark/part"
import type { MetaAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { DarkParticle } from "@dark/types"
import { resolveContinuationSources } from "@dark/gravity"
import { materializeAxion, materializeFuzzy, materializeMacho, materializeWimp, resolveFieldValues } from "@dark/strong"
import { dark$ } from "./store"

/**
 * Минимальный вход для текущего one-meta dark-прохода.
 *
 * На этом шаге pipeline использует только `matter` и `fields`
 * уже загруженной `MetaAST`.
 */
export type MatterAST = Pick<MetaAST, "matter" | "fields">

/**
 * Локальная запись frontier для прямого one-meta traversal.
 *
 * Эта нормализация остаётся полностью внутренней для `dark` и не является
 * архитектурным контрактом pipeline снаружи.
 */
interface MatterNodeEntry {
  kind: "node"
  node: NodeType
  parent: DarkParticle
}

/**
 * Локальная continuation-запись для dynamic meta после materialization её Fuzzy-узла.
 */
interface MatterContinuationEntry {
  kind: "continuation"
  node: NodeMeta
  parent: Fuzzy
  src: string
}

type MatterEntry = MatterNodeEntry | MatterContinuationEntry

const hasChildNodes = (node: NodeType): node is NodeType & { child: NodeType[] } => "child" in node && Array.isArray(node.child)

/**
 * Как только частица создана, dark сразу фиксирует её graph wiring в `dark$`.
 */
const registerParticle = (particle: DarkParticle, parent: DarkParticle): void => {
  parent.children.add(particle.id)
  if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)

  if (particle instanceof Wimp) {
    dark$.meta.set(particle.id, particle.src)
  }

  dark$.particles.set(particle.id, particle)
  dark$.parent.set(particle, parent)
}

/**
 * Дочерние topology-узлы всегда попадают в следующий frontier уже с реальным runtime parent.
 */
const appendChildEntries = (frontier: MatterEntry[], node: NodeType, parent: DarkParticle): void => {
  if (!hasChildNodes(node)) return
  frontier.push(...node.child.map((child): MatterNodeEntry => ({ kind: "node", node: child, parent })))
}

/**
 * Обрабатывает обычный topology entry текущего слоя.
 *
 * На этом шаге dark:
 * - понимает, нужна ли частица для текущего узла;
 * - сразу вызывает `strong` для materialization;
 * - сразу делает wiring в `dark$`;
 * - сразу формирует continuation и child-ветви следующего frontier.
 */
const processMatterNode = (entry: MatterNodeEntry, ast: MatterAST, nextFrontier: MatterEntry[]): DarkParticle | undefined => {
  switch (entry.node.type) {
    case "meta":
      if (typeof entry.node.src === "string") {
        const wimp = materializeWimp(entry.node, entry.node.src, ast.fields)
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        return wimp
      }

      const fuzzy = materializeFuzzy()
      registerParticle(fuzzy, entry.parent)

      for (const src of resolveContinuationSources(entry.node, ast.fields)) {
        nextFrontier.push({ kind: "continuation", node: entry.node, parent: fuzzy, src })
      }

      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return fuzzy
    case "cond": {
      const fuzzy = materializeFuzzy()
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return fuzzy
    }
    case "log": {
      const axion = materializeAxion()
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.node, axion)
      return axion
    }
    case "map": {
      const macho = materializeMacho()
      registerParticle(macho, entry.parent)
      appendChildEntries(nextFrontier, entry.node, macho)
      return macho
    }
    default:
      appendChildEntries(nextFrontier, entry.node, entry.parent)
      return
  }
}

/**
 * Обрабатывает continuation dynamic meta как уже выбранный `src` для нового Wimp.
 */
const processContinuation = (
  entry: MatterContinuationEntry,
  ast: MatterAST,
  nextFrontier: MatterEntry[],
): Wimp => {
  const wimp = materializeWimp(entry.node, entry.src, ast.fields)
  registerParticle(wimp, entry.parent)
  appendChildEntries(nextFrontier, entry.node, wimp)
  return wimp
}

/**
 * Регистрирует root Wimp до обхода.
 *
 * Это отдельный шаг текущего one-meta pipeline: после него `dark` уже знает точку входа,
 * от которой будет строить весь локальный traversal.
 */
export const initializeMatterRoot = (wimp: Wimp, ast: MatterAST, parent?: Wimp): void => {
  wimp.values = resolveFieldValues(ast.fields)
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)
  if (parent) dark$.parent.set(wimp, parent)
}

/**
 * Явный layer-by-layer pipeline одной meta.
 *
 * Генератор возвращает не промежуточные `seed/build`, а уже реальные runtime-частицы
 * текущего слоя. По ним можно отследить ход прохода без восстановления скрытой модели.
 */
export function* matterGenerator(wimp: Wimp, ast: MatterAST): Generator<DarkParticle[]> {
  if (!ast.matter) return

  let frontier = Array.from(ast.matter, (node): MatterEntry => ({ kind: "node", node, parent: wimp }))

  while (frontier.length > 0) {
    const currentLayer = frontier
    const nextFrontier: MatterEntry[] = []
    const particles: DarkParticle[] = []

    frontier = nextFrontier

    for (const entry of currentLayer) {
      const particle =
        entry.kind === "continuation" ? processContinuation(entry, ast, nextFrontier) : processMatterNode(entry, ast, nextFrontier)
      if (particle) particles.push(particle)
    }

    if (particles.length > 0) yield particles
  }
}

/**
 * Обёртка над явным генератором для мест, где нужен готовый список дочерних Wimp.
 */
export const matterPipeline = (wimp: Wimp, ast: MatterAST, parent?: Wimp): Wimp[] => {
  initializeMatterRoot(wimp, ast, parent)
  const wimps: Wimp[] = []

  for (const particles of matterGenerator(wimp, ast)) {
    for (const particle of particles) {
      if (particle instanceof Wimp) wimps.push(particle)
    }
  }

  return wimps
}
