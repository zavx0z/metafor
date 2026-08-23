import {describe, expect, test} from "bun:test"
import {resolveWeakModeFor, watchGpuDeviceLoss} from "./device.ts"

const availableDevice = async (): Promise<GPUDevice> => ({} as GPUDevice)

describe("Weak backend policy", () => {
  test("auto is the default and prefers WebGPU when it is available", async () => {
    expect(await resolveWeakModeFor(undefined, availableDevice)).toBe("gpu")
  })

  test("auto default falls back to CPU when WebGPU is unavailable", async () => {
    expect(await resolveWeakModeFor(undefined, async () => null)).toBe("cpu")
  })

  test("CPU remains an explicit deterministic fallback", async () => {
    expect(await resolveWeakModeFor("cpu", async () => {
      throw new Error("CPU must not acquire a GPU device")
    })).toBe("cpu")
  })

  test("strict GPU mode uses WebGPU when it is available", async () => {
    expect(await resolveWeakModeFor("gpu", availableDevice)).toBe("gpu")
  })

  test("strict GPU mode fails when WebGPU is unavailable", async () => {
    await expect(resolveWeakModeFor("gpu", async () => null)).rejects.toThrow("GPU-устройство недоступно")
  })

  test("auto explicitly prefers an available WebGPU device", async () => {
    expect(await resolveWeakModeFor("auto", availableDevice)).toBe("gpu")
  })

  test("unknown values use the safe auto policy", async () => {
    expect(await resolveWeakModeFor("unexpected", async () => null)).toBe("cpu")
  })

  test("потеря устройства передаётся наблюдателю", async () => {
    let resolveLoss: ((info: GPUDeviceLostInfo) => void) | undefined
    const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
      resolveLoss = resolve
    })
    let observed: GPUDeviceLostInfo | null = null

    watchGpuDeviceLoss({lost}, (info) => {
      observed = info
    })
    resolveLoss?.({reason: "destroyed", message: "контрольная потеря"} as GPUDeviceLostInfo)
    await lost
    await Promise.resolve()

    expect(observed).toMatchObject({reason: "destroyed", message: "контрольная потеря"})
  })
})
