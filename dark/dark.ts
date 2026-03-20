import { Fuzzy, Wimp } from "@dark/part"
import type { MetaAST } from "@metafor/ast"
import type { DarkParticle } from "@dark/types"
import type { MatterNode, ParticleSeed, SeedParent } from "@dark/types/gravity"
import type { ParticleBuild } from "@dark/types/strong"
import { createContinuationSeeds, createParticleSeed } from "@dark/gravity"
import { materializeParticles, resolveFieldValues } from "@dark/strong"
import { dark$ } from "./store"

// Для текущего one-meta прохода dark видит только matter и fields текущей meta.
type MatterAST = Pick<MetaAST, "matter" | "fields">
type MatterEntry = MatterNode | ParticleSeed

// Во frontier одновременно живут ещё не разобранные AST-узлы и уже подготовленные seed.
const isParticleSeed = (value: MatterEntry | SeedParent): value is ParticleSeed => "kind" in value

// Временное сопоставление seed -> particle остаётся локальным внутри dark-прохода.
const resolveParent = (parent: SeedParent, particles: Map<ParticleSeed, DarkParticle>): DarkParticle => {
  if (!isParticleSeed(parent)) return parent

  const particle = particles.get(parent)
  if (!particle) throw new Error(`Particle seed parent is not materialized: ${parent.kind}`)
  return particle
}

// Как только слой materialized, dark сразу фиксирует wiring в основном runtime store.
const registerBuild = (build: ParticleBuild): void => {
  const { particle, parent } = build

  parent.children.add(particle.id)
  if (parent instanceof Fuzzy) parent.branch.set(particle.id, particle)

  if (particle instanceof Wimp) {
    dark$.meta.set(particle.id, particle.src)
  }

  dark$.particles.set(particle.id, particle)
  dark$.parent.set(particle, parent)
}

// Dark сам собирает следующий frontier: continuation из Fuzzy и child-ветви текущих узлов.
const collectMatterLayer = (frontier: MatterEntry[], ast: MatterAST): { seeds: ParticleSeed[]; nextFrontier: MatterEntry[] } => {
  const seeds: ParticleSeed[] = []
  const nextFrontier: MatterEntry[] = []

  for (const entry of frontier) {
    if (isParticleSeed(entry)) {
      seeds.push(entry)
      continue
    }

    const seed = createParticleSeed(entry.node, entry.parent, ast.fields)
    const parent = seed ?? entry.parent

    if (seed) {
      seeds.push(seed)

      if (entry.node.type === "meta" && typeof entry.node.src === "object" && seed.kind === "fuzzy") {
        nextFrontier.push(...createContinuationSeeds(entry.node, seed, ast.fields))
      }
    }

    if ("child" in entry.node && Array.isArray(entry.node.child)) {
      nextFrontier.push(...entry.node.child.map((node): MatterNode => ({ node, parent })))
    }
  }

  return { seeds, nextFrontier }
}

// Root Wimp регистрируется до обхода, потому что весь дальнейший one-meta pipeline строится относительно него.
export const initializeMatterRoot = (wimp: Wimp, ast: MatterAST, parent?: Wimp): void => {
  wimp.values = resolveFieldValues(ast.fields)
  dark$.particles.set(wimp.id, wimp)
  dark$.meta.set(wimp.id, wimp.src)
  if (parent) dark$.parent.set(wimp, parent)
}

// Явный layer-by-layer pipeline одной meta: dark владеет traversal, а strong только materialization.
export function* matterGenerator(wimp: Wimp, ast: MatterAST): Generator<ParticleBuild[]> {
  if (!ast.matter) return

  const materialized = new Map<ParticleSeed, DarkParticle>()
  let frontier = Array.from(ast.matter, (node): MatterEntry => ({ node, parent: wimp }))

  while (frontier.length > 0) {
    const { seeds, nextFrontier } = collectMatterLayer(frontier, ast)
    frontier = nextFrontier

    if (seeds.length === 0) continue

    // Strong создаёт runtime instances, но не знает ничего о parent wiring текущего прохода.
    const materializations = materializeParticles(seeds, ast.fields)
    for (const materialization of materializations) {
      materialized.set(materialization.seed, materialization.particle)
    }

    // После materialization dark сам восстанавливает parent по локальному build-state.
    const builds = materializations.map<ParticleBuild>(({ seed, particle }) => ({
      seed,
      particle,
      parent: resolveParent(seed.parent, materialized),
      meta: seed.meta,
    }))

    for (const build of builds) registerBuild(build)
    yield builds
  }
}

// Обёртка над явным генератором для мест, где нужен готовый список дочерних Wimp.
export const matterPipeline = (wimp: Wimp, ast: MatterAST, parent?: Wimp): Wimp[] => {
  initializeMatterRoot(wimp, ast, parent)
  const wimps: Wimp[] = []

  for (const builds of matterGenerator(wimp, ast)) {
    for (const build of builds) {
      if (build.particle instanceof Wimp) wimps.push(build.particle)
    }
  }

  return wimps
}
