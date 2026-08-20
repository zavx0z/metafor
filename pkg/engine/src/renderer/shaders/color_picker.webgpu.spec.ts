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
