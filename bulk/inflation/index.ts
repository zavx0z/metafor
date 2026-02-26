import { createMonad, updateBoundary, onStateChange } from "@metafor/monad"
import { GPU } from "@metafor/boundary"
import { setupDevice } from "fixture/bunWebGPU"
import gravity from "../gravity/meta.json"

GPU._device = await setupDevice()

const inflation = createMonad({
  fields: {
    bool: { type: "boolean" },
  },
  params: {
    bool: true,
  },
  state: "ожидание",
  superposition: {
    ожидание: {
      загрузка: { bool: true },
    },
    загрузка: {
      успех: { bool: true },
    },
    успех: {},
  },
  actions: {
    загрузка: (params) => console.log(gravity),
  },
})

onStateChange((monadId, old, current) => {
  const msg = `State changed: ${old} → ${current}`
  console.log(msg)
})
console.log("runnig")

await updateBoundary()

process.stdin.resume()
