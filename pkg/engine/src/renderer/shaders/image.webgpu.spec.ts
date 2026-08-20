import {beforeAll, describe, expect, test} from "bun:test"
import {setupDevice} from "fixture"
import imageShader from "./image.wgsl"
import externalImageShader from "./image_external.wgsl"

describe("image tint shader contract", () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupDevice()
  })

  test("multiplies sampled RGBA by the per-object tint in both image paths", () => {
    for (const shader of [imageShader, externalImageShader]) {
      expect(shader).toContain("color.rgb * perObject.color.rgb")
      expect(shader).toContain("color.a * perObject.color.a * opacity")
    }
  })

  test("keeps the tinted sampled-image pipeline compilable", async () => {
    const globalLayout = device.createBindGroupLayout({
      entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}],
    })
    const perObjectLayout = device.createBindGroupLayout({
      entries: [{binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: "uniform", hasDynamicOffset: true}}],
    })
    const imageLayout = device.createBindGroupLayout({
      entries: [
        {binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {type: "filtering"}},
        {binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: "float"}},
      ],
    })
    const module = device.createShaderModule({code: imageShader})
    const pipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({bindGroupLayouts: [globalLayout, perObjectLayout, imageLayout]}),
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 8, attributes: [{shaderLocation: 1, offset: 0, format: "float32x2"}]},
        ],
      },
      fragment: {module, entryPoint: "fs_main", targets: [{format: "rgba8unorm"}]},
      primitive: {topology: "triangle-list", cullMode: "none"},
    })
    expect(pipeline).toBeDefined()
  })
})
