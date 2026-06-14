import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {open} from "./sqlite.ts"
import type {BoundaryParticle} from "./sqlite.ts"
import type {Particle} from "./index.ts"
import {BooleanValue, EnumValue} from "@boundary/actor"
import type {Boundary} from "./index.ts"

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

  const fieldUuid = async (key: string): Promise<string> => {
    const row = (
      await sql<Array<{uuid: string}>>`SELECT uuid FROM field WHERE wimp = ${SRC} AND key = ${key} LIMIT 1`
    )[0]
    if (!row) throw new Error(`field ${key} missing`)
    return row.uuid
  }

  const enumVariantUuid = async (field: string, value: string): Promise<string> => {
    const row = (
      await sql<Array<{uuid: string}>>`
        SELECT uuid FROM field_enum_variant WHERE field = ${field} AND item_value = ${value} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`enum variant ${value} missing`)
    return row.uuid
  }

  const stateUuid = async (name: string): Promise<string> => {
    const row = (
      await sql<Array<{uuid: string}>>`SELECT uuid FROM state WHERE wimp = ${SRC} AND name = ${name} LIMIT 1`
    )[0]
    if (!row) throw new Error(`state ${name} missing`)
    return row.uuid
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
    const flagUuid = (await fieldUuid("flag"))
    const statusUuid = (await fieldUuid("status"))
    const idleVariantUuid = (await enumVariantUuid(statusUuid, "idle"))
    const idleStateUuid = (await stateUuid("idle"))

    // actor-1
    const actorUuid = "actor-1"
    const valueFlag = "v-flag"
    const valueStatus = "v-status"

    await boundary.absorb({
      parts: [{
        part: "graviton",
        op: "add",
        path: "actor",
        value: {
          actor: {uuid: actorUuid, parentActor: null, parentTopology: null, wimp: SRC, position: 0},
          values: [
            {actor: actorUuid, field: flagUuid, value: valueFlag},
            {actor: actorUuid, field: statusUuid, value: valueStatus},
          ],
          valueRecords: [
            {uuid: valueFlag, kind: "boolean", boolean: true},
            {uuid: valueStatus, kind: "enum", variant: idleVariantUuid},
          ],
          valueItems: [],
          state: {actor: actorUuid, metaState: idleStateUuid},
        },
      }],
    })

    const actor = await boundary.actor.get(actorUuid)
    if (!actor) throw new Error("actor missing")
    expect(actor.uuid).toBe(actorUuid)
    expect(await actor.wimp()).toBe(SRC)
    expect(await actor.parent()).toBeNull()
    expect(await actor.position()).toBe(0)
    expect((await actor.state())?.metaState).toBe(idleStateUuid)
    expect(await actor.values.count()).toBe(2)

    const flagLink = await actor.values.get({field: flagUuid})
    const flagValue = await flagLink!.value()
    expect(flagValue).toBeInstanceOf(BooleanValue)
    expect(await (flagValue as BooleanValue).boolean()).toBe(true)

    const statusLink = await actor.values.get({field: statusUuid})
    const statusValue = await statusLink!.value()
    expect(statusValue).toBeInstanceOf(EnumValue)
    expect(await (statusValue as EnumValue).variant()).toBe(idleVariantUuid)

    // gluon-replace: переключаем actor_value на shared value (entanglement через shared uuid)
    const actor2Uuid = "actor-2"
    const valueFlag2 = "v-flag-2"
    const valueStatus2 = "v-status-2"

    await boundary.absorb({
      parts: [{
        part: "graviton",
        op: "add",
        path: "actor",
        value: {
          actor: {uuid: actor2Uuid, parentActor: null, parentTopology: null, wimp: SRC, position: 1},
          values: [
            {actor: actor2Uuid, field: flagUuid, value: valueFlag2},
            {actor: actor2Uuid, field: statusUuid, value: valueStatus2},
          ],
          valueRecords: [
            {uuid: valueFlag2, kind: "boolean", boolean: true},
            {uuid: valueStatus2, kind: "enum", variant: idleVariantUuid},
          ],
          valueItems: [],
          state: {actor: actor2Uuid, metaState: idleStateUuid},
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
          actor: {uuid: actor2Uuid, parentActor: null, parentTopology: null, wimp: SRC, position: 1},
          values: [
            {actor: actor2Uuid, field: flagUuid, value: valueFlag},
            {actor: actor2Uuid, field: statusUuid, value: valueStatus2},
          ],
          valueRecords: [
            {uuid: valueFlag, kind: "boolean", boolean: true},
            {uuid: valueStatus2, kind: "enum", variant: idleVariantUuid},
          ],
          valueItems: [],
          state: {actor: actor2Uuid, metaState: idleStateUuid},
        },
      }],
    })

    const actor2 = (await boundary.actor.get(actor2Uuid))!
    const link2 = (await actor2.values.get({field: flagUuid}))!
    const sharedValue = await link2.value()
    expect(sharedValue.uuid).toBe(valueFlag)
    const owners = await sharedValue.owners()
    expect(owners.map((o) => o.actor).sort()).toEqual([actorUuid, actor2Uuid].sort())
  })

  test("absorb() обновляет БД и не выпускает входящие particles в entropy", async () => {
    await boundary.wimp.create(SRC)
    const observed: Particle[] = []
    const outgoing: Particle[] = []
    const observedBinding = boundary.observe((event) => observed.push(...event.data.parts))
    const entropyBinding = boundary.entropy((event) => outgoing.push(...event.data.parts))
    const part: BoundaryParticle = {
      part: "graviton",
      op: "add",
      path: "actor",
      value: {
        actor: {uuid: "actor-published", parentActor: null, parentTopology: null, wimp: SRC, position: 0},
        values: [],
        valueRecords: [],
        valueItems: [],
        state: {actor: "actor-published", metaState: null},
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
          WHERE uuid = ${"actor-published"}
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
