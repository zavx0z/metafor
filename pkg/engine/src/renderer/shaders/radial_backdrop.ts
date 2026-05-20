export default /* wgsl */ `
struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    base: vec4<f32>,
    glowA: vec4<f32>,
    glowB: vec4<f32>,
    size: vec4<f32>,
    glowAParams: vec4<f32>,
    glowBParams: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) localPos: vec2<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOutput {
    _ = normal;

    var out: VertexOutput;
    let worldPosition = perObject.modelMatrix * vec4<f32>(pos, 1.0);
    out.position = globalUniforms.viewProjectionMatrix * worldPosition;
    out.localPos = pos.xy;
    return out;
}

fn glowAlpha(uv: vec2<f32>, params: vec4<f32>, size: vec2<f32>, opacity: f32) -> f32 {
    let shortest = max(min(size.x, size.y), 0.0001);
    let pixelDelta = (uv - params.xy) * size;
    let distanceFromCenter = length(pixelDelta) / shortest;
    let radius = max(params.z, 0.0001);
    return opacity * clamp(1.0 - distanceFromCenter / radius, 0.0, 1.0);
}

fn over(base: vec3<f32>, top: vec3<f32>, alpha: f32) -> vec3<f32> {
    let a = clamp(alpha, 0.0, 1.0);
    return base * (1.0 - a) + top * a;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let size = max(perObject.size.xy, vec2<f32>(0.0001));
    let uv = vec2<f32>(
        in.localPos.x / size.x + 0.5,
        0.5 - in.localPos.y / size.y
    );

    let a = glowAlpha(uv, perObject.glowAParams, size, perObject.glowA.a);
    let b = glowAlpha(uv, perObject.glowBParams, size, perObject.glowB.a);
    var rgb = perObject.base.rgb;
    rgb = over(rgb, perObject.glowA.rgb, a);
    rgb = over(rgb, perObject.glowB.rgb, b);

    return vec4<f32>(rgb, perObject.base.a);
}
`
