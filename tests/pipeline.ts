import type {
  Binding,
  DarkGraph,
  DarkTopologyDependencySeed,
  DynamicBinding,
  FuzzyID,
  Fuzzy,
  ParticleID,
  WimpID,
  Wimp,
} from "@dark/types"
import type { Address } from "@dark/types/dark"
import type { MetaAST } from "@metafor/ast"
import type { ValueDynamic } from "../metafor/template/parser.t"
import type { NodeCondition, NodeLogical, NodeMeta } from "@metafor/dsl"
import { graph$ } from "./store.ts"
import { resetGraph, snapshotGraph } from "./fixtures/index.ts"

export type ParentContext = {
  metaAddress: Address
  viaParticle: "wimp" | "fuzzy" | "macho" | "axion"
  parentParticleId: ParticleID
}

export type EntanglementContext = {
  id: string
  inherited: boolean
}

export type StepInput = {
  metaAddress: Address
  branchAddress: string
  parentContext: ParentContext | null
  entanglement: EntanglementContext | null
  viaParticle: ParentContext["viaParticle"] | null
}

export type StepWimpParticle = Wimp
export type StepFuzzyParticle = Fuzzy
export type StepParticle = Wimp | Fuzzy

export type StepGuard = {
  particleId: FuzzyID
  kind: "fuzzy"
  basis: string | string[]
  expr?: string
}

export type StepContinuation =
  | {
      kind: "wimp-load"
      mode: "static"
      fromParticleId: WimpID
      metaAddress: string
      fields?: Binding<Record<string, unknown>>
      mass?: Binding<Record<string, unknown>>
      parentContext: ParentContext | null
      entanglement: EntanglementContext | null
      viaParticle: "wimp"
      guard?: StepGuard
    }
  | {
      kind: "wimp-load"
      mode: "dynamic"
      fromParticleId: FuzzyID
      basis: string | string[]
      expr?: string
      fields?: Binding<Record<string, unknown>>
      mass?: Binding<Record<string, unknown>>
      parentContext: ParentContext | null
      entanglement: EntanglementContext | null
      viaParticle: "fuzzy"
    }

export type StepResult = {
  metaAddress: Address
  branchAddress: string
  graph: DarkGraph
  continuations: StepContinuation[]
  dependencySeeds: DarkTopologyDependencySeed[]
  parentContext: ParentContext | null
  entanglement: EntanglementContext | null
  viaParticle: ParentContext["viaParticle"] | null
}

export function normalizeBinding(
  value: NodeMeta["fields"] | NodeMeta["mass"],
): Binding<Record<string, unknown>> | undefined {
  if (!value) return undefined
  if (typeof value === "string") {
    return {
      mode: "static",
      value: value as unknown as Record<string, unknown>,
    }
  }

  const result: DynamicBinding = {
    mode: "dynamic",
    basis: value.data,
  }
  if ("expr" in value && value.expr) {
    result.expr = value.expr
  }
  return result
}

export function createWimpId(): WimpID {
  return crypto.randomUUID()
}

export function createFuzzyId(): FuzzyID {
  return crypto.randomUUID()
}

export function getDynamicExpr(
  value: NodeMeta["fields"] | NodeMeta["mass"] | NodeMeta["src"],
): string | undefined {
  return value && typeof value === "object" && "expr" in value ? value.expr : undefined
}

export function appendParticle(
  graph: DarkGraph,
  particle: StepParticle,
  parentId?: ParticleID,
): StepParticle {
  const stored = structuredClone(particle) as StepParticle
  graph.particles.set(stored.id, stored)
  if (parentId) {
    graph.parent.set(stored.id, parentId)
    const parent = graph.particles.get(parentId)
    if (parent) {
      parent.children.add(stored.id)
    }
  } else {
    graph.roots.add(stored.id)
  }
  if (stored.kind === "wimp") {
    graph.meta.set(stored.id, stored.src)
  }
  return stored
}

export function normalizeStaticWimp(node: NodeMeta): StepWimpParticle {
  if (typeof node.src !== "string") {
    throw new Error("Step: статический Wimp должен иметь строковый src")
  }

  const result: StepWimpParticle = {
    id: createWimpId(),
    kind: "wimp",
    src: node.src,
    children: new Set(),
  }
  if (node.fields) {
    const fields = normalizeBinding(node.fields)
    if (fields) result.fields = fields
  }
  if (node.mass) {
    const mass = normalizeBinding(node.mass)
    if (mass) result.mass = mass
  }
  return result
}

export function normalizeFuzzy(node: NodeLogical | NodeCondition): StepFuzzyParticle {
  const result: StepFuzzyParticle = {
    id: createFuzzyId(),
    kind: "fuzzy",
    basis: node.data,
    children: new Set(),
  }
  if (node.expr) {
    result.expr = node.expr
  }
  return result
}

export function collectTopologyDependencySeeds(
  ast: MetaAST,
  input: StepInput,
): DarkTopologyDependencySeed[] {
  const result: DarkTopologyDependencySeed[] = []
  for (const [field, definition] of Object.entries(ast.fields)) {
    if (definition.type.startsWith("enum<")) {
      result.push({
        metaAddress: input.metaAddress,
        branchAddress: input.branchAddress,
        field,
        fieldType: definition.type,
        topologyKind: "enum",
        sourcePath: `/value/${field}`,
        participatesInEntanglement: false,
        mutableFromReaction: false,
        mutableDuringProcess: false,
      })
    } else if (definition.type.startsWith("array<")) {
      result.push({
        metaAddress: input.metaAddress,
        branchAddress: input.branchAddress,
        field,
        fieldType: definition.type,
        topologyKind: "array",
        sourcePath: `/value/${field}`,
        participatesInEntanglement: false,
        mutableFromReaction: false,
        mutableDuringProcess: false,
      })
    }
  }
  return result
}

export function collectBranchGraph(
  node: NodeLogical | NodeCondition,
  graph: DarkGraph,
  input: StepInput,
  continuations: StepContinuation[],
  parentId?: ParticleID,
): StepFuzzyParticle {
  const fuzzy = appendParticle(graph, normalizeFuzzy(node), parentId) as StepFuzzyParticle

  const guard: StepGuard = {
    particleId: fuzzy.id,
    kind: "fuzzy",
    basis: node.data,
  }
  if (node.expr) {
    guard.expr = node.expr
  }

  for (const child of node.child) {
    if (child.type === "meta" && typeof child.src === "string") {
      const wimp = appendParticle(graph, normalizeStaticWimp(child), fuzzy.id) as StepWimpParticle
      const continuation: Extract<StepContinuation, { mode: "static" }> = {
        kind: "wimp-load",
        mode: "static",
        fromParticleId: wimp.id,
        metaAddress: wimp.src,
        parentContext: input.parentContext,
        entanglement: input.entanglement,
        viaParticle: "wimp",
        guard,
      }
      if (wimp.fields) continuation.fields = wimp.fields
      if (wimp.mass) continuation.mass = wimp.mass
      continuations.push(continuation)
      continue
    }

    if (child.type === "log" || child.type === "cond") {
      collectBranchGraph(child, graph, input, continuations, fuzzy.id)
    }
  }

  return fuzzy
}

export function processLoadedMetaStep(ast: MetaAST, input: StepInput): StepResult {
  resetGraph()
  const graph = graph$
  const continuations: StepContinuation[] = []

  for (const node of ast.gravity ?? []) {
    if (node.type === "meta") {
      if (typeof node.src === "string") {
        const wimp = appendParticle(graph, normalizeStaticWimp(node)) as StepWimpParticle
        const continuation: Extract<StepContinuation, { mode: "static" }> = {
          kind: "wimp-load",
          mode: "static",
          fromParticleId: wimp.id,
          metaAddress: wimp.src,
          parentContext: input.parentContext,
          entanglement: input.entanglement,
          viaParticle: "wimp",
        }
        if (wimp.fields) continuation.fields = wimp.fields
        if (wimp.mass) continuation.mass = wimp.mass
        continuations.push(continuation)
        continue
      }

      const addressParticle = appendParticle(graph, {
        id: createFuzzyId(),
        kind: "fuzzy",
        basis: node.src.data,
        children: new Set(),
      }) as StepFuzzyParticle
      const srcExprAddr = getDynamicExpr(node.src as ValueDynamic)
      if (srcExprAddr) {
        addressParticle.expr = srcExprAddr
      }

      const dynamicContinuation: Extract<StepContinuation, { mode: "dynamic" }> = {
        kind: "wimp-load",
        mode: "dynamic",
        fromParticleId: addressParticle.id,
        basis: node.src.data,
        parentContext: input.parentContext,
        entanglement: input.entanglement,
        viaParticle: "fuzzy",
      }
      const srcExprDyn = getDynamicExpr(node.src as ValueDynamic)
      if (srcExprDyn) {
        dynamicContinuation.expr = srcExprDyn
      }
      if (node.fields) {
        const fields = normalizeBinding(node.fields)
        if (fields) dynamicContinuation.fields = fields
      }
      if (node.mass) {
        const mass = normalizeBinding(node.mass)
        if (mass) dynamicContinuation.mass = mass
      }
      continuations.push(dynamicContinuation)
      continue
    }

    if (node.type === "log" || node.type === "cond") {
      collectBranchGraph(node, graph, input, continuations)
    }
  }

  return {
    metaAddress: input.metaAddress,
    branchAddress: input.branchAddress,
    graph: snapshotGraph(),
    continuations,
    dependencySeeds: collectTopologyDependencySeeds(ast, input),
    parentContext: input.parentContext,
    entanglement: input.entanglement,
    viaParticle: input.viaParticle,
  }
}

export async function processMetaStep(input: StepInput): Promise<StepResult> {
  const { loadMetaAST } = await import("../dark/load")
  const ast = (await loadMetaAST(input.metaAddress)) as MetaAST
  return processLoadedMetaStep(ast, input)
}

export function getFuzzyByBasis(
  graph: DarkGraph,
  basis: string | string[],
  expr?: string,
): Fuzzy {
  const particle = [...graph.particles.values()].find(
    (item): item is Fuzzy =>
      item.kind === "fuzzy" &&
      "basis" in item &&
      JSON.stringify(item.basis) === JSON.stringify(basis) &&
      "expr" in item &&
      item.expr === expr,
  )
  if (!particle) throw new Error(`Fuzzy not found for basis: ${JSON.stringify(basis)}`)
  return particle
}

export function getWimpBySrc(graph: DarkGraph, src: string): Wimp {
  const particle = [...graph.particles.values()].find(
    (item): item is Wimp => item.kind === "wimp" && "src" in item && item.src === src,
  )
  if (!particle) throw new Error(`Wimp not found for src: ${src}`)
  return particle
}
