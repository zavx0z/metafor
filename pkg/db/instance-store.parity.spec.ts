import "fake-indexeddb/auto"
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, test } from "bun:test"
import { createSqliteDbInstanceStore } from "./sqlite-instance-store.ts"
import { createIdbDbInstanceStore } from "./idb-instance-store.ts"
import type { DbInstanceStore } from "./instance-store.t.ts"
import type { DbFieldOrbitSnapshot, DbParticleShellSnapshot } from "./instance.t.ts"

const ROOT = "parity/root"

const root: DbParticleShellSnapshot = {
  particleId: "p-root",
  parentParticleId: null,
  kind: "wimp",
  src: ROOT,
  metaSrc: ROOT,
  label: "root",
  depth: 0,
  shellOrder: 0,
  localX: 0,
  localY: 0,
  localZ: 0,
  shellScale: 1,
  shellRadius: 1,
  shellTube: 0.4,
  colorR: 0.1,
  colorG: 0.2,
  colorB: 0.3,
}

const childA: DbParticleShellSnapshot = {
  ...root,
  particleId: "p-a",
  parentParticleId: "p-root",
  label: "a",
  depth: 1,
  shellOrder: 0,
  shellRadius: 0.5,
  shellTube: 0.2,
}

const childB: DbParticleShellSnapshot = {
  ...root,
  particleId: "p-b",
  parentParticleId: "p-root",
  label: "b",
  depth: 1,
  shellOrder: 1,
  shellRadius: 0.5,
  shellTube: 0.2,
}

const grandchild: DbParticleShellSnapshot = {
  ...root,
  particleId: "p-aa",
  parentParticleId: "p-a",
  label: "aa",
  depth: 2,
  shellOrder: 0,
  shellRadius: 0.25,
  shellTube: 0.1,
}

const fieldOnRoot: DbFieldOrbitSnapshot = {
  id: "f-root-0",
  particleId: "p-root",
  fieldKey: "k0",
  fieldLabel: "root field",
  fieldOrder: 0,
  fieldValueKind: "text",
  valueText: "v0",
  localX: 0.1,
  localY: 0,
  localZ: 0,
  sphereRadius: 0.05,
  colorR: 1,
  colorG: 1,
  colorB: 1,
}

const fieldOnA: DbFieldOrbitSnapshot = { ...fieldOnRoot, id: "f-a-0", particleId: "p-a" }
const fieldOnA2: DbFieldOrbitSnapshot = { ...fieldOnRoot, id: "f-a-1", particleId: "p-a", fieldOrder: 1 }

const seedStore = async (store: DbInstanceStore): Promise<void> => {
  await store.clearWorld(ROOT)
  await store.insertParticleShell(ROOT, root)
  await store.insertParticleShell(ROOT, childA)
  await store.insertParticleShell(ROOT, childB)
  await store.insertParticleShell(ROOT, grandchild)
  await store.insertFieldOrbit(ROOT, fieldOnRoot)
  await store.insertFieldOrbit(ROOT, fieldOnA2)
  await store.insertFieldOrbit(ROOT, fieldOnA)
}

const collectStoreSnapshot = async (store: DbInstanceStore) => ({
  all: await store.selectAllParticleShells(ROOT),
  fields: await store.selectAllFieldOrbits(ROOT),
  roots: await store.selectParticleShellsByParent(ROOT, null),
  childrenOfRoot: await store.selectParticleShellsByParent(ROOT, "p-root"),
  childrenOfA: await store.selectParticleShellsByParent(ROOT, "p-a"),
  fieldsOfA: await store.selectFieldOrbitsByParticle(ROOT, "p-a"),
  fieldsOfRoot: await store.selectFieldOrbitsByParticle(ROOT, "p-root"),
})

describe("DbInstanceStore parity (SQLite vs IDB)", () => {
  test("одинаковое состояние после одинаковой последовательности операций", async () => {
    const sqlite = createSqliteDbInstanceStore({ filename: ":memory:" })
    const idb = await createIdbDbInstanceStore({
      databaseName: `parity-${Math.random().toString(36).slice(2)}`,
      factory: new IDBFactory(),
    })

    await seedStore(sqlite)
    await seedStore(idb)

    const left = await collectStoreSnapshot(sqlite)
    const right = await collectStoreSnapshot(idb)

    expect(left.all).toEqual(right.all)
    expect(left.fields).toEqual(right.fields)
    expect(left.roots).toEqual(right.roots)
    expect(left.childrenOfRoot).toEqual(right.childrenOfRoot)
    expect(left.childrenOfA).toEqual(right.childrenOfA)
    expect(left.fieldsOfA).toEqual(right.fieldsOfA)
    expect(left.fieldsOfRoot).toEqual(right.fieldsOfRoot)

    await sqlite.close()
    await idb.close()
  })

  test("clearWorld удаляет всё под rootSrc и не трогает чужой rootSrc", async () => {
    const make = (impl: DbInstanceStore) => async () => {
      await impl.insertParticleShell("alpha", { ...root, particleId: "p-alpha" })
      await impl.insertParticleShell("beta", { ...root, particleId: "p-beta" })
      await impl.clearWorld("alpha")
      const alpha = await impl.selectAllParticleShells("alpha")
      const beta = await impl.selectAllParticleShells("beta")
      return { alpha, beta }
    }

    const sqlite = createSqliteDbInstanceStore({ filename: ":memory:" })
    const idb = await createIdbDbInstanceStore({
      databaseName: `clear-${Math.random().toString(36).slice(2)}`,
      factory: new IDBFactory(),
    })

    const left = await make(sqlite)()
    const right = await make(idb)()

    expect(left).toEqual(right)
    expect(left.alpha).toHaveLength(0)
    expect(left.beta).toHaveLength(1)

    await sqlite.close()
    await idb.close()
  })
})
