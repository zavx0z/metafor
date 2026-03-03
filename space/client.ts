import { createMonad, updateBoundary, updateMonads, onStateChange, releaseLock } from "@boundary/monad"
import space from "./meta.json"
import { executeProcess } from "@force/weak/proc"

const status = document.getElementById("status")!
const out = document.getElementById("output")!

status.innerText = "✅ WebGPU Active"
status.style.color = "#4af626"

// -------------------------------------------------------------
const procs = space.processes
const proc = procs[Object.keys(procs)[0] as keyof typeof procs]

// console.log(space)
const spaceMonad = createMonad({
  fields: {},
  params: {},
  superposition: space.superposition,
  state: Object.keys(space.superposition)[0]!,
})

// executeProcess(proc.action)

// Callback на изменение состояния (пакетный)
onStateChange((changes) => {
  for (const { monadId, oldState, newState, intention } of changes) {
    const msg = `State changed for monad ${monadId}: ${oldState} → ${newState}${intention ? `, intention: ${intention}` : ""}`
    console.log(msg)
    out.innerText += msg + "\n"
  }
})
await updateBoundary()

// await releaseLock()

// // Обновляем и выполняем шаг для каждой монады
// await updateMonads([
//   { id: warriorId, fields: { hp: 100 } },
//   { id: corpseId, fields: { hp: 0 } },
// ])

