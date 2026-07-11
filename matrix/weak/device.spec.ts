import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {GPU, resolveWeakMode} from "./device.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
const previousDevice = GPU._device

beforeEach(() => {
  delete Bun.env.METAFOR_WEAK_BACKEND
  GPU._device = null
})

afterEach(() => {
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
  GPU._device = previousDevice
})

describe("Weak backend policy", () => {
  test("auto is the default and prefers an available WebGPU device", async () => {
    GPU._device = {} as GPUDevice
    expect(await resolveWeakMode()).toBe("gpu")
  })

  test("CPU remains an explicit deterministic fallback", async () => {
    GPU._device = {} as GPUDevice
    Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    expect(await resolveWeakMode()).toBe("cpu")
  })

  test("strict GPU mode uses WebGPU when it is available", async () => {
    GPU._device = {} as GPUDevice
    Bun.env.METAFOR_WEAK_BACKEND = "gpu"
    expect(await resolveWeakMode()).toBe("gpu")
  })

  test("unknown values fall back to auto instead of silently forcing CPU", async () => {
    GPU._device = {} as GPUDevice
    Bun.env.METAFOR_WEAK_BACKEND = "unexpected"
    expect(await resolveWeakMode()).toBe("gpu")
  })
})
