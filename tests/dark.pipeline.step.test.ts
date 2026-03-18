import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { Binding } from "@dark/types"
import type { Address } from "@dark/types/dark"
import { convertMetaDSLToMetaAST, type MetaAST } from "../metafor/ast/index.ts"
import { MetaFor } from "../metafor/dsl/metafor.ts"
import { parse, type NodeCondition, type NodeLogical, type NodeMeta, type NodeType } from "../metafor/template/index.ts"

import { HubFixture } from "fixture/hub"
import { loadMetaAST } from "../dark/load"

type ParentContext = {
  metaAddress: Address
  viaParticle: "wimp" | "fuzzy" | "macho" | "axion"
  knotId: string
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

type StepParticle =
  | {
      kind: "wimp"
      src: string
      fields?: Binding<Record<string, unknown>>
      mass?: Binding<Record<string, unknown>>
    }
  | {
      kind: "fuzzy"
      role: "address" | "branch"
      basis: string | string[]
      expr?: string
      particles?: StepParticle[]
    }

type StepGuard = {
  kind: "fuzzy"
  basis: string | string[]
  expr?: string
}

type StepKnot = {
  id: string
  metaAddress: Address
  branchAddress: string
  parentKnotId: string | null
  particles: StepParticle[]
}

type TopologyDependencySeed = {
  knotId: string
  field: string
  fieldType: string
  topologyKind: "enum" | "array"
  sourcePath: string
  participatesInEntanglement: false
  mutableFromReaction: false
  mutableDuringProcess: false
}

type StepContinuation =
  | {
      kind: "wimp-load"
      mode: "static"
      fromKnotId: string
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
      fromKnotId: string
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
  knot: StepKnot
  particles: StepParticle[]
  continuations: StepContinuation[]
  dependencySeeds: TopologyDependencySeed[]
  parentContext: ParentContext | null
  entanglement: EntanglementContext | null
  viaParticle: ParentContext["viaParticle"] | null
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
    ...(value.expr ? { expr: value.expr } : {}),
  }
}

function createKnotId(metaAddress: Address, branchAddress: string): string {
  return `knot:${metaAddress}@${branchAddress}`
}

function normalizeStaticWimp(node: NodeMeta): Extract<StepParticle, { kind: "wimp" }> {
  if (typeof node.src !== "string") {
    throw new Error("Step: статический Wimp должен иметь строковый src")
  }

  return {
    kind: "wimp",
    src: node.src,
    ...(node.fields ? { fields: normalizeBinding(node.fields) } : {}),
    ...(node.mass ? { mass: normalizeBinding(node.mass) } : {}),
  }
}

function normalizeBranchFuzzy(node: NodeLogical | NodeCondition): Extract<StepParticle, { kind: "fuzzy"; role: "branch" }> {
  const particles = node.child.flatMap((child) => {
    if (child.type === "meta" && typeof child.src === "string") return [normalizeStaticWimp(child)]
    if (child.type === "log" || child.type === "cond") return [normalizeBranchFuzzy(child)]
    return []
  })

  return {
    kind: "fuzzy",
    role: "branch",
    basis: node.data,
    ...(node.expr ? { expr: node.expr } : {}),
    particles,
  }
}

function collectTopologyDependencySeeds(ast: MetaAST, knotId: string): TopologyDependencySeed[] {
  return Object.entries(ast.fields).flatMap(([field, definition]) => {
    if (definition.type.startsWith("enum<")) {
      return [
        {
          knotId,
          field,
          fieldType: definition.type,
          topologyKind: "enum" as const,
          sourcePath: `/value/${field}`,
          participatesInEntanglement: false as const,
          mutableFromReaction: false as const,
          mutableDuringProcess: false as const,
        },
      ]
    }

    if (definition.type.startsWith("array<")) {
      return [
        {
          knotId,
          field,
          fieldType: definition.type,
          topologyKind: "array" as const,
          sourcePath: `/value/${field}`,
          participatesInEntanglement: false as const,
          mutableFromReaction: false as const,
          mutableDuringProcess: false as const,
        },
      ]
    }

    return []
  })
}

function collectStaticContinuations(
  node: NodeType,
  input: StepInput,
  fromKnotId: string,
  guard?: StepGuard,
): Extract<StepContinuation, { mode: "static" }>[] {
  if (node.type === "meta" && typeof node.src === "string") {
    return [
      {
        kind: "wimp-load",
        mode: "static",
        fromKnotId,
        metaAddress: node.src,
        ...(node.fields ? { fields: normalizeBinding(node.fields) } : {}),
        ...(node.mass ? { mass: normalizeBinding(node.mass) } : {}),
        parentContext: input.parentContext,
        entanglement: input.entanglement,
        viaParticle: "wimp",
        ...(guard ? { guard } : {}),
      },
    ]
  }

  if (node.type === "log" || node.type === "cond") {
    const nestedGuard = {
      kind: "fuzzy" as const,
      basis: node.data,
      ...(node.expr ? { expr: node.expr } : {}),
    }
    return node.child.flatMap((child) => collectStaticContinuations(child, input, fromKnotId, nestedGuard))
  }

  return []
}

function processLoadedMetaStep(ast: MetaAST, input: StepInput): StepResult {
  const particles: StepParticle[] = []
  const continuations: StepContinuation[] = []
  const knotId = createKnotId(input.metaAddress, input.branchAddress)

  for (const node of ast.gravity ?? []) {
    if (node.type === "meta") {
      if (typeof node.src === "string") {
        const wimp = normalizeStaticWimp(node)
        particles.push(wimp)
        continuations.push({
          kind: "wimp-load",
          mode: "static",
          fromKnotId: knotId,
          metaAddress: wimp.src,
          ...(wimp.fields ? { fields: wimp.fields } : {}),
          ...(wimp.mass ? { mass: wimp.mass } : {}),
          parentContext: input.parentContext,
          entanglement: input.entanglement,
          viaParticle: "wimp",
        })
        continue
      }

      particles.push({
        kind: "fuzzy",
        role: "address",
        basis: node.src.data,
        ...(node.src.expr ? { expr: node.src.expr } : {}),
      })

      continuations.push({
        kind: "wimp-load",
        mode: "dynamic",
        fromKnotId: knotId,
        basis: node.src.data,
        ...(node.src.expr ? { expr: node.src.expr } : {}),
        ...(node.fields ? { fields: normalizeBinding(node.fields) } : {}),
        ...(node.mass ? { mass: normalizeBinding(node.mass) } : {}),
        parentContext: input.parentContext,
        entanglement: input.entanglement,
        viaParticle: "fuzzy",
      })
      continue
    }

    if (node.type === "log" || node.type === "cond") {
      const fuzzy = normalizeBranchFuzzy(node)
      particles.push(fuzzy)
      const guard = {
        kind: "fuzzy" as const,
        basis: node.data,
        ...(node.expr ? { expr: node.expr } : {}),
      }
      continuations.push(...node.child.flatMap((child) => collectStaticContinuations(child, input, knotId, guard)))
    }
  }

  return {
    metaAddress: input.metaAddress,
    knot: {
      id: knotId,
      metaAddress: input.metaAddress,
      branchAddress: input.branchAddress,
      parentKnotId: input.parentContext?.knotId ?? null,
      particles,
    },
    particles,
    continuations,
    dependencySeeds: collectTopologyDependencySeeds(ast, knotId),
    parentContext: input.parentContext,
    entanglement: input.entanglement,
    viaParticle: input.viaParticle,
  }
}

async function processMetaStep(input: StepInput): Promise<StepResult> {
  const ast = (await loadMetaAST(input.metaAddress)) as MetaAST
  return processLoadedMetaStep(ast, input)
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
        knotId: "knot:zavx0z/root@root",
      },
      entanglement: {
        id: "ent:root@w:0",
        inherited: true,
      },
      viaParticle: "wimp",
    })

    expect(result.metaAddress).toBe("zavx0z/git")
    expect(result.parentContext).toEqual({
      metaAddress: "zavx0z/root",
      viaParticle: "wimp",
      knotId: "knot:zavx0z/root@root",
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

    expect(result.particles).toEqual([
      {
        kind: "fuzzy",
        role: "address",
        basis: "/value/operation",
        expr: "zavx0z/git-${_[0]}",
      },
      {
        kind: "fuzzy",
        role: "branch",
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
      },
    ])

    expect(result.continuations).toEqual([
      {
        kind: "wimp-load",
        mode: "dynamic",
        fromKnotId: "knot:zavx0z/git@root",
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
        fromKnotId: "knot:zavx0z/git@root",
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
          kind: "fuzzy",
          basis: "/state",
          expr: '_[0] === "\\u043E\\u0448\\u0438\\u0431\\u043A\\u0430"',
        },
      },
    ])
  })

  test("должен собирать knot отдельно от частиц и continuation", async () => {
    const result = await processMetaStep({
      metaAddress: "zavx0z/git" as Address,
      branchAddress: "root",
      parentContext: null,
      entanglement: null,
      viaParticle: null,
    })

    expect(result.knot).toEqual({
      id: "knot:zavx0z/git@root",
      metaAddress: "zavx0z/git",
      branchAddress: "root",
      parentKnotId: null,
      particles: result.particles,
    })
    expect("dependencySeeds" in result.particles[0]!).toBe(false)
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
      fromKnotId: "knot:zavx0z/git@root",
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
        knotId: "knot:zavx0z/root@branch-0",
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
        knotId: "knot:zavx0z/root@branch-0",
      })
      expect(continuation.entanglement).toEqual({
        id: "ent:root@f:0",
        inherited: true,
      })
    }
    expect(result.knot.parentKnotId).toBe("knot:zavx0z/root@branch-0")
  })

  test("должен собирать continuation из value-based ternary как branch-переход", () => {
    const [node] = parse(
      ({ html, value }) =>
        html`${value.role === "admin" ? html`<meta-for src="zavx0z/git-admin" />` : html`<meta-for src="zavx0z/git-user" />`}`,
    )

    const fuzzy = normalizeBranchFuzzy(node as NodeCondition)

    expect(fuzzy).toEqual({
      kind: "fuzzy",
      role: "branch",
      basis: "/value/role",
      expr: '_[0] === "admin"',
      particles: [
        {
          kind: "wimp",
          src: "zavx0z/git-admin",
        },
        {
          kind: "wimp",
          src: "zavx0z/git-user",
        },
      ],
    })
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
        knotId: "knot:zavx0z/test-topology@root",
        field: "operation",
        fieldType: "enum<string>",
        topologyKind: "enum",
        sourcePath: "/value/operation",
        participatesInEntanglement: false,
        mutableFromReaction: false,
        mutableDuringProcess: false,
      },
      {
        knotId: "knot:zavx0z/test-topology@root",
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
