/**
 * Integration smoke для `store/server.open()` — гоняет обе схемы (meta + actor)
 * на одном SQL handle и проверяет, что `open` → `close` чисты, ORM-классы
 * meta- и actor-сторон работают вместе.
 *
 * Цель — поймать DDL-регрессии (например битые индексы) и
 * cross-schema FK-нарушения раньше unit-spec-ов.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaDSL } from "../metafor.t.ts"
import type { ServerStore } from "./server.t.ts"
import { open } from "./server.ts"
import { BooleanValue, EnumValue } from "@store/actor"

const minimalMeta: MetaDSL = {
  name: "smoke",
  fields: {
    flag: { type: "boolean", default: false, label: "Flag" },
    status: { type: "enum", values: ["idle", "ready"], default: "idle" },
  },
  superposition: { idle: {}, ready: {} },
  mass: {},
  processes: {},
  reactions: { reactions: {}, superposition: {} },
  matter: [],
}

describe("store/server smoke", () => {
  let store: ServerStore

  beforeEach(async () => {
    store = await open({})
  })

  afterEach(async () => {
    await store.close()
  })

  test("open() поднимает обе схемы — meta и actor — на одной БД", async () => {
    const tables = (await store.sql<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
    `).map((r) => r.name)

    // присутствуют ключевые таблицы из обеих схем
    expect(tables).toContain("meta")
    expect(tables).toContain("field")
    expect(tables).toContain("superposition")
    expect(tables).toContain("actor")
    expect(tables).toContain("actor_value")
    expect(tables).toContain("actor_state")
    expect(tables).toContain("value")
    expect(tables).toContain("value_enum")
    expect(tables).toContain("value_list_item")
  })

  test("meta.create записывает декларацию, ORM-классы читают её обратно", async () => {
    const meta = await store.meta.create("owner/smoke", minimalMeta)

    expect(await meta.name()).toBe("smoke")
    expect(await meta.fields.count()).toBe(2)
    expect(await meta.superposition.count()).toBe(2)

    const flag = await meta.fields.get({ key: "flag" })
    if (!flag) throw new Error("flag field missing")
    if (flag.type !== "boolean") throw new Error("expected boolean field")
    expect(await flag.default()).toBe(false)
    expect(await flag.label()).toBe("Flag")

    const status = await meta.fields.get({ key: "status" })
    if (!status) throw new Error("status field missing")
    if (status.type !== "enum") throw new Error("expected enum field")
    expect(await status.variants()).toEqual(["idle", "ready"])
    expect(await status.default()).toBe("idle")
  })

  test("actor.create + read через ORM-инстансы", async () => {
    await store.meta.create("owner/smoke", minimalMeta)

    const flagFieldUuid = (await store.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM field WHERE meta = ${"owner/smoke"} AND key = ${"flag"}
    `)[0]!.uuid
    const statusFieldUuid = (await store.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM field WHERE meta = ${"owner/smoke"} AND key = ${"status"}
    `)[0]!.uuid
    const idleStateUuid = (await store.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM superposition WHERE meta = ${"owner/smoke"} AND name = ${"idle"}
    `)[0]!.uuid
    const idleVariantUuid = (await store.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM field_enum_variant WHERE field = ${statusFieldUuid} AND item_value = ${"idle"}
    `)[0]!.uuid

    const actorUuid = "actor-1"
    const valueFlag = "v-flag"
    const valueStatus = "v-status"

    const actor = await store.actor.create({
      actor: { uuid: actorUuid, parent: null, meta: "owner/smoke", position: 0 },
      values: [
        { actor: actorUuid, field: flagFieldUuid, value: valueFlag },
        { actor: actorUuid, field: statusFieldUuid, value: valueStatus },
      ],
      valueRecords: [
        { uuid: valueFlag, kind: "boolean", boolean: true },
        { uuid: valueStatus, kind: "enum", variant: idleVariantUuid },
      ],
      valueItems: [],
      state: { actor: actorUuid, metaState: idleStateUuid },
    })

    expect(actor.uuid).toBe(actorUuid)
    expect(await actor.meta()).toBe("owner/smoke")
    expect(await actor.parent()).toBeNull()
    expect(await actor.position()).toBe(0)
    expect((await actor.state())?.metaState).toBe(idleStateUuid)

    const links = await actor.values.all()
    expect(links.length).toBe(2)

    const flagLink = await actor.values.get({ field: flagFieldUuid })
    const flagValue = await flagLink!.value()
    expect(flagValue).toBeInstanceOf(BooleanValue)
    expect(await (flagValue as BooleanValue).boolean()).toBe(true)

    const statusLink = await actor.values.get({ field: statusFieldUuid })
    const statusValue = await statusLink!.value()
    expect(statusValue).toBeInstanceOf(EnumValue)
    expect(await (statusValue as EnumValue).variant()).toBe(idleVariantUuid)

    // smoke на манипуляцию: setBoolean пишет в свою подтаблицу
    await (flagValue as BooleanValue).setBoolean(false)
    const refreshed = await flagLink!.value()
    expect(await (refreshed as BooleanValue).boolean()).toBe(false)

    // ссылка от тех же void-полей должна быть на разные value, пока не share-нём
    const flagOwners = await flagValue.owners()
    expect(flagOwners.length).toBe(1)

    // делаем второго актора, share-аем с ним flag
    const actor2Uuid = "actor-2"
    const valueFlag2 = "v-flag-2"
    const valueStatus2 = "v-status-2"
    await store.actor.create({
      actor: { uuid: actor2Uuid, parent: null, meta: "owner/smoke", position: 1 },
      values: [
        { actor: actor2Uuid, field: flagFieldUuid, value: valueFlag2 },
        { actor: actor2Uuid, field: statusFieldUuid, value: valueStatus2 },
      ],
      valueRecords: [
        { uuid: valueFlag2, kind: "boolean", boolean: true },
        { uuid: valueStatus2, kind: "enum", variant: idleVariantUuid },
      ],
      valueItems: [],
      state: { actor: actor2Uuid, metaState: idleStateUuid },
    })

    const actor2 = (await store.actor.get(actor2Uuid))!
    const link2 = (await actor2.values.get({ field: flagFieldUuid }))!
    await link2.share(valueFlag) // привязать actor2's flag к valueFlag (того же, что у actor1)

    // оба актора теперь делят одну запись value
    const sharedValue = await link2.value()
    expect(sharedValue.uuid).toBe(valueFlag)
    const sharedOwners = await sharedValue.owners()
    expect(sharedOwners.map((o) => o.actor).sort()).toEqual([actorUuid, actor2Uuid].sort())

    // fork — actor2 получает свою новую копию
    const forked = await link2.fork()
    expect(forked.uuid).not.toBe(valueFlag)
    expect((await forked.owners()).map((o) => o.actor)).toEqual([actor2Uuid])
    // actor1 продолжает владеть старой записью один
    const flagAfterFork = await flagLink!.value()
    expect((await flagAfterFork.owners()).map((o) => o.actor)).toEqual([actorUuid])
  })

  test("close() идемпотентен — повторный вызов не падает", async () => {
    await store.close()
    // afterEach сделает второй close
    expect(true).toBe(true)
  })
})
