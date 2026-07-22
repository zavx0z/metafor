import {describe, expect, test} from "bun:test"
import {resolveWeakModeFor} from "./device.ts"

const availableDevice = async (): Promise<GPUDevice> => ({} as GPUDevice)

describe("Weak backend policy", () => {
  test("GPU is the strict default when a WebGPU device is available", async () => {
    expect(await resolveWeakModeFor(undefined, availableDevice)).toBe("gpu")
  })

  test("CPU remains an explicit deterministic fallback", async () => {
    expect(await resolveWeakModeFor("cpu", async () => {
      throw new Error("CPU must not acquire a GPU device")
    })).toBe("cpu")
  })

  test("strict GPU mode uses WebGPU when it is available", async () => {
    expect(await resolveWeakModeFor("gpu", availableDevice)).toBe("gpu")
  })

  test("auto explicitly prefers an available WebGPU device", async () => {
    expect(await resolveWeakModeFor("auto", availableDevice)).toBe("gpu")
  })

  test("unknown values keep the strict GPU default instead of enabling fallback", async () => {
    expect(await resolveWeakModeFor("unexpected", availableDevice)).toBe("gpu")
  })
})
