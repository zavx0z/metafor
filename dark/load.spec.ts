import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {MetaDSL} from ".."
import {open} from "../store/server.ts"
import {emitMetaPatches} from "./patch/meta.ts"

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
  })

  afterEach(async () => {
    await store.close()
  })

  test("эмитит graviton-патчи и возвращает MetaIdentifiers с uuid полей и состояний", async () => {
    const ids = await emitMetaPatches("owner/min", minMeta, store)

    expect(ids.src).toBe("owner/min")
    expect(ids.fieldUuids.has("flag")).toBe(true)
    expect(ids.superpositionUuids.has("idle")).toBe(true)
    expect(ids.initialState).toBe(ids.superpositionUuids.get("idle") ?? null)

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

  test("Meta.identifiers() читает те же uuid после emit", async () => {
    const emitted = await emitMetaPatches("owner/min", minMeta, store)
    const meta = await store.meta.get("owner/min")
    if (!meta) throw new Error("meta missing after emit")

    const reread = await meta.identifiers()
    expect(reread.fieldUuids.get("flag")).toBe(emitted.fieldUuids.get("flag"))
    expect(reread.superpositionUuids.get("idle")).toBe(emitted.superpositionUuids.get("idle"))
    expect(reread.initialState).toBe(emitted.initialState)
  })
})
