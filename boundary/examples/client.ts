import { Boundary } from "../src/index"

const out = document.getElementById("output")!
const status = document.getElementById("status")!
const log = (msg: string) => {
  out.innerText += msg + "\n"
  console.log(msg)
}

if (!navigator.gpu) {
  status.style.color = "red"
  status.innerText = "❌ WebGPU не поддерживается!"
  throw new Error("WebGPU не поддерживается!")
}

try {
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error("No Adapter")
  const device = await adapter.requestDevice()

  status.innerText = "✅ WebGPU Active"
  status.style.color = "#4af626"

  const boundary = new Boundary(device)

  log("--- Инициализация границы ---")
  await boundary.init({
    branes: {
      hp: { type: "number" },
      mana: { type: "number" },
      isAlive: { type: "boolean" },
    },
    fields: [
      {
        id: "q1",
        brane: { hp: 100, mana: 100, isAlive: true },
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
        brane: { hp: 0, mana: 50, isAlive: false },
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
  log(`Начальные состояния: ${JSON.stringify(startStates)}`)

  log("\n--- Шаг симуляции ---")
  boundary.step()

  const endStates = await boundary.getStates()
  log(`Новые состояния:     ${JSON.stringify(endStates)}`)
} catch (err: any) {
  status.innerText = "❌ Ошибка"
  log(err.toString())
  console.error(err)
}
