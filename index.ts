import { createMonad, onStateChange, updateBoundary } from "@boundary/monad"
import { GPU } from "@boundary/matrix"
import { setupDevice } from "fixture/bunWebGPU"
GPU._device = await setupDevice()

const root = createMonad({
  uuid: crypto.randomUUID(),
  fields: {
    hp: { type: "number" },
    mana: { type: "number" },
    isAlive: { type: "boolean" },
  },
  values: { hp: 100, mana: 50, isAlive: true },
  superposition: {
    IDLE: {
      PATROL: { hp: { gt: 50 } }, // ← Приоритет 1: hp > 50
      DEAD: { hp: { lte: 0 } }, // ← Приоритет 2: hp <= 0
    },
    PATROL: {
      IDLE: { mana: { lt: 10 } }, // mana < 10 → IDLE
      COMBAT: { isAlive: true }, // isAlive === true → COMBAT
    },
    COMBAT: null,
    DEAD: null, // Терминальное состояние
  },
})

onStateChange((changes) => {
  for (const change of changes) {
    const msg = `State changed: ${change.oldState} → ${change.newState}`
    console.log(msg)
  }
})

await updateBoundary()
