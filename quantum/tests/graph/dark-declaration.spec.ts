import {describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  validateGraph,
  type MetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {
  loadMetaDeclarationGraph,
  normalizeMetaTemplate,
  readDarkDeclarationProjection,
  type MetaLoader,
} from "../../dark/graph/declaration.ts"

const ROOT = parseMetaAddress("example/dark-root")!
const CHILD = parseMetaAddress("example/dark-child")!
const PEER = parseMetaAddress("example/dark-peer")!
const LEAF = parseMetaAddress("example/dark-leaf")!

const dsl = (value: Partial<MetaDSL> & Pick<MetaDSL, "name">): MetaDSL => ({
  name: value.name,
  fields: value.fields ?? [],
  superposition: value.superposition ?? [],
  ...(value.desc === undefined ? {} : {desc: value.desc}),
  ...(value.mass === undefined ? {} : {mass: value.mass}),
  ...(value.processes === undefined ? {} : {processes: value.processes}),
  ...(value.reactions === undefined ? {} : {reactions: value.reactions}),
  ...(value.matter === undefined ? {} : {matter: value.matter}),
  ...(value.bulk === undefined ? {} : {bulk: value.bulk}),
})

const loader = (
  declarations: Map<string, MetaDSL>,
  reads: string[] = [],
): MetaLoader => async (src) => {
  reads.push(src)
  const declaration = declarations.get(src)
  if (!declaration) throw new Error(`Missing test declaration: ${src}`)
  return structuredClone(declaration)
}

const completeDeclarations = (): Map<string, MetaDSL> => new Map([
  [ROOT, dsl({
    name: "Dark root",
    desc: "Complete declaration projection",
    fields: [
      {key: "mode", type: "enum", required: true, default: "idle", values: ["idle", "ready"], label: "Mode"},
      {key: "title", type: "string", label: "Title"},
      {key: "items", type: "array", required: true, default: [], data: "item"},
    ],
    superposition: [
      {
        name: "idle",
        transitions: {
          ready: {
            mode: {eq: "ready"},
            title: {pattern: /^ready/iu, length: {min: 1}},
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
          error: {src: "({update}) => update({title: 'error'})", read: ["mode"], write: ["title"]},
        },
      },
      {
        key: "idle",
        declaration: {
          type: "finally",
          before: {src: "() => {}", read: ["title"]},
        },
      },
    ],
    reactions: [
      {
        key: "observe",
        label: "Observe child",
        desc: null,
        sources: [{meta: CHILD, states: ["visible"]}],
        src: "({update}) => update({title: 'observed'})",
        read: [],
        write: ["title"],
        massRead: ["cache"],
        massWrite: ["cache"],
        states: ["ready"],
      },
    ],
    matter: [{
      kind: "wimp",
      src: CHILD,
      fieldsBinding: {data: "title", expr: "{label: _[0]}"},
      massBinding: {
        data: "/mass/cache",
        expr: "{cache: _[0]}",
        directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
      },
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    }],
    bulk: {view: ".root { display: block; }"},
  })],
  [CHILD, dsl({
    name: "Dark child",
    fields: [{key: "label", type: "string"}],
    superposition: [{name: "visible"}],
    mass: [],
    processes: [],
  })],
])

describe("Dark Graph declaration provider", () => {
  test("returns one complete public template graph as transport-safe JSON", async () => {
    const reads: string[] = []
    const projection = await readDarkDeclarationProjection(
      {root: ROOT},
      loader(completeDeclarations(), reads),
    )

    expect(reads).toEqual([ROOT, CHILD])
    expect(projection.root).toBe(ROOT)
    expect(Object.keys(projection.template)).toEqual([ROOT, CHILD])
    expect(projection).not.toHaveProperty("schema")
    expect(projection).not.toHaveProperty("runtime")
    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection)

    const root = projection.template[ROOT]!
    expect(root.fields.map(({key}) => key)).toEqual(["mode", "title", "items"])
    expect(root.superposition.map(({name}) => name)).toEqual(["idle", "ready"])
    expect(Object.keys(root.superposition[0]!.transitions!)).toEqual(["ready"])
    expect(root.superposition[0]!.transitions!.ready!.title).toEqual({
      pattern: {source: "^ready", flags: "iu"},
      length: {min: 1},
    })
    expect(root.processes.map(({key}) => key)).toEqual(["ready", "idle"])
    expect(root.reactions?.map(({key}) => key)).toEqual(["observe"])
    expect(root.reactions?.[0]).toMatchObject({
      sources: [{meta: CHILD, states: ["visible"]}],
      read: [],
      write: ["title"],
      massRead: ["cache"],
      massWrite: ["cache"],
      src: "({update}) => update({title: 'observed'})",
    })
    expect(root.matter?.map(({kind}) => kind)).toEqual(["wimp"])
    expect(root.mass).toEqual([
      {key: "cache", format: "json", label: "Cache", description: "Metadata only"},
    ])
    expect(root.bulk).toEqual({view: ".root { display: block; }"})
    expect(projection.template[CHILD]!.superposition).toEqual([
      {name: "visible", transitions: null},
    ])

    const document: Graph = {
      schema: GRAPH_SCHEMA,
      ...projection,
      runtime: {
        roots: [{
          ref: "atom:1",
          kind: "atom",
          declaration: "#/template/example~1dark-root",
          meta: ROOT,
          state: "idle",
          values: {},
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
            declaration: "#/template/example~1dark-root/matter/0",
            meta: CHILD,
            state: "visible",
            values: {},
            mass: [],
          }],
        }],
        reactions: [{
          ref: "reaction:1:1:2",
          kind: "reaction",
          reaction: {meta: ROOT, key: "observe"},
          source: {atom: "atom:2", states: ["visible"]},
          target: {atom: "atom:1", states: ["ready"]},
          active: false,
        }],
      },
    }
    expect(validateGraph(document)).toEqual({ok: true, value: document})
  })

  test("loads reachable references breadth-first once while preserving Matter sequence", async () => {
    const declarations = new Map<string, MetaDSL>([
      [ROOT, dsl({
        name: "Root",
        fields: [],
        superposition: [],
        matter: [
          {kind: "wimp", src: CHILD},
          {
            kind: "macho",
            collectionBinding: {data: "items"},
            children: [{edgeSlot: "child", particle: {kind: "wimp", src: PEER}}],
          },
          {kind: "wimp", src: CHILD},
        ],
      })],
      [CHILD, dsl({
        name: "Child",
        matter: [
          {kind: "wimp", src: LEAF},
          {kind: "wimp", src: ROOT},
        ],
      })],
      [PEER, dsl({name: "Peer"})],
      [LEAF, dsl({name: "Leaf"})],
    ])
    const reads: string[] = []
    const projection = await readDarkDeclarationProjection(
      {root: ROOT},
      loader(declarations, reads),
    )

    expect(reads).toEqual([ROOT, CHILD, PEER, LEAF])
    expect(Object.keys(projection.template)).toEqual([ROOT, CHILD, PEER, LEAF])
    expect(projection.template[ROOT]!.matter).toEqual([
      {kind: "wimp", src: CHILD},
      {
        kind: "macho",
        collectionBinding: {data: "items"},
        children: [{edgeSlot: "child", particle: {kind: "wimp", src: PEER}}],
      },
      {kind: "wimp", src: CHILD},
    ])
  })

  test("loads a Reaction source Meta even when Matter does not contain it", async () => {
    const declarations = new Map<string, MetaDSL>([
      [ROOT, dsl({
        name: "Observer",
        fields: [{key: "count", type: "number", required: true, default: 0}],
        superposition: [{name: "listening", transitions: null}],
        reactions: [{
          key: "observe",
          label: "Observe",
          desc: null,
          sources: [{meta: PEER, states: ["ready"]}],
          src: "({update, value}) => update({count: value.count + 1})",
          read: ["count"],
          write: ["count"],
          massRead: [],
          massWrite: [],
          states: ["listening"],
        }],
      })],
      [PEER, dsl({
        name: "Source",
        superposition: [{name: "ready", transitions: null}],
      })],
    ])
    const reads: string[] = []

    const materialReads: string[] = []
    const materialized: string[] = []
    for await (const declaration of loadMetaDeclarationGraph(
      ROOT,
      loader(declarations, materialReads),
    )) materialized.push(declaration.address)

    const projection = await readDarkDeclarationProjection(
      {root: ROOT},
      loader(declarations, reads),
    )

    expect(materialReads).toEqual([ROOT])
    expect(materialized).toEqual([ROOT])
    expect(reads).toEqual([ROOT, PEER])
    expect(Object.keys(projection.template)).toEqual([ROOT, PEER])
  })

  test("rejects a noncanonical root before loader access and closes RPC params", async () => {
    const reads: string[] = []
    const read = loader(new Map(), reads)

    await expect(readDarkDeclarationProjection(
      {root: "example/root/nested"},
      read,
    )).rejects.toThrow("canonical <owner>/<repository>")
    await expect(readDarkDeclarationProjection(
      {root: ROOT, view: "compact"},
      read,
    )).rejects.toThrow("must contain only root")
    expect(reads).toEqual([])
  })

  test("rejects a noncanonical Matter target before target loader access", async () => {
    const reads: string[] = []
    const declarations = new Map<string, MetaDSL>([
      [ROOT, dsl({
        name: "Invalid target",
        matter: [{kind: "wimp", src: "example/child/nested"}],
      })],
    ])

    await expect(readDarkDeclarationProjection(
      {root: ROOT},
      loader(declarations, reads),
    )).rejects.toThrow("Matter src must be a canonical")
    expect(reads).toEqual([ROOT])
  })

  test("rejects non-serializable declaration values instead of silently dropping them", () => {
    const declaration = dsl({
      name: "Invalid JSON",
      fields: [{
        key: "callback",
        type: "string",
        default: (() => "not JSON") as unknown as string,
      }],
    })

    expect(() => normalizeMetaTemplate(declaration, ROOT)).toThrow(
      "non-serializable function",
    )
  })

  test("returns public branded addresses without exposing a second schema", async () => {
    const projection = await readDarkDeclarationProjection(
      {root: ROOT},
      loader(new Map([[ROOT, dsl({name: "Root"})]])),
    )
    const root: MetaAddress = projection.root
    expect(root).toBe(ROOT)
    expect(Object.keys(projection)).toEqual(["root", "template"])
  })
})
