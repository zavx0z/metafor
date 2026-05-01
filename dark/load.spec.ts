import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {MetaDSL} from ".."
import {open} from "../store/server.ts"
import {projectTemplateMatterRelations} from "./matter.ts"

const minMeta: MetaDSL = {
  name: "min",
  fields: {flag: {type: "boolean"}},
  superposition: {idle: {}},
  mass: {},
  processes: {},
  reactions: {reactions: {}, superposition: {}},
  matter: [],
}

describe("store.meta.create", () => {
  let store: Awaited<ReturnType<typeof open>>

  beforeEach(async () => {
    store = await open(":memory:")
  })

  afterEach(async () => {
    await store.close()
  })

  test("создаёт декларацию и Meta.identifiers() возвращает uuid полей и состояний", async () => {
    const meta = await store.meta.create("owner/min", minMeta, projectTemplateMatterRelations(minMeta))
    const ids = await meta.identifiers()

    expect(ids.src).toBe("owner/min")
    expect(ids.fieldUuids.has("flag")).toBe(true)
    expect(ids.superpositionUuids.has("idle")).toBe(true)
    expect(ids.initialState).toBe(ids.superpositionUuids.get("idle") ?? null)

    const projection = (await store.meta.readDarkParticleModel("owner/min"))!
    expect(projection.meta.src).toBe("owner/min")
    expect(projection.meta.fieldSchemas).toEqual(minMeta.fields)
  })

  test("повторная канонизация той же src идемпотентна — DELETE+INSERT", async () => {
    const first = await store.meta.create("owner/min", minMeta, projectTemplateMatterRelations(minMeta))
    const firstIds = await first.identifiers()

    const second = await store.meta.create("owner/min", minMeta, projectTemplateMatterRelations(minMeta))
    const secondIds = await second.identifiers()

    // UUID'ы регенерируются (не deterministic), но структура целая
    expect(secondIds.fieldUuids.has("flag")).toBe(true)
    expect(secondIds.fieldUuids.get("flag")).not.toBe(firstIds.fieldUuids.get("flag"))
  })
})
