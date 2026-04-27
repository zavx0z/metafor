import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { Fuzzy, materializeFields, Meta, Wimp } from "@dark/strong"
import { openDbMaterializationWriter, openDbSqliteBackend } from "store/db"
import { HubFixture } from "fixture"
import { matter } from "../../dark/index.ts"
import { createDbFixture } from "fixture/db.fixture.ts"
import { dark$ } from "../../dark/store.ts"
import {
  addRuntimeWimp,
  applyWeakResultPacket,
  applyStructuralPatchFromDb,
  boundary$,
  gravity$,
  listRuntimeWimpIds,
  prepareRuntimeFromDb,
  rebuildRuntime,
  setValues,
  strong$,
  unlock,
  update,
  writeRuntimeFromDb,
} from "../boundary.ts"
import { resetBoundaryForTest } from "./test.helper"
import { weak$ } from "../weak"

const hub = new HubFixture()

const resetDarkStore = (): void => {
  dark$.meta.clear()
  dark$.fields.clear()
  dark$.particles.clear()
}

const normalizeRuntimeFields = (fields: typeof boundary$.fields): string[] =>
  fields
    .map((field) =>
      JSON.stringify({
        type: field.type,
        elementType: field.elementType ?? null,
        enum: field.enum ?? null,
      }),
    )
    .sort()

const materializeGithubWorldToDb = async () => {
  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)

  await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, { dbWriter: writer })

  return backend
}

const materializeFixtureToDb = async () => {
  const fixture = createDbFixture()
  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)

  await fixture.root.save(writer)
  await fixture.child.save(writer)

  return { fixture, backend }
}

const materializeIndependentRootsToDb = async () => {
  const meta = new Meta({
    src: "meta/runtime-index-shift",
    fieldSchemas: {
      title: { type: "string", required: true, default: "" },
    },
  })
  const createRoot = (title: string) => {
    const wimp = new Wimp({ src: meta.src, meta, parent: null })
    wimp.fields = materializeFields(wimp, meta.fields)
    wimp.fields.title!.value = title
    return wimp
  }

  const alpha = createRoot("alpha")
  const beta = createRoot("beta")
  const gamma = createRoot("gamma")
  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)

  await alpha.save(writer)
  await beta.save(writer)
  await gamma.save(writer)

  return { backend, wimps: { alpha, beta, gamma } }
}

const materializeProcessFlowFixtureToDb = async () => {
  const meta = new Meta({
    src: "meta/process-flow",
    fieldSchemas: {
      trigger: { type: "boolean", required: true, default: false },
    },
    superposition: {
      idle: {
        processing: {
          trigger: true,
        },
      },
      processing: {
        done: {},
      },
      done: null,
    },
    processes: {
      processing: {
        type: "action",
        action: {
          src: "./noop.ts",
        },
      },
    },
  })

  const root = new Wimp({ src: meta.src, meta, parent: null })
  root.fields = materializeFields(root, meta.fields)
  root.fields.trigger!.value = false

  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)
  await root.save(writer)

  return { backend, meta, root }
}

const materializeProcessRetriggerFixtureToDb = async () => {
  const meta = new Meta({
    src: "meta/process-retrigger",
    fieldSchemas: {
      approved: { type: "boolean", required: true, default: false },
      payload: { type: "string", required: false, default: null },
    },
    superposition: {
      processing: {
        done: {
          approved: true,
        },
      },
      done: null,
    },
    processes: {
      processing: {
        type: "action",
        action: {
          src: "./noop.ts",
        },
      },
    },
  })

  const root = new Wimp({ src: meta.src, meta, parent: null })
  root.fields = materializeFields(root, meta.fields)
  root.fields.approved!.value = false
  root.fields.payload!.value = null

  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)
  await root.save(writer)

  return { backend, meta, root }
}

const materializeCrossBraneProcessRetriggerFixtureToDb = async () => {
  const rootMeta = new Meta({
    src: "meta/process-retrigger-root",
    fieldSchemas: {
      payload: { type: "string", required: false, default: null },
    },
    superposition: {
      processing: null,
    },
    processes: {
      processing: {
        type: "action",
        action: {
          src: "./noop.ts",
        },
      },
    },
  })

  const childMeta = new Meta({
    src: "meta/process-retrigger-child",
    fieldSchemas: {
      payload: { type: "string", required: false, default: null },
    },
    superposition: {
      processing: null,
    },
    processes: {
      processing: {
        type: "action",
        action: {
          src: "./noop.ts",
        },
      },
    },
  })

  const root = new Wimp({ src: rootMeta.src, meta: rootMeta, parent: null })
  root.fields = materializeFields(root, rootMeta.fields)
  root.fields.payload!.value = null

  const gate = new Fuzzy({ parent: root })
  root.children.add(gate)

  const child = new Wimp({ src: childMeta.src, meta: childMeta, parent: gate })
  gate.children.add(child)
  child.fields = materializeFields(child, childMeta.fields, [
    { key: "payload", value: null, source: root.fields.payload! },
  ])
  child.fields.payload!.source = root.fields.payload!

  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)
  await root.save(writer)
  await child.save(writer)

  return { backend, rootMeta, childMeta, root, child }
}

describe("boundary runtime from db backend", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterEach(async () => {
    await resetBoundaryForTest()
    resetDarkStore()
  })

  afterAll(async () => {
    resetDarkStore()
    await hub.teardown()
  })

  test("публичный boundary API читает db backend, собранный прямо из matter materialization", async () => {
    const backend = await materializeGithubWorldToDb()

    try {
      const wimpIds = await backend.listWimpIds()
      const rows = await Promise.all(wimpIds.map((wimpId) => backend.readWimpRows(wimpId)))
      const prepared = await prepareRuntimeFromDb(backend)

      expect(await backend.readMetaRows("zavx0z/git")).not.toBeNull()
      expect(wimpIds.length).toBeGreaterThan(0)
      expect(rows.every((row) => row !== null && row.values.length === row.fields.length)).toBe(true)
      expect(prepared.branes).toHaveLength(wimpIds.length)
      expect(prepared.fields.length).toBeGreaterThan(0)
      expect(prepared.states).toHaveLength(wimpIds.length)
      expect(prepared.stringTable.length).toBeGreaterThan(0)
    } finally {
      backend.close()
    }
  })

  test("проходит путь AST -> db backend -> unified boundary runtime API -> weak", async () => {
    const backend = await materializeGithubWorldToDb()

    try {
      const wimpIds = await backend.listWimpIds()
      const prepared = await prepareRuntimeFromDb(backend)

      const changes = await writeRuntimeFromDb(backend)
      expect(changes).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(gravity$.structuralDirty).toBe(false)
      expect(boundary$.branes).toHaveLength(wimpIds.length)
      expect(gravity$.braneIndexToWimpId).toHaveLength(wimpIds.length)
      expect(boundary$.states).toHaveLength(wimpIds.length)
      expect(normalizeRuntimeFields(boundary$.fields)).toEqual(normalizeRuntimeFields(prepared.fields))
      expect(boundary$.stringTable).toEqual(prepared.stringTable)
      expect(boundary$.sharedValues.length + boundary$.braneValues.length).toBeGreaterThan(0)
      expect(boundary$.sharedBlocks.length + boundary$.braneSharedBlockRefs.length).toBeGreaterThan(0)
    } finally {
      backend.close()
    }
  })

  test("structural add/remove сначала мутируют gravity$, а barrier patch потом пересобирает boundary$", async () => {
    const { fixture, backend } = await materializeFixtureToDb()

    try {
      expect(listRuntimeWimpIds()).toEqual([])
      expect(boundary$.branes).toEqual([])
      expect(gravity$.wimpIdToBraneIndex.size).toBe(0)

      const addRootChanges = await applyStructuralPatchFromDb(backend, { op: "add", path: `/wimp/${fixture.root.id}` })
      expect(addRootChanges).toEqual([])
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(gravity$.structuralDirty).toBe(true)
      expect(boundary$.branes).toEqual([])
      expect(weak$.initialized).toBe(false)

      const addChildChanges = await applyStructuralPatchFromDb(backend, { op: "add", path: `/wimp/${fixture.child.id}` })
      expect(addChildChanges).toEqual([])
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id, fixture.child.id])
      expect(gravity$.structuralDirty).toBe(true)
      expect(boundary$.branes).toEqual([])

      const initialChanges = await applyStructuralPatchFromDb(backend, { op: "test", path: "", value: {} })
      expect(initialChanges).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(gravity$.structuralDirty).toBe(false)
      expect(boundary$.branes).toHaveLength(2)
      expect(gravity$.getBraneIndex(fixture.root.id)).toBe(0)
      expect(gravity$.getBraneIndex(fixture.child.id)).toBe(1)
      expect(gravity$.getWimpId(0)).toBe(fixture.root.id)
      expect(gravity$.getWimpId(1)).toBe(fixture.child.id)
      expect(boundary$.sharedBlocks).toHaveLength(1)
      expect(boundary$.braneSharedBlockRefs).toEqual([0, 0])

      const removeChildChanges = await applyStructuralPatchFromDb(backend, {
        op: "remove",
        path: `/wimp/${fixture.child.id}`,
      })
      expect(removeChildChanges).toEqual([])
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(gravity$.structuralDirty).toBe(true)
      expect(gravity$.getBraneIndex(fixture.child.id)).toBe(1)
      expect(gravity$.getWimpId(1)).toBe(fixture.child.id)
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)

      const removalChanges = await applyStructuralPatchFromDb(backend, { op: "test", path: "", value: null })
      expect(removalChanges).toEqual([])
      expect(gravity$.structuralDirty).toBe(false)
      expect(boundary$.branes).toHaveLength(1)
      expect(gravity$.getBraneIndex(fixture.root.id)).toBe(0)
      expect(gravity$.getBraneIndex(fixture.child.id)).toBeUndefined()
      expect(boundary$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })

  test("uuid остаётся стабильным, а braneIndex может измениться после следующего rebuild", async () => {
    const { backend, wimps } = await materializeIndependentRootsToDb()

    try {
      await applyStructuralPatchFromDb(backend, { op: "add", path: `/wimp/${wimps.beta.id}` })
      await applyStructuralPatchFromDb(backend, { op: "add", path: `/wimp/${wimps.gamma.id}` })
      await applyStructuralPatchFromDb(backend, { op: "test", path: "", value: "" })

      expect(boundary$.branes).toHaveLength(2)
      expect(gravity$.getBraneIndex(wimps.beta.id)).toBe(0)
      expect(gravity$.getBraneIndex(wimps.gamma.id)).toBe(1)

      await applyStructuralPatchFromDb(backend, { op: "remove", path: `/wimp/${wimps.beta.id}` })
      await applyStructuralPatchFromDb(backend, { op: "test", path: "", value: {} })

      expect(boundary$.branes).toHaveLength(1)
      expect(gravity$.getBraneIndex(wimps.gamma.id)).toBe(0)
      expect(gravity$.getWimpId(0)).toBe(wimps.gamma.id)
    } finally {
      backend.close()
    }
  })

  test("barrier patch при structuralDirty = false ничего не пересобирает и не меняет адресацию", async () => {
    const { backend } = await materializeFixtureToDb()

    try {
      await writeRuntimeFromDb(backend)

      const previousBraneIds = [...gravity$.braneIndexToWimpId]
      const previousStates = [...boundary$.states]
      const previousStringTable = [...boundary$.stringTable]

      const changes = await applyStructuralPatchFromDb(backend, { op: "test", path: "", value: null })
      expect(changes).toEqual([])
      expect(gravity$.structuralDirty).toBe(false)
      expect(gravity$.braneIndexToWimpId).toEqual(previousBraneIds)
      expect(boundary$.states).toEqual(previousStates)
      expect(boundary$.stringTable).toEqual(previousStringTable)
      expect(weak$.initialized).toBe(true)
    } finally {
      backend.close()
    }
  })

  test("ordinary runtime update и unlock продолжают работать после gravity/barrier rebuild", async () => {
    const { fixture, backend } = await materializeFixtureToDb()

    try {
      addRuntimeWimp(fixture.root.id)
      addRuntimeWimp(fixture.child.id)

      expect(boundary$.branes).toEqual([])
      await rebuildRuntime(backend)

      const rootBraneIndex = gravity$.getBraneIndex(fixture.root.id)
      const childBraneIndex = gravity$.getBraneIndex(fixture.child.id)
      expect(rootBraneIndex).toBe(0)
      expect(childBraneIndex).toBe(1)

      const changes = await update([[rootBraneIndex!, [[1, "ready"]]]])
      expect(changes).toContainEqual([childBraneIndex!, 1])
      expect(
        changes.every(([braneIndex, nextState]) =>
          (braneIndex === rootBraneIndex || braneIndex === childBraneIndex) && nextState === 1,
        ),
      ).toBe(true)
      expect(boundary$.states[rootBraneIndex!]).toBe(1)
      expect(boundary$.states[childBraneIndex!]).toBe(1)

      const rootReadyStateId = (await backend.readMetaRows(fixture.root.meta!.id))?.states.find(
        (row) => row.ownerMetaId === fixture.root.meta!.id && row.stateName === "ready",
      )?.id
      const childReadyStateId = (await backend.readMetaRows(fixture.child.meta!.id))?.states.find(
        (row) => row.ownerMetaId === fixture.child.meta!.id && row.stateName === "ready",
      )?.id
      expect(rootReadyStateId).toBeDefined()
      expect(childReadyStateId).toBeDefined()
      expect((await backend.readFieldValue(fixture.fields.rootMode!.id))?.value).toBe("ready")
      expect((await backend.readFieldValue(fixture.fields.childMode!.id))?.value).toBe("ready")
      expect((await backend.readWimpRows(fixture.root.id))?.state.metaStateId).toBe(rootReadyStateId)
      expect((await backend.readWimpRows(fixture.child.id))?.state.metaStateId).toBe(childReadyStateId)

      await writeRuntimeFromDb(backend)
      expect(boundary$.states[rootBraneIndex!]).toBe(1)
      expect(boundary$.states[childBraneIndex!]).toBe(1)

      await update([[rootBraneIndex!, [], true]])
      expect(boundary$.branes[rootBraneIndex!]?.lock).toBe(true)

      unlock([rootBraneIndex!])
      expect(boundary$.branes[rootBraneIndex!]?.lock).toBe(false)
    } finally {
      backend.close()
    }
  })

  test("setValues принимает UUID-addressed field updates и резолвит их через strong$", async () => {
    const { fixture, backend } = await materializeFixtureToDb()

    try {
      await writeRuntimeFromDb(backend)

      expect(strong$.runtimeFieldIndexByWimpFieldId.get(fixture.fields.childAlias!.id)).toBeDefined()
      expect(strong$.braneIndexByWimpFieldId.get(fixture.fields.childAlias!.id)).toBeDefined()

      const changes = await setValues({
        [fixture.fields.childAlias!.id]: "Alias via UUID field",
        [fixture.fields.rootMode!.id]: "ready",
      })

      expect(Array.isArray(changes)).toBe(true)
      expect((await backend.readFieldValue(fixture.fields.childAlias!.id))?.value).toBe("Alias via UUID field")
      expect((await backend.readFieldValue(fixture.fields.rootMode!.id))?.value).toBe("ready")
    } finally {
      backend.close()
    }
  })

  test("process-bound state автоматически берет lock, а W-result снимает его и доводит переход до следующего state", async () => {
    const { backend, meta, root } = await materializeProcessFlowFixtureToDb()

    try {
      await writeRuntimeFromDb(backend)

      const braneIndex = gravity$.getBraneIndex(root.id)
      expect(braneIndex).toBe(0)

      const enterProcessChanges = await update([[braneIndex!, [[0, true]]]])
      expect(enterProcessChanges).toContainEqual([braneIndex!, 1])
      expect(boundary$.states[braneIndex!]).toBe(1)
      expect(boundary$.branes[braneIndex!]?.lock).toBe(true)

      const processId = (await backend.readMetaRows(meta.id))?.processes.find(
        (row) => row.ownerMetaId === meta.id && row.processKey === "processing",
      )?.id
      expect(processId).toBeDefined()

      const weakResultChanges = await applyWeakResultPacket({
        channel: "weak-w",
        boson: "w+",
        source: "bulk",
        wimpId: root.id,
        processId: processId!,
        patches: [],
      })

      expect(weakResultChanges).toContainEqual([braneIndex!, 2])
      expect(boundary$.states[braneIndex!]).toBe(2)
      expect(boundary$.branes[braneIndex!]?.lock).toBe(false)
    } finally {
      backend.close()
    }
  })

  test("setValues retrigger-ит текущий process-state даже без смены state", async () => {
    const { backend, meta, root } = await materializeProcessRetriggerFixtureToDb()

    try {
      await writeRuntimeFromDb(backend)

      const braneIndex = gravity$.getBraneIndex(root.id)
      expect(braneIndex).toBe(0)
      expect(boundary$.states[braneIndex!]).toBe(0)
      expect(boundary$.branes[braneIndex!]?.lock).toBe(false)

      const changes = await setValues({
        [root.fields.payload!.id]: "payload via UUID",
      })

      expect(changes).toEqual([])
      expect(boundary$.states[braneIndex!]).toBe(0)
      expect(boundary$.branes[braneIndex!]?.lock).toBe(true)
      expect((await backend.readFieldValue(root.fields.payload!.id))?.value).toBe("payload via UUID")

      const processId = (await backend.readMetaRows(meta.id))?.processes.find(
        (row) => row.ownerMetaId === meta.id && row.processKey === "processing",
      )?.id
      expect(processId).toBeDefined()

      const weakResultChanges = await applyWeakResultPacket({
        channel: "weak-w",
        boson: "w+",
        source: "bulk",
        wimpId: root.id,
        processId: processId!,
        patches: [],
      })

      expect(weakResultChanges).toEqual([])
      expect(boundary$.states[braneIndex!]).toBe(0)
      expect(boundary$.branes[braneIndex!]?.lock).toBe(false)
    } finally {
      backend.close()
    }
  })

  test("W-result retrigger-ит другие process-state браны, затронутые shared/source field", async () => {
    const { backend, rootMeta, root, child } = await materializeCrossBraneProcessRetriggerFixtureToDb()

    try {
      await writeRuntimeFromDb(backend)

      const rootBraneIndex = gravity$.getBraneIndex(root.id)
      const childBraneIndex = gravity$.getBraneIndex(child.id)
      expect(rootBraneIndex).toBe(0)
      expect(childBraneIndex).toBe(1)
      expect(boundary$.states[rootBraneIndex!]).toBe(0)
      expect(boundary$.states[childBraneIndex!]).toBe(0)
      expect(boundary$.branes[rootBraneIndex!]?.lock).toBe(false)
      expect(boundary$.branes[childBraneIndex!]?.lock).toBe(false)

      const rootProcessId = (await backend.readMetaRows(rootMeta.id))?.processes.find(
        (row) => row.ownerMetaId === rootMeta.id && row.processKey === "processing",
      )?.id
      expect(rootProcessId).toBeDefined()

      await update([[rootBraneIndex!, [], true]])
      expect(boundary$.branes[rootBraneIndex!]?.lock).toBe(true)

      const weakResultChanges = await applyWeakResultPacket({
        channel: "weak-w",
        boson: "w+",
        source: "bulk",
        wimpId: root.id,
        processId: rootProcessId!,
        patches: [
          {
            op: "replace",
            path: `/field/${root.fields.payload!.id}`,
            value: "shared payload",
          },
        ],
      })

      expect(weakResultChanges).toEqual([])
      expect(boundary$.branes[rootBraneIndex!]?.lock).toBe(false)
      expect(boundary$.branes[childBraneIndex!]?.lock).toBe(true)
      expect((await backend.readFieldValue(root.fields.payload!.id))?.value).toBe("shared payload")
      expect((await backend.readFieldValue(child.fields.payload!.id))?.value).toBe("shared payload")
    } finally {
      backend.close()
    }
  })
})
