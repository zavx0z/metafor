import { createMonad, updateBoundary, deleteMonad, releaseLock, type BraneStateChange } from "@boundary/monad"
import space from "./meta.json"
import { executeProcess, loadAction } from "../force/weak/proc/load"

const status = document.getElementById("status")!
const out = document.getElementById("output")!

status.innerText = "✅ WebGPU Active"
status.style.color = "#4af626"

// -------------------------------------------------------------
const procs = space.processes
const proc = procs[Object.keys(procs)[0] as keyof typeof procs]

const spaceId = createMonad({ fields: {}, params: {}, superposition: space.superposition })

log(await updateBoundary())
const action = await loadAction(proc.action)
await executeProcess({ action })
log(await releaseLock())
deleteMonad(spaceId)

function log(changed: BraneStateChange[]) {
  const { monadId, oldState, newState, intention } = changed[0]!
  const msg = `${monadId}: ${oldState} → ${newState}${intention ? `, intention: ${intention}` : ""}`
  console.log(msg)
  out.innerText += msg + "\n"
}
