import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Address } from "@dark/types/dark"
import type { Binding, DarkParticle, Fuzzy, Wimp } from "@dark/types"
import { parse, type NodeCondition, type NodeLogical, type NodeMeta, type NodeType } from "../metafor/template/index.ts"

import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"
import type { MetaAST } from "../metafor/ast/ast.t"

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

function normalizeStaticWimp(node: NodeMeta): Wimp {
  if (typeof node.src !== "string") {
    throw new Error("Fuzzy: дочерний Wimp должен иметь статический src")
  }

  const result: Wimp = {
    kind: "wimp",
    src: node.src,
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

function normalizeToFuzzy(node: NodeLogical | NodeCondition): Fuzzy {
  const basis = node.data
  const basisList = Array.isArray(basis) ? basis : [basis]

  for (const item of basisList) {
    if (!item.startsWith("/state") && !item.startsWith("/value")) {
      throw new Error(`Fuzzy: basis должен использовать только state/value (${item})`)
    }
    if (item.startsWith("/mass")) {
      throw new Error(`Fuzzy: basis не должен использовать mass как источник (${item})`)
    }
  }

  const particles = node.child.map(normalizeChildParticle)
  return {
    kind: "fuzzy",
    basis,
    ...(node.expr ? { expr: node.expr } : {}),
    particles,
  }
}

function normalizeChildParticle(node: NodeType): DarkParticle {
  if (node.type === "meta") return normalizeStaticWimp(node)
  if (node.type === "log" || node.type === "cond") return normalizeToFuzzy(node)
  if (node.type === "map") {
    throw new Error("Fuzzy: дочерний map должен нормализоваться отдельно как Macho")
  }
  throw new Error(`Fuzzy: неподдерживаемый дочерний узел (${node.type})`)
}

describe("Fuzzy — логическое ветвление", () => {
  let ast: MetaAST

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
  })

  test("должен формироваться из логического условия по state", () => {
    const node = ast.gravity?.[1] as NodeLogical
    const fuzzy = normalizeToFuzzy(node)

    expect(fuzzy).toEqual({
      kind: "fuzzy",
      basis: "/state",
      expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
      particles: [
        {
          kind: "wimp",
          src: "zavx0z/git-error",
          fields: {
            mode: "dynamic",
            basis: "/value/error",
            expr: "{ message: _[0] }",
          },
        },
      ],
    })
  })

  test("должен формироваться из логического условия по value", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const fuzzy = normalizeToFuzzy(node as NodeLogical)

    expect(fuzzy).toEqual({
      kind: "fuzzy",
      basis: "/value/showMeta",
      particles: [
        {
          kind: "wimp",
          src: "zavx0z/git-primary",
        },
      ],
    })
  })

  test("должен сохранять дочерние частицы ветви", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const fuzzy = normalizeToFuzzy(node as NodeLogical)

    expect(fuzzy.particles).toHaveLength(1)
    expect(fuzzy.particles[0]).toEqual({
      kind: "wimp",
      src: "zavx0z/git-primary",
    })
  })
})

describe("Fuzzy — тернарное ветвление", () => {
  test("должен формироваться из ternary-условия", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const fuzzy = normalizeToFuzzy(node as NodeCondition)

    expect(fuzzy.kind).toBe("fuzzy")
    expect(fuzzy.basis).toBe("/value/role")
    expect(fuzzy.expr).toBe('_[0] === "admin"')
  })

  test("должен сохранять true-ветвь", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const fuzzy = normalizeToFuzzy(node as NodeCondition)

    expect(fuzzy.particles[0]).toEqual({
      kind: "wimp",
      src: "zavx0z/git-admin",
    })
  })

  test("должен сохранять false-ветвь", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const fuzzy = normalizeToFuzzy(node as NodeCondition)

    expect(fuzzy.particles[1]).toEqual({
      kind: "wimp",
      src: "zavx0z/git-user",
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
    const fuzzy = normalizeToFuzzy(node)

    expect(fuzzy.basis).toBe("/state")
  })

  test("должен нормализовать basis из value", () => {
    const [node] = parse(({ html, value }) => html`${value.showMeta && html`<meta-for src="zavx0z/git-primary" />`}`)
    const fuzzy = normalizeToFuzzy(node as NodeLogical)

    expect(fuzzy.basis).toBe("/value/showMeta")
  })

  test("должен сохранять expr", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )
    const fuzzy = normalizeToFuzzy(node as NodeCondition)

    expect(fuzzy.expr).toBe('_[0] === "admin"')
  })

  test("должен сохранять branch-семантику дочерних частиц", async () => {
    const ast = (await loadMetaAST("zavx0z/git" as Address)) as MetaAST
    const node = ast.gravity?.[1] as NodeLogical
    const fuzzy = normalizeToFuzzy(node)

    expect(fuzzy.particles).toEqual([
      {
        kind: "wimp",
        src: "zavx0z/git-error",
        fields: {
          mode: "dynamic",
          basis: "/value/error",
          expr: "{ message: _[0] }",
        },
      },
    ])
  })
})
