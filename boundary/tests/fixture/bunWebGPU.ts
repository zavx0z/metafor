import { setupGlobals } from "bun-webgpu"

setupGlobals()

/**
 * GPU device for bun-webgpu tests.
 * Initialized once and reused across all tests.
 */
let _device: GPUDevice | null = null

/**
 * Initializes GPU device for testing.
 * Must be called before any test that uses WebGPU.
 */
export async function setupDevice(): Promise<GPUDevice> {
  if (_device) return _device

  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported!")
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error("Failed to get GPU adapter!")
  }

  _device = await adapter.requestDevice()
  return _device
}

/**
 * Gets the initialized GPU device.
 * Throws if device is not initialized.
 */
export function getDevice(): GPUDevice {
  if (!_device) {
    throw new Error("Device not initialized. Call setupDevice() first.")
  }
  return _device
}
