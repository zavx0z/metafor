import {state} from "./shared.ts"

export function increment() {
  state.value += 1
  return state.value
}
