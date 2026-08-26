import {describe, expect, test} from "bun:test"
import {MetaFor} from "@metafor/dsl"
import {
  GRAPH_SCHEMA,
  READ_GRAPH_METHOD,
  type MetaAddress,
  type MetaField,
  type Graph,
  type MetaState,
  type ReadGraphParams,
  parseMetaAddress,
  validateGraph,
} from "@metafor/types/metafor/graph"

const ROOT = parseMetaAddress("example/root")!
const CHILD = parseMetaAddress("example/child")!
const PEER = parseMetaAddress("example/peer")!
const LEAF = parseMetaAddress("example/leaf")!

const compileTimeAddressBoundary = () => {
  // @ts-expect-error Raw strings, including three-segment strings, are not validated MetaAddress values.
  const invalid: MetaAddress = "example/root/nested"
  return invalid
}

const activeBuilderConditions = () =>
  MetaFor("condition-source")
    .fields((field) => ({
      mode: field.enum("idle", "ready").required("idle"),
      title: field.string.optional(),
      items: field.array.required([], {data: "item"}),
      count: field.number.required(0, {id: true}),
      enabled: field.boolean.optional(),
      note: field.string.optional(),
    }))
    .superposition({
      idle: {
        ready: {
          mode: {eq: "ready", notOneOf: ["idle"]},
          title: {startsWith: "R", length: {min: 1}},
          items: {length: {min: 1}, every: {gte: 0}, some: {gt: 1}},
          count: {
            gt: 0,
            gte: 0,
            lt: 10,
            lte: 10,
            notGt: 11,
            notGte: 12,
            notLt: -1,
            notLte: -2,
            notEq: 5,
          },
          enabled: {eq: true, logicalEq: true},
        },
      },
      ready: null,
    })
    .mass(() => ({}))
    .energy()
    .processes()
    .reactions()
    .matter()
    .bulk()

const completeDocument = (): Graph => ({
  schema: GRAPH_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name: "Root",
      desc: "Complete compact normalized declaration",
      fields: [
        {key: "mode", type: "enum", required: true, default: "idle", values: ["idle", "ready"], label: "Mode"},
        {key: "title", type: "string", label: "Title"},
        {key: "items", type: "array", required: true, default: [], data: "item"},
        {key: "count", type: "number", required: true, default: 0, id: true},
        {key: "enabled", type: "boolean"},
        {key: "note", type: "string"},
      ],
      superposition: [
        {
          name: "idle",
          transitions: {
            ready: {
              mode: {eq: "ready", notOneOf: ["idle"]},
              title: {
                startsWith: "R",
                length: {min: 1},
                pattern: {source: "^R", flags: "i"},
              },
              items: {length: {min: 1}, every: {gte: 0}, some: {gt: 1}},
              count: {
                gt: 0,
                gte: 0,
                lt: 10,
                lte: 10,
                notGt: 11,
                notGte: 12,
                notLt: -1,
                notLte: -2,
                notEq: 5,
                in: [1, 2],
                notIn: [3],
              },
              enabled: {eq: true, logicalEq: true},
            },
          },
        },
        {name: "ready", transitions: null},
      ],
      mass: [
        {key: "cache", format: "json", label: "Cache", description: "Metadata only"},
      ],
      processes: [
        {
          key: "ready",
          declaration: {
            type: "action",
            label: "Load",
            env: ["server"],
            action: {
              src: "./actions/load.ts",
              importSpecifier: "default",
              wrapperSrc: "async () => import('./actions/load.ts')",
              read: ["mode", "title"],
            },
            success: {src: "({update}) => update({title: 'ready'})", write: ["title"]},
            error: {src: "({update}) => update({title: 'error'})", write: ["title"]},
          },
        },
      ],
      reactions: [
        {
          key: "0",
          label: "Observe child",
          desc: null,
          sources: [{meta: CHILD, states: ["visible"]}],
          src: "({update}) => update({title: 'observed'})",
          read: ["count"],
          write: ["title"],
          massRead: ["cache"],
          massWrite: ["cache"],
          states: ["ready"],
        },
      ],
      matter: [
        {
          kind: "wimp",
          src: CHILD,
          fieldsBinding: {data: "title", expr: "{label: _[0]}"},
          massBinding: {
            data: "/mass/cache",
            expr: "{cache: _[0]}",
            directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
          },
          children: [{
            edgeSlot: "child",
            particle: {
              kind: "macho",
              collectionBinding: {data: "items"},
            },
          }],
        },
        {
          kind: "wimp",
          src: CHILD,
          children: [{
            edgeSlot: "child",
            particle: {
              kind: "macho",
              collectionBinding: {data: "items"},
            },
          }],
        },
      ],
      bulk: {view: ".root { display: block; }"},
    },
    [CHILD]: {
      name: "Child",
      fields: [{key: "label", type: "string"}],
      superposition: [{name: "visible", transitions: null}],
      mass: [],
      processes: [{
        key: "visible",
        declaration: {
          type: "finally",
          before: {src: "() => {}", read: ["label"]},
        },
      }],
    },
  },
  runtime: {
    roots: [{
      ref: "atom:1",
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "ready",
      values: {mode: "ready", title: null, items: [2, 4], count: 2, enabled: true},
      mass: [{
        ref: "mass:cache-root",
        key: "cache",
        format: "json",
        label: "Cache",
        description: "Metadata only",
        content: "lazy",
      }],
      children: [{
        ref: "atom:2",
        kind: "atom",
        declaration: "#/template/example~1root/matter/0",
        meta: CHILD,
        state: "visible",
        values: {label: "Current child"},
        mass: [],
        children: [{
          ref: "topology:1",
          kind: "topology",
          declaration: "#/template/example~1root/matter/0/children/0/particle",
          topology: "macho",
        }],
      }, {
        ref: "atom:3",
        kind: "atom",
        declaration: "#/template/example~1root/matter/1",
        meta: CHILD,
        state: "visible",
        values: {label: "Second child"},
        mass: [],
        children: [{
          ref: "topology:2",
          kind: "topology",
          declaration: "#/template/example~1root/matter/1/children/0/particle",
          topology: "macho",
        }],
      }],
    }],
    reactions: [{
      ref: "reaction:1:1:2",
      kind: "reaction",
      reaction: {meta: ROOT, key: "0"},
      source: {atom: "atom:2", states: ["visible"]},
      target: {atom: "atom:1", states: ["ready"]},
      active: true,
    }],
  },
})

const clone = (): Record<string, any> => structuredClone(completeDocument())

let nextRuntimeAtomRef = 100
let nextRuntimeTopologyRef = 100

const runtimeAtom = (declaration: string, meta: MetaAddress, label: string): Record<string, unknown> => ({
  ref: `atom:${nextRuntimeAtomRef++}`,
  kind: "atom",
  declaration,
  meta,
  state: "visible",
  values: {label},
  mass: [],
})

const topologyDocument = (
  topology: "axion" | "macho" | "fuzzy",
  matter: Record<string, unknown>,
  children: Record<string, unknown>[],
): Record<string, any> => {
  const input = clone()
  input.template["example/peer"] = structuredClone(input.template["example/child"])
  input.template["example/peer"].name = "Peer"
  input.template["example/root"].matter = [matter]
  input.runtime.reactions = []
  input.runtime.roots[0].children = [{
    ref: `topology:${nextRuntimeTopologyRef++}`,
    kind: "topology",
    declaration: "#/template/example~1root/matter/0",
    topology,
    children,
  }]
  return input
}

const createdWimpCompositionDocument = (): Record<string, any> => {
  const input = clone()
  input.template["example/leaf"] = structuredClone(input.template["example/child"])
  input.template["example/leaf"].name = "Leaf"
  input.template["example/peer"] = structuredClone(input.template["example/child"])
  input.template["example/peer"].name = "Peer"
  input.template["example/child"].matter = [{
    kind: "wimp",
    src: LEAF,
  }]
  input.template["example/root"].matter = [{
    kind: "wimp",
    src: CHILD,
    children: [{
      edgeSlot: "child",
      particle: {
        kind: "wimp",
        src: PEER,
      },
    }],
  }]
  input.runtime.reactions = []
  input.runtime.roots[0].children = [{
    ref: `atom:${nextRuntimeAtomRef++}`,
    kind: "atom",
    declaration: "#/template/example~1root/matter/0",
    meta: CHILD,
    state: "visible",
    values: {label: "Child"},
    mass: [],
    children: [
      runtimeAtom("#/template/example~1child/matter/0", LEAF, "Leaf"),
      runtimeAtom(
        "#/template/example~1root/matter/0/children/0/particle",
        PEER,
        "Peer",
      ),
    ],
  }]
  return input
}

const expectIssue = (input: unknown, path: string, code: string): void => {
  const result = validateGraph(input)
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.issues).toContainEqual(expect.objectContaining({path, code}))
  expect(result.issues.every((issue) =>
    typeof issue.path === "string" &&
    typeof issue.code === "string" &&
    typeof issue.message === "string"
  )).toBe(true)
}

describe("Graph public contract", () => {
  test("accepts one complete document and preserves semantic sequences", () => {
    const params: ReadGraphParams = {}
    const input = completeDocument()
    const result = validateGraph(input)
    const root = input.template[ROOT]!

    expect(READ_GRAPH_METHOD).toBe("readGraph")
    expect(params).toEqual({})
    expect(result).toEqual({ok: true, value: input})
    expect(root.superposition.map(({name}) => name)).toEqual(["idle", "ready"])
    expect(Object.keys(root.superposition[0]!.transitions!)).toEqual(["ready"])
    expect(root.fields[0]).toMatchObject({values: ["idle", "ready"]})
    expect(root.processes.map(({key}) => key)).toEqual(["ready"])
    expect(root.matter?.map(({kind}) => kind)).toEqual(["wimp", "wimp"])
  })

  test("keeps runtime sparse and accepts present null without default provenance", () => {
    const input = completeDocument()
    const runtimeRoot = input.runtime.roots[0]!
    const values = runtimeRoot.kind === "atom" ? runtimeRoot.values : {}

    expect(values).toEqual({mode: "ready", title: null, items: [2, 4], count: 2, enabled: true})
    expect(values).not.toHaveProperty("missing")
    expect(validateGraph(input).ok).toBe(true)
  })

  test("closes Reaction source, Field, Mass and runtime relation dependencies", () => {
    const reactionOnlyDependency = clone()
    reactionOnlyDependency.template["example/peer"] = structuredClone(
      reactionOnlyDependency.template["example/child"],
    )
    reactionOnlyDependency.template["example/peer"].name = "Peer"
    reactionOnlyDependency.template["example/root"].reactions[0].sources = [{
      meta: "example/peer",
      states: ["visible"],
    }]
    reactionOnlyDependency.runtime.reactions = []
    expect(validateGraph(reactionOnlyDependency).ok).toBe(true)

    const rawRef = clone()
    rawRef.runtime.roots[0].ref = "1"
    expectIssue(rawRef, "/runtime/roots/0/ref", "invalid_ref")

    const childSelector = clone()
    childSelector.template["example/root"].reactions[0].sources = [{
      relation: "child",
      states: ["visible"],
    }]
    expect(validateGraph(childSelector).ok).toBe(true)

    const wrongStructuralSelector = clone()
    wrongStructuralSelector.template["example/root"].reactions[0].sources = [{
      relation: "parent",
      states: ["visible"],
    }]
    expectIssue(
      wrongStructuralSelector,
      "/runtime/reactions/0/source",
      "reaction_source_mismatch",
    )

    const topologyWrite = clone()
    topologyWrite.template["example/root"].reactions[0].write = ["mode"]
    expectIssue(
      topologyWrite,
      "/template/example~1root/reactions/0/write/0",
      "topology_field_write",
    )

    const missingMass = clone()
    missingMass.template["example/root"].reactions[0].massRead = ["missing"]
    expectIssue(
      missingMass,
      "/template/example~1root/reactions/0/massRead/0",
      "unknown_mass_reference",
    )

    const fieldEvent = clone()
    fieldEvent.template["example/root"].reactions[0].sources[0].states = []
    expectIssue(
      fieldEvent,
      "/template/example~1root/reactions/0/sources/0/states",
      "empty_reaction_states",
    )

    const missingSourceState = clone()
    missingSourceState.template["example/root"].reactions[0].sources[0].states = ["missing"]
    expectIssue(
      missingSourceState,
      "/template/example~1root/reactions/0/sources/0/states/0",
      "unknown_state_reference",
    )

    const staleRelation = clone()
    staleRelation.runtime.reactions[0].source.atom = "atom:999"
    expectIssue(
      staleRelation,
      "/runtime/reactions/0/source/atom",
      "unknown_atom_reference",
    )

    const eagerMass = clone()
    eagerMass.runtime.roots[0].mass[0].content = {runs: 1}
    expectIssue(
      eagerMass,
      "/runtime/roots/0/mass/0/content",
      "invalid_literal",
    )
  })

  test("accepts active builder-derived Conditions for every Field type", () => {
    const built = activeBuilderConditions()
    const input = completeDocument()
    input.template[ROOT]!.fields = structuredClone(built.fields) as MetaField[]
    input.template[ROOT]!.superposition =
      structuredClone(built.superposition) as MetaState[]
    const transition = input.template[ROOT]!.superposition[0]!.transitions!.ready!

    expect(transition).toMatchObject({
      mode: {eq: "ready", notOneOf: ["idle"]},
      title: {startsWith: "R", length: {min: 1}},
      items: {length: {min: 1}, every: {gte: 0}, some: {gt: 1}},
      count: {
        gt: 0,
        gte: 0,
        lt: 10,
        lte: 10,
        notGt: 11,
        notGte: 12,
        notLt: -1,
        notLte: -2,
      },
      enabled: {eq: true, logicalEq: true},
    })
    expect(validateGraph(input).ok).toBe(true)
  })

  test.each([
    ["number operand", "count", {eq: "not-a-number"}, "/eq", "invalid_condition_operand"],
    ["number operator", "count", {startsWith: "1"}, "/startsWith", "invalid_condition_operator"],
    ["boolean operator", "enabled", {gt: 0}, "/gt", "invalid_condition_operator"],
    ["boolean operand", "enabled", {eq: "true"}, "/eq", "invalid_condition_operand"],
    ["string operator", "title", {gt: 1}, "/gt", "invalid_condition_operator"],
    ["array operator", "items", {startsWith: "x"}, "/startsWith", "invalid_condition_operator"],
    ["array item operand", "items", {every: {gte: "zero"}}, "/every/gte", "invalid_condition_operand"],
    ["enum operand", "mode", {eq: "missing"}, "/eq", "invalid_condition_operand"],
    ["enum operator", "mode", {startsWith: "r"}, "/startsWith", "invalid_condition_operator"],
  ])("rejects Condition %s mismatch", (_name, field, condition, suffix, code) => {
    const input = clone()
    input.template["example/root"].superposition[0].transitions.ready[field] = condition
    expectIssue(
      input,
      `/template/example~1root/superposition/0/transitions/ready/${field}${suffix}`,
      code,
    )
  })

  test.each([
    ["empty condition", "note", {}, "", "empty_condition"],
    ["empty length", "title", {length: {}}, "/length", "empty_condition"],
    ["empty every", "items", {every: {}}, "/every", "empty_condition"],
  ])("rejects %s", (_name, field, condition, suffix, code) => {
    const input = clone()
    input.template["example/root"].superposition[0].transitions.ready[field] = condition
    expectIssue(
      input,
      `/template/example~1root/superposition/0/transitions/ready/${field}${suffix}`,
      code,
    )
  })

  test("enforces exact normalized Field combinations", () => {
    const optionalId = clone()
    optionalId.template["example/root"].fields[1].id = true
    expectIssue(optionalId, "/template/example~1root/fields/1/id", "invalid_field_property")

    const arrayId = clone()
    arrayId.template["example/root"].fields[2].id = true
    expectIssue(arrayId, "/template/example~1root/fields/2/id", "invalid_field_property")

    const primitiveData = clone()
    primitiveData.template["example/root"].fields[1].data = "title"
    expectIssue(primitiveData, "/template/example~1root/fields/1/data", "invalid_field_property")

    const primitiveVariants = clone()
    primitiveVariants.template["example/root"].fields[3].values = ["one"]
    expectIssue(primitiveVariants, "/template/example~1root/fields/3/values", "invalid_field_property")

    const requiredWithoutDefault = clone()
    delete requiredWithoutDefault.template["example/root"].fields[3].default
    expectIssue(requiredWithoutDefault, "/template/example~1root/fields/3/default", "required")
  })

  test("rejects a self-transition", () => {
    const input = clone()
    input.template["example/root"].superposition[0].transitions.idle = {}
    expectIssue(
      input,
      "/template/example~1root/superposition/0/transitions/idle",
      "self_transition",
    )
  })

  test("enforces root and parent-relative occurrence declaration pointers", () => {
    const wrongRoot = clone()
    wrongRoot.runtime.roots[0].declaration = "#/template/example~1root/matter/0"
    expectIssue(wrongRoot, "/runtime/roots/0/declaration", "occurrence_pointer_mismatch")

    const wrongChild = clone()
    wrongChild.runtime.roots[0].children[0].declaration = "#/template/example~1child"
    expectIssue(wrongChild, "/runtime/roots/0/children/0/declaration", "occurrence_pointer_mismatch")

    const wrongSiblingTopology = clone()
    wrongSiblingTopology.runtime.roots[0].children[0].children[0].declaration =
      "#/template/example~1root/matter/1/children/0/particle"
    expectIssue(
      wrongSiblingTopology,
      "/runtime/roots/0/children/0/children/0/declaration",
      "occurrence_pointer_mismatch",
    )
  })

  test("consumes required static WIMP siblings in declared order", () => {
    const swapped = clone()
    swapped.runtime.roots[0].children = [
      swapped.runtime.roots[0].children[1],
      swapped.runtime.roots[0].children[0],
    ]
    expectIssue(
      swapped,
      "/runtime/roots/0/children/0/declaration",
      "occurrence_order_mismatch",
    )

    const duplicated = clone()
    duplicated.runtime.roots[0].children = [
      structuredClone(duplicated.runtime.roots[0].children[1]),
      structuredClone(duplicated.runtime.roots[0].children[1]),
    ]
    expectIssue(
      duplicated,
      "/runtime/roots/0/children/0/declaration",
      "occurrence_order_mismatch",
    )

    const omitted = clone()
    omitted.runtime.roots[0].children.pop()
    expectIssue(
      omitted,
      "/runtime/roots/0/children",
      "missing_static_occurrence",
    )
  })

  test("composes a created WIMP Atom from target roots before producing-WIMP children", () => {
    const input = createdWimpCompositionDocument()
    expect(validateGraph(input).ok).toBe(true)

    const reversed = createdWimpCompositionDocument()
    reversed.runtime.roots[0].children[0].children.reverse()
    expectIssue(
      reversed,
      "/runtime/roots/0/children/0/children/0/declaration",
      "occurrence_order_mismatch",
    )
  })

  test("closes Matter child slots by their parent particle kind", () => {
    const wimpElse = clone()
    wimpElse.template["example/root"].matter[0].children[0].edgeSlot = "else"
    expectIssue(
      wimpElse,
      "/template/example~1root/matter/0/children/0/edgeSlot",
      "invalid_edge_slot",
    )

    const machoThen = clone()
    machoThen.template["example/root"].matter[0].children[0].particle.children = [{
      edgeSlot: "then",
      particle: {kind: "wimp", src: CHILD},
    }]
    expectIssue(
      machoThen,
      "/template/example~1root/matter/0/children/0/particle/children/0/edgeSlot",
      "invalid_edge_slot",
    )

    const fuzzyChild = topologyDocument("fuzzy", {
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode"},
      children: [{
        edgeSlot: "child",
        particle: {kind: "wimp", src: CHILD},
      }],
    }, [])
    expectIssue(
      fuzzyChild,
      "/template/example~1root/matter/0/children/0/edgeSlot",
      "invalid_edge_slot",
    )

    const axionBranch = topologyDocument("axion", {
      kind: "axion",
      predicateBinding: {data: "mode"},
      children: [{
        edgeSlot: "branch",
        particle: {kind: "wimp", src: CHILD},
      }],
    }, [])
    expectIssue(
      axionBranch,
      "/template/example~1root/matter/0/children/0/edgeSlot",
      "invalid_edge_slot",
    )
  })

  test("accepts exactly the selected Axion branch sequence", () => {
    const matter = {
      kind: "axion",
      predicateBinding: {data: "mode"},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: CHILD}},
        {edgeSlot: "else", particle: {kind: "wimp", src: PEER}},
      ],
    }
    const thenBranch = topologyDocument("axion", matter, [
      runtimeAtom(
        "#/template/example~1root/matter/0/children/0/particle",
        CHILD,
        "Then",
      ),
    ])
    expect(validateGraph(thenBranch).ok).toBe(true)

    const elseBranch = topologyDocument("axion", matter, [
      runtimeAtom(
        "#/template/example~1root/matter/0/children/1/particle",
        PEER,
        "Else",
      ),
    ])
    expect(validateGraph(elseBranch).ok).toBe(true)

    const logicalChildMatter = {
      kind: "axion",
      predicateBinding: {data: "mode"},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: CHILD}},
        {edgeSlot: "child", particle: {kind: "wimp", src: PEER}},
      ],
    }
    const logicalChildBranch = topologyDocument("axion", logicalChildMatter, [
      runtimeAtom(
        "#/template/example~1root/matter/0/children/0/particle",
        CHILD,
        "Then",
      ),
      runtimeAtom(
        "#/template/example~1root/matter/0/children/1/particle",
        PEER,
        "Logical child",
      ),
    ])
    expect(validateGraph(logicalChildBranch).ok).toBe(true)

    const thenOnlyMatter = {
      kind: "axion",
      predicateBinding: {data: "mode"},
      children: [
        {edgeSlot: "then", particle: {kind: "wimp", src: CHILD}},
      ],
    }
    const inactiveWithoutElse = topologyDocument("axion", thenOnlyMatter, [])
    delete inactiveWithoutElse.template["example/peer"]
    expect(validateGraph(inactiveWithoutElse).ok).toBe(true)

    const crossBranch = topologyDocument("axion", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "Then"),
      runtimeAtom("#/template/example~1root/matter/0/children/1/particle", PEER, "Else"),
    ])
    expectIssue(
      crossBranch,
      "/runtime/roots/0/children/0/children",
      "branch_occurrence_mismatch",
    )

    const reversed = topologyDocument("axion", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/1/particle", PEER, "Else"),
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "Then"),
    ])
    expectIssue(
      reversed,
      "/runtime/roots/0/children/0/children",
      "branch_occurrence_mismatch",
    )
  })

  test("accepts zero-to-many ordered Macho child occurrences", () => {
    const matter = {
      kind: "macho",
      collectionBinding: {data: "items"},
      children: [
        {edgeSlot: "child", particle: {kind: "wimp", src: CHILD}},
        {edgeSlot: "child", particle: {kind: "wimp", src: PEER}},
      ],
    }
    const repeated = topologyDocument("macho", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "First"),
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "Second"),
    ])
    expect(validateGraph(repeated).ok).toBe(true)

    const empty = topologyDocument("macho", matter, [])
    expect(validateGraph(empty).ok).toBe(true)

    const reversed = topologyDocument("macho", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/1/particle", PEER, "Peer"),
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "Child"),
    ])
    expectIssue(
      reversed,
      "/runtime/roots/0/children/0/children/1/declaration",
      "collection_occurrence_mismatch",
    )

    const wrongParent = topologyDocument("macho", matter, [
      runtimeAtom("#/template/example~1root", CHILD, "Wrong parent"),
    ])
    expectIssue(
      wrongParent,
      "/runtime/roots/0/children/0/children/0/declaration",
      "collection_occurrence_mismatch",
    )
  })

  test("accepts zero or one selected Fuzzy dynamic-meta branch", () => {
    const matter = {
      kind: "fuzzy",
      fuzzyKind: "dynamic-meta",
      predicateBinding: {data: "mode", expr: "example/${_[0]}"},
      children: [
        {edgeSlot: "branch", particle: {kind: "wimp", src: CHILD}},
        {edgeSlot: "branch", particle: {kind: "wimp", src: PEER}},
      ],
    }
    const selected = topologyDocument("fuzzy", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/1/particle", PEER, "Selected"),
    ])
    expect(validateGraph(selected).ok).toBe(true)

    const empty = topologyDocument("fuzzy", matter, [])
    expect(validateGraph(empty).ok).toBe(true)

    const multiple = topologyDocument("fuzzy", matter, [
      runtimeAtom("#/template/example~1root/matter/0/children/0/particle", CHILD, "First"),
      runtimeAtom("#/template/example~1root/matter/0/children/1/particle", PEER, "Second"),
    ])
    expectIssue(
      multiple,
      "/runtime/roots/0/children/0/children",
      "dynamic_branch_mismatch",
    )
  })

  test("compiles RegExp descriptors with their validated flags", () => {
    const valid = completeDocument()
    expect(validateGraph(valid).ok).toBe(true)

    const invalid = clone()
    invalid.template["example/root"].superposition[0].transitions.ready.title.pattern = {
      source: "[",
      flags: "",
    }
    expectIssue(
      invalid,
      "/template/example~1root/superposition/0/transitions/ready/title/pattern/source",
      "invalid_regexp",
    )
  })

  test("exposes an opaque validated MetaAddress boundary", () => {
    expect(parseMetaAddress("example/root")).toBe(ROOT)
    expect(parseMetaAddress("example/root-child")).toBeTruthy()
    expect(parseMetaAddress("example/root/nested")).toBeNull()
    expect(parseMetaAddress("example/../root")).toBeNull()
    expect(typeof compileTimeAddressBoundary).toBe("function")
  })

  test.each([
    ["raw Atom identity", "/runtime/roots/0/atomId", (input: Record<string, any>) => {
      input.runtime.roots[0].atomId = 17
    }],
    ["raw Field identity", "/runtime/roots/0/fieldId", (input: Record<string, any>) => {
      input.runtime.roots[0].fieldId = 5
    }],
    ["raw value identity", "/runtime/roots/0/valueId", (input: Record<string, any>) => {
      input.runtime.roots[0].valueId = 9
    }],
    ["revision", "/revision", (input: Record<string, any>) => {
      input.revision = 3
    }],
    ["digest", "/templateDigest", (input: Record<string, any>) => {
      input.templateDigest = "sha256:x"
    }],
    ["CAS", "/cas", (input: Record<string, any>) => {
      input.cas = "etag"
    }],
    ["status envelope", "/runtime/roots/0/status", (input: Record<string, any>) => {
      input.runtime.roots[0].status = "materialized"
    }],
    ["missing envelope", "/runtime/roots/0/missing", (input: Record<string, any>) => {
      input.runtime.roots[0].missing = ["title"]
    }],
    ["stub", "/template/example~1root/matter/0/stub", (input: Record<string, any>) => {
      input.template["example/root"].matter[0].stub = true
    }],
    ["port", "/runtime/roots/0/port", (input: Record<string, any>) => {
      input.runtime.roots[0].port = "out"
    }],
    ["global edges", "/edges", (input: Record<string, any>) => {
      input.edges = []
    }],
    ["universal order", "/order", (input: Record<string, any>) => {
      input.order = []
    }],
  ])("rejects forbidden %s shape", (_name, path, mutate) => {
    const input = clone()
    mutate(input)
    expectIssue(input, path, "unknown_property")
  })

  test("rejects non-canonical and unresolved Meta identity", () => {
    const invalidAddress = clone()
    invalidAddress.root = "example/root/nested"
    expectIssue(invalidAddress, "/root", "invalid_meta_address")

    const unresolved = clone()
    delete unresolved.template["example/child"]
    expectIssue(unresolved, "/template/example~1root/matter", "unresolved_matter_target")
  })

  test("rejects invalid runtime declaration, State and sparse value references", () => {
    const declaration = clone()
    declaration.runtime.roots[0].declaration = "#/template/example~1missing"
    expectIssue(declaration, "/runtime/roots/0/declaration", "unresolved_declaration_pointer")

    const state = clone()
    state.runtime.roots[0].state = "missing"
    expectIssue(state, "/runtime/roots/0/state", "unknown_state_reference")

    const value = clone()
    value.runtime.roots[0].values.unknown = true
    expectIssue(value, "/runtime/roots/0/values/unknown", "unknown_field_reference")
  })

  test("requires ordered declaration sequences instead of maps or order vectors", () => {
    const states = clone()
    states.template["example/root"].superposition = {idle: {}, ready: null}
    expectIssue(states, "/template/example~1root/superposition", "invalid_type")

    const fields = clone()
    fields.template["example/root"].fields = {mode: {type: "enum"}}
    expectIssue(fields, "/template/example~1root/fields", "invalid_type")
  })
})
