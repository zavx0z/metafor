struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    color: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

@binding(0) @group(2) var atlasSampler: sampler;
@binding(1) @group(2) var atlasTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) uv: vec2<f32>
) -> VertexOutput {
    var out: VertexOutput;
    let worldPosition = perObject.modelMatrix * vec4<f32>(pos, 1.0);
    out.position = globalUniforms.viewProjectionMatrix * worldPosition;
    out.uv = uv;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // SDF: значение в R-канале (tiny-sdf пишет одинаковый distance в RGB,
    // alpha=255). 0.5 — контур глифа: > 0.5 внутри, < 0.5 снаружи.
    // Adaptive smoothstep через fwidth даёт чёткие края на любом масштабе.
    let sdf = textureSample(atlasTexture, atlasSampler, in.uv).r;
    let smoothing = fwidth(sdf);
    let alpha = smoothstep(0.5 - smoothing, 0.5 + smoothing, sdf);
    return vec4<f32>(perObject.color.rgb, perObject.color.a * alpha);
}
