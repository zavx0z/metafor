/// <reference types="@webgpu/types" />

export type GpuCtx = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  pipeline: GPURenderPipeline
  uniformBuffer: GPUBuffer
  bindGroup: GPUBindGroup
  canvas: HTMLCanvasElement
}

const SHADER = /* wgsl */ `
struct Uniforms {
  // [cos, sin, aspect, time]
  data: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) local: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // full-screen-ish quad in NDC, then we rotate / scale via uniform
  var quad = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0),
  );

  let p = quad[vi];

  let c = u.data.x;
  let s = u.data.y;
  let aspect = u.data.z;

  // size of the figure relative to the smaller screen dimension
  let size = 0.28;

  // rotate
  var r = vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);

  // scale + correct aspect
  r.x = r.x * size / aspect;
  r.y = r.y * size;

  var out: VsOut;
  out.pos = vec4(r, 0.0, 1.0);
  out.local = p; // -1..1 in unrotated quad space, used for shape mask
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let t = u.data.w;

  // signed distance to a square (in unrotated local space)
  let d = max(abs(in.local.x), abs(in.local.y));

  // outline
  let outlineInner = 0.86;
  let outlineOuter = 0.99;
  let outline = smoothstep(outlineOuter, outlineInner - 0.01, d) - smoothstep(outlineInner, outlineInner - 0.05, d);

  // fill mask (inside square)
  let fillMask = 1.0 - smoothstep(0.78, 0.82, d);

  // pulsing alpha
  let pulse = 0.35 + 0.15 * sin(t * 2.0);

  // base fill colour: cyan/magenta gradient
  let baseColor = vec3<f32>(
    0.4 + 0.5 * sin(t + in.local.x * 2.0),
    0.3 + 0.4 * cos(t * 1.3 + in.local.y * 2.0),
    0.9
  );

  // bright outline colour
  let outlineColor = vec3<f32>(1.0, 0.85, 0.2);

  let fillRGBA = vec4(baseColor, fillMask * pulse);
  let outRGBA  = vec4(outlineColor, outline);

  // composite outline over fill
  let a = outRGBA.a + fillRGBA.a * (1.0 - outRGBA.a);
  let rgb = outRGBA.rgb * outRGBA.a + fillRGBA.rgb * fillRGBA.a * (1.0 - outRGBA.a);

  if (a <= 0.001) {
    discard;
  }

  // premultiplied alpha output (matches alphaMode: 'premultiplied')
  return vec4(rgb, a);
}
`

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GpuCtx> {
  if (!navigator.gpu) {
    console.error("[space] WebGPU not supported in this webview")
    throw new Error("WebGPU not supported")
  }
  console.log("[space] WebGPU supported")

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" })
  if (!adapter) {
    console.error("[space] No GPU adapter")
    throw new Error("No GPU adapter")
  }
  console.log("[space] adapter found:", adapter.info?.vendor ?? "(unknown vendor)")

  const device = await adapter.requestDevice()
  console.log("[space] device created")

  const context = canvas.getContext("webgpu")
  if (!context) throw new Error("Failed to get webgpu context")

  const format = navigator.gpu.getPreferredCanvasFormat()

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  })
  console.log("[space] canvas configured, format =", format)

  const module = device.createShaderModule({ code: SHADER })

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: {
      module,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "one",
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
    primitive: { topology: "triangle-list" },
  })

  const uniformBuffer = device.createBuffer({
    size: 16, // vec4<f32>
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  })

  return { device, context, format, pipeline, uniformBuffer, bindGroup, canvas }
}

export function frame(ctx: GpuCtx, time: number) {
  const { device, context, pipeline, uniformBuffer, bindGroup, canvas } = ctx

  const angle = time * 0.5
  const aspect = canvas.width / Math.max(1, canvas.height)
  const data = new Float32Array([Math.cos(angle), Math.sin(angle), aspect, time])
  device.queue.writeBuffer(uniformBuffer, 0, data.buffer, data.byteOffset, data.byteLength)

  const encoder = device.createCommandEncoder()
  const view = context.getCurrentTexture().createView()

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, // fully transparent background
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  })

  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.draw(6, 1, 0, 0)
  pass.end()

  device.queue.submit([encoder.finish()])
}

export function resizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.floor(window.innerWidth * dpr))
  const h = Math.max(1, Math.floor(window.innerHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
}
