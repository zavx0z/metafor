import type { NodeType } from "@metafor/dsl"
import type {
  MatterContinuation,
  MatterContinuationEntry,
  MatterEntry,
  MatterLayerResult,
  MatterNodeEntry,
  MatterAST,
  MatterWimpResult,
} from "@dark/types/dark"
import type { DarkParticle } from "@dark/types"
import { resolveContinuationSources } from "@dark/gravity"
import { Axion, Fuzzy, Macho, resolveWimpContinuation, Wimp, resolveFieldValues } from "@dark/strong"
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
 * - materialize не-Wimp частицы текущей meta;
 * - для meta-узлов создаёт пустые `Wimp` и continuation к ним;
 * - сразу делает wiring в `dark$`;
 * - сразу формирует child-ветви следующего frontier и Wimp-результат текущего слоя.
 */
const processMatterNode = (
  entry: MatterNodeEntry,
  ast: MatterAST,
  nextFrontier: MatterEntry[],
  wimps: MatterWimpResult[],
): void => {
  switch (entry.node.type) {
    case "meta":
      if (typeof entry.node.src === "string") {
        const continuation = resolveWimpContinuation(entry.node, ast.fields)
        const wimp = new Wimp(entry.node.src)
        wimps.push([wimp, continuation])
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        return
      }

      const fuzzy = new Fuzzy()
      registerParticle(fuzzy, entry.parent)

      const continuation = resolveWimpContinuation(entry.node, ast.fields)
      for (const src of resolveContinuationSources(entry.node, ast.fields)) {
        nextFrontier.push({ kind: "continuation", node: entry.node, parent: fuzzy, src, continuation })
      }

      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return
    case "cond": {
      const fuzzy = new Fuzzy()
      registerParticle(fuzzy, entry.parent)
      appendChildEntries(nextFrontier, entry.node, fuzzy)
      return
    }
    case "log": {
      const axion = new Axion()
      registerParticle(axion, entry.parent)
      appendChildEntries(nextFrontier, entry.node, axion)
      return
    }
    case "map": {
      const macho = new Macho()
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
 * Явный layer-by-layer pipeline одной meta.
 *
 * На первом `next()` pipeline инициализирует root `Wimp`, затем обрабатывает первый слой
 * и yield-ит только те `Wimp`, которые были обнаружены именно на этом шаге.
 *
 * Остальные частицы (`Fuzzy`, `Axion`, `Macho`) не возвращаются наружу:
 * вся их runtime-информация сразу складывается в `dark$`.
 *
 * Даже если на уровне не появился ни один новый `Wimp`, pipeline всё равно yield-ит
 * пустой массив, чтобы снаружи не терялась граница между слоями прохода.
 */
export function* matterPipeline(
  wimp: Wimp,
  ast: MatterAST,
  continuation?: MatterContinuation,
  parent?: DarkParticle,
): Generator<MatterLayerResult, void> {
  /**
   * `Wimp` получает входные данные.
   * Если continuation пришёл от родителя, он важнее локальных defaults текущей meta.
   * Более сложное entanglement/merge поведение остаётся отдельным следующим шагом.
   */
  wimp.values = continuation?.values ?? resolveFieldValues(ast.fields)
  wimp.mass = continuation?.mass ?? (ast.mass && Object.keys(ast.mass).length > 0 ? ast.mass : undefined)
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)

  if (parent) dark$.parent.set(wimp, parent)

  if (!ast.matter) return

  let frontier = Array.from(ast.matter, (node): MatterEntry => ({ kind: "node", node, parent: wimp }))

  while (frontier.length > 0) {
    const currentLayer = frontier
    const nextFrontier: MatterEntry[] = []
    const levelWimps: MatterLayerResult = []

    frontier = nextFrontier

    for (const entry of currentLayer) {
      if (entry.kind === "continuation") {
        /**
         * Обрабатывает continuation dynamic meta как уже выбранный `src` для нового Wimp.
         * Сам `Wimp` здесь тоже остаётся пустым: continuation только прикладывается к нему
         * позже, когда его собственная meta будет загружена и передана в `matterPipeline`.
         */
        const wimp = new Wimp(entry.src)
        levelWimps.push([wimp, entry.continuation])
        registerParticle(wimp, entry.parent)
        appendChildEntries(nextFrontier, entry.node, wimp)
        continue
      }

      processMatterNode(entry, ast, nextFrontier, levelWimps)
    }

    yield levelWimps
  }
}
