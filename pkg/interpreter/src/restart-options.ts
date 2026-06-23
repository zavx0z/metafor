import type {InspectMode} from "./inspect-mode.ts"
import type {JsonObject} from "./types.ts"

export type RestartInspectOptions = {
  inspectMode: InspectMode
  pauseOnStart: boolean
}

export function restartInspectOptionsFromParams(params: JsonObject): RestartInspectOptions {
  const pauseOnStart = params["pauseOnStart"] === true
  return {
    inspectMode: pauseOnStart ? "brk" : "inspect",
    pauseOnStart,
  }
}
