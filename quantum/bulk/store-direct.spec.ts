import {describe, expect, test} from "bun:test"
import {readFileSync} from "node:fs"
import type {BoundaryInitialProjectionEntry} from "shared/protocol/boundary/initial"
import type {BulkObserverSnapshot} from "@bulk/types/initial"
import type {BulkRuntimeProjection} from "@bulk/types/projection"
import {
  BULK_STORE_LAYOUT_OUTSIDE_IN,
  type BulkStore,
} from "shared/protocol/bulk/store"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {buildDirectBulkStore} from "./store-direct.ts"
import {bulkStoreApplyControl, prepareBulkStoreInitial} from "./store-initial.ts"
import {BULK_STORE_RELATION_KIND, isBulkStore} from "./store.ts"
import {buildBulkStoreTestOracle} from "./store-test-oracle.ts"

const snapshot = structuredClone(snapshotJson) as BulkObserverSnapshot
const projection = snapshot.projection.runtime
const rootSrc = parseMetaAddress(snapshot.rootSrc)
const rootAtom = projection.atoms.find((atom) =>
  atom.parentAtom === null && atom.parentTopology === null)

if (!rootAtom || rootSrc === null) throw new Error("Bulk direct fixture has no root")

const direct = (): BulkStore => buildDirectBulkStore(projection, rootAtom.id)

const oracle = (): BulkStore => buildBulkStoreTestOracle(projection, rootSrc)

const textColumns = new Map<string, ReadonlySet<string>>([
  ["fieldSource", new Set(["key", "label"])],
  ["dark", new Set(["label"])],
  ["field", new Set(["key", "label", "valueText"])],
  ["fieldAlias", new Set(["valueText"])],
  ["orbital", new Set(["label"])],
  ["proxy", new Set(["label"])],
])

const floatColumns = new Map<string, ReadonlySet<string>>([
  ["dark", new Set(["position", "form", "material"])],
  ["field", new Set(["position", "form", "material"])],
  ["orbital", new Set(["position", "form", "material"])],
  ["proxy", new Set(["position", "form", "material"])],
  ["transition", new Set(["control"])],
  ["relation", new Set(["control"])],
  ["batch", new Set(["material"])],
])

const expectStoreParity = (actual: BulkStore, expected: BulkStore): void => {
  expect(isBulkStore(actual)).toBe(true)
  expect(actual.root).toBe(expected.root)
  expect(actual.layout).toBe(expected.layout)
  expect(actual.orbitalRelatedState).toEqual(expected.orbitalRelatedState)

  for (const section of [
    "fieldSource",
    "dark",
    "field",
    "fieldAlias",
    "orbital",
    "proxy",
    "transition",
    "relation",
    "batch",
  ] as const) {
    const skipped = textColumns.get(section) ?? new Set<string>()
    const floats = floatColumns.get(section) ?? new Set<string>()
    const actualSection = actual[section] as unknown as Record<string, readonly number[]>
    const expectedSection = expected[section] as unknown as Record<string, readonly number[]>
    expect(Object.keys(actualSection).toSorted()).toEqual(
      Object.keys(expectedSection).toSorted(),
    )
    for (const column of Object.keys(actualSection)) {
      if (skipped.has(column) ||
          (section === "fieldSource" && column === "localId") ||
          (actual.layout === BULK_STORE_LAYOUT_OUTSIDE_IN &&
            section === "fieldAlias" && column === "orbit") ||
          ((section === "dark" || section === "fieldSource") && column === "wimp")) continue
      if (floats.has(column)) {
        expect(
          new Float32Array(actualSection[column]!),
          `${section}.${column} browser buffer`,
        ).toEqual(new Float32Array(expectedSection[column]!))
      } else {
        expect(actualSection[column], `${section}.${column}`).toEqual(expectedSection[column])
      }
    }
    for (const column of skipped) {
      const actualSlots = actualSection[column]!
      const expectedSlots = expectedSection[column]!
      expect(
        actualSlots.map((slot) => actual.text[slot]),
        `${section}.${column} visible text`,
      ).toEqual(expectedSlots.map((slot) => expected.text[slot]))
    }
  }
  expect(Array.from(actual.dark.wimp, (slot) => actual.wimp.src[slot - 1])).toEqual(
    Array.from(expected.dark.wimp, (slot) => expected.wimp.src[slot - 1]),
  )
  expect(Array.from(actual.fieldSource.wimp, (slot) => actual.wimp.src[slot - 1])).toEqual(
    Array.from(expected.fieldSource.wimp, (slot) => expected.wimp.src[slot - 1]),
  )
}

describe("direct Bulk Store production writer", () => {
  test("matches the legacy scene oracle for every numeric pixel/control column", () => {
    expectStoreParity(direct(), oracle())
  })

  test("writes outside-in directly with exact legacy pixel/control parity", () => {
    expectStoreParity(
      buildDirectBulkStore(
        projection,
        rootAtom.id,
        BULK_STORE_LAYOUT_OUTSIDE_IN,
      ),
      buildBulkStoreTestOracle(
        projection,
        rootSrc,
        null,
        "outside-in",
      ),
    )
  })

  test("matches nested topology ownership without a semantic scene", () => {
    const topologyRoot = parseMetaAddress("owner/direct-root")!
    const topologyChild = parseMetaAddress("owner/direct-child")!
    const topologyProjection: BulkRuntimeProjection = {
      atoms: [
        {id: 1, parentAtom: null, parentTopology: null, wimp: topologyRoot, position: 0},
        {id: 2, parentAtom: null, parentTopology: 1, wimp: topologyChild, position: 0},
      ],
      topologies: [
        {id: 1, parentAtom: 1, parentTopology: null, kind: "fuzzy", position: 0},
      ],
      wimps: [
        {src: topologyRoot, name: "Root"},
        {src: topologyChild, name: "Child"},
      ],
      fields: [], states: [], transitions: [], conditions: [], processes: [], reactions: [],
      atomStates: [], fieldEnumVariants: [], atomValues: [], values: [], valueItems: [],
      matterParticles: [], matterTopologyBindingPaths: [], matterChildWimpBindingPaths: [],
    }

    expectStoreParity(
      buildDirectBulkStore(topologyProjection, 1),
      buildBulkStoreTestOracle(topologyProjection, topologyRoot),
    )
  })

  test("preserves canonical declaration rows as compact relational source facts", () => {
    const store = direct()
    expect(Array.from(store.fieldSource.id)).toEqual(projection.fields.map(({id}) => id))
    expect(Array.from(store.fieldSource.localId)).toEqual(
      projection.fields.map((field) => Number(
        (field as typeof field & {localId?: number}).localId ?? field.id,
      )),
    )
    expect(Array.from(store.stateSource.id)).toEqual(projection.states.map(({id}) => id))
    expect(Array.from(store.stateSource.position)).toEqual(
      projection.states.map(({position}) => position),
    )
    expect(Array.from(store.stateSource.name, (slot) => store.text[slot])).toEqual(
      projection.states.map(({name}) => name),
    )
    expect(Array.from(store.transitionSource.id)).toEqual(
      projection.transitions.map(({id}) => id),
    )
    expect(Array.from(store.transitionSource.fromState)).toEqual(
      projection.transitions.map(({fromState}) => fromState),
    )
    expect(Array.from(store.transitionSource.toState)).toEqual(
      projection.transitions.map(({toState}) => toState),
    )
    expect(Array.from(store.conditionSource.id)).toEqual(
      projection.conditions.map(({id}) => id),
    )
    expect(Array.from(store.conditionSource.transition)).toEqual(
      projection.conditions.map(({transition}) => transition),
    )
    expect(Array.from(store.conditionSource.field)).toEqual(
      projection.conditions.map(({field}) => field),
    )
    expect(Array.from(store.processSource.id)).toEqual(projection.processes.map(({id}) => id))
    for (const [slot, process] of projection.processes.entries()) {
      expect(store.text[store.processSource.state[slot]!]).toBe(process.state)
      expect(store.text[store.processSource.label[slot]!]).toBe(
        String(process.descriptor.label ?? process.descriptor.key ?? process.state),
      )
      const readStart = store.processSource.readStart[slot]!
      const writeStart = store.processSource.writeStart[slot]!
      expect(Array.from(store.processField.slice(
        readStart, readStart + store.processSource.readCount[slot]!,
      )).every((id) => projection.fields.some((field) => field.id === id))).toBe(true)
      expect(Array.from(store.processField.slice(
        writeStart, writeStart + store.processSource.writeCount[slot]!,
      )).every((id) => projection.fields.some((field) => field.id === id))).toBe(true)
    }
  })

  test("keeps Process dependencies without persistent center-loop geometry", () => {
    const store = direct()
    const processRelations = Array.from(
      {length: store.relation.id.length},
      (_, slot) => slot,
    ).filter((slot) =>
      store.relation.kind[slot] === BULK_STORE_RELATION_KIND["process-read"] ||
      store.relation.kind[slot] === BULK_STORE_RELATION_KIND["process-write"]
    )

    expect(processRelations.length).toBeGreaterThan(0)
    for (const slot of processRelations) {
      expect(store.relation.batch[slot]).toBe(0)
      expect(store.relation.controlStart[slot]).toBe(-1)
    }
  })

  test("keeps the production initial path free of manifestation and scene stages", () => {
    const initial = readFileSync(new URL("./store-initial.ts", import.meta.url), "utf8")
    const runtime = readFileSync(new URL("./store-runtime.ts", import.meta.url), "utf8")
    const oracle = readFileSync(new URL("./oracle.ts", import.meta.url), "utf8")
    const production = `${initial}\n${runtime}`

    for (const forbidden of [
      "buildBulkManifestation",
      "prepareBulkInitialVisual",
      "BulkManifest",
      "ReadyScene",
      "BulkProjectionStore",
      "layoutCenteredNestedFieldSubtree",
    ]) expect(production).not.toContain(forbidden)
    expect(initial).not.toContain("structuredClone")
    expect(oracle).not.toContain('from "./manifestation.ts"')
    expect(oracle).not.toContain("prepareBulkInitialVisual")
    expect(oracle).not.toContain("store-test-oracle")
    expect(oracle).not.toContain("testOracle")
  })

  test("excludes WIMP view_css from the initial Store", () => {
    const css = ".must-not-enter-bulk-store { color: magenta; }"
    const entries: BoundaryInitialProjectionEntry[] = [
      {
        part: "graviton",
        op: "add",
        path: "wimp",
        value: {src: "test/root", name: "Root"},
      },
      {
        part: "graviton",
        op: "add",
        path: "bulk",
        value: {wimp: "test/root", view: css},
      },
      {
        part: "graviton",
        op: "add",
        path: "atom/1",
        value: {
          atom: {
            id: 1,
            wimp: "test/root",
            parentAtom: null,
            parentTopology: null,
            position: 0,
          },
          state: {metaState: null},
          values: [],
          valueRecords: [],
          valueItems: [],
        },
      },
    ]
    const prepared = prepareBulkStoreInitial({version: 1, entries}, "view-css-proof")
    expect(prepared).not.toBeNull()
    const serialized = JSON.stringify(prepared!.initial.store)
    expect(Object.keys(prepared!.initial.store.wimp).toSorted()).toEqual([
      "flags",
      "name",
      "src",
    ])
    expect(serialized).not.toContain("view_css")
    expect(serialized).not.toContain("viewCss")
    expect(serialized).not.toContain(css)
    expect(bulkStoreApplyControl({parts: [{
      part: "graviton",
      op: "replace",
      path: "bulk",
      by: "boundary",
      ts: 1,
      value: {wimp: "test/root", view: css},
    }]})).toBeNull()
  })
})
