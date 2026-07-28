import {beforeAll, describe, expect, test} from "bun:test"
import {setupDevice} from "fixture"
import {
  LINE_OVERLAY_BLEND_STATE,
  LINE_SCENE_BLEND_STATE,
  LINE_SCENE_DEPTH_STATE,
  LINE_SILHOUETTE_DEPTH_STATE,
} from "../line-pipeline"
import type {LineVisibilityMode} from "../../materials/LineGlowMaterial"
import lineShaderCode from "./line.wgsl"

type ProductionLinePipeline = Readonly<{
  pipeline: GPURenderPipeline
  globalBindGroupLayout: GPUBindGroupLayout
  perObjectBindGroupLayout: GPUBindGroupLayout
}>

const createProductionLinePipeline = async (
  device: GPUDevice,
  shaderCode: string,
  visibilityMode: LineVisibilityMode = "scene",
  format: GPUTextureFormat = "bgra8unorm",
): Promise<ProductionLinePipeline> => {
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

  const descriptor: GPURenderPipelineDescriptor = {
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
          format,
          blend: visibilityMode === "overlay"
            ? LINE_OVERLAY_BLEND_STATE
            : LINE_SCENE_BLEND_STATE,
        },
      ],
    },
    primitive: {topology: "line-list"},
    multisample: {count: visibilityMode === "overlay" ? 1 : 4},
  }
  if (visibilityMode === "scene") descriptor.depthStencil = LINE_SCENE_DEPTH_STATE
  if (visibilityMode === "silhouette") {
    descriptor.depthStencil = LINE_SILHOUETTE_DEPTH_STATE
  }
  const pipeline = await device.createRenderPipelineAsync(descriptor)

  return {pipeline, globalBindGroupLayout, perObjectBindGroupLayout}
}

const identityMatrix = (): Float32Array => {
  const result = new Float32Array(16)
  result[0] = 1
  result[5] = 1
  result[10] = 1
  result[15] = 1
  return result
}

const createUniformBuffer = (
  device: GPUDevice,
  data: Float32Array,
  minimumSize = data.byteLength,
): GPUBuffer => {
  const buffer = device.createBuffer({
    size: Math.max(minimumSize, data.byteLength),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(buffer, 0, data)
  return buffer
}

type TestLineMaterial = Readonly<{
  color: readonly [number, number, number, number]
  glowColor: readonly [number, number, number, number]
  glowIntensity: number
  luminanceBoost: number
  shimmerAmount: number
  silhouetteAmount: number
  visualScale: number
}>

const createLineBindings = (
  device: GPUDevice,
  pipeline: ProductionLinePipeline,
  material: TestLineMaterial,
): Readonly<{
  global: GPUBindGroup
  perObject: GPUBindGroup
}> => {
  const scene = new Float32Array(72)
  scene.set(identityMatrix(), 0)
  scene.set(identityMatrix(), 16)
  scene[70] = 4

  const perObject = new Float32Array(64)
  perObject.set(identityMatrix(), 0)
  perObject.set(material.color, 16)
  perObject[20] = material.glowIntensity
  perObject[21] = material.luminanceBoost
  perObject[22] = Math.PI
  perObject[23] = material.shimmerAmount
  perObject.set(material.glowColor, 24)
  perObject[28] = material.visualScale
  perObject[29] = material.silhouetteAmount

  const globalBuffer = createUniformBuffer(device, identityMatrix())
  const sceneBuffer = createUniformBuffer(device, scene)
  const perObjectBuffer = createUniformBuffer(device, perObject, 256)
  const unusedBoneBuffer = createUniformBuffer(device, new Float32Array(64), 256)

  return {
    global: device.createBindGroup({
      layout: pipeline.globalBindGroupLayout,
      entries: [
        {binding: 0, resource: {buffer: globalBuffer}},
        {binding: 1, resource: {buffer: sceneBuffer}},
      ],
    }),
    perObject: device.createBindGroup({
      layout: pipeline.perObjectBindGroupLayout,
      entries: [
        {binding: 0, resource: {buffer: perObjectBuffer, size: 256}},
        {binding: 1, resource: {buffer: unusedBoneBuffer, size: 256}},
      ],
    }),
  }
}

const renderMarkerLevel = async (
  device: GPUDevice,
  markerVisibility: LineVisibilityMode,
  marker: TestLineMaterial | null,
): Promise<Readonly<{
  brightness: number
  redAccentPixelCount: number
  rgb: readonly [number, number, number]
  totalBrightness: number
}>> => {
  const format: GPUTextureFormat = "rgba8unorm"
  const scenePipeline = await createProductionLinePipeline(
    device,
    lineShaderCode,
    "scene",
    format,
  )
  const markerPipeline = markerVisibility === "scene"
    ? scenePipeline
    : await createProductionLinePipeline(
      device,
      lineShaderCode,
      markerVisibility,
      format,
    )
  const sceneBindings = createLineBindings(
    device,
    scenePipeline,
    {
      color: [0.035, 0.05, 0.075, 1],
      glowColor: [0, 0, 0, 0],
      glowIntensity: 1,
      luminanceBoost: 1,
      shimmerAmount: 0,
      silhouetteAmount: 0,
      visualScale: 1,
    },
  )
  const markerBindings = marker
    ? createLineBindings(device, markerPipeline, marker)
    : null

  const createVertexBuffer = (z: number): GPUBuffer => {
    const buffer = device.createBuffer({
      size: 24,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(
      buffer,
      0,
      new Float32Array([-1, 0, z, 1, 0, z]),
    )
    return buffer
  }
  const scenePositions = createVertexBuffer(0.2)
  const markerPositions = createVertexBuffer(
    markerVisibility === "overlay" ? 0.8 : 0.1,
  )
  const colors = device.createBuffer({
    size: 24,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(colors, 0, new Float32Array([1, 1, 1, 1, 1, 1]))

  const resolvedTexture = device.createTexture({
    size: [16, 16],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  })
  const multisampleTexture = device.createTexture({
    size: [16, 16],
    sampleCount: 4,
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const depthTexture = device.createTexture({
    size: [16, 16],
    sampleCount: 4,
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const readback = device.createBuffer({
    size: 256 * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: multisampleTexture.createView(),
      resolveTarget: resolvedTexture.createView(),
      loadOp: "clear",
      storeOp: "discard",
      clearValue: [0, 0, 0, 1],
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "discard",
      stencilClearValue: 0,
      stencilLoadOp: "clear",
      stencilStoreOp: "discard",
    },
  })
  pass.setPipeline(scenePipeline.pipeline)
  pass.setBindGroup(0, sceneBindings.global)
  pass.setBindGroup(1, sceneBindings.perObject, [0, 0])
  pass.setVertexBuffer(0, scenePositions)
  pass.setVertexBuffer(1, colors)
  pass.draw(2)

  if (markerVisibility !== "overlay" && markerBindings) {
    pass.setPipeline(markerPipeline.pipeline)
    pass.setBindGroup(0, markerBindings.global)
    pass.setBindGroup(1, markerBindings.perObject, [0, 0])
    pass.setVertexBuffer(0, markerPositions)
    pass.draw(2)
  }
  pass.end()

  if (markerVisibility === "overlay" && markerBindings) {
    const overlayPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: resolvedTexture.createView(),
        loadOp: "load",
        storeOp: "store",
      }],
    })
    overlayPass.setPipeline(markerPipeline.pipeline)
    overlayPass.setBindGroup(0, markerBindings.global)
    overlayPass.setBindGroup(1, markerBindings.perObject, [0, 0])
    overlayPass.setVertexBuffer(0, markerPositions)
    overlayPass.setVertexBuffer(1, colors)
    overlayPass.draw(2)
    overlayPass.end()
  }

  encoder.copyTextureToBuffer(
    {texture: resolvedTexture},
    {buffer: readback, bytesPerRow: 256, rowsPerImage: 16},
    [16, 16],
  )
  device.queue.submit([encoder.finish()])
  await readback.mapAsync(GPUMapMode.READ)
  const pixels = new Uint8Array(readback.getMappedRange())
  let brightest = 0
  let brightestRgb: readonly [number, number, number] = [0, 0, 0]
  let redAccentPixelCount = 0
  let totalBrightness = 0
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const offset = y * 256 + x * 4
      const red = pixels[offset]!
      const green = pixels[offset + 1]!
      const blue = pixels[offset + 2]!
      const brightness = red + green + blue
      totalBrightness += brightness
      if (red > 80 && red > green * 1.5) redAccentPixelCount += 1
      if (brightness <= brightest) continue
      brightest = brightness
      brightestRgb = [red, green, blue]
    }
  }
  readback.unmap()
  return {
    brightness: brightest,
    redAccentPixelCount,
    rgb: brightestRgb,
    totalBrightness,
  }
}

describe("line shader WebGPU pipeline", () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupDevice()
  })

  test("compiles the production vertex and fragment stages into a render pipeline", async () => {
    const {pipeline} = await createProductionLinePipeline(device, lineShaderCode)
    const {pipeline: silhouettePipeline} = await createProductionLinePipeline(
      device,
      lineShaderCode,
      "silhouette",
    )

    expect(pipeline).toBeDefined()
    expect(silhouettePipeline).toBeDefined()
    expect(LINE_SILHOUETTE_DEPTH_STATE.depthWriteEnabled).toBe(false)
  })

  test("renders the bounded current > potential > inactive > background hierarchy", async () => {
    const current: TestLineMaterial = {
      color: [0.712, 0.8848, 1, 1],
      glowColor: [0.904, 0.9616, 1, 0.9],
      glowIntensity: 4.8,
      luminanceBoost: 1.45,
      shimmerAmount: 0.13,
      silhouetteAmount: 0,
      visualScale: 1,
    }
    const potential: TestLineMaterial = {
      color: [0.424, 0.7696, 1, 0.5],
      glowColor: [0.584, 0.8336, 1, 0.4],
      glowIntensity: 2.4,
      luminanceBoost: 1.1,
      shimmerAmount: 0.065,
      silhouetteAmount: 0,
      visualScale: 1,
    }
    const inactive: TestLineMaterial = {
      color: [0.2, 0.68, 1, 0.14],
      glowColor: [0.2, 0.68, 1, 0.04],
      glowIntensity: 0.3,
      luminanceBoost: 1.05,
      shimmerAmount: 0,
      silhouetteAmount: 0,
      visualScale: 1,
    }

    const backgroundBrightness = await renderMarkerLevel(device, "scene", null)
    const inactiveBrightness = await renderMarkerLevel(device, "overlay", inactive)
    const potentialBrightness = await renderMarkerLevel(device, "overlay", potential)
    const currentBrightness = await renderMarkerLevel(device, "scene", current)

    expect(currentBrightness.brightness).toBeGreaterThan(
      potentialBrightness.brightness,
    )
    expect(currentBrightness.brightness).toBeLessThan(500)
    expect(potentialBrightness.brightness).toBeGreaterThan(250)
    expect(potentialBrightness.brightness).toBeGreaterThan(
      inactiveBrightness.brightness * 2,
    )
    expect(inactiveBrightness.brightness).toBeGreaterThan(
      backgroundBrightness.brightness + 30,
    )
  })

  test("keeps the torus body sparse while retaining a readable energy-bubble rim", async () => {
    const material: TestLineMaterial = {
      color: [0.2, 0.68, 1, 0.22],
      glowColor: [0.2, 0.68, 1, 0.08],
      glowIntensity: 0.95,
      luminanceBoost: 1,
      shimmerAmount: 0,
      silhouetteAmount: 0,
      visualScale: 1,
    }
    const background = await renderMarkerLevel(device, "scene", null)
    const opaque = await renderMarkerLevel(device, "scene", material)
    const bubble = await renderMarkerLevel(device, "silhouette", {
      ...material,
      silhouetteAmount: 1,
    })

    expect(bubble.brightness).toBeGreaterThan(background.brightness)
    expect(bubble.totalBrightness).toBeGreaterThan(background.totalBrightness)
    expect(bubble.totalBrightness).toBeLessThan(opaque.totalBrightness)
    expect(LINE_SILHOUETTE_DEPTH_STATE.depthWriteEnabled).toBe(false)
  })

  test("renders a semantic Field nucleus at unit visual scale in scene depth", async () => {
    const fieldMaterial: TestLineMaterial = {
      color: [0, 0.9, 1, 1],
      glowColor: [0.7, 0.97, 1, 0.1],
      glowIntensity: 0.8,
      luminanceBoost: 1,
      shimmerAmount: 0,
      silhouetteAmount: 0,
      visualScale: 1,
    }
    const field = await renderMarkerLevel(device, "scene", fieldMaterial)
    const shrunkenField = await renderMarkerLevel(device, "scene", {
      ...fieldMaterial,
      visualScale: 0.38,
    })

    expect(field.rgb[1]).toBeGreaterThan(field.rgb[0])
    expect(field.rgb[2]).toBeGreaterThan(field.rgb[0])
    expect(field.brightness).toBeLessThan(600)
    expect(field.totalBrightness).toBeGreaterThan(
      shrunkenField.totalBrightness,
    )
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
