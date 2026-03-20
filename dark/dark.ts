import type { NodeType } from "@metafor/dsl"
import type { MatterEntry, MatterNodeEntry, MatterAST, MatterContinuationEntry } from "@dark/types/dark"
import type { DarkParticle } from "@dark/types"
import { resolveContinuationSources } from "@dark/gravity"
import {
  Axion,
  Fuzzy,
  Macho,
  Wimp,
  materializeWimp,
  resolveFieldValues,
} from "@dark/strong"
import { dark$ } from "./store"

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
  if (!("child" in node && Array.isArray(node.child))) return
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
const processMatterNode = (
  entry: MatterNodeEntry,
  ast: MatterAST,
  nextFrontier: MatterEntry[],
): DarkParticle | undefined => {
  switch (entry.node.type) {
    case "meta":
      if (typeof entry.node.src === "string") {
        const wimp = materializeWimp(entry.node, entry.node.src, ast.fields)
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        return wimp
      }

      const fuzzy = new Fuzzy()
      registerParticle(fuzzy, entry.parent)

      for (const src of resolveContinuationSources(entry.node, ast.fields)) {
        nextFrontier.push({ kind: "continuation", node: entry.node, parent: fuzzy, src })
      }

      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return fuzzy
    case "cond": {
      const fuzzy = new Fuzzy()
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return fuzzy
    }
    case "log": {
      const axion = new Axion()
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.node, axion)
      return axion
    }
    case "map": {
      const macho = new Macho()
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
const processContinuation = (entry: MatterContinuationEntry, ast: MatterAST, nextFrontier: MatterEntry[]): Wimp => {
  const wimp = materializeWimp(entry.node, entry.src, ast.fields)
  registerParticle(wimp, entry.parent)
  appendChildEntries(nextFrontier, entry.node, wimp)
  return wimp
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
        entry.kind === "continuation"
          ? processContinuation(entry, ast, nextFrontier)
          : processMatterNode(entry, ast, nextFrontier)
      if (particle) particles.push(particle)
    }

    if (particles.length > 0) yield particles
  }
}

export const matterPipeline = (wimp: Wimp, ast: MatterAST, parent?: Wimp): Wimp[] => {
  wimp.values = resolveFieldValues(ast.fields)
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)
  if (parent) dark$.parent.set(wimp, parent)

  const wimps: Wimp[] = []

  for (const particles of matterGenerator(wimp, ast)) {
    for (const particle of particles) {
      if (particle instanceof Wimp) wimps.push(particle)
    }
  }

  return wimps
}
