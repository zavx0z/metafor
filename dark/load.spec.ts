import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {MetaDSL} from ".."
import {open} from "../store/server.ts"
import {emitMetaPatches} from "./patch/meta.ts"
import {dark$} from "./store.ts"

const minMeta: MetaDSL = {
  name: "min",
  fields: {flag: {type: "boolean"}},
  superposition: {idle: {}},
  mass: {},
  processes: {},
  reactions: {reactions: {}, superposition: {}},
  matter: [],
}

describe("emitMetaPatches", () => {
  let store: Awaited<ReturnType<typeof open>>

  beforeEach(async () => {
    store = await open(":memory:")
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    dark$.metaIndex.clear()
  })

  afterEach(async () => {
    await store.close()
  })

  test("эмитит graviton-патчи и возвращает MetaIndex с uuid полей и состояний", async () => {
    const index = await emitMetaPatches("owner/min", minMeta, store)

    expect(index.src).toBe("owner/min")
    expect(index.fieldUuids.has("flag")).toBe(true)
    expect(index.superpositionUuids.has("idle")).toBe(true)
    expect(index.initialState).toBe(index.superpositionUuids.get("idle") ?? null)

    const projection = (await store.meta.readDarkParticleModel("owner/min"))!
    expect(projection.meta.src).toBe("owner/min")
    expect(projection.meta.fieldSchemas).toEqual(minMeta.fields)
  })

  test("повторная канонизация той же src ведёт к UNIQUE-конфликту — caller должен дедуплицировать", async () => {
    await emitMetaPatches("owner/min", minMeta, store)
    let threw = false
    try {
      await emitMetaPatches("owner/min", minMeta, store)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
