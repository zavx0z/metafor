import "fake-indexeddb/auto"
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, test } from "bun:test"
import type { DbSyncMessage } from "@shared/protocol"
import { createSqliteDbActorStore } from "./sqlite/store.ts"
import { createIdbDbActorStore } from "./idb/store.ts"
import {
  applyDbSyncMessage,
  createMirroredActorStore,
  type DbSyncPublisher,
} from "./mirror.ts"
import type { DbParticleShellRow } from "./types.t.ts"

const ROOT = "mirror/root"
const root: DbParticleShellRow = {
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
  colorR: 0,
  colorG: 0,
  colorB: 0,
}
const child: DbParticleShellRow = {
  ...root,
  particleId: "p-a",
  parentParticleId: "p-root",
  label: "a",
  depth: 1,
}

describe("createMirroredActorStore + applyDbSyncMessage", () => {
  test("каждое write-вызов публикует sync-event, apply на second store воспроизводит state", async () => {
    const events: DbSyncMessage[] = []
    const publisher: DbSyncPublisher = { postMessage: (msg) => events.push(msg) }

    const primary = createSqliteDbActorStore({ filename: ":memory:" })
    const mirrored = createMirroredActorStore(primary, publisher, "dark")

    await mirrored.clearWorld(ROOT)
    await mirrored.insertParticleShell(ROOT, root)
    await mirrored.insertParticleShell(ROOT, child)

    expect(events.map((e) => e.op.kind)).toEqual([
      "clear-world",
      "insert-particle",
      "insert-particle",
    ])
    expect(events.every((e) => e.source === "dark")).toBe(true)
    expect(events.every((e) => e.rootSrc === ROOT)).toBe(true)

    const replica = await createIdbDbActorStore({
      databaseName: `mirror-${Math.random().toString(36).slice(2)}`,
      factory: new IDBFactory(),
    })
    for (const event of events) {
      await applyDbSyncMessage(replica, event)
    }

    expect(await replica.selectAllParticleShells(ROOT)).toEqual([root, child])

    await primary.close()
    await replica.close()
  })

  test("read-методы делегируются без публикации событий", async () => {
    const events: DbSyncMessage[] = []
    const publisher: DbSyncPublisher = { postMessage: (msg) => events.push(msg) }

    const primary = createSqliteDbActorStore({ filename: ":memory:" })
    const mirrored = createMirroredActorStore(primary, publisher, "dark")

    await mirrored.insertParticleShell(ROOT, root)
    events.length = 0

    expect(await mirrored.selectAllParticleShells(ROOT)).toEqual([root])
    expect(await mirrored.selectParticleShellsByParent(ROOT, null)).toEqual([root])
    expect(events).toHaveLength(0)

    await primary.close()
  })
})
