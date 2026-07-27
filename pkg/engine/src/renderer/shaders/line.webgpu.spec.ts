import {beforeAll, describe, expect, test} from "bun:test"
import {setupDevice} from "fixture"
import lineShaderCode from "./line.wgsl"

const createProductionLinePipeline = async (
  device: GPUDevice,
  shaderCode: string,
): Promise<GPURenderPipeline> => {
  const globalBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {type: "uniform"},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {type: "uniform"},
      },
    ],
  })
  const perObjectBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {type: "uniform", hasDynamicOffset: true},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: {type: "uniform", hasDynamicOffset: true},
      },
    ],
  })
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout],
  })
  const shaderModule = device.createShaderModule({
    label: "line shader validation",
    code: shaderCode,
  })

  return await device.createRenderPipelineAsync({
    label: "line pipeline validation",
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 12,
          attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}],
        },
        {
          arrayStride: 12,
          attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format: "bgra8unorm",
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {topology: "line-list"},
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    },
    multisample: {count: 4},
  })
}

describe("line shader WebGPU pipeline", () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupDevice()
  })

  test("compiles the production vertex and fragment stages into a render pipeline", async () => {
    const pipeline = await createProductionLinePipeline(device, lineShaderCode)

    expect(pipeline).toBeDefined()
  })

  test("rejects the immutable-color regression that blanked the Bulk page", async () => {
    const regressedShaderCode = lineShaderCode.replace(
      "var finalColor =",
      "let finalColor =",
    )
    expect(regressedShaderCode).not.toBe(lineShaderCode)

    device.pushErrorScope("validation")
    let pipelineError: unknown
    try {
      await createProductionLinePipeline(device, regressedShaderCode)
    } catch (error) {
      pipelineError = error
    }
    const validationError = await device.popErrorScope()

    expect(String(pipelineError)).toContain("Invalid ShaderModule")
    expect(validationError?.message).toContain("cannot assign to 'let finalColor'")
  })
})
