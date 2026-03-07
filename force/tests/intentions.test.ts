import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  createMonad,
  updateMonads,
  updateBoundary,
  _resetState,
  onStateChange,
  registerProcesses,
  getProcessSchema,
  releaseLock,
  type BraneStateChange,
} from "../force"
import type { ParsedProcessJson } from "../../metafor/build/monadJson"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"

beforeAll(async () => {
  GPU._device = await setupDevice()
})

const _createdMonadIds: string[] = []

afterEach(() => {
  _resetState()
  _createdMonadIds.length = 0
})

// Моковые схемы процессов из DSL
const mockProcesses: Record<string, ParsedProcessJson> = {
  patrolProcess: {
    type: "action",
    label: "Патруль",
    desc: "Процесс патрулирования",
    action: {
      src: "./actions/patrol.ts",
      read: ["position"],
    },
  },
  combatProcess: {
    type: "action",
    label: "Бой",
    desc: "Процесс боя",
    action: {
      src: "./actions/combat.ts",
      read: ["hp", "enemy"],
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
  idleProcess: {
    type: "action",
    label: "Бездействие",
    desc: "Процесс бездействия",
    action: {
      src: "./actions/idle.ts",
      read: [],
    },
  },
}

describe("Monad — Намерения (intentions)", () => {
  it("должен вернуть намерение при переходе в состояние", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
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
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()
    await updateMonads([{ uuid: monadUuid, fields: { hp: 80 } }])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")
  })

  it("должен вернуть намерение с правильными параметрами", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
      uuid,
      fields: { hp: { type: "number" }, mana: { type: "number" } },
      values: { hp: 30, mana: 50 },
      superposition: {
        IDLE: { COMBAT: { hp: { gt: 50 } } },
        COMBAT: null,
      },
      intentions: {
        COMBAT: "combatProcess",
      },
    })
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()
    await updateMonads([{ uuid: monadUuid, fields: { hp: 80, mana: 30 } }])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.intention).toBe("combatProcess")
    expect(runtimeChanges[0]!.values).toEqual({ hp: 80, mana: 30 })
  })

  it("должен вернуть разные намерения для разных состояний", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 100 },
      superposition: {
        IDLE: {
          PATROL: { hp: { gt: 50 } },
          DEAD: { hp: { lte: 0 } },
        },
        PATROL: {
          IDLE: { hp: { lte: 20 } },
        },
        DEAD: null,
      },
      intentions: {
        PATROL: "patrolProcess",
        DEAD: "deathProcess",
        IDLE: "idleProcess",
      },
    })
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // hp=100 > 50 → PATROL (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 100 } }])
    let runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")
    // WEAK FORCE исполняет процесс → releaseLock()
    await releaseLock([monadUuid])

    // hp=15 <= 20 → IDLE (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 15 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[1]!.newState).toBe("IDLE")
    expect(runtimeChanges[1]!.intention).toBe("idleProcess")
    await releaseLock([monadUuid])

    // hp=0 <= 0 → DEAD (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[2]!.newState).toBe("DEAD")
    expect(runtimeChanges[2]!.intention).toBe("deathProcess")
    await releaseLock([monadUuid])
  })

  it("должен вернуть намерение только при изменении состояния", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
      uuid,
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
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // Переход в PATROL
    await updateMonads([{ uuid: monadUuid, fields: { hp: 80 } }])
    let runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")

    // Остаётся в PATROL (намерение не должно вернуться снова)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 90 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
  })

  it("должен вернуть намерения при цепочке переходов", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
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
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // hp=100>80 → PATROL (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 100 } }])
    let runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[0]!.newState).toBe("PATROL")
    expect(runtimeChanges[0]!.intention).toBe("patrolProcess")
    // WEAK FORCE исполняет процесс → releaseLock()
    await releaseLock([monadUuid])

    // mana=10<20 → COMBAT (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { mana: 10 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[1]!.newState).toBe("COMBAT")
    expect(runtimeChanges[1]!.intention).toBe("combatProcess")
    await releaseLock([monadUuid])

    // hp=0<=0 → DEAD (LOCK=1)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])
    runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges[2]!.newState).toBe("DEAD")
    expect(runtimeChanges[2]!.intention).toBe("deathProcess")
    await releaseLock([monadUuid])
  })

  it("должен вернуть null намерение если состояние без намерения", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid = crypto.randomUUID()
    const monadUuid = createMonad({
      uuid,
      fields: { hp: { type: "number" } },
      values: { hp: 100 },
      superposition: {
        IDLE: { DEAD: { hp: { lte: 0 } } },
        DEAD: null,
      },
      // DEAD без намерения — терминальное состояние
    })
    _createdMonadIds.push(monadUuid)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // hp=0 <= 0 → DEAD (без намерения)
    await updateMonads([{ uuid: monadUuid, fields: { hp: 0 } }])
    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]!.newState).toBe("DEAD")
    expect(runtimeChanges[0]!.intention).toBeNull()
  })

  it("должен вернуть пакетные изменения для нескольких монад", async () => {
    const changes: BraneStateChange[] = []

    registerProcesses(mockProcesses)

    const uuid1 = crypto.randomUUID()
    const monadUuid1 = createMonad({
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
    const monadUuid2 = createMonad({
      uuid: uuid2,
      fields: { mana: { type: "number" } },
      values: { mana: 100 },
      superposition: {
        IDLE: { COMBAT: { mana: { gt: 50 } } },
        COMBAT: null,
      },
      intentions: {
        COMBAT: "combatProcess",
      },
    })
    _createdMonadIds.push(monadUuid1, monadUuid2)

    onStateChange((c) => changes.push(...c))
    await updateBoundary()

    // Обе монады меняют состояние одновременно
    await updateMonads([
      { uuid: monadUuid1, fields: { hp: 80 } },
      { uuid: monadUuid2, fields: { mana: 80 } },
    ])

    const runtimeChanges = changes.filter((c) => c.oldState !== undefined)
    expect(runtimeChanges).toHaveLength(2)
    const change1 = runtimeChanges.find((c) => c.monadId === monadUuid1)
    const change2 = runtimeChanges.find((c) => c.monadId === monadUuid2)
    expect(change1?.newState).toBe("PATROL")
    expect(change1?.intention).toBe("patrolProcess")
    expect(change2?.newState).toBe("COMBAT")
    expect(change2?.intention).toBe("combatProcess")
  })

  it("должен получить схему процесса по ключу намерения", async () => {
    registerProcesses(mockProcesses)

    const schema = getProcessSchema("patrolProcess")
    expect(schema).toBeDefined()
    expect(schema?.type).toBe("action")
    expect(schema?.label).toBe("Патруль")
    expect(schema?.action?.src).toBe("./actions/patrol.ts")
  })
})
