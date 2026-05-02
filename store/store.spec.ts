import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {open} from "./server.ts"
import {BooleanValue, EnumValue} from "@store/actor"
import type {Store} from "./index.ts"

const SRC = "owner/smoke"

describe("store/server smoke", () => {
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

  test("open() поднимает обе схемы — meta и actor — на одной БД", async () => {
    const tables = (
      await sql<Array<{ name: string }>>`
        SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
      `
    ).map((r) => r.name)

    expect(tables).toContain("wimp")
    expect(tables).toContain("field")
    expect(tables).toContain("superposition")
    expect(tables).toContain("actor")
    expect(tables).toContain("actor_value")
    expect(tables).toContain("actor_state")
    expect(tables).toContain("value")
    expect(tables).toContain("value_enum")
    expect(tables).toContain("value_list_item")
  })

  test("graviton-патчи декларации, чтение через ORM", async () => {
    const flagUuid = crypto.randomUUID()
    const statusUuid = crypto.randomUUID()
    const idleVariantUuid = crypto.randomUUID()
    const readyVariantUuid = crypto.randomUUID()
    const idleStateUuid = crypto.randomUUID()
    const readyStateUuid = crypto.randomUUID()

    await store.update({part: "graviton", patch: [{op: "add", path: `/wimp/${enc(SRC)}`, value: {name: "smoke"}}]})

    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${flagUuid}`, value: {key: "flag", type: "boolean", label: "Flag"}}],
    })
    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${flagUuid}/default`, value: {}}],
    })
    await store.update({
      part: "graviton",
      patch: [
        {
          op: "add",
          path: `/wimp/${enc(SRC)}/field/${flagUuid}/default/scalar`,
          value: {kind: "boolean", boolean: false},
        },
      ],
    })

    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${statusUuid}`, value: {key: "status", type: "enum"}}],
    })
    await store.update({
      part: "graviton",
      patch: [
        {
          op: "add",
          path: `/wimp/${enc(SRC)}/field/${statusUuid}/variant/${idleVariantUuid}`,
          value: {position: 0, item_value: "idle"},
        },
      ],
    })
    await store.update({
      part: "graviton",
      patch: [
        {
          op: "add",
          path: `/wimp/${enc(SRC)}/field/${statusUuid}/variant/${readyVariantUuid}`,
          value: {position: 1, item_value: "ready"},
        },
      ],
    })
    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${statusUuid}/default`, value: {}}],
    })
    await store.update({
      part: "graviton",
      patch: [
        {
          op: "add",
          path: `/wimp/${enc(SRC)}/field/${statusUuid}/default/variant`,
          value: {variant: idleVariantUuid},
        },
      ],
    })

    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/superposition/${idleStateUuid}`, value: {name: "idle", position: 0}}],
    })
    await store.update({
      part: "graviton",
      patch: [
        {op: "add", path: `/wimp/${enc(SRC)}/superposition/${readyStateUuid}`, value: {name: "ready", position: 1}},
      ],
    })

    const meta = await store.wimp.get(SRC)
    if (!meta) throw new Error("meta missing")
    expect(await meta.name.get()).toBe("smoke")
    expect(await meta.fields.count()).toBe(2)
    expect(await meta.superposition.count()).toBe(2)

    const flag = await meta.fields.get({key: "flag"})
    if (!flag) throw new Error("flag field missing")
    if (flag.type !== "boolean") throw new Error("expected boolean field")
    expect(await flag.default()).toBe(false)
    expect(await flag.label()).toBe("Flag")

    const status = await meta.fields.get({key: "status"})
    if (!status) throw new Error("status field missing")
    if (status.type !== "enum") throw new Error("expected enum field")
    expect((await status.variants.all()).map((v) => v.value)).toEqual(["idle", "ready"])
    expect(await status.default()).toBe("idle")
  })

  test("actor-патчи: graviton+gluon+photon, чтение через ORM", async () => {
    const flagUuid = crypto.randomUUID()
    const statusUuid = crypto.randomUUID()
    const idleVariantUuid = crypto.randomUUID()
    const idleStateUuid = crypto.randomUUID()

    // декларация (минимум)
    await store.update({part: "graviton", patch: [{op: "add", path: `/wimp/${enc(SRC)}`, value: {name: "smoke"}}]})
    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${flagUuid}`, value: {key: "flag", type: "boolean"}}],
    })
    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/field/${statusUuid}`, value: {key: "status", type: "enum"}}],
    })
    await store.update({
      part: "graviton",
      patch: [
        {
          op: "add",
          path: `/wimp/${enc(SRC)}/field/${statusUuid}/variant/${idleVariantUuid}`,
          value: {position: 0, item_value: "idle"},
        },
      ],
    })
    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/wimp/${enc(SRC)}/superposition/${idleStateUuid}`, value: {name: "idle", position: 0}}],
    })

    // actor-1
    const actorUuid = "actor-1"
    const valueFlag = "v-flag"
    const valueStatus = "v-status"

    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/actor/${actorUuid}`, value: {parent: null, wimp: SRC, position: 0}}],
    })
    await store.update({part: "gluon", patch: [{op: "add", path: `/value/${valueFlag}`, value: {kind: "boolean", boolean: true}}]})
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/value/${valueStatus}`, value: {kind: "enum", variant: idleVariantUuid}}],
    })
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/actor/${actorUuid}/value/${flagUuid}`, value: {value: valueFlag}}],
    })
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/actor/${actorUuid}/value/${statusUuid}`, value: {value: valueStatus}}],
    })
    await store.update({
      part: "photon",
      patch: [{op: "add", path: `/actor/${actorUuid}/state`, value: {metaState: idleStateUuid}}],
    })

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

    await store.update({
      part: "graviton",
      patch: [{op: "add", path: `/actor/${actor2Uuid}`, value: {parent: null, wimp: SRC, position: 1}}],
    })
    await store.update({part: "gluon", patch: [{op: "add", path: `/value/${valueFlag2}`, value: {kind: "boolean", boolean: true}}]})
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/value/${valueStatus2}`, value: {kind: "enum", variant: idleVariantUuid}}],
    })
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/actor/${actor2Uuid}/value/${flagUuid}`, value: {value: valueFlag2}}],
    })
    await store.update({
      part: "gluon",
      patch: [{op: "add", path: `/actor/${actor2Uuid}/value/${statusUuid}`, value: {value: valueStatus2}}],
    })
    await store.update({
      part: "photon",
      patch: [{op: "add", path: `/actor/${actor2Uuid}/state`, value: {metaState: idleStateUuid}}],
    })

    // share: actor2.flag → valueFlag (тот же, что у actor1)
    await store.update({
      part: "gluon",
      patch: [{op: "replace", path: `/actor/${actor2Uuid}/value/${flagUuid}`, value: {value: valueFlag}}],
    })
    // удаляем осиротевший valueFlag2
    await store.update({part: "gluon", patch: [{op: "remove", path: `/value/${valueFlag2}`}]})

    const actor2 = (await store.actor.get(actor2Uuid))!
    const link2 = (await actor2.values.get({field: flagUuid}))!
    const sharedValue = await link2.value()
    expect(sharedValue.uuid).toBe(valueFlag)
    const owners = await sharedValue.owners()
    expect(owners.map((o) => o.actor).sort()).toEqual([actorUuid, actor2Uuid].sort())
  })

  test("close() идемпотентен — повторный вызов не падает", async () => {
    await store.close()
    expect(true).toBe(true)
  })
})

const enc = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1")
