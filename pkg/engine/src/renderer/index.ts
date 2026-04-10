import { Scene } from "../scenes/Scene"
import { ViewPoint } from "../core/ViewPoint"
import { Mesh } from "../core/Mesh"
import { InstancedMesh } from "../core/InstancedMesh"
import { SkinnedMesh } from "../core/SkinnedMesh"
import { BufferGeometry } from "../core/BufferGeometry"
import { WireframeInstancedMesh } from "../core/WireframeInstancedMesh"
import { MeshBasicMaterial } from "../materials/MeshBasicMaterial"
import { MeshLambertMaterial } from "../materials/MeshLambertMaterial"
import { Matrix4 } from "../math/Matrix4"
import { LineSegments } from "../objects/LineSegments"
import { LineBasicMaterial } from "../materials/LineBasicMaterial"
import { LineGlowMaterial } from "../materials/LineGlowMaterial"
import { Vector3 } from "../math/Vector3"
import { Text } from "../objects/Text"
import { TextMaterial } from "../materials/TextMaterial"
import { Frustum } from "../math/Frustum"
import { Object3D } from "../core/Object3D"
import { UIDisplay } from "../ui/UIDisplay"
import meshStaticWGSL from "./shaders/mesh_static.wgsl" with { type: "text" };
import meshSkinnedWGSL from "./shaders/mesh_skinned.wgsl" with { type: "text" };
import meshInstancedWGSL from "./shaders/mesh_instanced.wgsl" with { type: "text" };
import blurWGSL from "./shaders/blur.wgsl" with { type: "text" };
import glassWGSL from "./shaders/glass.wgsl" with { type: "text" };

import lineShaderCode from "./shaders/line.wgsl" with { type: "text" };
import textShaderCode from "./shaders/text.wgsl" with { type: "text" };
import { Light } from "../lights/Light";
import { collectSceneObjects, LightItem, RenderItem } from "./utils/RenderList"
import { GlassMaterial } from "../materials/GlassMaterial";

// --- Константы для uniform-буферов ---
const UNIFORM_ALIGNMENT = 256
const MAX_RENDERABLES = 1000
const MAX_LIGHTS = 4 // Максимальное количество источников света

// Размер данных для одного объекта: mat4x4 (64) + mat4x4 (64) + vec4 (16) + u32 (4) + 3*padding(12) = 160. Выравниваем до 256.
const PER_OBJECT_UNIFORM_SIZE = Math.ceil((64 + 64 + 16 + 4) / UNIFORM_ALIGNMENT) * UNIFORM_ALIGNMENT
const MAX_BONES = 128
const BONE_MATRICES_SIZE = MAX_BONES * 16 * 4 // 128 * mat4x4<f32>
const PER_OBJECT_DATA_SIZE = PER_OBJECT_UNIFORM_SIZE + BONE_MATRICES_SIZE

// --- Размеры и смещения для данных сцены ---
const SCENE_UNIFORMS_SIZE = 272 + 16 // + vec3<f32> cameraPosition + f32 padding
const LIGHT_STRUCT_SIZE = 32

// --- Вспомогательные интерфейсы ---
interface GeometryBuffers {
  positionBuffer: GPUBuffer
  normalBuffer?: GPUBuffer
  indexBuffer?: GPUBuffer
  colorBuffer?: GPUBuffer
  skinIndexBuffer?: GPUBuffer
  skinWeightBuffer?: GPUBuffer
  instanceMatrixBuffer?: GPUBuffer // для инстансированных мешей
  instanceBuffer?: GPUBuffer // для WireframeInstancedMesh (матрица + параметры материала)
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
  private staticMeshPipeline: GPURenderPipeline | null = null
  private instancedMeshPipeline: GPURenderPipeline | null = null
  private skinnedMeshPipeline: GPURenderPipeline | null = null
  private linePipeline: GPURenderPipeline | null = null
  private instancedLinePipeline: GPURenderPipeline | null = null
  private textStencilPipeline: GPURenderPipeline | null = null
  private textCoverPipeline: GPURenderPipeline | null = null
  
  // --- Compute ресурсы для размытия ---
  private blurComputePipelineHorizontal: GPUComputePipeline | null = null
  private blurComputePipelineVertical: GPUComputePipeline | null = null
  private blurShaderModule: GPUShaderModule | null = null

  // --- Глобальные ресурсы ---
  private globalUniformBuffer: GPUBuffer | null = null
  private sceneUniformBuffer: GPUBuffer | null = null // Для освещения
  private globalBindGroup: GPUBindGroup | null = null

  // --- Ресурсы для каждого объекта ---
  private perObjectUniformBuffer: GPUBuffer | null = null
  private perObjectBindGroup: GPUBindGroup | null = null
  private perObjectDataCPU: Float32Array | null = null

  geometryCache: Map<BufferGeometry, GeometryBuffers> = new Map()
  private depthTexture: GPUTexture | null = null
  private multisampleTexture: GPUTexture | null = null
  private sampleCount = 4 // MSAA
  private pixelRatio = 1
  private frustum: Frustum = new Frustum()
  public canvas: HTMLCanvasElement | null = null
  
  // --- Offscreen текстуры для многопроходного рендеринга ---
  private offscreenTexture: GPUTexture | null = null
  private offscreenResolvedTexture: GPUTexture | null = null
  private blurredIntermediateTexture: GPUTexture | null = null
  private finalBlurredTexture: GPUTexture | null = null
  private offscreenDepthTexture: GPUTexture | null = null
  
  // Для отслеживания изменений размера canvas
  private lastCanvasWidth: number = 0
  private lastCanvasHeight: number = 0

  /**
   * Инициализирует WebGPU устройство и контекст.
   *
   * @throws Error Если браузер не поддерживает WebGPU или не удалось получить адаптер.
   */
  public async init(canvas?: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) throw new Error("WebGPU не поддерживается браузером.");

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Не удалось получить WebGPU адаптер.");

    this.device = await adapter.requestDevice();

    this.canvas = canvas || document.createElement("canvas");
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("Не удалось получить WebGPU контекст.");

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    await this.setupPipelines();
    await this.setupComputePipelines();
  }

  private async setupComputePipelines(): Promise<void> {
    if (!this.device || !this.blurShaderModule) return
    
    // Создаем пайплайн для горизонтального размытия
    this.blurComputePipelineHorizontal = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.blurShaderModule,
        entryPoint: 'blur_horizontal'
      }
    })
    
    // Создаем пайплайн для вертикального размытия
    this.blurComputePipelineVertical = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.blurShaderModule,
        entryPoint: 'blur_vertical'
      }
    })
  }

  private async setupPipelines(): Promise<void> {
    if (!this.device || !this.presentationFormat) return

    // Загружаем compute-шейдер
    this.blurShaderModule = this.device.createShaderModule({
      code: blurWGSL
    })

    this.globalUniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.sceneUniformBuffer = this.device.createBuffer({
      size: SCENE_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.perObjectUniformBuffer = this.device.createBuffer({
      size: MAX_RENDERABLES * PER_OBJECT_DATA_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.perObjectDataCPU = new Float32Array(MAX_RENDERABLES * (PER_OBJECT_DATA_SIZE / 4))

    const globalBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    })

    this.globalBindGroup = this.device.createBindGroup({
      layout: globalBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globalUniformBuffer } },
        { binding: 1, resource: { buffer: this.sceneUniformBuffer } },
      ],
    })

    const perObjectBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform", hasDynamicOffset: true },
        },
        {
          binding: 1, // for skinning
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform", hasDynamicOffset: true },
        },
      ],
    })

    this.perObjectBindGroup = this.device.createBindGroup({
      layout: perObjectBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.perObjectUniformBuffer,
            size: PER_OBJECT_UNIFORM_SIZE,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.perObjectUniformBuffer,
            size: BONE_MATRICES_SIZE,
          },
        },
      ],
    })

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [globalBindGroupLayout, perObjectBindGroupLayout],
    })

    // --- Shader Modules ---
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

    // --- Pipeline для Static Meshes ---
    this.staticMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: staticShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          // normal
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
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
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: { count: this.sampleCount },
    })

    // --- Pipeline для Instanced Meshes ---
    this.instancedMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: instancedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          // normal
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          // instance matrix (4 vec4)
          {
            arrayStride: 64,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 2, offset: 0, format: "float32x4" },
              { shaderLocation: 3, offset: 16, format: "float32x4" },
              { shaderLocation: 4, offset: 32, format: "float32x4" },
              { shaderLocation: 5, offset: 48, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: instancedShaderModule,
        entryPoint: "fs_main",
        targets: [{ format: this.presentationFormat }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: { count: this.sampleCount },
    })

    // --- Pipeline для Skinned Meshes ---
    this.skinnedMeshPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: skinnedShaderModule,
        entryPoint: "vs_main",
        buffers: [
          // position
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          // normal
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          // skinIndex
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "uint16x4" }] },
          // skinWeight
          { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: "float32x4" }] },
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
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: { count: this.sampleCount },
    })

    // --- Pipeline для Lines ---
    this.linePipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: lineShaderModule,
        entryPoint: "vs_main",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
        ],
      },
      fragment: {
        module: lineShaderModule,
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
      primitive: { topology: "line-list" },
      depthStencil: {
        depthWriteEnabled: true, // Включаем запись глубины для придания объема
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: { count: this.sampleCount },
    })

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
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          // color (базовый цвет вершин)
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          // instance buffer (матрица 16 floats + параметры материала 9 floats = 25 floats = 100 байт)
          {
            arrayStride: 100, // 25 * 4 байта
            stepMode: "instance",
            attributes: [
              // Матрица инстанса (16 floats)
              { shaderLocation: 2, offset: 0, format: "float32x4" },
              { shaderLocation: 3, offset: 16, format: "float32x4" },
              { shaderLocation: 4, offset: 32, format: "float32x4" },
              { shaderLocation: 5, offset: 48, format: "float32x4" },
              // Параметры материала (9 floats)
              { shaderLocation: 6, offset: 64, format: "float32x4" }, // color (rgba)
              { shaderLocation: 7, offset: 80, format: "float32" }, // glowIntensity
              { shaderLocation: 8, offset: 84, format: "float32x4" }, // glowColor (rgba)
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
      primitive: { topology: "line-list" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
      },
      multisample: { count: this.sampleCount },
    })

    // --- Pipelines для Text ---
    this.textStencilPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: textShaderModule,
        entryPoint: "vs_main",
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }],
      },
      fragment: {
        module: textShaderModule,
        entryPoint: "fs_stencil",
        targets: [{ format: this.presentationFormat, writeMask: 0 }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
        stencilFront: { compare: "always", failOp: "keep", depthFailOp: "keep", passOp: "increment-wrap" },
        stencilBack: { compare: "always", failOp: "keep", depthFailOp: "keep", passOp: "decrement-wrap" },
      },
      multisample: { count: this.sampleCount },
    })

    this.textCoverPipeline = await this.device.createRenderPipelineAsync({
      layout: pipelineLayout,
      vertex: {
        module: textShaderModule,
        entryPoint: "vs_main",
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }],
      },
      fragment: {
        module: textShaderModule,
        entryPoint: "fs_cover",
        targets: [{ format: this.presentationFormat }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less",
        format: "depth24plus-stencil8",
        stencilFront: { compare: "not-equal", failOp: "keep", depthFailOp: "keep", passOp: "keep" },
        stencilBack: { compare: "not-equal", failOp: "keep", depthFailOp: "keep", passOp: "keep" },
      },
      multisample: { count: this.sampleCount },
    })
  }

  public setPixelRatio(value: number): void {
    this.pixelRatio = value
  }

  public setSize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = Math.floor(width * this.pixelRatio)
      this.canvas.height = Math.floor(height * this.pixelRatio)
    }
  }

  private updateOffscreenTextures(): void {
    if (!this.device || !this.canvas || !this.presentationFormat) return
    
    const width = this.canvas.width
    const height = this.canvas.height
    
    if (width === this.lastCanvasWidth && height === this.lastCanvasHeight) {
      return
    }
    
    this.lastCanvasWidth = width
    this.lastCanvasHeight = height
    
    const textureUsage = GPUTextureUsage.RENDER_ATTACHMENT | 
                         GPUTextureUsage.TEXTURE_BINDING | 
                         GPUTextureUsage.STORAGE_BINDING |
                         GPUTextureUsage.COPY_SRC
    
    // Освобождаем старые текстуры
    this.offscreenTexture?.destroy()
    this.offscreenResolvedTexture?.destroy()
    this.offscreenDepthTexture?.destroy()
    this.blurredIntermediateTexture?.destroy()
    this.finalBlurredTexture?.destroy()
    
    // Мультисемплинговая текстура для offscreen-рендеринга
    this.offscreenTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: 4,
    })
    
    // Разрешенная (односэмпловая) текстура для compute-шейдеров
    this.offscreenResolvedTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | 
             GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.COPY_SRC,
    })
    
    // Текстура глубины для offscreen-пасса
    this.offscreenDepthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus-stencil8',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      sampleCount: 4,
    })
    
    // Текстуры для размытия
    this.blurredIntermediateTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.COPY_SRC,
    })
    this.finalBlurredTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.COPY_SRC,
    })
  }

  private collectSceneObjectsByType(
    renderList: RenderItem[]
  ): { 
    glassObjects: RenderItem[], 
    regularObjects: RenderItem[], 
    uiObjects: RenderItem[] 
  } {
    // Функция для проверки, является ли объект или любой из его родителей UIDisplay
    const isUIDisplayOrChildOfUIDisplay = (obj: Object3D): boolean => {
      if ((obj as any).isUIDisplay) return true
      let parent = obj.parent
      while (parent) {
        if ((parent as any).isUIDisplay) return true
        parent = parent.parent
      }
      return false
    }

    return {
      glassObjects: renderList.filter(item => item.object.material?.isGlassMaterial === true),
      regularObjects: renderList.filter(item => 
        !item.object.material?.isGlassMaterial && 
        !isUIDisplayOrChildOfUIDisplay(item.object)
      ),
      uiObjects: renderList.filter(item => isUIDisplayOrChildOfUIDisplay(item.object))
    }
  }

  private applyBlur(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    horizontal: boolean
  ): void {
    if (!this.device || !this.blurComputePipelineHorizontal || !this.blurComputePipelineVertical) return
    
    const computePass = commandEncoder.beginComputePass()
    
    const pipeline = horizontal 
      ? this.blurComputePipelineHorizontal 
      : this.blurComputePipelineVertical
    
    computePass.setPipeline(pipeline)
    
    // Создаем bind group для передачи текстур в шейдер
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: inputTexture.createView()
        },
        {
          binding: 1,
          resource: outputTexture.createView()
        }
      ]
    })
    
    computePass.setBindGroup(0, bindGroup)
    
    // Вычисляем количество workgroup
    const width = this.canvas.width
    const height = this.canvas.height
    
    if (horizontal) {
      const workgroupCountX = Math.ceil(width / 64)
      computePass.dispatchWorkgroups(workgroupCountX, height)
    } else {
      const workgroupCountY = Math.ceil(height / 64)
      computePass.dispatchWorkgroups(width, workgroupCountY)
    }
    
    computePass.end()
  }

  public render(scene: Scene, viewPoint: ViewPoint): void {
    if (
      !this.device ||
      !this.context ||
      !this.staticMeshPipeline ||
      !this.instancedMeshPipeline ||
      !this.skinnedMeshPipeline ||
      !this.linePipeline ||
      !this.instancedLinePipeline ||
      !this.textStencilPipeline ||
      !this.textCoverPipeline ||
      !this.globalUniformBuffer ||
      !this.canvas
    )
      return

    this.updateTextures()
    this.updateOffscreenTextures()

    const commandEncoder = this.device.createCommandEncoder()
    const textureView = this.context.getCurrentTexture().createView()
    const vpMatrix = new Matrix4().multiplyMatrices(viewPoint.projectionMatrix, viewPoint.viewMatrix)
    this.device.queue.writeBuffer(this.globalUniformBuffer, 0, new Float32Array(vpMatrix.elements))
    this.frustum.setFromProjectionMatrix(vpMatrix)

    // Collect all scene objects once.
    const allRenderItems: RenderItem[] = []
    const allLights: LightItem[] = []
    collectSceneObjects(scene, allRenderItems, allLights, this.frustum)

    const { glassObjects, regularObjects, uiObjects } = this.collectSceneObjectsByType(allRenderItems)

    // Update uniform buffers once for all objects.
    this.updateSceneUniforms(allLights, viewPoint.viewMatrix)
    this.updatePerObjectData(allRenderItems)
    if (this.perObjectDataCPU && this.perObjectUniformBuffer) {
      this.device.queue.writeBuffer(this.perObjectUniformBuffer, 0, this.perObjectDataCPU.buffer)
    }

    // --- Pass 1: Render regular objects to offscreen texture ---
    if (glassObjects.length > 0 && this.offscreenTexture && this.offscreenResolvedTexture && this.offscreenDepthTexture) {
      const offscreenPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
          view: this.offscreenTexture.createView(),
          resolveTarget: this.offscreenResolvedTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0]
        }],
        depthStencilAttachment: {
          view: this.offscreenDepthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          stencilClearValue: 0,
          stencilLoadOp: 'clear',
          stencilStoreOp: 'store',
        }
      }
      const offscreenPassEncoder = commandEncoder.beginRenderPass(offscreenPassDescriptor)
      offscreenPassEncoder.setBindGroup(0, this.globalBindGroup!)
      this.renderObjectList(offscreenPassEncoder, regularObjects, allRenderItems)
      offscreenPassEncoder.end()
    }

    // --- Pass 2: Compute Blur Passes ---
    if (glassObjects.length > 0 && this.offscreenResolvedTexture && this.blurredIntermediateTexture && this.finalBlurredTexture) {
      this.applyBlur(commandEncoder, this.offscreenResolvedTexture, this.blurredIntermediateTexture, true)
      this.applyBlur(commandEncoder, this.blurredIntermediateTexture, this.finalBlurredTexture, false)
    }
    
    // --- Pass 3: Final Render Pass ---
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: this.multisampleTexture!.createView(),
          resolveTarget: textureView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: scene.background.toArray(),
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture!.createView(),
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
    this.renderObjectList(passEncoder, regularObjects, allRenderItems);
    // Рендерим стеклянные объекты (пока как обычные, но с прозрачностью)
    this.renderObjectList(passEncoder, glassObjects, allRenderItems);
    // Рендерим UI объекты
    this.renderObjectList(passEncoder, uiObjects, allRenderItems);
    
    passEncoder.end()
    this.device.queue.submit([commandEncoder.finish()])
  }


  private updatePerObjectData(objects: RenderItem[]): void {
    if (!this.perObjectDataCPU) return

    this.perObjectDataCPU.fill(0)

    for (let i = 0; i < objects.length; i++) {
      const item = objects[i]
      if (!item) continue;
      const dynamicOffset = i * PER_OBJECT_DATA_SIZE
      const offsetFloats = dynamicOffset / 4
      
      switch (item.type) {
        case "static-mesh":
          this.updateMeshData(item.object as Mesh, item.worldMatrix, offsetFloats)
          break
        case "skinned-mesh":
          this.updateSkinnedMeshData(item.object as SkinnedMesh, item.worldMatrix, offsetFloats)
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
  }

  private updateSkinnedMeshData(mesh: SkinnedMesh, worldMatrix: Matrix4, offsetFloats: number): void {
    this.updateMeshData(mesh, worldMatrix, offsetFloats);
    const dynamicOffset = offsetFloats * 4;
    const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE;
    this.perObjectDataCPU!.set(mesh.skeleton.boneMatrices, boneMatricesOffset / 4);
  }

  private updateMeshData(mesh: Mesh, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material.visible) return

    const normalMatrix = new Matrix4().copy(worldMatrix).invert().transpose()

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set(normalMatrix.elements, offsetFloats + 16)

    if (material instanceof MeshBasicMaterial || material instanceof MeshLambertMaterial) {
      this.perObjectDataCPU!.set(material.color.toArray(), offsetFloats + 32)
    } else if (material instanceof GlassMaterial) {
      this.perObjectDataCPU!.set(material.tintColor.toArray(), offsetFloats + 32)
    }
  }

  private updateInstancedMeshData(mesh: InstancedMesh, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material.visible) return

    const normalMatrix = new Matrix4().copy(worldMatrix).invert().transpose()

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set(normalMatrix.elements, offsetFloats + 16)

    if (material instanceof MeshBasicMaterial || material instanceof MeshLambertMaterial) {
      this.perObjectDataCPU!.set([...material.color.toArray(), 1.0], offsetFloats + 32)
    }
  }

  private updateInstancedLineData(lines: WireframeInstancedMesh, worldMatrix: Matrix4, offsetFloats: number): void {
    if (!lines.visible) return

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set([0, 0, 0, 0], offsetFloats + 16)
    this.perObjectDataCPU!.set([0, 0, 0, 0], offsetFloats + 20)
    this.perObjectDataCPU!.set([0, 0, 0, 0], offsetFloats + 24)
  }

  private updateLineData(lines: LineSegments, worldMatrix: Matrix4, offsetFloats: number): void {
    const material = lines.material
    const isLineBasic = material instanceof LineBasicMaterial
    const isLineGlow = material instanceof LineGlowMaterial

    if (!(isLineBasic || isLineGlow) || !material.visible) return

    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    this.perObjectDataCPU!.set(
      [material.color.r, material.color.g, material.color.b, material.color.a * material.opacity],
      offsetFloats + 16,
    )

    let glowIntensity = 1.0
    let glowColor = new Float32Array([0, 0, 0, 0])

    if (isLineGlow) {
      glowIntensity = (material as LineGlowMaterial).glowIntensity
      const glowColorObj = (material as LineGlowMaterial).glowColor
      if (glowColorObj) {
        glowColor = new Float32Array(glowColorObj.toArray())
      }
    }

    this.perObjectDataCPU!.set([glowIntensity, 0, 0, 0], offsetFloats + 20)
    this.perObjectDataCPU!.set(glowColor, offsetFloats + 24)
  }

  private updateTextData(text: Text, worldMatrix: Matrix4, offsetFloats: number, isStencil: boolean): void {
    this.perObjectDataCPU!.set(worldMatrix.elements, offsetFloats)
    if (!isStencil) {
      const material = text.material as TextMaterial
      this.perObjectDataCPU!.set(
        [material.color.r, material.color.g, material.color.b, material.color.a * material.opacity],
        offsetFloats + 32,
      )
    }
  }

  private renderObjectList(
    passEncoder: GPURenderPassEncoder,
    objectsToRender: RenderItem[],
    allObjects: RenderItem[]
  ): void {
    let currentPipeline: GPURenderPipeline | null = null

    for (const item of objectsToRender) {
      // Находим индекс этого объекта в общем списке для получения правильного renderIndex
      const renderIndex = allObjects.indexOf(item)
      if (renderIndex === -1) continue

      let pipeline: GPURenderPipeline | null = null

      // Определяем, какой конвейер нужен для текущего объекта
      switch (item.type) {
        case "static-mesh":
          pipeline = this.staticMeshPipeline
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
          pipeline = this.linePipeline
          break
        case "text-stencil":
          pipeline = this.textStencilPipeline
          break
        case "text-cover":
          pipeline = this.textCoverPipeline
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
          this.renderInstancedMesh(passEncoder, item.object as InstancedMesh, item.worldMatrix, renderIndex)
          break
        case "instanced-line":
          this.renderInstancedLines(passEncoder, item.object as WireframeInstancedMesh, item.worldMatrix, renderIndex)
          break
        case "line":
          this.renderLines(passEncoder, item.object as LineSegments, item.worldMatrix, renderIndex)
          break
        case "text-stencil":
          passEncoder.setStencilReference(0)
          this.renderTextPass(passEncoder, item.object as Text, item.worldMatrix, renderIndex, true)
          break
        case "text-cover":
          passEncoder.setStencilReference(0)
          this.renderTextPass(passEncoder, item.object as Text, item.worldMatrix, renderIndex, false)
          break
      }
    }
  }

  /**
   * Очищает кэш геометрии для указанного объекта BufferGeometry.
   * Это заставляет рендерер пересоздать GPU буферы при следующем рендеринге.
   * @param geometry - Геометрия для очистки из кэша
   */
  public invalidateGeometry(geometry: BufferGeometry): void {
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
    this.device.queue.writeBuffer(buffer, 0, typedArray)
    return buffer
  }

  private updateSceneUniforms(lights: LightItem[], viewMatrix: Matrix4): void {
    if (!this.device || !this.sceneUniformBuffer) return

    const sceneData = new ArrayBuffer(SCENE_UNIFORMS_SIZE)
    const float32View = new Float32Array(sceneData)
    const uint32View = new Uint32Array(sceneData)

    const viewNormalMatrix = new Matrix4().copy(viewMatrix).invert().transpose()

    float32View.set(viewMatrix.elements, 0)
    float32View.set(viewNormalMatrix.elements, 16)

    uint32View[32] = Math.min(lights.length, MAX_LIGHTS)

    // Вычисляем позицию камеры в мировых координатах из viewMatrix
    // cameraPosition = -transpose(rotationPart) * translationPart
    const te = viewMatrix.elements
    const tx = te[12]
    const ty = te[13]
    const tz = te[14]
    const cameraPosition = new Vector3(
      -(te[0] * tx + te[1] * ty + te[2] * tz),
      -(te[4] * tx + te[5] * ty + te[6] * tz),
      -(te[8] * tx + te[9] * ty + te[10] * tz),
    )
    // Записываем cameraPosition после lights (36 + 4*32 = 164)
    // 36 + 4*32 = 164 байта, что соответствует 41 элементу float32 (164/4 = 41)
    float32View.set([cameraPosition.x, cameraPosition.y, cameraPosition.z], 41)

    const lightsArrayOffset = 36
    for (let i = 0; i < uint32View[32]; i++) {
      const lightItem = lights[i]
      const light = lightItem.light
      const worldLightPos = new Vector3(
        lightItem.worldMatrix.elements[12],
        lightItem.worldMatrix.elements[13],
        lightItem.worldMatrix.elements[14],
      )
      const viewLightPos = worldLightPos.applyMatrix4(viewMatrix)

      const currentLightOffset = lightsArrayOffset + i * (LIGHT_STRUCT_SIZE / 4)
      float32View.set([viewLightPos.x, viewLightPos.y, viewLightPos.z, 1.0], currentLightOffset)

      float32View.set([light.color.r, light.color.g, light.color.b, light.intensity], currentLightOffset + 4)
    }

    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, sceneData)
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

      return buffers
    }

    if (!this.device) throw new Error("Device not initialized")

    const positionBuffer = this.createAndUploadBuffer(
      geometry.attributes.position.array as ArrayBufferView,
      GPUBufferUsage.VERTEX,
    )

    let normalBuffer: GPUBuffer | undefined
    if (geometry.attributes.normal) {
      normalBuffer = this.createAndUploadBuffer(
        geometry.attributes.normal.array as ArrayBufferView,
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
    } else {
      // Для линий создаем буфер цвета, заполненный единицами (белый цвет)
      const vertexCount = geometry.attributes.position.count
      const defaultColors = new Float32Array(vertexCount * 3)
      for (let i = 0; i < vertexCount * 3; i++) {
        defaultColors[i] = 1.0
      }
      colorBuffer = this.createAndUploadBuffer(defaultColors, GPUBufferUsage.VERTEX)
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
      normalBuffer,
      colorBuffer,
      indexBuffer,
      skinIndexBuffer,
      skinWeightBuffer,
      instanceMatrixBuffer,
      instanceBuffer,
    }

    this.geometryCache.set(geometry, buffers)
    return buffers
  }

  private renderMesh(
    passEncoder: GPURenderPassEncoder | null,
    mesh: Mesh | SkinnedMesh,
    worldMatrix: Matrix4,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material.visible) return

    const isSkinned = (mesh as SkinnedMesh).isSkinnedMesh;
    const dynamicOffset = renderIndex * PER_OBJECT_DATA_SIZE
    const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE

    if (passEncoder) {
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const { positionBuffer, normalBuffer, indexBuffer, skinIndexBuffer, skinWeightBuffer } =
        this.getOrCreateGeometryBuffers(mesh.geometry)

      passEncoder.setVertexBuffer(0, positionBuffer)
      if (normalBuffer) {
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
        passEncoder.draw(mesh.geometry.attributes.position.count)
      }
    }
  }

  private renderInstancedMesh(
    passEncoder: GPURenderPassEncoder | null,
    mesh: InstancedMesh,
    worldMatrix: Matrix4,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup || !this.perObjectDataCPU) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!material.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_DATA_SIZE
    const offsetFloats = dynamicOffset / 4

    const normalMatrix = new Matrix4().copy(worldMatrix).invert().transpose()

    this.perObjectDataCPU.set(worldMatrix.elements, offsetFloats) // modelMatrix
    this.perObjectDataCPU.set(normalMatrix.elements, offsetFloats + 16) // normalMatrix

    if (material instanceof MeshBasicMaterial || material instanceof MeshLambertMaterial) {
      this.perObjectDataCPU.set([...material.color.toArray(), 1.0], offsetFloats + 32)
    }

    if (passEncoder) {
      const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])

      const { positionBuffer, normalBuffer, indexBuffer, instanceMatrixBuffer } = this.getOrCreateGeometryBuffers(
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
        passEncoder.draw(mesh.geometry.attributes.position.count, mesh.count)
      }
    }
  }

  private renderLines(
    passEncoder: GPURenderPassEncoder | null,
    lines: LineSegments,
    worldMatrix: Matrix4,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup || !this.perObjectDataCPU) return

    const material = lines.material
    const isLineBasic = material instanceof LineBasicMaterial
    const isLineGlow = material instanceof LineGlowMaterial

    if (!(isLineBasic || isLineGlow) || !material.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_DATA_SIZE
    const offsetFloats = dynamicOffset / 4

    // Записываем матрицу модели (16 floats)
    this.perObjectDataCPU.set(worldMatrix.elements, offsetFloats)

    // Записываем цвет материала с opacity (4 floats)
    this.perObjectDataCPU.set(
      [material.color.r, material.color.g, material.color.b, material.color.a * material.opacity],
      offsetFloats + 16,
    )

    // Записываем параметры свечения
    let glowIntensity = 1.0
    let glowColor = new Float32Array([0, 0, 0, 0])

    if (isLineGlow) {
      glowIntensity = (material as LineGlowMaterial).glowIntensity
      const glowColorObj = (material as LineGlowMaterial).glowColor
      if (glowColorObj) {
        glowColor = new Float32Array(glowColorObj.toArray())
      }
    }

    // glowIntensity (1 float) и padding (3 floats)
    this.perObjectDataCPU.set([glowIntensity, 0, 0, 0], offsetFloats + 20)

    // glowColor (4 floats)
    this.perObjectDataCPU.set(glowColor, offsetFloats + 24)

    if (passEncoder) {
      const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const { positionBuffer, colorBuffer } = this.getOrCreateGeometryBuffers(lines.geometry)

      passEncoder.setVertexBuffer(0, positionBuffer)
      passEncoder.setVertexBuffer(1, colorBuffer || positionBuffer)
      passEncoder.draw(lines.geometry.attributes.position.count)
    }
  }

  private renderInstancedLines(
    passEncoder: GPURenderPassEncoder | null,
    lines: WireframeInstancedMesh,
    worldMatrix: Matrix4,
    renderIndex: number,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup || !this.perObjectDataCPU) return

    // Проверяем видимость
    if (!lines.visible) return

    const dynamicOffset = renderIndex * PER_OBJECT_DATA_SIZE
    const offsetFloats = dynamicOffset / 4

    // Записываем только матрицу модели (16 floats)
    this.perObjectDataCPU.set(worldMatrix.elements, offsetFloats)

    // Остальные параметры материала теперь передаются через атрибуты инстансов
    // Заполняем остальные поля нулями для выравнивания
    this.perObjectDataCPU.set([0, 0, 0, 0], offsetFloats + 16) // color
    this.perObjectDataCPU.set([0, 0, 0, 0], offsetFloats + 20) // glowIntensity + padding
    this.perObjectDataCPU.set([0, 0, 0, 0], offsetFloats + 24) // glowColor

    if (passEncoder) {
      const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const { positionBuffer, colorBuffer, instanceBuffer } = this.getOrCreateGeometryBuffers(lines.geometry)

      passEncoder.setVertexBuffer(0, positionBuffer)
      passEncoder.setVertexBuffer(1, colorBuffer || positionBuffer)
      if (instanceBuffer) {
        passEncoder.setVertexBuffer(2, instanceBuffer)
      }
      passEncoder.draw(lines.geometry.attributes.position.count, lines.count)
    }
  }

  private renderTextPass(
    passEncoder: GPURenderPassEncoder | null,
    text: Text,
    worldMatrix: Matrix4,
    renderIndex: number,
    isStencil: boolean,
  ): void {
    if (!this.device || !this.perObjectUniformBuffer || !this.perObjectBindGroup || !this.perObjectDataCPU) return
    const geometry = isStencil ? text.stencilGeometry : text.coverGeometry
    if (!geometry.index) return

    const dynamicOffset = renderIndex * PER_OBJECT_DATA_SIZE
    const offsetFloats = dynamicOffset / 4
    this.perObjectDataCPU.set(worldMatrix.elements, offsetFloats)
    if (!isStencil) {
      this.perObjectDataCPU.set([...(text.material as TextMaterial).color.toArray(), 1.0], offsetFloats + 32)
    }

    if (passEncoder) {
      const boneMatricesOffset = dynamicOffset + PER_OBJECT_UNIFORM_SIZE
      passEncoder.setBindGroup(1, this.perObjectBindGroup, [dynamicOffset, boneMatricesOffset])
      const { positionBuffer, indexBuffer } = this.getOrCreateGeometryBuffers(geometry)

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
      if (this.depthTexture) this.depthTexture.destroy()
      if (this.multisampleTexture) this.multisampleTexture.destroy()

      const size = { width: this.canvas.width, height: this.canvas.height }

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
    }
  }
}
