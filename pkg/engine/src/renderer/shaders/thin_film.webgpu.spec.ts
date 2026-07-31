import {beforeAll, describe, expect, test} from "bun:test"
import {setupDevice} from "fixture"
import thinFilmShaderCode from "./thin_film.wgsl"

describe("thin-film shader WebGPU pipeline", () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupDevice()
  })

  test("applies material opacity to highlights and reflection", () => {
    expect(thinFilmShaderCode).toContain(
      `opacity * (
            0.045 + fresnel * 0.955 +
            keyHighlight * 0.4 * highlightVisibility +
            keySheen * 0.035 * highlightVisibility +
            fillHighlight * 0.065 * highlightVisibility +
            reflectionBand * 0.035
        )`,
    )
  })

  test("compiles the one-pass transparent mesh pipeline", async () => {
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
    const module = device.createShaderModule({
      label: "thin-film shader validation",
      code: thinFilmShaderCode,
    })
    const pipeline = await device.createRenderPipelineAsync({
      label: "thin-film pipeline validation",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout],
      }),
      vertex: {
        module,
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
        module,
        entryPoint: "fs_main",
        targets: [{
          format: "rgba8unorm",
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
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: {count: 4},
    })

    expect(pipeline).toBeDefined()
  })
})
