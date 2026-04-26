import "fake-indexeddb/auto"
import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import type { MetaDSL } from "../index.ts"
import type { DbParticleShellRow } from "store/db"
import { open as openBrowserStore } from "./browser.ts"
import { open as openServerStore } from "./server.ts"

const particle: DbParticleShellRow = {
  particleId: "particle:root",
  parentParticleId: null,
  kind: "wimp",
  src: "test/meta",
  metaSrc: "test/meta",
  label: "Test",
  depth: 0,
  shellOrder: 0,
  localX: 0,
  localY: 0,
  localZ: 0,
  shellScale: 1,
  shellRadius: 1,
  shellTube: 0.1,
  colorR: 1,
  colorG: 1,
  colorB: 1,
}

const meta: MetaDSL = {
  name: "test",
  fields: {
    title: {
      type: "string",
      label: "Title",
    },
  },
  superposition: {
    idle: {},
  },
  matter: [],
}

describe("store entrypoints", () => {
  test("server store initializes sqlite-backed meta actor view ORM", async () => {
    const store = openServerStore()
    try {
      store.meta.create("test/meta", meta)
      expect(store.meta.model("test/meta").meta.fieldSchemas).toEqual(meta.fields)

      await store.actor.insertParticle("test/meta", particle)
      expect(await store.actor.world("test/meta")).toEqual({
        rootSrc: "test/meta",
        particles: [particle],
        fields: [],
      })

      expect(await store.view.wimpIds()).toEqual([])
    } finally {
      await store.close()
    }
  })

  test("browser store initializes idb-backed meta actor view ORM", async () => {
    const store = await openBrowserStore({
      databaseName: "metafor-store-spec",
      indexedDb: new IDBFactory(),
    })
    try {
      await store.actor.insertParticle("test/meta", particle)
      expect(await store.actor.particles("test/meta")).toEqual([particle])
      expect(await store.meta.get("missing")).toBeNull()
      expect(await store.view.wimpIds()).toEqual([])
    } finally {
      await store.close()
    }
  })
})
