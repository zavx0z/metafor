import {beforeAll, describe, expect, test} from "bun:test"
import {setupDevice} from "fixture"
import colorPickerShader from "./color_picker.wgsl"

describe("color picker shader WebGPU pipeline", () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupDevice()
  })

  test("keeps wheel and both sliders analytical and texture-free", () => {
    expect(colorPickerShader).toContain("atan2(point.y, point.x)")
    expect(colorPickerShader).toContain("clamp(1.0 - uv.y")
    expect(colorPickerShader).toContain("let checkerIndex = floor")
    expect(colorPickerShader).toContain("perObject.checkerPrimary")
    expect(colorPickerShader).toContain("perObject.checkerSecondary")
    expect(colorPickerShader).toContain("perObject.checkerParams.x")
    expect(colorPickerShader).not.toContain("0.32")
    expect(colorPickerShader).not.toContain("0.54")
    expect(colorPickerShader).not.toContain("0.004")
    expect(colorPickerShader.match(/@binding\(/g)).toHaveLength(2)
    expect(colorPickerShader).not.toContain("texture_2d")
    expect(colorPickerShader).not.toContain("textureSample")
    expect(colorPickerShader).not.toContain("sampler")
    expect(colorPickerShader).toContain("vec3<f32>(level)")
  })

  test("renders value as the same achromatic white-to-black strip for different hue and saturation", async () => {
    const first = await renderValueStrip(device, {hue: 0.1, saturation: 1})
    const second = await renderValueStrip(device, {hue: 0.8, saturation: 0.25})
    expect(first).toEqual(second)

    const top = pixel(first, 8, 4, 1)
    const middle = pixel(first, 8, 4, 4)
    const bottom = pixel(first, 8, 4, 6)
    expect(top[0]).toBeGreaterThan(200)
    expect(top[0]).toBe(top[1])
    expect(top[1]).toBe(top[2])
    expect(middle[0]).toBeGreaterThan(bottom[0])
    expect(middle[0]).toBe(middle[1])
    expect(middle[1]).toBe(middle[2])
    expect(bottom[0]).toBeLessThan(64)
    expect(bottom[0]).toBe(bottom[1])
    expect(bottom[1]).toBe(bottom[2])
  })

  test("compiles one bounded quad pipeline", async () => {
    const globalLayout = device.createBindGroupLayout({
      entries: [
        {binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}},
        {binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: "uniform"}},
      ],
    })
    const perObjectLayout = device.createBindGroupLayout({
      entries: [
        {binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: "uniform", hasDynamicOffset: true}},
        {binding: 1, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform", hasDynamicOffset: true}},
      ],
    })
    const module = device.createShaderModule({code: colorPickerShader})
    const pipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({bindGroupLayouts: [globalLayout, perObjectLayout]}),
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{
          format: "rgba8unorm",
          blend: {
            color: {srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add"},
            alpha: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"},
          },
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: {depthWriteEnabled: false, depthCompare: "less-equal", format: "depth24plus-stencil8"},
      multisample: {count: 4},
    })

    expect(pipeline).toBeDefined()
  })
})

async function renderValueStrip(
  device: GPUDevice,
  options: Readonly<{hue: number; saturation: number}>,
): Promise<Uint8Array> {
  const width = 8
  const height = 8
  const module = device.createShaderModule({code: colorPickerShader})
  const globalLayout = device.createBindGroupLayout({
    entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}],
  })
  const perObjectLayout = device.createBindGroupLayout({
    entries: [{binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: "uniform"}}],
  })
  const pipeline = await device.createRenderPipelineAsync({
    layout: device.createPipelineLayout({bindGroupLayouts: [globalLayout, perObjectLayout]}),
    vertex: {
      module,
      entryPoint: "vs_main",
      buffers: [
        {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
        {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
      ],
    },
    fragment: {module, entryPoint: "fs_main", targets: [{format: "rgba8unorm"}]},
    primitive: {topology: "triangle-list", cullMode: "none"},
  })
  const positions = new Float32Array([
    -1, -1, 0, 1, -1, 0, 1, 1, 0,
    -1, -1, 0, 1, 1, 0, -1, 1, 0,
  ])
  const normals = new Float32Array(positions.length)
  normals.fill(1)
  const positionBuffer = gpuBuffer(device, positions, GPUBufferUsage.VERTEX)
  const normalBuffer = gpuBuffer(device, normals, GPUBufferUsage.VERTEX)
  const globalData = new Float32Array(16)
  globalData[0] = globalData[5] = globalData[10] = globalData[15] = 1
  const globalBuffer = gpuBuffer(device, globalData, GPUBufferUsage.UNIFORM)
  const objectData = new Float32Array(64)
  objectData[0] = objectData[5] = objectData[10] = objectData[15] = 1
  objectData[16] = objectData[21] = objectData[26] = objectData[31] = 1
  objectData.set([options.hue, options.saturation, 0.4, 0.7], 32)
  objectData.set([2, 2, 1, 1], 36)
  const objectBuffer = gpuBuffer(device, objectData, GPUBufferUsage.UNIFORM)
  const globalBindGroup = device.createBindGroup({
    layout: globalLayout,
    entries: [{binding: 0, resource: {buffer: globalBuffer}}],
  })
  const objectBindGroup = device.createBindGroup({
    layout: perObjectLayout,
    entries: [{binding: 0, resource: {buffer: objectBuffer}}],
  })
  const texture = device.createTexture({
    size: {width, height},
    format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const bytesPerRow = 256
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: texture.createView(),
      clearValue: {r: 0, g: 0, b: 0, a: 0},
      loadOp: "clear",
      storeOp: "store",
    }],
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, globalBindGroup)
  pass.setBindGroup(1, objectBindGroup)
  pass.setVertexBuffer(0, positionBuffer)
  pass.setVertexBuffer(1, normalBuffer)
  pass.draw(6)
  pass.end()
  encoder.copyTextureToBuffer(
    {texture},
    {buffer: readback, bytesPerRow, rowsPerImage: height},
    {width, height},
  )
  device.queue.submit([encoder.finish()])
  await readback.mapAsync(GPUMapMode.READ)
  const padded = new Uint8Array(readback.getMappedRange())
  const result = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    result.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4)
  }
  readback.unmap()
  texture.destroy()
  positionBuffer.destroy()
  normalBuffer.destroy()
  globalBuffer.destroy()
  objectBuffer.destroy()
  readback.destroy()
  return result
}

function gpuBuffer(device: GPUDevice, data: Float32Array, usage: GPUBufferUsageFlags): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.ceil(data.byteLength / 4) * 4,
    usage: usage | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(buffer, 0, data)
  return buffer
}

function pixel(bytes: Uint8Array, width: number, x: number, y: number): readonly [number, number, number, number] {
  const offset = (y * width + x) * 4
  return [bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!]
}
