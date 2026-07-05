import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {open} from "./sqlite.ts"
import type {BoundaryParticle} from "./sqlite.ts"
import type {Particle} from "./index.ts"
import {BooleanValue, EnumValue} from "@boundary/actor"
import type {Boundary} from "./index.ts"
import {STATE_NONE, STATE_UNDEFINED} from "../matrix/state.ts"

const SRC = "owner/smoke"

const wimpPartSrc = (part: Particle): unknown => {
  if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return part.value
  return (part.value as {wimp?: {src?: unknown}}).wimp?.src
}

describe("boundary/sqlite smoke", () => {
  let boundary: Boundary
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

  const enumVariantId = async (field: number, value: string): Promise<number> => {
    const row = (
      await sql<Array<{id: number}>>`
        SELECT id FROM field_enum_variant WHERE field = ${field} AND item_value = ${value} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`enum variant ${value} missing`)
    return row.id
  }

  const stateId = async (name: string): Promise<number> => {
    const row = (
      await sql<Array<{id: number}>>`SELECT id FROM state WHERE wimp = ${SRC} AND name = ${name} LIMIT 1`
    )[0]
    if (!row) throw new Error(`state ${name} missing`)
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

  test("wimp.create пишет декларацию и отправляет graviton-сигнал source", async () => {
    const received: Particle[] = []
    const subscription = boundary.observe((event) => {
      received.push(...event.data.parts)
    })

    try {
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

      const signal = received.find(
        (part) => part.part === "graviton" && part.op === "add" && part.path === "wimp" && wimpPartSrc(part) === SRC,
      )
      expect(signal).toBeDefined()
    } finally {
      subscription.close()
    }
  })

  test("observe поддерживает несколько независимых слушателей", async () => {
    const first: Particle[] = []
    const second: Particle[] = []
    const firstSubscription = boundary.observe((event) => {
      first.push(...event.data.parts)
    })
    const secondSubscription = boundary.observe((event) => {
      second.push(...event.data.parts)
    })

    try {
      await boundary.wimp.create("owner/multi-a")

      expect(first.some((part) => part.part === "graviton" && part.path === "wimp" && wimpPartSrc(part) === "owner/multi-a")).toBe(true)
      expect(second.some((part) => part.part === "graviton" && part.path === "wimp" && wimpPartSrc(part) === "owner/multi-a")).toBe(true)

      const firstLength = first.length
      firstSubscription.close()
      await boundary.wimp.create("owner/multi-b")

      expect(first).toHaveLength(firstLength)
      expect(second.some((part) => part.part === "graviton" && part.path === "wimp" && wimpPartSrc(part) === "owner/multi-b")).toBe(true)
    } finally {
      firstSubscription.close()
      secondSubscription.close()
    }
  })

  test("actor snapshot: graviton/actor с полным value читается через ORM", async () => {
    await boundary.wimp.create(SRC, {
      name: "smoke",
      fields: [
        {key: "flag", type: "boolean"},
        {key: "status", type: "enum", values: ["idle"]},
      ],
      superposition: [{name: "idle"}],
    })
    const flagId = (await fieldId("flag"))
    const statusId = (await fieldId("status"))
    const idleVariantId = (await enumVariantId(statusId, "idle"))
    const idleStateId = (await stateId("idle"))

    // actor-1
    const actorId = 1
    const valueFlag = 101
    const valueStatus = 102

    await boundary.absorb({
      parts: [{
        part: "graviton",
        op: "add",
        path: "actor",
        value: {
          actor: {id: actorId, parentActor: null, parentTopology: null, wimp: SRC, position: 0},
          values: [
            {actor: actorId, field: flagId, value: valueFlag},
            {actor: actorId, field: statusId, value: valueStatus},
          ],
          valueRecords: [
            {id: valueFlag, kind: "boolean", boolean: true},
            {id: valueStatus, kind: "enum", variant: idleVariantId},
          ],
          valueItems: [],
          state: {actor: actorId, metaState: idleStateId},
        },
      }],
    })

    const actor = await boundary.actor.get(actorId)
    if (!actor) throw new Error("actor missing")
    expect(actor.id).toBe(actorId)
    expect(await actor.wimp()).toBe(SRC)
    expect(await actor.parent()).toBeNull()
    expect(await actor.position()).toBe(0)
    expect((await actor.state())?.metaState).toBe(idleStateId)
    expect(await actor.values.count()).toBe(2)

    const flagLink = await actor.values.get({field: flagId})
    const flagValue = await flagLink!.value()
    expect(flagValue).toBeInstanceOf(BooleanValue)
    expect(await (flagValue as BooleanValue).boolean()).toBe(true)

    const statusLink = await actor.values.get({field: statusId})
    const statusValue = await statusLink!.value()
    expect(statusValue).toBeInstanceOf(EnumValue)
    expect(await (statusValue as EnumValue).variant()).toBe(idleVariantId)

    // gluon-replace: переключаем actor_value на shared value (entanglement через shared id)
    const actor2Id = 2
    const valueFlag2 = 201
    const valueStatus2 = 202

    await boundary.absorb({
      parts: [{
        part: "graviton",
        op: "add",
        path: "actor",
        value: {
          actor: {id: actor2Id, parentActor: null, parentTopology: null, wimp: SRC, position: 1},
          values: [
            {actor: actor2Id, field: flagId, value: valueFlag2},
            {actor: actor2Id, field: statusId, value: valueStatus2},
          ],
          valueRecords: [
            {id: valueFlag2, kind: "boolean", boolean: true},
            {id: valueStatus2, kind: "enum", variant: idleVariantId},
          ],
          valueItems: [],
          state: {actor: actor2Id, metaState: idleStateId},
        },
      }],
    })

    // share: actor2.flag → valueFlag (тот же, что у actor1)
    await boundary.absorb({
      parts: [{
        part: "graviton",
        op: "replace",
        path: "actor",
        value: {
          actor: {id: actor2Id, parentActor: null, parentTopology: null, wimp: SRC, position: 1},
          values: [
            {actor: actor2Id, field: flagId, value: valueFlag},
            {actor: actor2Id, field: statusId, value: valueStatus2},
          ],
          valueRecords: [
            {id: valueFlag, kind: "boolean", boolean: true},
            {id: valueStatus2, kind: "enum", variant: idleVariantId},
          ],
          valueItems: [],
          state: {actor: actor2Id, metaState: idleStateId},
        },
      }],
    })

    const actor2 = (await boundary.actor.get(actor2Id))!
    const link2 = (await actor2.values.get({field: flagId}))!
    const sharedValue = await link2.value()
    expect(sharedValue.id).toBe(valueFlag)
    const owners = await sharedValue.owners()
    expect(owners.map((o) => o.actor).sort()).toEqual([actorId, actor2Id].sort())
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
    expect(runtime.data.branes[withoutStatesIndex]?.state).toBe(STATE_NONE)
    expect(runtime.data.branes[withoutStatesIndex]?.collapses).toEqual([])
    expect(runtime.data.stateNames[withoutStatesIndex]).toEqual([])
    expect(runtime.weak.stateMetaStateIdsByBraneIndex[withoutStatesIndex]).toEqual([])
  })

  test("matrixRuntime включает action process descriptors", async () => {
    const src = "owner/process-runtime"
    await boundary.wimp.create(src, {
      fields: [{key: "command", type: "string"}],
      superposition: [{name: "ready"}],
      processes: [{
        key: "ready",
        declaration: {
          type: "action",
          env: ["server"],
          action: {
            src: "./actions/run",
            importSpecifier: "run",
            wrapperSrc: "async ({ value }) => value.command",
            read: ["command"],
          },
        },
      }],
    })
    const commandId = await fieldId("command", src)

    const runtime = await boundary.matrixRuntime()
    const descriptor = runtime.processes.actionDescriptorsByProcessId.find(([, item]) =>
      item.wimp === src && item.key === "ready"
    )?.[1]

    expect(descriptor).toEqual({
      type: "action",
      wimp: src,
      key: "ready",
      env: ["server"],
      action: {
        src: "./actions/run",
        importSpecifier: "run",
        wrapperSrc: "async ({ value }) => value.command",
        readFields: [[commandId, "command"]],
      },
    })
  })

  test("absorb() обновляет БД и не выпускает входящие particles в entropy", async () => {
    await boundary.wimp.create(SRC)
    const observed: Particle[] = []
    const outgoing: Particle[] = []
    const observedBinding = boundary.observe((event) => observed.push(...event.data.parts))
    const entropyBinding = boundary.entropy((event) => outgoing.push(...event.data.parts))
    const actorId = 1
    const part: BoundaryParticle = {
      part: "graviton",
      op: "add",
      path: "actor",
      value: {
        actor: {id: actorId, parentActor: null, parentTopology: null, wimp: SRC, position: 0},
        values: [],
        valueRecords: [],
        valueItems: [],
        state: {actor: actorId, metaState: null},
      },
    }

    try {
      await boundary.absorb({parts: [part]})
      await waitFor(() => observed.some((item) => item.part === part.part && item.op === part.op && item.path === part.path))
      expect(outgoing).toEqual([])

      const row = (
        await sql<Array<{wimp: string}>>`
          SELECT wimp
          FROM actor
          WHERE id = ${actorId}
        `
      )[0]
      expect(row?.wimp).toBe(SRC)
    } finally {
      observedBinding.close()
      entropyBinding.close()
    }
  })

  test("absorb() принимает wimp-сигнал без записи meta", async () => {
    const part: BoundaryParticle = {part: "graviton", op: "add", path: "wimp", value: SRC}
    const observed: Particle[] = []
    const binding = boundary.observe((event) => observed.push(...event.data.parts))

    try {
      await boundary.absorb({parts: [part]})
      expect(await boundary.wimp.exists(SRC)).toBe(false)
      expect(observed).toEqual([part])
    } finally {
      binding.close()
    }
  })

  test("close() идемпотентен — повторный вызов не падает", async () => {
    await boundary.close()
    expect(true).toBe(true)
  })
})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected force part")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
