import { createMonad, updateBoundary, updateMonads, onStateChange, releaseLock } from "@boundary/monad"
import space from "./meta.json"
import { executeProcess } from "@force/weak/proc"

const procs = space.processes
const proc = procs[Object.keys(procs)[0] as keyof typeof procs]

console.log(await import("./proc/create.ts"))
// executeProcess(proc.action.src)
console.log(proc.action.src)

const status = document.getElementById("status")!
const out = document.getElementById("output")!

status.innerText = "✅ WebGPU Active"
status.style.color = "#4af626"

console.log("--- Создание монад ---")
out.innerText += "--- Создание монад ---\n"

const warriorId = createMonad({
  fields: {
    hp: { type: "number" },
    mana: { type: "number" },
    isAlive: { type: "boolean" },
  },
  params: {
    hp: 100,
    mana: 100,
    isAlive: true,
  },
  state: "IDLE",
  superposition: {
    IDLE: {
      PATROL: { hp: { gt: 50 } },
      DEAD: { hp: { lte: 0 } },
    },
    PATROL: {
      IDLE: { mana: { lt: 10 } },
      COMBAT: { isAlive: true },
    },
    COMBAT: {
      DEAD: { hp: { lte: 0 } },
    },
    DEAD: null,
  },
  intentions: {
    PATROL: "patrolProcess",
    COMBAT: "combatProcess",
    DEAD: "deathProcess",
  },
})

// Монада 2: воин с hp=0 (мертвый)
const corpseId = createMonad({
  fields: {
    hp: { type: "number" },
    mana: { type: "number" },
    isAlive: { type: "boolean" },
  },
  params: {
    hp: 0,
    mana: 50,
    isAlive: false,
  },
  state: "IDLE",
  superposition: {
    IDLE: {
      PATROL: { hp: { gt: 50 } },
      DEAD: { hp: { lte: 0 } },
    },
    PATROL: {
      IDLE: { mana: { lt: 10 } },
      COMBAT: { isAlive: true },
    },
    COMBAT: {
      DEAD: { hp: { lte: 0 } },
    },
    DEAD: null,
  },
  intentions: {
    DEAD: "deathProcess",
  },
})

// Callback на изменение состояния (пакетный)
onStateChange((changes) => {
  for (const { monadId, oldState, newState, intention } of changes) {
    const msg = `State changed for monad ${monadId}: ${oldState} → ${newState}${intention ? `, intention: ${intention}` : ""}`
    console.log(msg)
    out.innerText += msg + "\n"
  }
})

console.log("\n--- Инициализация пространства ---")
out.innerText += "\n--- Инициализация пространства ---\n"
await updateBoundary()

const startMsg = `Начальные состояния созданы`
console.log(startMsg)
out.innerText += startMsg + "\n"

console.log("\n--- TAKT 1: Шаг симуляции (hp=100 → PATROL, hp=0 → DEAD) ---")
out.innerText += "\n--- TAKT 1 ---\n"

// Обновляем и выполняем шаг для каждой монады
await updateMonads([
  { id: warriorId, fields: { hp: 100 } },
  { id: corpseId, fields: { hp: 0 } },
])

// WEAK FORCE: исполняет процессы для монад с намерением
// После завершения — снимаем блокировку
await releaseLock()

const endMsg = `Симуляция завершена`
console.log(endMsg)
out.innerText += endMsg + "\n"
