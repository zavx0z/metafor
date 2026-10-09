Object.assign(globalThis, {__fixtureEditorLoads: ((globalThis as {__fixtureEditorLoads?: number}).__fixtureEditorLoads ?? 0) + 1})
import {state} from "./shared.ts"

export function increment() {
  state.value += 1
  return state.value
}
