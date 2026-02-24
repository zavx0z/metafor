import { Boundary, GPU } from "../src/index"

const status = document.getElementById("status")!
const out = document.getElementById("output")!

if (!navigator.gpu) {
  status.style.color = "red"
  status.innerText = "❌ WebGPU не поддерживается!"
  throw new Error("WebGPU не поддерживается!")
}

try {
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error("No Adapter")
  const device = await adapter.requestDevice()
  GPU._device = device

  status.innerText = "✅ WebGPU Active"
  status.style.color = "#4af626"

  const boundary = new Boundary({
    debug: {
      all: true,
    },
  })

  console.log("--- Запись данных на границу ---")
  out.innerText += "--- Запись данных на границу ---\n"

  await boundary.write({
    fields: {
      hp: { type: "number" },
      mana: { type: "number" },
      isAlive: { type: "boolean" },
    },
    branes: [
      {
        id: "q1",
        params: { hp: 100, mana: 100, isAlive: true },
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
      },
      {
        id: "q2",
        params: { hp: 0, mana: 50, isAlive: false },
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
      },
    ],
  })
  const startStates = await boundary.getStates()
  const startMsg = `Начальные состояния: ${JSON.stringify(startStates)}`
  console.log(startMsg)
  out.innerText += startMsg + "\n"

  console.log("\n--- Шаг симуляции ---")
  out.innerText += "\n--- Шаг симуляции ---\n"
  boundary.step()

  const endStates = await boundary.getStates()
  const endMsg = `Новые состояния:     ${JSON.stringify(endStates)}`
  console.log(endMsg)
  out.innerText += endMsg + "\n"
} catch (err: any) {
  status.innerText = "❌ Ошибка"
  console.error(err)
  out.innerText += err.toString() + "\n"
}
