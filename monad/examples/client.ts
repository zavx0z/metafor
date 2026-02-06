import { MonadSystem } from "../src/index"

// Схема и правила
const CONTEXT_SCHEMA = {
  hp: "number",
  mana: "number",
  isAlive: "boolean",
}

const RULES = {
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
}

async function run() {
  const out = document.getElementById("output")!
  const status = document.getElementById("status")!
  const log = (msg: string) => {
    out.innerText += msg + "\n"
    console.log(msg)
  }

  if (!navigator.gpu) {
    status.innerText = "❌ WebGPU не поддерживается!"
    status.style.color = "red"
    console.error("❌ WebGPU не поддерживается!")
    return
  }

  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error("No Adapter")
    const device = await adapter.requestDevice()

    status.innerText = "✅ WebGPU Active"
    status.style.color = "#4af626"

    const system = new MonadSystem(device)

    log("--- Инициализация ---")
    await system.init({
      statesConfig: RULES,
      contextSchema: CONTEXT_SCHEMA,
      monads: [
        { id: "m1", state: "IDLE", context: { hp: 100, mana: 100, isAlive: true } },
        { id: "m2", state: "IDLE", context: { hp: 0, mana: 50, isAlive: false } },
      ],
      globalContextSize: { floats: 4096, uints: 4096 },
    })

    const startStates = await system.getStates()
    log(`Начальные состояния: ${JSON.stringify(startStates)}`)

    log("\n--- Шаг симуляции ---")
    system.step()

    const endStates = await system.getStates()
    log(`Новые состояния:     ${JSON.stringify(endStates)}`)
  } catch (err: any) {
    status.innerText = "❌ Ошибка"
    log(err.toString())
    console.error(err)
  }
}

run()
