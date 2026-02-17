import { setupGlobals } from "bun-webgpu"

setupGlobals()

const adapter = await navigator.gpu.requestAdapter()
export const device = await adapter?.requestDevice()
