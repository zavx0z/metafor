import { createMonad, updateBoundary, onStateChange } from "@metafor/monad"
import { GPU } from "@metafor/boundary"
import { setupDevice } from "fixture/bunWebGPU"

GPU._device = await setupDevice()

const inflation = createMonad({
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

onStateChange((monadId, old, current) => {
  const msg = `State changed: ${old} → ${current}`
  console.log(msg)
})
console.log("runnig")

await updateBoundary()

process.stdin.resume()
