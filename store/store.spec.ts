import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {open} from "./sqlite.ts"
import type {StorePart, StoreParticle} from "./sqlite.ts"
import type {Particle} from "./index.ts"
import {BooleanValue, EnumValue} from "@store/actor"
import type {Store} from "./index.ts"

const SRC = "owner/smoke"

describe("store/sqlite smoke", () => {
  let store: Store
  let sql: SQL
  let filename: string

  beforeEach(async () => {
    mkdirSync(join(import.meta.dir, "tmp"), {recursive: true})
    filename = join(import.meta.dir, "tmp", `store-${crypto.randomUUID()}.sqlite`)
    store = await open(filename)
    sql = new SQL(`sqlite://${filename}`)
  })

  afterEach(async () => {
    await sql.close()
    await store.close()
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
    const subscription = store.subscribe((event) => {
      received.push(...event.data.parts)
    })

    try {
      await store.wimp.create(SRC, {
        name: "smoke",
        mass: {title: "draft"},
        fields: [{key: "flag", type: "boolean", label: "Flag", default: false}],
        superposition: [{name: "idle"}],
      })

      const meta = await store.wimp.get(SRC)
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
        (part) => part.part === "graviton" && part.op === "add" && part.path === "wimp" && part.value === SRC,
      )
      expect(signal).toBeDefined()
    } finally {
      subscription.close()
    }
  })

  test("subscribe поддерживает несколько независимых слушателей", async () => {
    const first: Particle[] = []
    const second: Particle[] = []
    const firstSubscription = store.subscribe((event) => {
      first.push(...event.data.parts)
    })
    const secondSubscription = store.subscribe((event) => {
      second.push(...event.data.parts)
    })

    try {
      await store.wimp.create("owner/multi-a")

      expect(first.some((part) => part.part === "graviton" && part.path === "wimp" && part.value === "owner/multi-a")).toBe(true)
      expect(second.some((part) => part.part === "graviton" && part.path === "wimp" && part.value === "owner/multi-a")).toBe(true)

      const firstLength = first.length
      firstSubscription.close()
      await store.wimp.create("owner/multi-b")

      expect(first).toHaveLength(firstLength)
      expect(second.some((part) => part.part === "graviton" && part.path === "wimp" && part.value === "owner/multi-b")).toBe(true)
    } finally {
      firstSubscription.close()
      secondSubscription.close()
    }
  })

  test("actor parts: graviton+gluon+photon, чтение через ORM", async () => {
    await store.wimp.create(SRC, {
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

    await update(store, "graviton", [{op: "add", path: `/actor/${actorUuid}`, value: {parent: null, wimp: SRC, position: 0}}])
    await update(store, "gluon", [{op: "add", path: `/value/${valueFlag}`, value: {kind: "boolean", boolean: true}}])
    await update(store, "gluon", [{op: "add", path: `/value/${valueStatus}`, value: {kind: "enum", variant: idleVariantUuid}}])
    await update(store, "gluon", [{op: "add", path: `/actor/${actorUuid}/value/${flagUuid}`, value: {value: valueFlag}}])
    await update(store, "gluon", [{op: "add", path: `/actor/${actorUuid}/value/${statusUuid}`, value: {value: valueStatus}}])
    await update(store, "photon", [{op: "add", path: `/actor/${actorUuid}/state`, value: {metaState: idleStateUuid}}])

    const actor = await store.actor.get(actorUuid)
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

    await update(store, "graviton", [{op: "add", path: `/actor/${actor2Uuid}`, value: {parent: null, wimp: SRC, position: 1}}])
    await update(store, "gluon", [{op: "add", path: `/value/${valueFlag2}`, value: {kind: "boolean", boolean: true}}])
    await update(store, "gluon", [{op: "add", path: `/value/${valueStatus2}`, value: {kind: "enum", variant: idleVariantUuid}}])
    await update(store, "gluon", [{op: "add", path: `/actor/${actor2Uuid}/value/${flagUuid}`, value: {value: valueFlag2}}])
    await update(store, "gluon", [{op: "add", path: `/actor/${actor2Uuid}/value/${statusUuid}`, value: {value: valueStatus2}}])
    await update(store, "photon", [{op: "add", path: `/actor/${actor2Uuid}/state`, value: {metaState: idleStateUuid}}])

    // share: actor2.flag → valueFlag (тот же, что у actor1)
    await update(store, "gluon", [{op: "replace", path: `/actor/${actor2Uuid}/value/${flagUuid}`, value: {value: valueFlag}}])
    // удаляем осиротевший valueFlag2
    await update(store, "gluon", [{op: "remove", path: `/value/${valueFlag2}`}])

    const actor2 = (await store.actor.get(actor2Uuid))!
    const link2 = (await actor2.values.get({field: flagUuid}))!
    const sharedValue = await link2.value()
    expect(sharedValue.uuid).toBe(valueFlag)
    const owners = await sharedValue.owners()
    expect(owners.map((o) => o.actor).sort()).toEqual([actorUuid, actor2Uuid].sort())
  })

  test("update() публикует примененные parts после записи", async () => {
    const received: Particle[] = []
    const subscription = store.subscribe((event) => {
      received.push(...event.data.parts)
    })

    await store.wimp.create(SRC)
    const part: StoreParticle = {part: "graviton", op: "add", path: "/actor/actor-published", value: {wimp: SRC, position: 0}}

    try {
      await store.update({parts: [part]})
      await waitFor(() => received.some((item) => item.part === part.part && item.op === part.op && item.path === part.path))

      const row = (
        await sql<Array<{wimp: string}>>`
          SELECT wimp
          FROM actor
          WHERE uuid = ${"actor-published"}
        `
      )[0]
      expect(row?.wimp).toBe(SRC)
    } finally {
      subscription.close()
    }
  })

  test("graviton wimp signal не является store.update write", async () => {
    const part: StoreParticle = {part: "graviton", op: "add", path: "wimp", value: SRC}

    await expect(store.update({parts: [part]})).rejects.toThrow("Particle path must start")
  })

  test("graviton больше не принимает старый /wimp path", async () => {
    const part: StoreParticle = {part: "graviton", op: "add", path: "/wimp/owner~1smoke", value: {name: "smoke"}}

    await expect(store.update({parts: [part]})).rejects.toThrow("Unknown graviton path")
  })

  test("close() идемпотентен — повторный вызов не падает", async () => {
    await store.close()
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

const update = async (
  store: Store,
  part: StorePart,
  parts: Array<Omit<StoreParticle, "part">>,
): Promise<void> => {
  await store.update({parts: parts.map((item) => ({part, ...item}) as StoreParticle)})
}
