import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {open, type BoundaryDatabase} from "./sqlite.ts"
import {STATE_NONE, STATE_UNDEFINED} from "@metafor/types/matrix/runtime"

const SRC = "owner/smoke"

describe("boundary/sqlite smoke", () => {
  let boundary: BoundaryDatabase
  let sql: SQL
  let filename: string

  beforeEach(async () => {
    mkdirSync(join(import.meta.dir, "tmp"), {recursive: true})
    filename = join(import.meta.dir, "tmp", `boundary-${crypto.randomUUID()}.sqlite`)
    boundary = await open(filename)
    sql = new SQL(`sqlite://${filename}`)
  })

  afterEach(async () => {
    await sql.close()
    await boundary.close()
    rmSync(filename, {force: true})
    rmSync(`${filename}-shm`, {force: true})
    rmSync(`${filename}-wal`, {force: true})
  })

  const fieldId = async (key: string, src = SRC): Promise<number> => {
    const row = (
      await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${src} AND key = ${key} LIMIT 1`
    )[0]
    if (!row) throw new Error(`field ${key} missing`)
    return row.id
  }

  test("open() поднимает обе схемы — meta и actor — на одной БД", async () => {
    const tables = (
      await sql<Array<{ name: string }>>`
        SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
      `
    ).map((r) => r.name)

    expect(tables).toContain("wimp")
    expect(tables).toContain("field")
    expect(tables).toContain("state")
    expect(tables).toContain("actor")
    expect(tables).toContain("actor_value")
    expect(tables).toContain("actor_state")
    expect(tables).toContain("value")
    expect(tables).toContain("value_enum")
    expect(tables).toContain("value_list_item")
  })

  test("wimp.create writes the declaration without a second transport surface", async () => {
    await boundary.wimp.create(SRC, {
      name: "smoke",
      mass: {title: "draft"},
      fields: [{key: "flag", type: "boolean", label: "Flag", default: false}],
      superposition: [{name: "idle"}],
    })

    const meta = await boundary.wimp.get(SRC)
    if (!meta) throw new Error("meta missing")
    expect(await meta.name.get()).toBe("smoke")
    expect(await meta.mass.exists()).toBe(true)
    expect(await meta.fields.count()).toBe(1)
    expect(await meta.states.count()).toBe(1)

    const flag = await meta.fields.get({key: "flag"})
    if (!flag) throw new Error("flag field missing")
    if (flag.type !== "boolean") throw new Error("expected boolean field")
    expect(await flag.default()).toBe(false)
    expect(await flag.label()).toBe("Flag")
  })

  test("matrixRuntime различает runtime undefined и отсутствие state graph", async () => {
    const withStates = "owner/with-states"
    const withoutStates = "owner/no-states"

    await boundary.wimp.create(withStates, {
      fields: [{key: "level", type: "number"}],
      superposition: [{name: "idle"}, {name: "ready"}],
    })
    await boundary.wimp.create(withoutStates, {
      fields: [{key: "level", type: "number"}],
    })
    const levelWithStates = await fieldId("level", withStates)
    const levelWithoutStates = await fieldId("level", withoutStates)

    await boundary.actor.create({
      actor: {id: 11, parentActor: null, parentTopology: null, wimp: withStates},
      values: [{actor: 11, field: levelWithStates, value: 111}],
      valueRecords: [{id: 111, kind: "number", number: 7}],
      valueItems: [],
      state: {actor: 11, metaState: null},
    })
    await boundary.actor.create({
      actor: {id: 12, parentActor: null, parentTopology: null, wimp: withoutStates},
      values: [{actor: 12, field: levelWithoutStates, value: 112}],
      valueRecords: [{id: 112, kind: "number", number: 9}],
      valueItems: [],
      state: {actor: 12, metaState: null},
    })

    const runtime = await boundary.matrixRuntime()
    const withStatesIndex = runtime.runtime.braneIndexByActorId.find(([actorId]) => actorId === 11)?.[1]
    const withoutStatesIndex = runtime.runtime.braneIndexByActorId.find(([actorId]) => actorId === 12)?.[1]
    if (withStatesIndex === undefined || withoutStatesIndex === undefined) {
      throw new Error("test actors were not materialized into matrix runtime")
    }

    expect(runtime.data.branes[withStatesIndex]?.state).toBe(STATE_UNDEFINED)
    expect(runtime.data.stateNames[withStatesIndex]).toEqual(["idle", "ready"])
    expect(runtime.weak.stateMetaStateIdsByBraneIndex[withStatesIndex]).toHaveLength(2)
    expect(runtime.weak.stateHasProcessByBraneIndex[withStatesIndex]).toEqual([false, false])
    expect(runtime.data.branes[withoutStatesIndex]?.state).toBe(STATE_NONE)
    expect(runtime.data.branes[withoutStatesIndex]?.collapses).toEqual([])
    expect(runtime.data.stateNames[withoutStatesIndex]).toEqual([])
    expect(runtime.weak.stateMetaStateIdsByBraneIndex[withoutStatesIndex]).toEqual([])
    expect(runtime.weak.stateHasProcessByBraneIndex[withoutStatesIndex]).toEqual([])
    expect(["state", "ProcessIds", "ByBraneIndex"].join("") in runtime.weak).toBe(false)
  })

  test("energyRuntime отдаёт actor/wimp mapping и process descriptors вне Matrix snapshot", async () => {
    const src = "owner/energy-runtime"

    await boundary.wimp.create(src, {
      fields: [
        {key: "command", type: "string"},
        {key: "result", type: "string"},
        {key: "errorText", type: "string"},
      ],
      superposition: [{name: "ready"}],
      processes: [{
        key: "ready",
        declaration: {
          type: "action",
          env: ["server"],
          action: {
            src: "./actions/run.ts",
            importSpecifier: "run",
            wrapperSrc: "async (params) => params.value",
            read: ["command"],
          },
          success: {
            src: "({ update, data }) => update({ result: data.result })",
            read: ["result"],
            write: ["result"],
          },
          error: {
            src: "({ update, error }) => update({ errorText: error.message })",
            read: ["errorText"],
            write: ["errorText"],
          },
        },
      }],
    })
    const commandId = await fieldId("command", src)
    const resultId = await fieldId("result", src)
    const errorTextId = await fieldId("errorText", src)
    const readyStateId = (
      await sql<Array<{id: number}>>`SELECT id FROM state WHERE wimp = ${src} AND name = ${"ready"} LIMIT 1`
    )[0]?.id
    if (readyStateId === undefined) throw new Error("ready state missing")

    await boundary.actor.create({
      actor: {id: 21, parentActor: null, parentTopology: null, wimp: src},
      values: [{actor: 21, field: commandId, value: 211}],
      valueRecords: [{id: 211, kind: "string", text: "echo"}],
      valueItems: [],
      state: {actor: 21, metaState: readyStateId},
    })

    const catalog = await boundary.energyRuntime()
    const process = catalog.processes.find((item) => item.wimp === src && item.state === "ready")

    expect(catalog.version).toBe(1)
    expect(catalog.actors).toContainEqual([21, src])
    expect(process).toEqual({
      wimp: src,
      state: "ready",
      descriptor: {
        type: "action",
        key: "ready",
        env: ["server"],
        action: {
          src: "./actions/run.ts",
          importSpecifier: "run",
          wrapperSrc: "async (params) => params.value",
          readFields: [[commandId, "command"]],
        },
        success: {
          src: "({ update, data }) => update({ result: data.result })",
          readFields: [[resultId, "result"]],
          writeFields: [[resultId, "result"]],
        },
        error: {
          src: "({ update, error }) => update({ errorText: error.message })",
          readFields: [[errorTextId, "errorText"]],
          writeFields: [[errorTextId, "errorText"]],
        },
      },
    })

    const matrixRuntime = await boundary.matrixRuntime()
    const braneIndex = matrixRuntime.runtime.braneIndexByActorId.find(([actorId]) => actorId === 21)?.[1]
    if (braneIndex === undefined) throw new Error("test actor was not materialized into matrix runtime")

    expect(matrixRuntime.weak.stateHasProcessByBraneIndex[braneIndex]).toEqual([true])
    expect(["state", "ProcessIds", "ByBraneIndex"].join("") in matrixRuntime.weak).toBe(false)
    expect("processes" in matrixRuntime).toBe(false)
  })

  test("close() идемпотентен — повторный вызов не падает", async () => {
    await boundary.close()
    expect(true).toBe(true)
  })
})
