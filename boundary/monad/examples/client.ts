import { createMonad, updateBoundary, updateMonad, onStateChange } from "../index"

const status = document.getElementById("status")!
const out = document.getElementById("output")!

try {
  status.innerText = "✅ WebGPU Active"
  status.style.color = "#4af626"

  console.log("--- Создание монад ---")
  out.innerText += "--- Создание монад ---\n"

  // Монада 1: воин с hp=100
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
    actions: {
      PATROL: (params) => console.log(`Warrior патрулирует: hp=${params.hp}`),
      COMBAT: (params) => console.log(`Warrior в бою: hp=${params.hp}`),
      DEAD: (params) => console.log(`Warrior погиб: hp=${params.hp}`),
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
    actions: {
      PATROL: (params) => console.log(`Corpse патрулирует: hp=${params.hp}`),
      COMBAT: (params) => console.log(`Corpse в бою: hp=${params.hp}`),
      DEAD: (params) => console.log(`Corpse погиб: hp=${params.hp}`),
    },
  })

  // Callback на изменение состояния
  onStateChange((monadId, old, current) => {
    const msg = `State changed: ${old} → ${current}`
    console.log(msg)
    out.innerText += msg + "\n"
  })

  console.log("\n--- Инициализация границы ---")
  out.innerText += "\n--- Инициализация границы ---\n"
  await updateBoundary()

  const startMsg = `Начальные состояния созданы`
  console.log(startMsg)
  out.innerText += startMsg + "\n"

  console.log("\n--- Шаг симуляции (hp=100 → PATROL, hp=0 → DEAD) ---")
  out.innerText += "\n--- Шаг симуляции ---\n"

  // Обновляем и выполняем шаг для каждой монады
  await updateMonad(warriorId, { hp: 100 })
  await updateMonad(corpseId, { hp: 0 })

  const endMsg = `Симуляция завершена`
  console.log(endMsg)
  out.innerText += endMsg + "\n"
} catch (err: any) {
  status.innerText = "❌ Ошибка"
  console.error(err)
  out.innerText += err.toString() + "\n"
}
