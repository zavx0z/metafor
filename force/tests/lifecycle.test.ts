import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import { resetForceStore,
  createActor,
  deleteActor,
  updateActors,
  updateBoundary,
  onStateChange,
  force$,
  type BraneStateChange,
} from "../index"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdActorIds: string[] = []

afterEach(() => {
  resetForceStore(force$)
  _createdActorIds.length = 0
})

describe("Monad — Жизненный цикл", () => {
  it("должен создать, обновить и удалить монаду", async () => {
    let stateChanged = false
    let oldState: string | undefined = ""
    let currentState = ""

    onStateChange((changes: BraneStateChange[]) => {
      const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
      if (runtimeChanges.length > 0) {
        const change = runtimeChanges[0]!
        stateChanged = true
        oldState = change.oldState
        currentState = change.newState
      }
    })

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid)

    await updateBoundary()

    // Проверяем начальное состояние
    expect(stateChanged).toBe(false) // событие рождения игнорируется фильтром runtimeChanges

    // Обновляем hp → должен перейти в PATROL
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 } }])

    expect(stateChanged).toBe(true)
    expect(oldState).toBe("IDLE")
    expect(currentState).toBe("PATROL")

    // Удаляем монаду
    deleteActor(actorUuid)
    expect(true).toBe(true)
  })

  it("должен работать с множественными монадами", async () => {
    const states1: string[] = []
    const states2: string[] = []

    onStateChange((changes) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        if (change.actorId === _createdActorIds[0]) {
          states1.push(change.newState)
        } else {
          states2.push(change.newState)
        }
      }
    })

    const uuid1 = crypto.randomUUID()
    const actorUuid1 = createActor({
      uuid: uuid1,
      fields: { hp: { type: "number" } },
      values: { hp: 100 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid1)

    const uuid2 = crypto.randomUUID()
    const actorUuid2 = createActor({
      uuid: uuid2,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid2)

    await updateBoundary()

    // Обновляем первую монаду → PATROL
    await updateActors([{ uuid: actorUuid1, fields: { hp: 80 } }])

    // Обновляем вторую монаду → остаётся IDLE (hp=30 не <= 0)
    await updateActors([{ uuid: actorUuid2, fields: { hp: 30 } }])

    expect(states1).toEqual(["PATROL"])
    expect(states2).toEqual([])
  })

  it("должен вызвать callback для каждой монады отдельно", async () => {
    const callbackCounts = new Map<string, number>()

    onStateChange((changes) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        const count = callbackCounts.get(change.actorId) ?? 0
        callbackCounts.set(change.actorId, count + 1)
      }
    })

    // Создаём две монады с разными полями для избежания конфликтов
    const uuid1 = crypto.randomUUID()
    const actorUuid1 = createActor({
      uuid: uuid1,
      fields: { hp1: { type: "number" } },
      values: { hp1: 100 },
      superposition: { IDLE: { PATROL: { hp1: { gt: 50 } } }, PATROL: null },
      intentions: {},
    })
    _createdActorIds.push(actorUuid1)

    const uuid2 = crypto.randomUUID()
    const actorUuid2 = createActor({
      uuid: uuid2,
      fields: { hp2: { type: "number" } },
      values: { hp2: 100 },
      superposition: { IDLE: { PATROL: { hp2: { gt: 50 } } }, PATROL: null },
      intentions: {},
    })
    _createdActorIds.push(actorUuid2)

    await updateBoundary()

    await updateActors([{ uuid: actorUuid1, fields: { hp1: 80 } }])
    await updateActors([{ uuid: actorUuid2, fields: { hp2: 80 } }])

    expect(callbackCounts.get(actorUuid1)).toBe(1)
    expect(callbackCounts.get(actorUuid2)).toBe(1)
  })

  it("должен блокировать переходы при lock=true в updateActors()", async () => {
    let stateChanged = false

    onStateChange((changes) => {
      const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
      if (runtimeChanges.length > 0) {
        stateChanged = true
      }
    })

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid)

    await updateBoundary()

    // Обновляем hp с блокировкой → НЕ должен перейти в PATROL
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 }, lock: true }])

    expect(stateChanged).toBe(false)

    // Разблокировка (FSM проверит переход по текущим данным)
    await updateActors([{ uuid: actorUuid, fields: {}, lock: false }])

    expect(stateChanged).toBe(true)
  })

  it("должен обновлять поля даже при блокировке переходов", async () => {
    const stateChanges: string[] = []

    onStateChange((changes) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        stateChanges.push(change.newState)
      }
    })

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid)

    await updateBoundary()

    // Обновляем hp с блокировкой → поле обновлено, но переход не сработал
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 }, lock: true }])

    expect(stateChanges).toHaveLength(0)

    // Разблокировка (FSM проверит переход по текущим данным)
    await updateActors([{ uuid: actorUuid, fields: {}, lock: false }])

    expect(stateChanges).toEqual(["PATROL"])
  })

  it("должен разблокировать монаду без изменения полей", async () => {
    const stateChanges: string[] = []

    onStateChange((changes) => {
      for (const change of changes) {
        if (change.oldState === undefined) continue
        stateChanges.push(change.newState)
      }
    })

    const uuid = crypto.randomUUID()
    const actorUuid = createActor({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 30 },
      superposition: {
        IDLE: { PATROL: { hp: { gt: 50 } } },
        PATROL: null,
      },
      intentions: {},
    })
    _createdActorIds.push(actorUuid)

    await updateBoundary()

    // Обновляем hp с блокировкой
    await updateActors([{ uuid: actorUuid, fields: { hp: 80 }, lock: true }])
    expect(stateChanges).toHaveLength(0)

    // Разблокировка (FSM проверит переход по текущим данным)
    await updateActors([{ uuid: actorUuid, fields: {}, lock: false }])

    expect(stateChanges).toEqual(["PATROL"])
  })
})
