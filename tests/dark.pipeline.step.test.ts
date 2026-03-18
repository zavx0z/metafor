import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import "fixture/test"

import type {
  Binding,
  DarkGraph,
  DarkParticle,
  DarkTopologyDependencySeed,
  DynamicBinding,
  FuzzyID,
  Fuzzy,
  ParticleID,
  WimpID,
  Wimp,
} from "@dark/types"
import type { Address } from "@dark/types/dark"
import { convertMetaDSLToMetaAST, type MetaAST } from "../metafor/ast/index.ts"
import { MetaFor } from "../metafor/dsl/metafor.ts"
import { parse, type NodeCondition, type NodeLogical, type NodeMeta, type NodeType } from "../metafor/template/index.ts"
import type { ValueDynamic } from "../metafor/template/parser.t"

import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"

type ParentContext = {
  metaAddress: Address
  viaParticle: "wimp" | "fuzzy" | "macho" | "axion"
  parentParticleId: ParticleID
}

type EntanglementContext = {
  id: string
  inherited: boolean
}

type StepInput = {
  metaAddress: Address
  branchAddress: string
  parentContext: ParentContext | null
  entanglement: EntanglementContext | null
  viaParticle: ParentContext["viaParticle"] | null
}

type StepWimpParticle = Wimp
type StepFuzzyParticle = Fuzzy
type StepParticle = Wimp | Fuzzy

type StepGuard = {
  particleId: FuzzyID
  kind: "fuzzy"
  basis: string | string[]
  expr?: string
}

type StepContinuation =
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

type StepResult = {
  metaAddress: Address
  branchAddress: string
  graph: DarkGraph
  continuations: StepContinuation[]
  dependencySeeds: DarkTopologyDependencySeed[]
  parentContext: ParentContext | null
  entanglement: EntanglementContext | null
  viaParticle: ParentContext["viaParticle"] | null
}

type MutableStepGraph = DarkGraph

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
})

function normalizeBinding(value: NodeMeta["fields"] | NodeMeta["mass"]): Binding<Record<string, unknown>> | undefined {
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

function createWimpId(): WimpID {
  return crypto.randomUUID()
}

function createFuzzyId(): FuzzyID {
  return crypto.randomUUID()
}

function getDynamicExpr(value: NodeMeta["fields"] | NodeMeta["mass"] | NodeMeta["src"]): string | undefined {
  return value && typeof value === "object" && "expr" in value ? value.expr : undefined
}

function createEmptyGraph(): MutableStepGraph {
  return {
    roots: new Set(),
    particles: new Map<ParticleID, DarkParticle>(),
    parent: new Map(),
    meta: new Map(),
  }
}

function appendParticle(graph: MutableStepGraph, particle: StepParticle, parentId?: ParticleID): void {
  graph.particles.set(particle.id, particle)
  if (parentId) {
    graph.parent.set(particle.id, parentId)
    const parent = graph.particles.get(parentId)
    if (parent) {
      parent.children.add(particle.id)
    }
  } else {
    graph.roots.add(particle.id)
  }
  if (particle.kind === "wimp") {
    graph.meta.set(particle.id, particle.src)
  }
}

function normalizeStaticWimp(node: NodeMeta): StepWimpParticle {
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

function normalizeFuzzy(node: NodeLogical | NodeCondition): StepFuzzyParticle {
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

function collectTopologyDependencySeeds(ast: MetaAST, input: StepInput): DarkTopologyDependencySeed[] {
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

function collectBranchGraph(
  node: NodeLogical | NodeCondition,
  graph: MutableStepGraph,
  input: StepInput,
  continuations: StepContinuation[],
  parentId?: ParticleID,
): StepFuzzyParticle {
  const fuzzy = normalizeFuzzy(node)
  appendParticle(graph, fuzzy, parentId)

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
      const wimp = normalizeStaticWimp(child)
      appendParticle(graph, wimp, fuzzy.id)
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

function processLoadedMetaStep(ast: MetaAST, input: StepInput): StepResult {
  const graph = createEmptyGraph()
  const continuations: StepContinuation[] = []

  for (const node of ast.gravity ?? []) {
    if (node.type === "meta") {
      if (typeof node.src === "string") {
        const wimp = normalizeStaticWimp(node)
        appendParticle(graph, wimp)
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

      const addressParticle: StepFuzzyParticle = {
        id: createFuzzyId(),
        kind: "fuzzy",
        basis: node.src.data,
        children: new Set(),
      }
      const srcExprAddr = getDynamicExpr(node.src as ValueDynamic)
      if (srcExprAddr) {
        addressParticle.expr = srcExprAddr
      }
      appendParticle(graph, addressParticle)

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
    graph: {
      roots: graph.roots,
      particles: graph.particles,
      parent: graph.parent,
      meta: graph.meta,
    },
    continuations,
    dependencySeeds: collectTopologyDependencySeeds(ast, input),
    parentContext: input.parentContext,
    entanglement: input.entanglement,
    viaParticle: input.viaParticle,
  }
}

async function processMetaStep(input: StepInput): Promise<StepResult> {
  const ast = (await loadMetaAST(input.metaAddress)) as MetaAST
  return processLoadedMetaStep(ast, input)
}

function getFuzzyByBasis(graph: DarkGraph, basis: string | string[], expr?: string): Fuzzy {
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

function getWimpBySrc(graph: DarkGraph, src: string): Wimp {
  const particle = [...graph.particles.values()].find(
    (item): item is Wimp => item.kind === "wimp" && "src" in item && item.src === src,
  )
  if (!particle) throw new Error(`Wimp not found for src: ${src}`)
  return particle
}

function createSyntheticTopologyMetaAst(): MetaAST {
  const sourceText = `
    const meta = MetaFor("test-topology")
      .fields((field) => ({
        operation: field.enum("single", "list").required("single"),
        items: field.array.required<string>(["a", "b"]),
        label: field.string.required("demo"),
      }))
  `

  const meta = MetaFor("test-topology")
    .fields((field) => ({
      operation: field.enum("single", "list").required("single"),
      items: field.array.required<string>(["a", "b"]),
      label: field.string.required("demo"),
    }))
    .superposition({ idle: null })
    .mass({})
    .processes(() => ({}))
    .reactions(() => [])
    .gravity(
      ({ html, value }) => html`
        ${value.operation === "single"
          ? html`<meta-for src="zavx0z/item-single" />`
          : value.items.map((item) => html`<meta-for src="zavx0z/item" fields=${{ label: item }} />`)}
      `,
    )
    .bulk()

  return convertMetaDSLToMetaAST(meta as any, sourceText)
}

describe("Dark pipeline step — контракт одного шага", () => {
  test("должен принимать адрес текущей meta, контекст родителя и entanglement", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: {
        metaAddress: "zavx0z/root" as Address,
        viaParticle: "wimp",
        parentParticleId: crypto.randomUUID(),
      },
      entanglement: {
        id: "ent:root@w:0",
        inherited: true,
      },
      viaParticle: "wimp",
    })

    expect(result.metaAddress).toBe("zavx0z/git")
    expect(result.branchAddress).toBe("root")
    expect(result.parentContext).toEqual({
      metaAddress: "zavx0z/root",
      viaParticle: "wimp",
      parentParticleId: result.parentContext!.parentParticleId,
    })
    expect(result.entanglement).toEqual({
      id: "ent:root@w:0",
      inherited: true,
    })
    expect(result.viaParticle).toBe("wimp")
  })

  test("должен за один шаг формировать частицы текущего уровня и continuation-данные", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: null,
      entanglement: null,
      viaParticle: null,
    })

    const selector = getFuzzyByBasis(result.graph, "/value/operation", "zavx0z/git-${_[0]}")
    const branch = getFuzzyByBasis(result.graph, "/state", '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"')
    const errorWimp = getWimpBySrc(result.graph, "zavx0z/git-error")

    expect(selector.id).toBeUUID()
    expect(branch.id).toBeUUID()
    expect(errorWimp.id).toBeUUID()
    expect(result.graph.roots).toEqual(new Set([selector.id, branch.id]))
    expect(selector.children).toEqual(new Set())
    expect(branch.children).toEqual(new Set([errorWimp.id]))
    expect(result.graph.parent).toEqual(new Map([[errorWimp.id, branch.id]]))
    expect(result.graph.meta).toEqual(new Map([[errorWimp.id, "zavx0z/git-error"]]))
    expect(errorWimp.fields).toEqual({
      mode: "dynamic",
      basis: "/value/error",
      expr: "{ message: _[0] }",
    })

    expect(result.continuations).toEqual([
      {
        kind: "wimp-load",
        mode: "dynamic",
        fromParticleId: selector.id,
        basis: "/value/operation",
        expr: "zavx0z/git-${_[0]}",
        fields: {
          mode: "dynamic",
          basis: ["/value/operation", "/value/args"],
          expr: "{ operation: _[0], args: _[1] }",
        },
        parentContext: null,
        entanglement: null,
        viaParticle: "fuzzy",
      },
      {
        kind: "wimp-load",
        mode: "static",
        fromParticleId: errorWimp.id,
        metaAddress: "zavx0z/git-error",
        fields: {
          mode: "dynamic",
          basis: "/value/error",
          expr: "{ message: _[0] }",
        },
        parentContext: null,
        entanglement: null,
        viaParticle: "wimp",
        guard: {
          particleId: branch.id,
          kind: "fuzzy",
          basis: "/state",
          expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
        },
      },
    ])
  })

  test("должен собирать единый граф частиц без обязательного knot-объекта", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: null,
      entanglement: null,
      viaParticle: null,
    })

    const selector = getFuzzyByBasis(result.graph, "/value/operation", "zavx0z/git-${_[0]}")
    const branch = getFuzzyByBasis(result.graph, "/state", '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"')
    const errorWimp = getWimpBySrc(result.graph, "zavx0z/git-error")

    expect(result.graph.roots).toEqual(new Set([selector.id, branch.id]))
    expect(result.graph.parent).toEqual(new Map([[errorWimp.id, branch.id]]))
    expect(result.graph.meta).toEqual(new Map([[errorWimp.id, "zavx0z/git-error"]]))
    expect(result.graph.meta.has(selector.id as WimpID)).toBe(false)
    expect("field" in result.graph.particles.get(selector.id)!).toBe(false)
  })

  test("должен вычислять continuation для динамического выбора следующего адреса Wimp", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: null,
      entanglement: null,
      viaParticle: null,
    })

    const dynamicContinuation = result.continuations.find(
      (item): item is Extract<StepContinuation, { mode: "dynamic" }> => item.mode === "dynamic",
    )

    expect(dynamicContinuation).toEqual({
      kind: "wimp-load",
      mode: "dynamic",
      fromParticleId: getFuzzyByBasis(result.graph, "/value/operation", "zavx0z/git-${_[0]}").id,
      basis: "/value/operation",
      expr: "zavx0z/git-${_[0]}",
      fields: {
        mode: "dynamic",
        basis: ["/value/operation", "/value/args"],
        expr: "{ operation: _[0], args: _[1] }",
      },
      parentContext: null,
      entanglement: null,
      viaParticle: "fuzzy",
    })
  })

  test("должен сохранять parentContext и entanglement во всех continuation-данных", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: {
        metaAddress: "zavx0z/root" as Address,
        viaParticle: "fuzzy",
        parentParticleId: crypto.randomUUID(),
      },
      entanglement: {
        id: "ent:root@f:0",
        inherited: true,
      },
      viaParticle: "fuzzy",
    })

    for (const continuation of result.continuations) {
      expect(continuation.parentContext).toEqual({
        metaAddress: "zavx0z/root",
        viaParticle: "fuzzy",
        parentParticleId: result.parentContext!.parentParticleId,
      })
      expect(continuation.entanglement).toEqual({
        id: "ent:root@f:0",
        inherited: true,
      })
    }
    const branch = getFuzzyByBasis(result.graph, "/state", '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"')
    const errorWimp = getWimpBySrc(result.graph, "zavx0z/git-error")
    expect(result.graph.parent.get(errorWimp.id)).toBe(branch.id)
  })

  test("должен собирать continuation из value-based ternary как graph-ветвление", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin"
          ? html`<meta-for src="zavx0z/git-admin" />`
          : html`<meta-for src="zavx0z/git-user" />`}`,
    )

    const graph = createEmptyGraph()
    const continuations: StepContinuation[] = []
    const fuzzy = collectBranchGraph(
      node as NodeCondition,
      graph,
      {
        metaAddress: "zavx0z/git" as Address,
        branchAddress: "role-check",
        parentContext: null,
        entanglement: null,
        viaParticle: null,
      },
      continuations,
    )

    const adminWimp = getWimpBySrc(graph, "zavx0z/git-admin")
    const userWimp = getWimpBySrc(graph, "zavx0z/git-user")

    expect(fuzzy.id).toBeUUID()
    expect(fuzzy.kind).toBe("fuzzy")
    expect(fuzzy.basis).toBe("/value/role")
    expect(fuzzy.expr).toBe('_[0] === "admin"')
    expect(fuzzy.children).toEqual(new Set([adminWimp.id, userWimp.id]))
    expect(graph.meta).toEqual(
      new Map([
        [adminWimp.id, "zavx0z/git-admin"],
        [userWimp.id, "zavx0z/git-user"],
      ]),
    )
    expect(continuations).toEqual([
      {
        kind: "wimp-load",
        mode: "static",
        fromParticleId: adminWimp.id,
        metaAddress: "zavx0z/git-admin",
        parentContext: null,
        entanglement: null,
        viaParticle: "wimp",
        guard: {
          particleId: fuzzy.id,
          kind: "fuzzy",
          basis: "/value/role",
          expr: '_[0] === "admin"',
        },
      },
      {
        kind: "wimp-load",
        mode: "static",
        fromParticleId: userWimp.id,
        metaAddress: "zavx0z/git-user",
        parentContext: null,
        entanglement: null,
        viaParticle: "wimp",
        guard: {
          particleId: fuzzy.id,
          kind: "fuzzy",
          basis: "/value/role",
          expr: '_[0] === "admin"',
        },
      },
    ])
  })

  test("должен выносить topology dependency seeds отдельно для enum/array полей", () => {
    const ast = createSyntheticTopologyMetaAst()
    const result = processLoadedMetaStep(ast, {
      metaAddress: "zavx0z/test-topology" as Address,
      branchAddress: "root",
      parentContext: null,
      entanglement: null,
      viaParticle: null,
    })

    expect(result.dependencySeeds).toEqual([
      {
        metaAddress: "zavx0z/test-topology",
        branchAddress: "root",
        field: "operation",
        fieldType: "enum<string>",
        topologyKind: "enum",
        sourcePath: "/value/operation",
        participatesInEntanglement: false,
        mutableFromReaction: false,
        mutableDuringProcess: false,
      },
      {
        metaAddress: "zavx0z/test-topology",
        branchAddress: "root",
        field: "items",
        fieldType: "array<string>",
        topologyKind: "array",
        sourcePath: "/value/items",
        participatesInEntanglement: false,
        mutableFromReaction: false,
        mutableDuringProcess: false,
      },
    ])
  })
})
