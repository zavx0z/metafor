import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import "fixture/test"
import { HubFixture } from "fixture/hub"

import { convertMetaDSLToMetaAST, type MetaAST } from "@metafor/ast"
import { MetaFor } from "../metafor/dsl/metafor.ts"
import { parse, type NodeCondition, type NodeLogical } from "../metafor/template/index.ts"

import {
  collectBranchGraph,
  createEmptyGraph,
  getFuzzyByBasis,
  getWimpBySrc,
  processLoadedMetaStep,
  processMetaStep,
  type StepContinuation,
} from "./pipeline.ts"
import type { Address } from "@dark/types/dark"
import type { WimpID } from "@dark/types"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
})

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
