import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { materializeFields, Meta, Wimp } from "@dark/strong"
import { openDbMaterializationWriter, openDbSqliteBackend } from "../../pkg/db/index.ts"
import { HubFixture } from "fixture"
import { matter } from "../../dark/index.ts"
import { createDbFixture } from "fixture/db.fixture.ts"
import { dark$ } from "../../dark/store.ts"
import {
  addRuntimeWimp,
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
      const sharedData = backend.readData()
      const prepared = prepareRuntimeFromDb(backend)

      expect(sharedData.metas.some((meta) => meta.id === "zavx0z/git")).toBe(true)
      expect(sharedData.wimps.length).toBeGreaterThan(0)
      expect(sharedData.fieldValues.length).toBe(sharedData.wimpFields.length)
      expect(prepared.branes).toHaveLength(sharedData.wimps.length)
      expect(prepared.fields.length).toBeGreaterThan(0)
      expect(prepared.states).toHaveLength(sharedData.wimps.length)
      expect(prepared.stringTable.length).toBeGreaterThan(0)
    } finally {
      backend.close()
    }
  })

  test("проходит путь AST -> db backend -> unified boundary runtime API -> weak", async () => {
    const backend = await materializeGithubWorldToDb()

    try {
      const sharedData = backend.readData()
      const prepared = prepareRuntimeFromDb(backend)

      const changes = await writeRuntimeFromDb(backend)
      expect(changes).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(gravity$.structuralDirty).toBe(false)
      expect(boundary$.branes).toHaveLength(sharedData.wimps.length)
      expect(gravity$.braneIndexToWimpId).toHaveLength(sharedData.wimps.length)
      expect(boundary$.states).toHaveLength(sharedData.wimps.length)
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

      const persisted = backend.readData()
      const rootReadyStateId = persisted.metaStates.find(
        (row) => row.ownerMetaId === fixture.root.meta!.id && row.stateName === "ready",
      )?.id
      const childReadyStateId = persisted.metaStates.find(
        (row) => row.ownerMetaId === fixture.child.meta!.id && row.stateName === "ready",
      )?.id
      expect(rootReadyStateId).toBeDefined()
      expect(childReadyStateId).toBeDefined()
      expect(persisted.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.rootMode!.id)?.value).toBe("ready")
      expect(persisted.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childMode!.id)?.value).toBe("ready")
      expect(persisted.wimpStates.find((row) => row.ownerWimpId === fixture.root.id)?.metaStateId).toBe(rootReadyStateId)
      expect(persisted.wimpStates.find((row) => row.ownerWimpId === fixture.child.id)?.metaStateId).toBe(childReadyStateId)

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
      expect(backend.readData().fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value).toBe(
        "Alias via UUID field",
      )
      expect(backend.readData().fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.rootMode!.id)?.value).toBe("ready")
    } finally {
      backend.close()
    }
  })
})
