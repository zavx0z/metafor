import {Space} from "../scenes/Space"
import {ViewPoint} from "../core/ViewPoint"
import {Mesh} from "../core/Mesh"
import {InstancedMesh} from "../core/InstancedMesh"
import {SkinnedMesh} from "../core/SkinnedMesh"
import {BufferGeometry} from "../core/BufferGeometry"
import {WireframeInstancedMesh} from "../core/WireframeInstancedMesh"
import {ColorPickerMaterial, HolographicMaterial, ImageMaterial, LineBasicMaterial, LineGlowMaterial, MeshBasicMaterial, MeshLambertMaterial, RadialBackdropMaterial, RoundedRectMaterial, TextMaterial, ThinFilmMaterial} from "../materials"
import {Matrix4, Vector3, Frustum} from "../math"
import {LineSegments} from "../objects/LineSegments"
import {Text} from "../objects/Text"
import {Object3D} from "../core/Object3D"
import meshBasicWGSL from "./shaders/mesh_basic.wgsl"
import thinFilmWGSL from "./shaders/thin_film.wgsl"
import holographicWGSL from "./shaders/holographic.wgsl"
import meshStaticWGSL from "./shaders/mesh_static.wgsl"
import meshSkinnedWGSL from "./shaders/mesh_skinned.wgsl"
import meshInstancedWGSL from "./shaders/mesh_instanced.wgsl"

import lineShaderCode from "./shaders/line.wgsl"
import textShaderCode from "./shaders/text.wgsl"
import imageShaderCode from "./shaders/image.wgsl"
import imageExternalShaderCode from "./shaders/image_external.wgsl"
import roundedShaderCode from "./shaders/rounded.wgsl"
import radialBackdropShaderCode from "./shaders/radial_backdrop.ts"
import colorPickerShaderCode from "./shaders/color_picker.wgsl"
import {TEXT_COVER_FACE_STATE, TEXT_STENCIL_BACK_FACE_STATE, TEXT_STENCIL_FACE_STATE} from "./text-stencil"
import {
  LINE_OVERLAY_BLEND_STATE,
  LINE_SCENE_BLEND_STATE,
  LINE_SCENE_DEPTH_STATE,
  LINE_SILHOUETTE_DEPTH_STATE,
} from "./line-pipeline"
import {collectSpaceObjects, type LightItem, type RenderItem} from "./utils/RenderList"
import {GlassMaterial} from "../materials/GlassMaterial"
import {TextureLoader} from "../loaders/TextureLoader"
import {
  alignedGpuFrameBytesPerRow,
  encodeRgbaFramePng,
  isCapturableGpuFrameFormat,
  unpackGpuFrameRgba,
} from "./frame-readback"
import {createSceneUniformLayout} from "./scene-uniform-layout"
import {
  BONE_MATRICES_SIZE,
  MAX_BONES,
  PER_OBJECT_UNIFORM_SIZE,
  planPerObjectUploads,
  populateBoneMatrixBlock,
  type PerObjectUploadPlan,
} from "./per-object-upload"

if (import.meta.hot) {
  (import.meta.hot.accept as unknown as (dependencies: string[], callback: () => void) => void)([
    "./shaders/mesh_basic.wgsl",
    "./shaders/thin_film.wgsl",
    "./shaders/holographic.wgsl",
    "./shaders/mesh_static.wgsl",
    "./shaders/mesh_skinned.wgsl",
    "./shaders/mesh_instanced.wgsl",
    "./shaders/line.wgsl",
    "./shaders/text.wgsl",
    "./shaders/image.wgsl",
    "./shaders/image_external.wgsl",
    "./shaders/rounded.wgsl",
    "./shaders/color_picker.wgsl",
  ], () => {
    if (typeof location !== "undefined") location.reload()
  })
}

// --- Константы для uniform-буферов ---
const INITIAL_RENDERABLE_CAPACITY = 512
const MAX_LIGHTS = 4 // Максимальное количество источников света
const WEBGPU_INIT_TIMEOUT_MS = 15000

const LIGHT_STRUCT_SIZE = 32
const SCENE_UNIFORM_LAYOUT = createSceneUniformLayout(MAX_LIGHTS, LIGHT_STRUCT_SIZE)
const SCENE_UNIFORMS_SIZE = SCENE_UNIFORM_LAYOUT.byteSize

// --- Вспомогательные интерфейсы ---
interface GeometryBuffers {
  positionBuffer: GPUBuffer
  normalBuffer?: GPUBuffer
  uvBuffer?: GPUBuffer
  indexBuffer?: GPUBuffer
  colorBuffer?: GPUBuffer
  skinIndexBuffer?: GPUBuffer
  skinWeightBuffer?: GPUBuffer
  instanceMatrixBuffer?: GPUBuffer // для инстансированных мешей
  instanceBuffer?: GPUBuffer // для WireframeInstancedMesh (матрица + параметры материала)
}

interface PreparedRenderLayer {
  background: GPUColor | undefined
  glassObjects: RenderItem[]
  regularObjects: RenderItem[]
  overlayLines: RenderItem[]
  uiObjects: RenderItem[]
}

function hasDirectRenderItems(layer: PreparedRenderLayer): boolean {
  return layer.regularObjects.length > 0 || layer.glassObjects.length > 0 || layer.uiObjects.length > 0
}

export type RenderOverlay = Object3D & {
  updateForViewPoint?(viewPoint: ViewPoint): void
}

/**
 * Рендерер, использующий **WebGPU API** для отрисовки сцены.
 *
 * Основные особенности:
 * * Полная поддержка **WebGPU** (не поддерживает WebGL).
 * * Работает в пространстве отсечения с глубиной **[0, 1]**.
 * * Автоматически управляет буферами uniform-ов и пайплайнами.
 */
export class Renderer {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private presentationFormat: GPUTextureFormat | null = null
  private basicMeshPipeline: GPURenderPipeline | null = null
  private thinFilmMeshPipeline: GPURenderPipeline | null = null
  private holographicMeshPipeline: GPURenderPipeline | null = null
  private staticMeshPipeline: GPURenderPipeline | null = null
  private instancedMeshPipeline: GPURenderPipeline | null = null
  private skinnedMeshPipeline: GPURenderPipeline | null = null
  private linePipeline: GPURenderPipeline | null = null
  private lineOverlayPipeline: GPURenderPipeline | null = null
  private lineSilhouettePipeline: GPURenderPipeline | null = null
  private instancedLinePipeline: GPURenderPipeline | null = null
  private textStencilPipeline: GPURenderPipeline | null = null
  private textCoverPipeline: GPURenderPipeline | null = null
  private textDepthCoverPipeline: GPURenderPipeline | null = null
  private imagePipeline: GPURenderPipeline | null = null
  private externalImagePipeline: GPURenderPipeline | null = null
  private roundedPipeline: GPURenderPipeline | null = null
  private uiBasicMeshPipeline: GPURenderPipeline | null = null
  private uiImagePipeline: GPURenderPipeline | null = null
  private uiExternalImagePipeline: GPURenderPipeline | null = null
  private uiRoundedPipeline: GPURenderPipeline | null = null
  private radialBackdropPipeline: GPURenderPipeline | null = null
  private uiRadialBackdropPipeline: GPURenderPipeline | null = null
  private colorPickerPipeline: GPURenderPipeline | null = null
  private uiColorPickerPipeline: GPURenderPipeline | null = null
  private imageBindGroupLayout: GPUBindGroupLayout | null = null
  private externalImageBindGroupLayout: GPUBindGroupLayout | null = null
  private imageSampler: GPUSampler | null = null
  private imageBindGroupCache: WeakMap<GPUTexture, GPUBindGroup> = new WeakMap()

  // --- Глобальные ресурсы ---
  private globalUniformBuffer: GPUBuffer | null = null
  private sceneUniformBuffer: GPUBuffer | null = null // Для освещения
  private globalBindGroup: GPUBindGroup | null = null

  // --- Ресурсы для каждого объекта ---
  private perObjectUniformBuffer: GPUBuffer | null = null
  private boneMatricesBuffer: GPUBuffer | null = null
  private perObjectBindGroupLayout: GPUBindGroupLayout | null = null
  private perObjectBindGroup: GPUBindGroup | null = null
  private perObjectDataCPU: Float32Array | null = null
  private boneMatricesDataCPU: Float32Array | null = null
  private perObjectCapacity = INITIAL_RENDERABLE_CAPACITY

  private geometryCache: Map<BufferGeometry, GeometryBuffers> = new Map()
  private depthTexture: GPUTexture | null = null
  private depthTextureView: GPUTextureView | null = null
  private multisampleTexture: GPUTexture | null = null
  private multisampleTextureView: GPUTextureView | null = null
  private presentedFrameTexture: GPUTexture | null = null
  private hasPresentedFrame = false
  private sampleCount = 4 // MSAA
  public pixelRatio = 1
  private frustum: Frustum = new Frustum()
  public canvas: HTMLCanvasElement | null = null
  private readonly viewProjectionMatrix = new Matrix4()
  private readonly sceneUniformData = new ArrayBuffer(SCENE_UNIFORMS_SIZE)
  private readonly sceneUniformFloats = new Float32Array(this.sceneUniformData)
  private readonly sceneUniformUints = new Uint32Array(this.sceneUniformData)
  private readonly sceneViewNormalMatrix = new Matrix4()
  private readonly sceneCameraPosition = new Vector3()
  private readonly sceneWorldLightPosition = new Vector3()
  private readonly meshNormalMatrix = new Matrix4()
  private readonly skinnedMeshWorldInverse = new Matrix4()
  private readonly skinnedBoneMatrix = new Matrix4()
  private readonly backgroundClearColor: GPUColorDict = {r: 0, g: 0, b: 0, a: 0}

  /**
   * Инициализирует WebGPU устройство и контекст.
   *
   * @throws Error Если браузер не поддерживает WebGPU или не удалось получить адаптер.
   */
  public async init(canvas?: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) throw new Error("WebGPU не поддерживается браузером.")

    const adapter = await withWebGpuInitTimeout(navigator.gpu.requestAdapter(), "WebGPU adapter")
    if (!adapter) throw new Error("Не удалось получить WebGPU адаптер.")

    this.device = await withWebGpuInitTimeout(adapter.requestDevice(), "WebGPU device")

    this.canvas = canvas || document.createElement("canvas")
    this.context = this.canvas.getContext("webgpu")
    if (!this.context) throw new Error("Не удалось получить WebGPU контекст.")

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat()
    this.configureCanvasContext()

    await this.setupPipelines()
  }

  private configureCanvasContext(): void {
    if (!this.device || !this.context || !this.presentationFormat) return
    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC
    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
      usage,
    })
  }

  private async setupPipelines(): Promise<void> {
    if (!this.device || !this.presentationFormat) return

    this.globalUniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.sceneUniformBuffer = this.device.createBuffer({
      size: SCENE_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const globalBindGroupLayout = this.device.createBindGroupLayout({
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

    this.globalBindGroup = this.device.createBindGroup({
      layout: globalBindGroupLayout,
      entries: [
        {binding: 0, resource: {buffer: this.globalUniformBuffer}},
        {binding: 1, resource: {buffer: this.sceneUniformBuffer}},
      ],
    })

    const perObjectBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {type: "uniform", hasDynamicOffset: true},
        },
        {
          binding: 1, // for skinning
          visibility: GPUShaderStage.VERTEX,
          buffer: {type: "uniform", hasDynamicOffset: true},
        },
      ],
    })
    this.perObjectBindGroupLayout = perObjectBindGroupLayout

    this.createPerObjectResources(INITIAL_RENDERABLE_CAPACITY)

    this.imageBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
      ],
    })
    this.externalImageBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          externalTexture: {},
        },
      ],
    })

    this.imageSampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout],
    })

    const imagePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout, this.imageBindGroupLayout],
    })
    const externalImagePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout, this.externalImageBindGroupLayout],
    })
    const depthStencil: GPUDepthStencilState = {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    }
    const uiDepthStencil: GPUDepthStencilState = {
      depthWriteEnabled: false,
      depthCompare: "less-equal",
      format: "depth24plus-stencil8",
    }

    // --- Shader Modules ---
    const basicShaderModule = this.device.createShaderModule({
      code: meshBasicWGSL,
    })
    const thinFilmShaderModule = this.device.createShaderModule({
      code: thinFilmWGSL,
    })
    const holographicShaderModule = this.device.createShaderModule({
      code: holographicWGSL,
    })
    const staticShaderModule = this.device.createShaderModule({
      code: meshStaticWGSL,
    })
    const instancedShaderModule = this.device.createShaderModule({
      code: meshInstancedWGSL,
    })
    const skinnedShaderModule = this.device.createShaderModule({
      code: meshSkinnedWGSL,
    })
    const lineShaderModule = this.device.createShaderModule({
      code: lineShaderCode,
    })
    const textShaderModule = this.device.createShaderModule({
      code: textShaderCode,
    })
    const imageShaderModule = this.device.createShaderModule({
      code: imageShaderCode,
    })
    const imageExternalShaderModule = this.device.createShaderModule({
      code: imageExternalShaderCode,
    })
    const roundedShaderModule = this.device.createShaderModule({
      code: roundedShaderCode,
    })
    const radialBackdropShaderModule = this.device.createShaderModule({
      label: "radialBackdropShader",
      code: radialBackdropShaderCode,
    })
    const colorPickerShaderModule = this.device.createShaderModule({
      label: "colorPickerShader",
      code: colorPickerShaderCode,
    })

    // --- Pipeline для MeshBasicMaterial: без освещения, цвет как задан в material.color ---
    this.basicMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: basicShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: basicShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.thinFilmMeshPipeline = await this.device.createRenderPipelineAsync({
      label: "ThinFilmMaterial",
      layout: pipelineLayout,
      vertex: {
        module: thinFilmShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: thinFilmShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      multisample: {count: this.sampleCount},
    })

    this.holographicMeshPipeline = await this.device.createRenderPipelineAsync({
      label: "HolographicMaterial",
      layout: pipelineLayout,
      vertex: {
        module: holographicShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: holographicShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one",
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
      multisample: {count: this.sampleCount},
    })

    this.uiBasicMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: basicShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: basicShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    this.imagePipeline = await this.device.createRenderPipelineAsync({
      layout: imagePipelineLayout,
      vertex: {
        module: imageShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 8, attributes: [{shaderLocation: 1, offset: 0, format: "float32x2"}]},
        ],
      },
      fragment: {
        module: imageShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.externalImagePipeline = await this.device.createRenderPipelineAsync({
      layout: externalImagePipelineLayout,
      vertex: {
        module: imageExternalShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 8, attributes: [{shaderLocation: 1, offset: 0, format: "float32x2"}]},
        ],
      },
      fragment: {
        module: imageExternalShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.uiImagePipeline = await this.device.createRenderPipelineAsync({
      layout: imagePipelineLayout,
      vertex: {
        module: imageShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 8, attributes: [{shaderLocation: 1, offset: 0, format: "float32x2"}]},
        ],
      },
      fragment: {
        module: imageShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    this.uiExternalImagePipeline = await this.device.createRenderPipelineAsync({
      layout: externalImagePipelineLayout,
      vertex: {
        module: imageExternalShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 8, attributes: [{shaderLocation: 1, offset: 0, format: "float32x2"}]},
        ],
      },
      fragment: {
        module: imageExternalShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    // --- Pipeline для RoundedRectMaterial: SDF rounded box + alpha-blend ---
    // Layout = базовый perObject (без image-текстур) → используем pipelineLayout.
    // Vertex buffer 0 = position (float32x3), buffer 1 = normal (float32x3) —
    // тот же layout что и basicMesh, чтобы PlaneGeometry рендерилась без
    // изменений buffer setup.
    this.roundedPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: roundedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: roundedShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.uiRoundedPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: roundedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: roundedShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    this.colorPickerPipeline = await this.device.createRenderPipelineAsync({
      label: "ColorPickerMaterial",
      layout: pipelineLayout,
      vertex: {
        module: colorPickerShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: colorPickerShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: {srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add"},
            alpha: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"},
          },
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.uiColorPickerPipeline = await this.device.createRenderPipelineAsync({
      label: "ColorPickerMaterial.ui",
      layout: pipelineLayout,
      vertex: {
        module: colorPickerShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: colorPickerShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: {srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add"},
            alpha: {srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add"},
          },
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    this.radialBackdropPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: radialBackdropShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: radialBackdropShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil,
      multisample: {count: this.sampleCount},
    })

    this.uiRadialBackdropPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: radialBackdropShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: radialBackdropShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: uiDepthStencil,
      multisample: {count: this.sampleCount},
    })

    // --- Pipeline для Static Meshes с освещением ---
    this.staticMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: staticShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          // normal
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
        ],
      },
      fragment: {
        module: staticShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
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
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: {count: this.sampleCount},
    })

    // --- Pipeline для Instanced Meshes ---
    this.instancedMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: instancedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          // normal
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
          // instance matrix (4 vec4)
          {
            arrayStride: 64,
            stepMode: "instance",
            attributes: [
              {shaderLocation: 2, offset: 0, format: "float32x4"},
              {shaderLocation: 3, offset: 16, format: "float32x4"},
              {shaderLocation: 4, offset: 32, format: "float32x4"},
              {shaderLocation: 5, offset: 48, format: "float32x4"},
            ],
          },
        ],
      },
      fragment: {
        module: instancedShaderModule,
        entryPoint: "fs_main",
        targets: [{format: this.presentationFormat}],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: {count: this.sampleCount},
    })

    // --- Pipeline для Skinned Meshes ---
    this.skinnedMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: skinnedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          // normal
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
          // skinIndex
          {arrayStride: 8, attributes: [{shaderLocation: 2, offset: 0, format: "uint16x4"}]},
          // skinWeight
          {arrayStride: 16, attributes: [{shaderLocation: 3, offset: 0, format: "float32x4"}]},
        ],
      },
      fragment: {
        module: skinnedShaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add"
            }
          }
        }],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: {count: this.sampleCount},
    })

    // --- Pipelines для Lines ---
    const linePresentationFormat = this.presentationFormat
    const createLinePipeline = (
      label: string,
      blend: GPUBlendState,
      sampleCount: number,
      depthStencil?: GPUDepthStencilState,
    ): Promise<GPURenderPipeline> => {
      const descriptor: GPURenderPipelineDescriptor = {
        label,
        layout: pipelineLayout,
        vertex: {
          module: lineShaderModule,
          entryPoint: "vs_main",
          buffers: [
            {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
            {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
          ],
        },
        fragment: {
          module: lineShaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format: linePresentationFormat,
              blend,
            },
          ],
        },
        primitive: {topology: "line-list"},
        multisample: {count: sampleCount},
      }
      if (depthStencil) descriptor.depthStencil = depthStencil
      return this.device!.createRenderPipelineAsync(descriptor)
    }
    this.linePipeline = await createLinePipeline(
      "scene line pipeline",
      LINE_SCENE_BLEND_STATE,
      this.sampleCount,
      LINE_SCENE_DEPTH_STATE,
    )
    this.lineOverlayPipeline = await createLinePipeline(
      "overlay line pipeline",
      LINE_OVERLAY_BLEND_STATE,
      1,
    )
    this.lineSilhouettePipeline = await createLinePipeline(
      "silhouette line pipeline",
      LINE_SCENE_BLEND_STATE,
      this.sampleCount,
      LINE_SILHOUETTE_DEPTH_STATE,
    )

    // --- Pipeline для Instanced Lines ---
    const lineInstancedWGSL = `
struct GlobalUniforms { viewProjectionMatrix: mat4x4<f32> };
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct Light {
  position: vec4<f32>,
  color: vec4<f32>,
};
struct SceneUniforms {
    viewMatrix: mat4x4<f32>,
    viewNormalMatrix: mat4x4<f32>,
    numLights: u32,
    lights: array<Light, 4>,
    cameraPosition: vec3<f32>,
    padding: f32,
};
@binding(1) @group(0) var<uniform> sceneUniforms: SceneUniforms;

struct PerObjectUniforms {
  modelMatrix: mat4x4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) vertexColor: vec4<f32>,
  @location(2) instanceColor: vec4<f32>,
  @location(3) glowIntensity: f32,
  @location(4) glowColor: vec4<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) color: vec3<f32>,
    @location(2) instanceMatrix0: vec4<f32>,
    @location(3) instanceMatrix1: vec4<f32>,
    @location(4) instanceMatrix2: vec4<f32>,
    @location(5) instanceMatrix3: vec4<f32>,
    @location(6) instanceColor: vec4<f32>,
    @location(7) glowIntensity: f32,
    @location(8) glowColor: vec4<f32>
) -> VertexOutput {
  var out: VertexOutput;
  // Собираем матрицу инстанса из 4 векторов
  let instanceMatrix = mat4x4<f32>(
      instanceMatrix0,
      instanceMatrix1,
      instanceMatrix2,
      instanceMatrix3
  );
  // Комбинируем матрицу объекта и матрицу инстанса
  let worldMatrix = perObject.modelMatrix * instanceMatrix;
  let worldPos = (worldMatrix * vec4<f32>(pos, 1.0)).xyz;
  out.position = globalUniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
  out.worldPosition = worldPos;
  out.vertexColor = vec4<f32>(color, 1.0);
  out.instanceColor = instanceColor;
  out.glowIntensity = glowIntensity;
  out.glowColor = glowColor;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let distanceMm = distance(in.worldPosition, sceneUniforms.cameraPosition);
  let fadeDistanceMm = 5000.0;
  let normalizedDistance = distanceMm / fadeDistanceMm;

  // Базовое затухание для обычных линий
  let baseFade = exp(-0.5 * normalizedDistance);

  // Эффект свечения: затухание намного медленнее
  let glowFade = exp(-0.5 * normalizedDistance / in.glowIntensity);

  // Смешиваем базовое затухание и свечение в зависимости от интенсивности
  let finalFade = mix(baseFade, glowFade, min(in.glowIntensity * 0.5, 1.0));

    // Используем цвет инстанса
    var finalColor = in.vertexColor.rgb * in.instanceColor.rgb;
    
    // Используем цвет свечения если он задан, иначе цвет инстанса
    let useGlowColor = in.glowColor.a > 0.5;
    finalColor = select(finalColor, in.glowColor.rgb, useGlowColor);

    return vec4<f32>(finalColor * finalFade, in.instanceColor.a * finalFade);
}
    `

    const lineInstancedShaderModule = this.device.createShaderModule({
      code: lineInstancedWGSL,
    })

    this.instancedLinePipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: lineInstancedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          {arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]},
          // color (базовый цвет вершин)
          {arrayStride: 12, attributes: [{shaderLocation: 1, offset: 0, format: "float32x3"}]},
          // instance buffer (матрица 16 floats + параметры материала 9 floats = 25 floats = 100 байт)
          {
            arrayStride: 100, // 25 * 4 байта
            stepMode: "instance",
            attributes: [
              // Матрица инстанса (16 floats)
              {shaderLocation: 2, offset: 0, format: "float32x4"},
              {shaderLocation: 3, offset: 16, format: "float32x4"},
              {shaderLocation: 4, offset: 32, format: "float32x4"},
              {shaderLocation: 5, offset: 48, format: "float32x4"},
              // Параметры материала (9 floats)
              {shaderLocation: 6, offset: 64, format: "float32x4"}, // color (rgba)
              {shaderLocation: 7, offset: 80, format: "float32"}, // glowIntensity
              {shaderLocation: 8, offset: 84, format: "float32x4"}, // glowColor (rgba)
            ],
          },
        ],
      },
      fragment: {
        module: lineInstancedShaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.presentationFormat,
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
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: {count: this.sampleCount},
    })

    // --- Pipelines для Text ---
    this.textStencilPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: textShaderModule,
        entryPoint: "vs_main",
        buffers: [{arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]}],
      },
      fragment: {
        module: textShaderModule,
        entryPoint: "fs_stencil",
        targets: [{format: this.presentationFormat, writeMask: 0}],
      },
      primitive: {topology: "triangle-list", cullMode: "none"},
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
        stencilFront: TEXT_STENCIL_FACE_STATE,
        stencilBack: TEXT_STENCIL_BACK_FACE_STATE,
      },
      multisample: {count: this.sampleCount},
    })

    const presentationFormat = this.presentationFormat
    if (!presentationFormat) throw new Error("Renderer presentation format is not initialized")

    const createTextCoverPipeline = (depthWriteEnabled: boolean): Promise<GPURenderPipeline> =>
      this.device!.createRenderPipelineAsync({
        layout: pipelineLayout,
        vertex: {
          module: textShaderModule,
          entryPoint: "vs_main",
          buffers: [{arrayStride: 12, attributes: [{shaderLocation: 0, offset: 0, format: "float32x3"}]}],
        },
        fragment: {
          module: textShaderModule,
          entryPoint: "fs_cover",
          targets: [{format: presentationFormat}],
        },
        primitive: {topology: "triangle-list", cullMode: "none"},
        depthStencil: {
          depthWriteEnabled,
          depthCompare: "less",
          format: "depth24plus-stencil8",
          stencilFront: TEXT_COVER_FACE_STATE,
          stencilBack: TEXT_COVER_FACE_STATE,
        },
        multisample: {count: this.sampleCount},
      })

    this.textCoverPipeline = await createTextCoverPipeline(false)
    this.textDepthCoverPipeline = await createTextCoverPipeline(true)

  }

  public setPixelRatio(value: number): void {
    this.pixelRatio = value
  }

  public setSize(width: number, height: number): void {
    if (this.canvas) {
      const nextWidth = Math.floor(width * this.pixelRatio)
      const nextHeight = Math.floor(height * this.pixelRatio)
      if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return
      this.canvas.width = nextWidth
      this.canvas.height = nextHeight
      this.configureCanvasContext()
    }
  }

  private collectSpaceObjectsByType(
    renderList: RenderItem[]
  ): {
    glassObjects: RenderItem[],
    regularObjects: RenderItem[],
    overlayLines: RenderItem[],
    uiObjects: RenderItem[]
  } {
    const isUiLayerObject = (obj: Object3D): boolean => {
      if (obj.renderLayer === "ui" || (obj as any).isUIDisplay) return true
      let parent = obj.parent
      while (parent) {
        if (parent.renderLayer === "ui" || (parent as any).isUIDisplay) return true
        parent = parent.parent
      }
      return false
    }

    const isOverlayLine = (item: RenderItem): boolean =>
      item.type === "line" &&
      (item.object as LineSegments).material instanceof LineGlowMaterial &&
      ((item.object as LineSegments).material as LineGlowMaterial).visibilityMode === "overlay"

    const isSilhouetteLine = (item: RenderItem): boolean =>
      item.type === "line" &&
      (item.object as LineSegments).material instanceof LineGlowMaterial &&
      ((item.object as LineSegments).material as LineGlowMaterial).visibilityMode === "silhouette"

    const regularObjects = renderList.filter(item =>
      !(item.object.material as any)?.isGlassMaterial &&
      !isUiLayerObject(item.object) &&
      !isOverlayLine(item)
    )

    return {
      glassObjects: renderList.filter(item => (item.object.material as any)?.isGlassMaterial === true),
      // Non-depth-writing silhouettes go first so later relation lines retain
      // visual priority even where their projected paths cross the Torus.
      regularObjects: [
        ...regularObjects.filter(isSilhouetteLine),
        ...regularObjects.filter(item => !isSilhouetteLine(item)),
      ],
      overlayLines: renderList.filter(item =>
        !isUiLayerObject(item.object) &&
        isOverlayLine(item)
      ),
      uiObjects: renderList.filter(item => isUiLayerObject(item.object))
    }
  }

  private isReadyToRender(): boolean {
    return !!(
      this.device &&
      this.context &&
      this.basicMeshPipeline &&
      this.thinFilmMeshPipeline &&
      this.holographicMeshPipeline &&
      this.staticMeshPipeline &&
      this.uiBasicMeshPipeline &&
      this.instancedMeshPipeline &&
      this.skinnedMeshPipeline &&
      this.linePipeline &&
      this.lineOverlayPipeline &&
      this.lineSilhouettePipeline &&
      this.instancedLinePipeline &&
      this.textStencilPipeline &&
      this.textCoverPipeline &&
      this.textDepthCoverPipeline &&
      this.imagePipeline &&
      this.externalImagePipeline &&
      this.uiImagePipeline &&
      this.uiExternalImagePipeline &&
      this.roundedPipeline &&
      this.uiRoundedPipeline &&
      this.radialBackdropPipeline &&
      this.uiRadialBackdropPipeline &&
      this.colorPickerPipeline &&
      this.uiColorPickerPipeline &&
      this.imageBindGroupLayout &&
      this.externalImageBindGroupLayout &&
      this.imageSampler &&
      this.globalUniformBuffer &&
      this.sceneUniformBuffer &&
      this.perObjectUniformBuffer &&
      this.boneMatricesBuffer &&
      this.perObjectBindGroupLayout &&
      this.perObjectBindGroup &&
      this.perObjectDataCPU &&
      this.boneMatricesDataCPU &&
      this.canvas
    )
  }

  public render(space: Space, viewPoint: ViewPoint): void {
    this.renderFrame(space, viewPoint)
  }

  /**
   * Reads the last frame copied by the normal render path. This submits only a
   * bounded texture-to-buffer copy and never requests or renders another frame.
   */
  public async captureLastPresentedFramePng(): Promise<Blob | null> {
    const device = this.device
    const texture = this.presentedFrameTexture
    const format = this.presentationFormat
    if (
      !device ||
      !texture ||
      !this.hasPresentedFrame ||
      !format ||
      !isCapturableGpuFrameFormat(format)
    ) return null

    const width = texture.width
    const height = texture.height
    const bytesPerRow = alignedGpuFrameBytesPerRow(width)
    const buffer = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    let mapped = false
    try {
      const encoder = device.createCommandEncoder()
      encoder.copyTextureToBuffer(
        {texture},
        {buffer, bytesPerRow, rowsPerImage: height},
        {width, height, depthOrArrayLayers: 1},
      )
      device.queue.submit([encoder.finish()])
      await buffer.mapAsync(GPUMapMode.READ)
      mapped = true
      const rgba = unpackGpuFrameRgba({
        bytes: new Uint8Array(buffer.getMappedRange()),
        bytesPerRow,
        format,
        width,
        height,
      })
      buffer.unmap()
      mapped = false
      return await encodeRgbaFramePng(rgba, width, height)
    } catch {
      return null
    } finally {
      if (mapped) buffer.unmap()
      buffer.destroy()
    }
  }

  public renderFrame(space: Space, viewPoint: ViewPoint): void
  public renderFrame(space: Space, overlay: RenderOverlay | readonly RenderOverlay[] | null | undefined, viewPoint: ViewPoint): void
  public renderFrame(
    space: Space,
    overlayOrViewPoint: RenderOverlay | readonly RenderOverlay[] | ViewPoint | null | undefined,
    maybeViewPoint?: ViewPoint,
  ): void {
    if (!this.isReadyToRender()) return

    const viewPoint = maybeViewPoint ?? (overlayOrViewPoint as ViewPoint)
    if (!viewPoint) return
    const overlays = maybeViewPoint === undefined
      ? []
      : Array.isArray(overlayOrViewPoint)
        ? overlayOrViewPoint
        : overlayOrViewPoint
          ? [overlayOrViewPoint as RenderOverlay]
          : []

    this.updateTextures()

    const commandEncoder = this.device!.createCommandEncoder()
    const canvasTexture = this.context!.getCurrentTexture()
    const textureView = canvasTexture.createView()
    this.viewProjectionMatrix.multiplyMatrices(viewPoint.projectionMatrix, viewPoint.viewMatrix)
    this.device!.queue.writeBuffer(this.globalUniformBuffer!, 0, this.viewProjectionMatrix.elements)
    this.frustum.setFromProjectionMatrix(this.viewProjectionMatrix)

    const preparedLayers: PreparedRenderLayer[] = []
    const frameRenderItems: RenderItem[] = []
    const frameLights: LightItem[] = []

    this.backgroundClearColor.r = space.background.r
    this.backgroundClearColor.g = space.background.g
    this.backgroundClearColor.b = space.background.b
    this.backgroundClearColor.a = space.background.a
    preparedLayers.push(this.prepareRenderLayer(space, frameRenderItems, frameLights, this.backgroundClearColor))

    for (const overlay of overlays) {
      overlay.updateForViewPoint?.(viewPoint)
      preparedLayers.push(this.prepareRenderLayer(overlay, frameRenderItems, frameLights))
    }
    const renderIndexByItem = new Map<RenderItem, number>()
    frameRenderItems.forEach((item, index) => {
      if (!renderIndexByItem.has(item)) renderIndexByItem.set(item, index)
    })

    // Uniform buffers are written once for the whole frame. Rewriting them between
    // passes before submit would make earlier passes read the later data.
    this.updateSceneUniforms(frameLights, viewPoint.viewMatrix)
    this.ensurePerObjectCapacity(frameRenderItems.length)
    const uploadPlan = this.updatePerObjectData(frameRenderItems)
    if (uploadPlan.uniformBytes > 0 && this.perObjectDataCPU && this.perObjectUniformBuffer) {
      this.device!.queue.writeBuffer(
        this.perObjectUniformBuffer,
        0,
        this.perObjectDataCPU.buffer,
        this.perObjectDataCPU.byteOffset,
        uploadPlan.uniformBytes,
      )
    }
    if (this.boneMatricesDataCPU && this.boneMatricesBuffer) {
      for (const range of uploadPlan.boneRanges) {
        this.device!.queue.writeBuffer(
          this.boneMatricesBuffer,
          range.byteOffset,
          this.boneMatricesDataCPU.buffer,
          this.boneMatricesDataCPU.byteOffset + range.byteOffset,
          range.byteLength,
        )
      }
    }

    const directDrawLayers = preparedLayers.filter(hasDirectRenderItems)
    if (directDrawLayers.length === 0) {
      // Preserve background clearing even for a completely empty scene.
      this.renderPreparedLayer(commandEncoder, textureView, preparedLayers[0]!, renderIndexByItem, true)
    } else {
      directDrawLayers.forEach((layer, index) => {
        // An empty root layer used to consume a complete MSAA resolve pass only
        // to clear the canvas. Clear in the first layer that actually draws.
        this.renderPreparedLayer(
          commandEncoder,
          textureView,
          layer,
          renderIndexByItem,
          index === 0,
          preparedLayers[0]?.background,
        )
      })
    }
    this.renderOverlayLines(
      commandEncoder,
      textureView,
      preparedLayers.flatMap((layer) => layer.overlayLines),
      renderIndexByItem,
    )
    if (this.presentedFrameTexture) {
      commandEncoder.copyTextureToTexture(
        {texture: canvasTexture},
        {texture: this.presentedFrameTexture},
        {
          width: this.canvas!.width,
          height: this.canvas!.height,
          depthOrArrayLayers: 1,
        },
      )
    }

    this.device!.queue.submit([commandEncoder.finish()])
    this.hasPresentedFrame = this.presentedFrameTexture !== null
  }

  private prepareRenderLayer(
    root: Object3D,
    frameRenderItems: RenderItem[],
    frameLights: LightItem[],
    background?: GPUColor,
  ): PreparedRenderLayer {
    const allRenderItems: RenderItem[] = []
    const lights: LightItem[] = []
    collectSpaceObjects(root, allRenderItems, lights, this.frustum)
    const {glassObjects, regularObjects, overlayLines, uiObjects} =
      this.collectSpaceObjectsByType(allRenderItems)

    frameRenderItems.push(...allRenderItems)
    frameLights.push(...lights)

    return {
      background,
      glassObjects,
      regularObjects,
      overlayLines,
      uiObjects,
    }
  }

  private renderPreparedLayer(
    commandEncoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    layer: PreparedRenderLayer,
    renderIndexByItem: ReadonlyMap<RenderItem, number>,
    clearColor: boolean,
    clearValue?: GPUColor,
  ): void {
    const colorLoadOp: GPULoadOp = clearColor ? "clear" : "load"
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: this.multisampleTextureView!,
          resolveTarget: textureView,
          loadOp: colorLoadOp,
          storeOp: "store",
          clearValue: clearValue ?? layer.background ?? [0, 0, 0, 0],
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
        stencilClearValue: 0,
        stencilLoadOp: "clear",
        stencilStoreOp: "store",
      },
    }
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
    passEncoder.setBindGroup(0, this.globalBindGroup!)

    // Рендерим обычные объекты
    this.renderObjectList(passEncoder, layer.regularObjects, renderIndexByItem)
    // Рендерим стеклянные объекты (пока как обычные, но с прозрачностью)
    this.renderObjectList(passEncoder, layer.glassObjects, renderIndexByItem)
    // Рендерим UI объекты
    this.renderObjectList(passEncoder, layer.uiObjects, renderIndexByItem, true)

    passEncoder.end()
  }

  private renderOverlayLines(
    commandEncoder: GPUCommandEncoder,
    textureView: GPUTextureView,
    overlayLines: RenderItem[],
    renderIndexByItem: ReadonlyMap<RenderItem, number>,
  ): void {
    if (overlayLines.length === 0) return
    const overlayPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: "load",
        storeOp: "store",
      }],
    })
    overlayPass.setBindGroup(0, this.globalBindGroup!)
    this.renderObjectList(overlayPass, overlayLines, renderIndexByItem)
    overlayPass.end()
  }


  private ensurePerObjectCapacity(required: number): void {
    if (required <= this.perObjectCapacity) return
    let nextCapacity = Math.max(1, this.perObjectCapacity)
    while (nextCapacity < required) nextCapacity *= 2
    this.createPerObjectResources(nextCapacity)
  }

  private createPerObjectResources(capacity: number): void {
    if (!this.device || !this.perObjectBindGroupLayout) return
    const previousUniformBuffer = this.perObjectUniformBuffer
    const previousBoneMatricesBuffer = this.boneMatricesBuffer
    const uniformBuffer = this.device.createBuffer({
      size: capacity * PER_OBJECT_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const boneMatricesBuffer = this.device.createBuffer({
      size: capacity * BONE_MATRICES_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.perObjectUniformBuffer = uniformBuffer
    this.boneMatricesBuffer = boneMatricesBuffer
    this.perObjectDataCPU = new Float32Array(capacity * (PER_OBJECT_UNIFORM_SIZE / 4))
    this.boneMatricesDataCPU = new Float32Array(capacity * (BONE_MATRICES_SIZE / 4))
    this.perObjectBindGroup = this.device.createBindGroup({
      layout: this.perObjectBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
            size: PER_OBJECT_UNIFORM_SIZE,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: boneMatricesBuffer,
            size: BONE_MATRICES_SIZE,
          },
        },
      ],
    })
    this.perObjectCapacity = capacity
    previousUniformBuffer?.destroy()
    previousBoneMatricesBuffer?.destroy()
  }

  private writePerObjectRgba(offsetFloats: number, color: {r: number, g: number, b: number, a: number}, alpha = color.a): void {
    const data = this.perObjectDataCPU
    if (!data) return
    data[offsetFloats] = color.r
    data[offsetFloats + 1] = color.g
    data[offsetFloats + 2] = color.b
    data[offsetFloats + 3] = alpha
  }

  private writePerObjectVec4(offsetFloats: number, x: number, y: number, z: number, w: number): void {
    const data = this.perObjectDataCPU
    if (!data) return
    data[offsetFloats] = x
    data[offsetFloats + 1] = y
    data[offsetFloats + 2] = z
    data[offsetFloats + 3] = w
  }

  private updatePerObjectData(objects: RenderItem[]): PerObjectUploadPlan {
    if (!this.perObjectDataCPU || !this.boneMatricesDataCPU) {
      return {uniformBytes: 0, boneRanges: []}
    }

    const objectCount = objects.length
    const usedFloats = objectCount * (PER_OBJECT_UNIFORM_SIZE / 4)
    this.perObjectDataCPU.fill(0, 0, usedFloats)
    const uploadPlan = planPerObjectUploads(objectCount, index => objects[index]?.type === "skinned-mesh")

    for (let i = 0; i < objectCount; i++) {
      const item = objects[i]
      if (!item) continue
      const dynamicOffset = i * PER_OBJECT_UNIFORM_SIZE
      const offsetFloats = dynamicOffset / 4

      switch (item.type) {
        case "static-mesh":
          this.updateMeshData(item.object as Mesh, item.worldMatrix, offsetFloats)
          break
        case "skinned-mesh":
          this.updateSkinnedMeshData(
            item.object as SkinnedMesh,
            item.worldMatrix,
            offsetFloats,
            i * (BONE_MATRICES_SIZE / 4),
          )
          break
        case "instanced-mesh":
          this.updateInstancedMeshData(item.object as InstancedMesh, item.worldMatrix, offsetFloats)
          break
        case "instanced-line":
          this.updateInstancedLineData(item.object as WireframeInstancedMesh, item.worldMatrix, offsetFloats)
          break
        case "line":
          this.updateLineData(item.object as LineSegments, item.worldMatrix, offsetFloats)
          break
        case "text-stencil":
        case "text-cover":
          this.updateTextData(item.object as Text, item.worldMatrix, offsetFloats, item.type === "text-stencil")
          break
      }
    }
    return uploadPlan
  }

  private updateSkinnedMeshData(
    mesh: SkinnedMesh,
    worldMatrix: Matrix4,
    offsetFloats: number,
    boneMatricesOffsetFloats: number,
  ): void {
    this.updateMeshData(mesh, worldMatrix, offsetFloats)

    const boneCount = Math.min(mesh.skeleton.bones.length, mesh.skeleton.boneInverses.length, MAX_BONES)
    // The skinned shader applies modelMatrix after skinning, so uniforms stay mesh-local.
    const meshWorldInverse = this.skinnedMeshWorldInverse.copy(worldMatrix).invert()
    const boneMatrix = this.skinnedBoneMatrix

    populateBoneMatrixBlock(this.boneMatricesDataCPU!, boneMatricesOffsetFloats, boneCount, index => {
      const bone = mesh.skeleton.bones[index]!
      const boneInverse = mesh.skeleton.boneInverses[index]!
      boneMatrix
        .multiplyMatrices(meshWorldInverse, bone.matrixWorld)
        .multiply(boneInverse)

      return boneMatrix.elements
    })
  }

  private updateMeshData(mesh: Mesh, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material || !material.visible) return

    const normalMatrix = this.meshNormalMatrix.copy(worldMatrix).invert().transpose()

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set(normalMatrix.elements, offsetFloats + 16)

    if (material instanceof MeshBasicMaterial || material instanceof MeshLambertMaterial) {
      this.writePerObjectRgba(offsetFloats + 32, material.color)
      if (material instanceof MeshBasicMaterial && material.clipBounds !== null) {
        this.perObjectDataCPU!.set(material.clipBounds, offsetFloats + 36)
      }
    } else if (material instanceof ThinFilmMaterial) {
      this.writePerObjectRgba(offsetFloats + 32, material.color)
      this.writePerObjectRgba(offsetFloats + 36, material.rimColor)
      this.writePerObjectVec4(
        offsetFloats + 40,
        material.opacity,
        material.rimStrength,
        material.iridescence,
        material.filmThickness,
      )
      this.writePerObjectVec4(
        offsetFloats + 44,
        material.highlightSize,
        0,
        0,
        0,
      )
    } else if (material instanceof HolographicMaterial) {
      this.writePerObjectRgba(offsetFloats + 32, material.color)
      this.writePerObjectVec4(
        offsetFloats + 36,
        material.opacity,
        material.rimStrength,
        material.scanDensity,
        material.scanSharpness,
      )
      this.writePerObjectVec4(
        offsetFloats + 40,
        material.irregularity,
        material.patternOffset,
        material.bandRadius,
        material.bandHalfWidth,
      )
    } else if (material instanceof ColorPickerMaterial) {
      this.writePerObjectVec4(
        offsetFloats + 32,
        material.hue,
        material.saturation,
        material.value,
        material.alpha,
      )
      this.writePerObjectVec4(
        offsetFloats + 36,
        material.width,
        material.height,
        colorPickerModeCode(material.mode),
        material.opacity,
      )
      if (material.clipBounds !== null) {
        this.perObjectDataCPU!.set(material.clipBounds, offsetFloats + 40)
      }
    } else if (isRadialBackdropMaterial(material)) {
      this.writePerObjectRgba(offsetFloats + 32, material.base)
      this.writePerObjectRgba(offsetFloats + 36, material.glowA)
      this.writePerObjectRgba(offsetFloats + 40, material.glowB)
      this.writePerObjectVec4(offsetFloats + 44, material.width, material.height, 0, 0)
      this.perObjectDataCPU!.set(material.glowAParams, offsetFloats + 48)
      this.perObjectDataCPU!.set(material.glowBParams, offsetFloats + 52)
    } else if (material instanceof RoundedRectMaterial) {
      // fill rgba @ 32..35
      this.writePerObjectRgba(offsetFloats + 32, material.fill)
      // border rgba @ 36..39
      this.writePerObjectRgba(offsetFloats + 36, material.border)
      // size.xy + 2 pad @ 40..43
      this.writePerObjectVec4(offsetFloats + 40, material.width, material.height, 0, 0)
      // radii tl/tr/br/bl @ 44..47
      // WGSL ожидает порядок (TR, BR, BL, TL) для quadrant-mapping —
      // но я переписал внутри sdRoundBox чтобы выбирать по квадранту
      // явно (см. shader). Передаём в порядке tl/tr/br/bl, в шейдере
      // комментарий описывает соответствие.
      this.perObjectDataCPU!.set(material.radii, offsetFloats + 44)
      // params: borderWidth, opacity, shadowBlur, shadowSpread @ 48..51
      this.writePerObjectVec4(
        offsetFloats + 48,
        material.borderWidth,
        clamp01(material.opacity),
        material.shadowBlur,
        material.shadowSpread,
      )
      // clipBounds @ 52..55 (zeros disable clip).
      if (material.clipBounds !== null) {
        this.perObjectDataCPU!.set(material.clipBounds, offsetFloats + 52)
      }
    } else if (material instanceof ImageMaterial) {
      if (material.clipBounds !== null) {
        this.perObjectDataCPU!.set(material.clipBounds, offsetFloats + 36)
      }
      const vb = material.viewBox
      const textureEntry = TextureLoader.peek(material.src)
      const sourceAspect = textureEntry !== undefined && textureEntry.width > 0 && textureEntry.height > 0
        ? textureEntry.width / textureEntry.height
        : 0
      this.writePerObjectVec4(offsetFloats + 40, vb.x, vb.y, vb.w, vb.h)
      this.writePerObjectVec4(
        offsetFloats + 44,
        clamp01(material.opacity),
        Math.max(0.0001, material.boxAspect),
        material.fit === "contain" ? 1 : 0,
        sourceAspect,
      )
    } else if ((material as any).isGlassMaterial) {
      this.writePerObjectRgba(offsetFloats + 32, (material as GlassMaterial).tintColor)
    }
  }

  private updateInstancedMeshData(mesh: InstancedMesh, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material!.visible) return

    const normalMatrix = this.meshNormalMatrix.copy(worldMatrix).invert().transpose()

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set(normalMatrix.elements, offsetFloats + 16)

    if (material! instanceof MeshBasicMaterial || material! instanceof MeshLambertMaterial) {
      this.writePerObjectRgba(offsetFloats + 32, material!.color, 1.0)
    }
  }

  private updateInstancedLineData(lines: WireframeInstancedMesh, worldMatrix: Matrix4, offsetFloats: number): void {
    if (!lines.visible) return

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.writePerObjectVec4(offsetFloats + 16, 0, 0, 0, 0)
    this.writePerObjectVec4(offsetFloats + 20, 0, 0, 0, 0)
    this.writePerObjectVec4(offsetFloats + 24, 0, 0, 0, 0)
  }

  private updateLineData(lines: LineSegments, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = lines.material
    const isLineBasic = material instanceof LineBasicMaterial
    const isLineGlow = material instanceof LineGlowMaterial

    if (!(isLineBasic || isLineGlow) || !material.visible) return

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.writePerObjectRgba(offsetFloats + 16, material.color, material.color.a * material.opacity)

    let glowIntensity = 1.0
    let luminanceBoost = 1.0
    let shimmerPhase = 0
    let shimmerAmount = 0
    let visualScale = 1
    let silhouetteAmount = 0
    let glowR = 0
    let glowG = 0
    let glowB = 0
    let glowA = 0

    if (isLineGlow) {
      glowIntensity = (material as LineGlowMaterial).glowIntensity
      luminanceBoost = (material as LineGlowMaterial).luminanceBoost
      shimmerPhase = (material as LineGlowMaterial).shimmerPhase
      shimmerAmount = (material as LineGlowMaterial).shimmerAmount
      visualScale = (material as LineGlowMaterial).visualScale
      silhouetteAmount = (material as LineGlowMaterial).silhouetteAmount
      const glowColorObj = (material as LineGlowMaterial).glowColor
      if (glowColorObj) {
        glowR = glowColorObj.r
        glowG = glowColorObj.g
        glowB = glowColorObj.b
        glowA = glowColorObj.a
      }
    }

    this.writePerObjectVec4(
      offsetFloats + 20,
      glowIntensity,
      luminanceBoost,
      shimmerPhase,
      shimmerAmount,
    )
    this.writePerObjectVec4(offsetFloats + 24, glowR, glowG, glowB, glowA)
    this.writePerObjectVec4(offsetFloats + 28, visualScale, silhouetteAmount, 0, 0)
  }

  private updateTextData(text: Text, worldMatrix: Matrix4, offsetFloats: number, isStencil: boolean): void {
    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    if (isStencil) return
    const material = text.material as TextMaterial
    this.writePerObjectRgba(offsetFloats + 32, material.color, material.color.a * material.opacity)
    // clipBounds (4 floats) at 36..40 — screen-pixel scissor.
    // perObjectDataCPU обнулён в начале фрейма; пропуск = clipping off
    // (clipBounds == zeros сигнализирует шейдеру выключение).
    if (text.clipBounds !== null) {
      this.perObjectDataCPU!.set(text.clipBounds, offsetFloats + 36)
    }
  }

  private renderObjectList(
    passEncoder: GPURenderPassEncoder,
    objectsToRender: RenderItem[],
    renderIndexByItem: ReadonlyMap<RenderItem, number>,
    isUiLayer = false,
  ): void {
    let currentPipeline: GPURenderPipeline | null = null

    for (const item of objectsToRender) {
      const renderIndex = renderIndexByItem.get(item)
      if (renderIndex === undefined) continue

      let pipeline: GPURenderPipeline | null = null

      // Определяем, какой конвейер нужен для текущего объекта
      switch (item.type) {
        case "static-mesh":
          {
            const mesh = item.object as Mesh
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
            pipeline =
              material instanceof ImageMaterial
                ? this.usesExternalImageTexture(material)
                  ? (isUiLayer ? this.uiExternalImagePipeline : this.externalImagePipeline)
                  : (isUiLayer ? this.uiImagePipeline : this.imagePipeline)
                : material instanceof ThinFilmMaterial
                  ? this.thinFilmMeshPipeline
                  : material instanceof HolographicMaterial
                    ? this.holographicMeshPipeline
                  : material instanceof ColorPickerMaterial
                    ? (isUiLayer ? this.uiColorPickerPipeline : this.colorPickerPipeline)
                  : isRadialBackdropMaterial(material)
                    ? (isUiLayer ? this.uiRadialBackdropPipeline : this.radialBackdropPipeline)
                    : material instanceof RoundedRectMaterial
                      ? (isUiLayer ? this.uiRoundedPipeline : this.roundedPipeline)
                      : material instanceof MeshBasicMaterial
                        ? (isUiLayer ? this.uiBasicMeshPipeline : this.basicMeshPipeline)
                        : this.staticMeshPipeline
          }
          break
        case "skinned-mesh":
          pipeline = this.skinnedMeshPipeline
          break
        case "instanced-mesh":
          pipeline = this.instancedMeshPipeline
          break
        case "instanced-line":
          pipeline = this.instancedLinePipeline
          break
        case "line":
          if ((item.object as LineSegments).material instanceof LineGlowMaterial) {
            const visibilityMode =
              ((item.object as LineSegments).material as LineGlowMaterial).visibilityMode
            pipeline = visibilityMode === "overlay"
              ? this.lineOverlayPipeline
              : visibilityMode === "silhouette"
                ? this.lineSilhouettePipeline
                : this.linePipeline
          } else {
            pipeline = this.linePipeline
          }
          break
        case "text-stencil":
          pipeline = this.textStencilPipeline
          break
        case "text-cover":
          pipeline = (item.object as Text).material.depthWrite ? this.textDepthCoverPipeline : this.textCoverPipeline
          break
        default:
          pipeline = null
          break
      }

      // Меняем конвейер только если он отличается от текущего
      if (pipeline && pipeline !== currentPipeline) {
        passEncoder.setPipeline(pipeline)
        currentPipeline = pipeline
      }

      // Выполняем соответствующий вызов отрисовки
      switch (item.type) {
        case "static-mesh":
        case "skinned-mesh":
          this.renderMesh(passEncoder, item.object as Mesh, item.worldMatrix, renderIndex)
          break
        case "instanced-mesh":
          this.renderInstancedMesh(passEncoder, item.object as InstancedMesh, renderIndex)
          break
        case "instanced-line":
          this.renderInstancedLines(passEncoder, item.object as WireframeInstancedMesh, renderIndex)
          break
        case "line":
          this.renderLines(passEncoder, item.object as LineSegments, renderIndex)
          break
        case "text-stencil":
          passEncoder.setStencilReference(0)
          this.renderTextPass(passEncoder, item.object as Text, renderIndex, true)
          break
        case "text-cover":
          passEncoder.setStencilReference(0)
          this.renderTextPass(passEncoder, item.object as Text, renderIndex, false)
          break
      }
    }
  }

  /**
   * Очищает кэш геометрии для указанного объекта BufferGeometry.
   * Это заставляет рендерер пересоздать GPU буферы при следующем рендеринге.
   *
   * Освобождает GPUBuffer'ы перед удалением записи. Без destroy() WebGPU
   * импликация держит native-память, а Map.delete сама по себе не триггерит
   * native cleanup — приводит к утечке GPU-памяти в долгих сессиях
   * (например, interpreter UI пересобирает Text-объекты на каждый step).
   * @param geometry - Геометрия для очистки из кэша
   */
  public invalidateGeometry(geometry: BufferGeometry): void {
    const buffers = this.geometryCache.get(geometry)
    if (buffers === undefined) return
    buffers.positionBuffer.destroy()
    buffers.normalBuffer?.destroy()
    buffers.uvBuffer?.destroy()
    buffers.indexBuffer?.destroy()
    buffers.colorBuffer?.destroy()
    buffers.skinIndexBuffer?.destroy()
    buffers.skinWeightBuffer?.destroy()
    buffers.instanceMatrixBuffer?.destroy()
    buffers.instanceBuffer?.destroy()
    this.geometryCache.delete(geometry)
  }

  private createAndUploadBuffer(
    typedArray: ArrayBufferView,
    usage: GPUBufferUsageFlags,
  ): GPUBuffer {
    if (!this.device) throw new Error("Device not initialized")

    const buffer = this.device.createBuffer({
      size: (typedArray.byteLength + 3) & ~3,
      usage: usage | GPUBufferUsage.COPY_DST,
    })
    this.device.queue.writeBuffer(buffer, 0, typedArray as GPUAllowSharedBufferSource)
    return buffer
  }

  private updateSceneUniforms(lights: LightItem[], viewMatrix: Matrix4): void {
    if (!this.device || !this.sceneUniformBuffer) return

    const float32View = this.sceneUniformFloats
    const uint32View = this.sceneUniformUints
    float32View.fill(0)

    const viewNormalMatrix = this.sceneViewNormalMatrix.copy(viewMatrix).invert().transpose()
    float32View.set(viewMatrix.elements, 0)
    float32View.set(viewNormalMatrix.elements, 16)

    uint32View[32] = Math.min(lights.length, MAX_LIGHTS)

    // Вычисляем позицию камеры в мировых координатах из viewMatrix
    // cameraPosition = -transpose(rotationPart) * translationPart
    const te = viewMatrix.elements
    const tx = te[12]!
    const ty = te[13]!
    const tz = te[14]!
    const cameraPosition = this.sceneCameraPosition.set(
      -(te[0]! * tx + te[1]! * ty + te[2]! * tz),
      -(te[4]! * tx + te[5]! * ty + te[6]! * tz),
      -(te[8]! * tx + te[9]! * ty + te[10]! * tz),
    )
    const cameraOffset = SCENE_UNIFORM_LAYOUT.cameraFloatOffset
    float32View[cameraOffset] = cameraPosition.x
    float32View[cameraOffset + 1] = cameraPosition.y
    float32View[cameraOffset + 2] = cameraPosition.z

    const lightsArrayOffset = SCENE_UNIFORM_LAYOUT.lightsFloatOffset
    for (let i = 0; i < uint32View[32]!; i++) {
      const lightItem = lights[i]!
      const light = lightItem.light
      const viewLightPos = this.sceneWorldLightPosition.set(
        lightItem.worldMatrix.elements[12]!,
        lightItem.worldMatrix.elements[13]!,
        lightItem.worldMatrix.elements[14]!,
      ).applyMatrix4(viewMatrix)

      const currentLightOffset = lightsArrayOffset + i * (LIGHT_STRUCT_SIZE / 4)
      float32View[currentLightOffset] = viewLightPos.x
      float32View[currentLightOffset + 1] = viewLightPos.y
      float32View[currentLightOffset + 2] = viewLightPos.z
      float32View[currentLightOffset + 3] = 1.0
      float32View[currentLightOffset + 4] = light.color.r
      float32View[currentLightOffset + 5] = light.color.g
      float32View[currentLightOffset + 6] = light.color.b
      float32View[currentLightOffset + 7] = light.intensity
    }

    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, this.sceneUniformData)
  }

  private getOrCreateGeometryBuffers(geometry: BufferGeometry): GeometryBuffers {
    if (this.geometryCache.has(geometry)) {
      const buffers = this.geometryCache.get(geometry)!

      // Проверяем, нужно ли обновить буфер инстансов
      if (
        geometry.attributes.instanceBuffer &&
        geometry.attributes.instanceBuffer.needsUpdate &&
        buffers.instanceBuffer
      ) {
        this.device!.queue.writeBuffer(
          buffers.instanceBuffer,
          0,
          geometry.attributes.instanceBuffer.array as any,
        )
        geometry.attributes.instanceBuffer.needsUpdate = false
      }

      // Проверяем, нужно ли обновить буфер позиций
      if (
        geometry.attributes.position &&
        geometry.attributes.position.needsUpdate &&
        buffers.positionBuffer
      ) {
        this.device!.queue.writeBuffer(
          buffers.positionBuffer,
          0,
          geometry.attributes.position.array as any,
        )
        geometry.attributes.position.needsUpdate = false
      }

      if (geometry.attributes.uv && geometry.attributes.uv.needsUpdate && buffers.uvBuffer) {
        this.device!.queue.writeBuffer(
          buffers.uvBuffer,
          0,
          geometry.attributes.uv.array as any,
        )
        geometry.attributes.uv.needsUpdate = false
      }

      return buffers
    }

    if (!this.device) throw new Error("Device not initialized")

    const positionBuffer = this.createAndUploadBuffer(
      geometry.attributes.position!.array as ArrayBufferView,
      GPUBufferUsage.VERTEX,
    )

    let normalBuffer: GPUBuffer | undefined
    if (geometry.attributes.normal) {
      normalBuffer = this.createAndUploadBuffer(
        geometry.attributes.normal.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    let uvBuffer: GPUBuffer | undefined
    if (geometry.attributes.uv) {
      uvBuffer = this.createAndUploadBuffer(
        geometry.attributes.uv.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    let skinIndexBuffer: GPUBuffer | undefined
    if (geometry.attributes.skinIndex && geometry.attributes.skinIndex.array.length > 0) {
      skinIndexBuffer = this.createAndUploadBuffer(
        geometry.attributes.skinIndex.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    let skinWeightBuffer: GPUBuffer | undefined
    if (geometry.attributes.skinWeight && geometry.attributes.skinWeight.array.length > 0) {
      skinWeightBuffer = this.createAndUploadBuffer(
        geometry.attributes.skinWeight.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    // Для WireframeInstancedMesh создаем буфер для данных инстансов (матрица + параметры материала)
    let instanceBuffer: GPUBuffer | undefined
    if (geometry.attributes.instanceBuffer && geometry.attributes.instanceBuffer.array.length > 0) {
      instanceBuffer = this.createAndUploadBuffer(
        geometry.attributes.instanceBuffer.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    // Для обратной совместимости: если есть старый атрибут instanceMatrix, создаем из него instanceBuffer
    let instanceMatrixBuffer: GPUBuffer | undefined
    if (geometry.attributes.instanceMatrix && geometry.attributes.instanceMatrix.array.length > 0) {
      instanceMatrixBuffer = this.createAndUploadBuffer(
        geometry.attributes.instanceMatrix.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    let colorBuffer: GPUBuffer | undefined
    if (geometry.attributes.color) {
      colorBuffer = this.createAndUploadBuffer(
        geometry.attributes.color.array as ArrayBufferView,
        GPUBufferUsage.VERTEX,
      )
    }

    let indexBuffer: GPUBuffer | undefined
    if (geometry.index) {
      indexBuffer = this.createAndUploadBuffer(
        geometry.index.array as ArrayBufferView,
        GPUBufferUsage.INDEX,
      )
    }

    const buffers: GeometryBuffers = {
      positionBuffer,
    }
    if (colorBuffer) buffers.colorBuffer = colorBuffer
    if (normalBuffer) buffers.normalBuffer = normalBuffer
    if (uvBuffer) buffers.uvBuffer = uvBuffer
    if (indexBuffer) buffers.indexBuffer = indexBuffer
    if (skinIndexBuffer) buffers.skinIndexBuffer = skinIndexBuffer
    if (skinWeightBuffer) buffers.skinWeightBuffer = skinWeightBuffer
    if (instanceMatrixBuffer) buffers.instanceMatrixBuffer = instanceMatrixBuffer
    if (instanceBuffer) buffers.instanceBuffer = instanceBuffer

    this.geometryCache.set(geometry, buffers)
    return buffers
  }

  private getOrCreateDefaultLineColorBuffer(geometry: BufferGeometry, buffers: GeometryBuffers): GPUBuffer {
    if (buffers.colorBuffer) return buffers.colorBuffer

    const vertexCount = geometry.attributes.position!.count
    const defaultColors = new Float32Array(vertexCount * 3)
    defaultColors.fill(1)
    const colorBuffer = this.createAndUploadBuffer(defaultColors, GPUBufferUsage.VERTEX)
    buffers.colorBuffer = colorBuffer
    return colorBuffer
  }

  private getImageBindGroup(material: ImageMaterial): GPUBindGroup {
    if (!this.device || !this.imageBindGroupLayout || !this.imageSampler) {
      throw new Error("Image pipeline is not initialized")
    }
    const entry = TextureLoader.load(this.device, material.src, material.onTextureChange)
    const texture = entry.status === "ready" && entry.texture
      ? entry.texture
      : TextureLoader.fallback(this.device)
    const cached = this.imageBindGroupCache.get(texture)
    if (cached) return cached
    const bindGroup = this.device.createBindGroup({
      layout: this.imageBindGroupLayout,
      entries: [
        { binding: 0, resource: this.imageSampler },
        { binding: 1, resource: texture.createView() },
      ],
    })
    this.imageBindGroupCache.set(texture, bindGroup)
    return bindGroup
  }

  private usesExternalImageTexture(material: ImageMaterial): boolean {
    const source = TextureLoader.peek(material.src)?.externalTextureSource
    if (source === undefined) return false
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0 && source.videoHeight > 0
    }
    return true
  }

  private getExternalImageBindGroup(material: ImageMaterial): GPUBindGroup {
    if (!this.device || !this.externalImageBindGroupLayout || !this.imageSampler) {
      throw new Error("External image pipeline is not initialized")
    }
    const entry = TextureLoader.load(this.device, material.src, material.onTextureChange)
    const source = entry.externalTextureSource
    if (source === undefined) throw new Error(`External texture source is missing for ${material.src}`)
    const externalTexture = this.device.importExternalTexture({source})
    return this.device.createBindGroup({
      layout: this.externalImageBindGroupLayout,
      entries: [
        { binding: 0, resource: this.imageSampler },
        { binding: 1, resource: externalTexture },
      ],
    })
  }

  private renderMesh(
    passEncoder: GPURenderPassEncoder | null,
    mesh: Mesh | SkinnedMesh,
    worldMatrix: Matrix4,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material!.visible) return

    const isSkinned = (mesh as SkinnedMesh).isSkinnedMesh
    const dynamicOffset = renderIndex * PER_OBJECT_UNIFORM_SIZE
    const boneMatricesOffset = renderIndex * BONE_MATRICES_SIZE

    if (passEncoder) {
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const {positionBuffer, normalBuffer, uvBuffer, indexBuffer, skinIndexBuffer, skinWeightBuffer} =
        this.getOrCreateGeometryBuffers(mesh.geometry)

      passEncoder.setVertexBuffer(0, positionBuffer)
      if (material instanceof ImageMaterial) {
        if (!uvBuffer) return
        passEncoder.setVertexBuffer(1, uvBuffer)
        passEncoder.setBindGroup(2, this.usesExternalImageTexture(material)
          ? this.getExternalImageBindGroup(material)
          : this.getImageBindGroup(material))
      } else if (normalBuffer) {
        passEncoder.setVertexBuffer(1, normalBuffer)
      }

      if (isSkinned && skinIndexBuffer && skinWeightBuffer) {
        passEncoder.setVertexBuffer(2, skinIndexBuffer)
        passEncoder.setVertexBuffer(3, skinWeightBuffer)
      }

      if (indexBuffer) {
        const indexFormat = mesh.geometry.index!.array instanceof Uint32Array ? "uint32" : "uint16"
        passEncoder.setIndexBuffer(indexBuffer, indexFormat)
        passEncoder.drawIndexed(mesh.geometry.index!.count)
      } else {
        passEncoder.draw(mesh.geometry.attributes.position!.count)
      }
    }
  }

  private renderInstancedMesh(
    passEncoder: GPURenderPassEncoder | null,
    mesh: InstancedMesh,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material!.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_UNIFORM_SIZE

    if (passEncoder) {
      const boneMatricesOffset = renderIndex * BONE_MATRICES_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])

      const {positionBuffer, normalBuffer, indexBuffer, instanceMatrixBuffer} = this.getOrCreateGeometryBuffers(
        mesh.geometry,
      )

      passEncoder.setVertexBuffer(0, positionBuffer)
      if (normalBuffer) {
        passEncoder.setVertexBuffer(1, normalBuffer)
      }

      // Устанавливаем буфер матриц инстансов
      if (instanceMatrixBuffer) {
        passEncoder.setVertexBuffer(2, instanceMatrixBuffer)
      }

      if (indexBuffer) {
        const indexFormat = mesh.geometry.index!.array instanceof Uint32Array ? "uint32" : "uint16"
        passEncoder.setIndexBuffer(indexBuffer, indexFormat)
        passEncoder.drawIndexed(mesh.geometry.index!.count, mesh.count)
      } else {
        passEncoder.draw(mesh.geometry.attributes.position!.count, mesh.count)
      }
    }
  }

  private renderLines(
    passEncoder: GPURenderPassEncoder | null,
    lines: LineSegments,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return

    const material = lines.material
    const isLineBasic = material instanceof LineBasicMaterial
    const isLineGlow = material instanceof LineGlowMaterial

    if (!(isLineBasic || isLineGlow) || !material.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_UNIFORM_SIZE

    if (passEncoder) {
      const boneMatricesOffset = renderIndex * BONE_MATRICES_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const buffers = this.getOrCreateGeometryBuffers(lines.geometry)
      const colorBuffer = this.getOrCreateDefaultLineColorBuffer(lines.geometry, buffers)

      passEncoder.setVertexBuffer(0, buffers.positionBuffer)
      passEncoder.setVertexBuffer(1, colorBuffer)
      passEncoder.draw(lines.geometry.attributes.position!.count)
    }
  }

  private renderInstancedLines(
    passEncoder: GPURenderPassEncoder | null,
    lines: WireframeInstancedMesh,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return

    // Проверяем видимость
    if (!lines.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_UNIFORM_SIZE

    if (passEncoder) {
      const boneMatricesOffset = renderIndex * BONE_MATRICES_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const buffers = this.getOrCreateGeometryBuffers(lines.geometry)
      const colorBuffer = this.getOrCreateDefaultLineColorBuffer(lines.geometry, buffers)

      passEncoder.setVertexBuffer(0, buffers.positionBuffer)
      passEncoder.setVertexBuffer(1, colorBuffer)
      if (buffers.instanceBuffer) {
        passEncoder.setVertexBuffer(2, buffers.instanceBuffer)
      }
      passEncoder.draw(lines.geometry.attributes.position!.count, lines.count)
    }
  }

  private renderTextPass(
    passEncoder: GPURenderPassEncoder | null,
    text: Text,
    renderIndex: number,
    isStencil: boolean,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return
    const geometry = isStencil ? text.stencilGeometry : text.coverGeometry
    if (!geometry.index) return

    const dynamicOffset = renderIndex * PER_OBJECT_UNIFORM_SIZE

    if (passEncoder) {
      const boneMatricesOffset = renderIndex * BONE_MATRICES_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const {positionBuffer, indexBuffer} = this.getOrCreateGeometryBuffers(geometry)

      passEncoder.setVertexBuffer(0, positionBuffer)
      const indexFormat = geometry.index.array instanceof Uint32Array ? "uint32" : "uint16"
      passEncoder.setIndexBuffer(indexBuffer!, indexFormat)
      passEncoder.drawIndexed(geometry.index.count)
    }
  }

  private updateTextures(): void {
    if (!this.device || !this.canvas || !this.presentationFormat) return

    const needsResize =
      !this.depthTexture ||
      this.depthTexture.width !== this.canvas.width ||
      this.depthTexture.height !== this.canvas.height

    if (needsResize) {
      this.depthTextureView = null
      this.multisampleTextureView = null
      if (this.depthTexture) this.depthTexture.destroy()
      if (this.multisampleTexture) this.multisampleTexture.destroy()
      if (this.presentedFrameTexture) this.presentedFrameTexture.destroy()
      this.hasPresentedFrame = false

      const size = {width: this.canvas.width, height: this.canvas.height}

      this.depthTexture = this.device.createTexture({
        size,
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount: this.sampleCount,
      })

      this.multisampleTexture = this.device.createTexture({
        size,
        format: this.presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount: this.sampleCount,
      })
      // These attachments outlive a frame. Reusing their views avoids two
      // short-lived WebGPU wrappers per presentation and prevents external
      // inspectors from accumulating them in long animated sessions.
      this.depthTextureView = this.depthTexture.createView()
      this.multisampleTextureView = this.multisampleTexture.createView()

      this.presentedFrameTexture = this.device.createTexture({
        size,
        format: this.presentationFormat,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
      })
    }
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

function colorPickerModeCode(mode: ColorPickerMaterial["mode"]): number {
  if (mode === "value") return 1
  if (mode === "alpha") return 2
  return 0
}

async function withWebGpuInitTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} init timed out after ${WEBGPU_INIT_TIMEOUT_MS}ms`)), WEBGPU_INIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
  }
}

function isRadialBackdropMaterial(material: unknown): material is RadialBackdropMaterial {
  return (material as RadialBackdropMaterial | undefined)?.isRadialBackdropMaterial === true
}
