import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"
import type { Binding, DarkGraph, DarkParticle, Fuzzy, FuzzyID, ParticleID, Wimp, WimpID } from "@dark/types"
import { parse, type NodeCondition, type NodeLogical, type NodeMeta, type NodeType } from "../metafor/template/index.ts"

import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"
import type { MetaAST } from "../metafor/ast/ast.t"

type MutableGraph = DarkGraph & {
  nextSeq: number
}

type GraphParticle = Wimp | Fuzzy

type NormalizedFuzzyGraph = {
  root: Fuzzy
  graph: DarkGraph
}

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

  return {
    mode: "dynamic",
    basis: value.data,
    ...(("expr" in value && value.expr) ? { expr: value.expr } : {}),
  }
}

function createEmptyGraph(): MutableGraph {
  return {
    roots: new Set(),
    particles: new Map<ParticleID, DarkParticle>(),
    parent: new Map(),
    meta: new Map(),
    nextSeq: 0,
  }
}

function createParticleId(graph: MutableGraph, scope: string): ParticleID {
  const id = `particle:${scope}:${graph.nextSeq}`
  graph.nextSeq += 1
  return id
}

function createWimpId(graph: MutableGraph, scope: string): WimpID {
  return createParticleId(graph, scope)
}

function createFuzzyId(graph: MutableGraph, scope: string): FuzzyID {
  return createParticleId(graph, scope)
}

function appendParticle(graph: MutableGraph, particle: GraphParticle, parentId?: ParticleID): void {
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

function normalizeStaticWimp(node: NodeMeta, graph: MutableGraph, scope: string): Wimp {
  if (typeof node.src !== "string") {
    throw new Error("Fuzzy: дочерний Wimp должен иметь статический src")
  }

  const result: Wimp = {
    id: createWimpId(graph, scope),
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

function validateFuzzyBasis(basis: string | string[]): void {
  const basisList = Array.isArray(basis) ? basis : [basis]
  for (const item of basisList) {
    if (!item.startsWith("/state") && !item.startsWith("/value")) {
      throw new Error(`Fuzzy: basis должен использовать только state/value (${item})`)
    }
    if (item.startsWith("/mass")) {
      throw new Error(`Fuzzy: basis не должен использовать mass как источник (${item})`)
    }
  }
}

function collectFuzzy(node: NodeLogical | NodeCondition, graph: MutableGraph, scope: string, parentId?: ParticleID): Fuzzy {
  validateFuzzyBasis(node.data)

  const result: Fuzzy = {
    id: createFuzzyId(graph, scope),
    kind: "fuzzy",
    basis: node.data,
    children: new Set(),
  }
  if (node.expr) {
    result.expr = node.expr
  }
  appendParticle(graph, result, parentId)

  for (const child of node.child) {
    if (child.type === "meta") {
      const wimp = normalizeStaticWimp(child, graph, scope)
      appendParticle(graph, wimp, result.id)
      continue
    }
    if (child.type === "log" || child.type === "cond") {
      collectFuzzy(child, graph, scope, result.id)
      continue
    }
    if (child.type === "map") {
      throw new Error("Fuzzy: дочерний map должен нормализоваться отдельно как Macho")
    }
    throw new Error(`Fuzzy: неподдерживаемый дочерний узел (${(child as NodeType).type})`)
  }

  return result
}

function normalizeToFuzzy(node: NodeLogical | NodeCondition, scope = "fuzzy"): NormalizedFuzzyGraph {
  const graph = createEmptyGraph()
  const root = collectFuzzy(node, graph, scope)
  return {
    root,
    graph: {
      roots: graph.roots,
      particles: graph.particles,
      parent: graph.parent,
      meta: graph.meta,
    },
  }
}

describe("Fuzzy — логическое ветвление", () => {
  let ast: MetaAST

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
  })

  test("должен формироваться из логического условия по state", () => {
    const node = ast.gravity?.[1] as NodeLogical
    const { root, graph } = normalizeToFuzzy(node, "git-state")

    expect(root).toEqual({
      id: "particle:git-state:0",
      kind: "fuzzy",
      basis: "/state",
      expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
      children: new Set(["particle:git-state:1"]),
    })
    expect(graph.particles.get("particle:git-state:1") as Wimp).toEqual({
      id: "particle:git-state:1",
      kind: "wimp",
      src: "zavx0z/git-error",
      fields: {
        mode: "dynamic",
        basis: "/value/error",
        expr: "{ message: _[0] }",
      },
      children: new Set(),
    })
    expect(graph.meta).toEqual(new Map([["particle:git-state:1", "zavx0z/git-error"]]))
  })

  test("должен формироваться из логического условия по value", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const { root } = normalizeToFuzzy(node as NodeLogical, "show-meta")

    expect(root).toEqual({
      id: "particle:show-meta:0",
      kind: "fuzzy",
      basis: "/value/showMeta",
      children: new Set(["particle:show-meta:1"]),
    })
  })

  test("должен сохранять дочерние частицы ветви", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const { root, graph } = normalizeToFuzzy(node as NodeLogical, "show-meta")

    expect(root.children).toEqual(new Set(["particle:show-meta:1"]))
    expect(graph.parent).toEqual(new Map([["particle:show-meta:1", "particle:show-meta:0"]]))
    expect(graph.particles.get("particle:show-meta:1") as Wimp).toEqual({
      id: "particle:show-meta:1",
      kind: "wimp",
      src: "zavx0z/git-primary",
      children: new Set(),
    })
  })
})

describe("Fuzzy — тернарное ветвление", () => {
  test("должен формироваться из ternary-условия", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const { root } = normalizeToFuzzy(node as NodeCondition, "role-check")

    expect(root.kind).toBe("fuzzy")
    expect(root.basis).toBe("/value/role")
    expect(root.expr).toBe('_[0] === "admin"')
  })

  test("должен сохранять true-ветвь", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const { graph } = normalizeToFuzzy(node as NodeCondition, "role-check")

    expect(graph.particles.get("particle:role-check:1") as Wimp).toEqual({
      id: "particle:role-check:1",
      kind: "wimp",
      src: "zavx0z/git-admin",
      children: new Set(),
    })
  })

  test("должен сохранять false-ветвь", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const { graph } = normalizeToFuzzy(node as NodeCondition, "role-check")

    expect(graph.particles.get("particle:role-check:2") as Wimp).toEqual({
      id: "particle:role-check:2",
      kind: "wimp",
      src: "zavx0z/git-user",
      children: new Set(),
    })
  })
})

describe("Fuzzy — ограничения basis", () => {
  test("не должен зависеть от mass", () => {
    const [node] = parse(({ html, mass }) => html`${mass.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)

    expect(() => normalizeToFuzzy(node as NodeLogical)).toThrow("basis должен использовать только state/value")
  })

  test("не должен принимать array/multiple-источник как Fuzzy", () => {
    const [node] = parse(
      ({ html, value, mass }) =>
        html`${value.showList && mass.items.map((item: unknown) => html`<meta-for src="zavx0z/git-item" />`)}`,
    )

    expect(() => normalizeToFuzzy(node as NodeLogical)).toThrow("basis должен использовать только state/value")
  })

  test("не должен принимать runtime-источники вне state/value", () => {
    const [root] = parse<any, { items: { active: boolean }[] }>(
      ({ html, mass }) => html`${mass.items.map((item: { active: boolean }) => html`${item.active && html`<meta-for src="zavx0z/git-item" />`}`)}`,
    )

    const mapNode = root as Extract<NodeType, { type: "map" }>
    const nested = mapNode.child[0] as NodeLogical

    expect(() => normalizeToFuzzy(nested)).toThrow("basis должен использовать только state/value")
  })
})

describe("Fuzzy — нормализация", () => {
  test("должен нормализовать basis из state", async () => {
    const ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
    const node = ast.gravity?.[1] as NodeLogical
    const { root } = normalizeToFuzzy(node, "git-state")

    expect(root.basis).toBe("/state")
  })

  test("должен нормализовать basis из value", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const { root } = normalizeToFuzzy(node as NodeLogical, "show-meta")

    expect(root.basis).toBe("/value/showMeta")
  })

  test("должен сохранять expr", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const { root } = normalizeToFuzzy(node as NodeCondition, "role-check")

    expect(root.expr).toBe('_[0] === "admin"')
  })

  test("должен сохранять branch-семантику дочерних частиц", async () => {
    const ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
    const node = ast.gravity?.[1] as NodeLogical
    const { graph } = normalizeToFuzzy(node, "git-state")

    expect(graph.particles.get("particle:git-state:1") as Wimp).toEqual({
      id: "particle:git-state:1",
      kind: "wimp",
      src: "zavx0z/git-error",
      fields: {
        mode: "dynamic",
        basis: "/value/error",
        expr: "{ message: _[0] }",
      },
      children: new Set(),
    })
  })
})
