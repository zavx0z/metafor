import.meta.hot.accept()
import { createMonad, updateBoundary, deleteMonad, releaseLock, type BraneStateChange } from "@boundary/monad"
import { executeProcess, loadAction } from "../force/weak/load"
import { loadDSL } from "../force/gravity/func/load"
import { type Node } from "@zavx0z/template"

const status = document.getElementById("status")!
status.innerText = "✅ WebGPU Active"
status.style.color = "#4af626"
const out = document.getElementById("output")!

// -------------------------------------------------------------
// const procs = space.processes
// const proc = procs[Object.keys(procs)[0] as keyof typeof procs]

// const spaceId = createMonad({ fields: {}, values: {}, superposition: space.superposition })
// log(await updateBoundary())

// const action = await loadAction(proc.action)
// await executeProcess({ action })

// log(await releaseLock())
// deleteMonad(spaceId)

function log(changed: BraneStateChange[]) {
  const { monadId, oldState, newState, intention, values } = changed[0]!
  const msg = `${monadId}: ${oldState} → ${newState}${intention ? `, intention: ${intention}` : ""}`
  console.log(msg)
  out.innerText += msg + "\n"
}

const HUB_DIRECTORY = "/github/"
const schema = await loadDSL(HUB_DIRECTORY + "zavx0z/git")

const hierarchy: Node[] = schema.bulk.gravity

console.log(hierarchy)

for (const [key, value] of Object.entries(hierarchy)) {
  switch (value.type) {
    case "map": {
      break
    }
    case "cond": {
      break
    }
    case "log": {
      break
    }
    case "meta": {
      break
    }
    default:
      break
  }
}
