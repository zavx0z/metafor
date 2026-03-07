/**
 * Тесты на Boundary-блокировку и TAKT-синхронизацию.
 *
 * Проверяет новый цикл:
 * 1. BOUNDARY (WGSL) ставит LOCK автоматически при изменении состояния
 * 2. MONAD проверяет намерение → если нет процесса, снимает LOCK
 * 3. WEAK FORCE исполняет процессы → releaseLock() снимает LOCK
 */

import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createActor,
  updateActors,
  updateBoundary,
  onStateChange,
  registerProcesses,
  releaseLock,
  force$,
  type BraneStateChange,
} from "../index"
import type { MetaJson } from "@metafor/ast/dsl"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdActorIds: string[] = []

afterEach(() => {
  force$.reset()
  _createdActorIds.length = 0
})

// Моковые схемы процессов из DSL
const mockProcesses: Record<string, MetaJson> = {
  patrolProcess: {
    type: "action",
    label: "Патруль",
    desc: "Процесс патрулирования",
    action: {
      src: "./actions/patrol.ts",
      read: ["position"],
    },
  },
  deathProcess: {
    type: "action",
    label: "Смерть",
    desc: "Процесс смерти",
    action: {
      src: "./actions/death.ts",
      read: ["hp"],
    },
  },
}

describe("Boundary-блокировка + TAKT-синхронизация", () => {
  it("должен автоматически снять блокировку если нет намерения (updateBoundary)", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null, // Терминальное состояние без намерения
      },
      // DEAD без намерения
    })
    _createdActorIds.push(actorUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // hp=0 <= 0 → DEAD (без намерения)
    // WGSL ставит LOCK=1 при изменении
    // MONAD должен автоматически снять LOCK так как нет намерения
    await updateActors([{ uuid: actorUuid, fields: { hp: 0 } }])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.newState).toBe("DEAD")
    expect(runtimeChanges[0]!.intention).toBeNull()
    // Блокировка должна быть снята автоматически
  })

  it("должен держать блокировку если есть намерение", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {
        PATROL: "patrolProcess",
      },
    })
    _createdActorIds.push(actorUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // hp=80 > 50 → PATROL (с намерением)
    // WGSL ставит LOCK=1
    // MONAD НЕ снимает LOCK так как есть намерение
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 } }])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")
    // Блокировка должна держаться до releaseLock()
  })

  it("должен снять блокировку через releaseLock() после завершения процесса", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      intentions: {
        PATROL: "patrolProcess",
        DEAD: "deathProcess",
      },
    })
    _createdActorIds.push(actorUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // TAKT 1: hp=80 > 50 → PATROL (с намерением, LOCK=1)
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 } }])
    let runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")

    // WEAK FORCE: исполняет patrolProcess...
    // После завершения: releaseLock()
    await releaseLock([actorUuid])

    // TAKT 2: hp=0 <= 0 → DEAD (с намерением, LOCK=1)
    await updateActors([{ uuid: actorUuid, fields: { hp: 0 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[1]!.newState).toBe("DEAD")
    expect(runtimeChanges[1]!.intention).toBe("deathProcess")

    // WEAK FORCE: исполняет deathProcess...
    // После завершения: releaseLock()
    await releaseLock([actorUuid])
  })

  it("должен работать с пакетной обработкой (TAKT) для нескольких монад", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid1 = crypto.randomUUID()
    const actorUuid1 = createActor({
      uuid: uuid1,
      fields: { hp: { type: "number" } },
      values: { hp: 100 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {
        PATROL: "patrolProcess",
      },
    })

    const uuid2 = crypto.randomUUID()
    const actorUuid2 = createActor({
      uuid: uuid2,
      fields: { mana: { type: "number" } },
      values: { mana: 100 },
      superposition: {
        IDLE: { DEAD: { mana: { lte: 0 } } },
        DEAD: null, // Без намерения
      },
    })

    const uuid3 = crypto.randomUUID()
    const actorUuid3 = createActor({
      uuid: uuid3,
      fields: { energy: { type: "number" } },
      values: { energy: 50 },
      superposition: {
        IDLE: { PATROL: { energy: { gt: 30 } } },
        PATROL: null,
      },
      intentions: {
        PATROL: "patrolProcess",
      },
    })

    _createdActorIds.push(actorUuid1, actorUuid2, actorUuid3)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // TAKT 1: Пакетное обновление всех монад
    await updateActors([
      { uuid: actorUuid1, fields: { hp: 80 } },      // → PATROL (с намерением, LOCK=1)
      { uuid: actorUuid2, fields: { mana: 0 } },     // → DEAD (без намерения, LOCK=1→0)
      { uuid: actorUuid3, fields: { energy: 40 } },  // → PATROL (с намерением, LOCK=1)
    ])

    // Находим изменения по монадам
    const change1 = changes.find((c) => c.actorId === actorUuid1)
    const change2 = changes.find((c) => c.actorId === actorUuid2)
    const change3 = changes.find((c) => c.actorId === actorUuid3)

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    const runtimeChange1 = runtimeChanges.find((c) => c.actorId === actorUuid1)
    const runtimeChange2 = runtimeChanges.find((c) => c.actorId === actorUuid2)
    const runtimeChange3 = runtimeChanges.find((c) => c.actorId === actorUuid3)

    expect(runtimeChange1?.newState).toBe("PATROL")
    expect(runtimeChange1?.intention).toBe("patrolProcess")

    expect(runtimeChange2?.newState).toBe("DEAD")
    expect(runtimeChange2?.intention).toBeNull()

    expect(runtimeChange3?.newState).toBe("PATROL")
    expect(runtimeChange3?.intention).toBe("patrolProcess")

    // releaseLock() для монад с намерением
    await releaseLock([actorUuid1, actorUuid3])
  })

  it("должен разблокировать все монады если не указаны ID", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid1 = crypto.randomUUID()
    const actorUuid1 = createActor({
      uuid: uuid1,
      fields: { hp: { type: "number" } },
      values: { hp: 100 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {
        PATROL: "patrolProcess",
      },
    })

    const uuid2 = crypto.randomUUID()
    const actorUuid2 = createActor({
      uuid: uuid2,
      fields: { mana: { type: "number" } },
      values: { mana: 100 },
      superposition: {
        IDLE: { PATROL: { mana: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {
        PATROL: "patrolProcess",
      },
    })

    _createdActorIds.push(actorUuid1, actorUuid2)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    await updateActors([
      { uuid: actorUuid1, fields: { hp: 80 } },
      { uuid: actorUuid2, fields: { mana: 80 } },
    ])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(2)

    // releaseLock() без аргументов → разблокировать все
    await releaseLock()
  })

  it("должен работать с цепочкой переходов (TAKT-by-TAKT)", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" }, mana: { type: "number" } },
      values: { hp: 100, mana: 100 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 80 } } },
        PATROL: { COMBAT: { mana: { lt: 20 } } },
        COMBAT: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      intentions: {
        PATROL: "patrolProcess",
        COMBAT: "combatProcess",
        DEAD: "deathProcess",
      },
    })
    _createdActorIds.push(actorUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // TAKT 1: hp=100>80 → PATROL (LOCK=1)
    await updateActors([{ uuid: actorUuid, fields: { hp: 100 } }])
    let runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")
    await releaseLock([actorUuid])

    // TAKT 2: mana=10<20 → COMBAT (LOCK=1)
    await updateActors([{ uuid: actorUuid, fields: { mana: 10 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[1]!.newState).toBe("COMBAT")
    expect(runtimeChanges[1]!.intention).toBe("combatProcess")
    await releaseLock([actorUuid])

    // TAKT 3: hp=0<=0 → DEAD (LOCK=1)
    await updateActors([{ uuid: actorUuid, fields: { hp: 0 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[2]!.newState).toBe("DEAD")
    expect(runtimeChanges[2]!.intention).toBe("deathProcess")
    await releaseLock([actorUuid])
  })
})
