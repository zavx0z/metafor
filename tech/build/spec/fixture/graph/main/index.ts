import {state} from "./shared.ts"

console.debug("build-example")
export const currentValue = () => state.value
export const openEditor = () => import("./editor.ts")
