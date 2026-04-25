import { describe, expect, test } from "bun:test"
import {
  clearDbWorld,
  insertDbFieldOrbit,
  insertDbParticleShell,
  openDbInstanceSqlite,
  selectAllFieldOrbits,
  selectAllParticleShells,
  selectFieldOrbitsByParticle,
  selectParticleShellsByParent,
} from "./instance.ts"
import type { DbFieldOrbitRow, DbParticleShellRow } from "./instance.t.ts"

describe("pkg/db instance sqlite", () => {
  test("incremental write через insertDbParticleShell + insertDbFieldOrbit пишет nested rows без JSON payload", () => {
    const db = openDbInstanceSqlite()
    const rootSrc = "stream/root"

    const root: DbParticleShellRow = {
      particleId: "p-root",
      parentParticleId: null,
      kind: "wimp",
      src: rootSrc,
      metaSrc: rootSrc,
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
    const child: DbParticleShellRow = {
      ...root,
      particleId: "p-child",
      parentParticleId: "p-root",
      label: "child",
      depth: 1,
      shellOrder: 0,
      shellRadius: 0.5,
      shellTube: 0.2,
    }
    const field: DbFieldOrbitRow = {
      id: "f-1",
      particleId: "p-root",
      fieldKey: "k",
      fieldLabel: "label",
      fieldOrder: 0,
      fieldValueKind: "text",
      valueText: "v",
      localX: 0.1,
      localY: 0,
      localZ: 0,
      sphereRadius: 0.05,
      colorR: 1,
      colorG: 1,
      colorB: 1,
    }

    const tx = db.transaction(() => {
      insertDbParticleShell(db, rootSrc, root)
      insertDbParticleShell(db, rootSrc, child)
      insertDbFieldOrbit(db, rootSrc, field)
    })
    tx()

    expect(selectAllParticleShells(db, rootSrc)).toEqual([root, child])
    expect(selectAllFieldOrbits(db, rootSrc)).toEqual([field])
  })

  test("subtree reads: selectParticleShellsByParent и selectFieldOrbitsByParticle возвращают узкие срезы", () => {
    const db = openDbInstanceSqlite()
    const rootSrc = "subtree/root"

    const root: DbParticleShellRow = {
      particleId: "p-root",
      parentParticleId: null,
      kind: "wimp",
      src: rootSrc,
      metaSrc: rootSrc,
      label: "root",
      depth: 0,
      shellOrder: 0,
      localX: 0, localY: 0, localZ: 0,
      shellScale: 1, shellRadius: 1, shellTube: 0.4,
      colorR: 0, colorG: 0, colorB: 0,
    }
    const childA: DbParticleShellRow = { ...root, particleId: "p-a", parentParticleId: "p-root", label: "a", depth: 1, shellRadius: 0.5, shellTube: 0.2 }
    const childB: DbParticleShellRow = { ...root, particleId: "p-b", parentParticleId: "p-root", label: "b", depth: 1, shellOrder: 1, shellRadius: 0.5, shellTube: 0.2 }
    const fieldOnA: DbFieldOrbitRow = {
      id: "f-on-a", particleId: "p-a", fieldKey: "k", fieldLabel: "k", fieldOrder: 0,
      fieldValueKind: "number", valueText: "1",
      localX: 0, localY: 0, localZ: 0, sphereRadius: 0.05,
      colorR: 0, colorG: 0, colorB: 0,
    }
    const fieldOnB: DbFieldOrbitRow = { ...fieldOnA, id: "f-on-b", particleId: "p-b" }

    const tx = db.transaction(() => {
      insertDbParticleShell(db, rootSrc, root)
      insertDbParticleShell(db, rootSrc, childA)
      insertDbParticleShell(db, rootSrc, childB)
      insertDbFieldOrbit(db, rootSrc, fieldOnA)
      insertDbFieldOrbit(db, rootSrc, fieldOnB)
    })
    tx()

    expect(selectParticleShellsByParent(db, rootSrc, null)).toEqual([root])
    expect(selectParticleShellsByParent(db, rootSrc, "p-root")).toEqual([childA, childB])
    expect(selectParticleShellsByParent(db, rootSrc, "p-a")).toEqual([])
    expect(selectFieldOrbitsByParticle(db, rootSrc, "p-a")).toEqual([fieldOnA])
    expect(selectFieldOrbitsByParticle(db, rootSrc, "p-b")).toEqual([fieldOnB])
  })

  test("clearDbWorld удаляет всё под rootSrc и не трогает чужой rootSrc", () => {
    const db = openDbInstanceSqlite()

    const make = (rootSrc: string): DbParticleShellRow => ({
      particleId: `p-${rootSrc}`,
      parentParticleId: null,
      kind: "wimp",
      src: rootSrc, metaSrc: rootSrc, label: rootSrc,
      depth: 0, shellOrder: 0,
      localX: 0, localY: 0, localZ: 0,
      shellScale: 1, shellRadius: 1, shellTube: 0.4,
      colorR: 0, colorG: 0, colorB: 0,
    })

    insertDbParticleShell(db, "alpha", make("alpha"))
    insertDbParticleShell(db, "beta", make("beta"))

    clearDbWorld(db, "alpha")

    expect(selectAllParticleShells(db, "alpha")).toHaveLength(0)
    expect(selectAllParticleShells(db, "beta")).toHaveLength(1)
  })
})
