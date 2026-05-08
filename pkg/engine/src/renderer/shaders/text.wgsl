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

// clipBounds — screen-space rect (framebuffer-pixels): (minX, minY, maxX, maxY).
// Фрагменты с position.xy вне этого rect'а discardятся. Clip — на стадии
// фрагмента после projection, поэтому камеру/perspective учитывать не нужно:
// gl_FragCoord уже учитывает их. Если clipBounds == (0,0,0,0) — clip выключен.
struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    color: vec4<f32>,
    clipBounds: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec3<f32>) -> VertexOutput {
    var out: VertexOutput;
    let worldPosition = perObject.modelMatrix * vec4<f32>(pos, 1.0);
    out.position = globalUniforms.viewProjectionMatrix * worldPosition;
    return out;
}

@fragment
fn fs_stencil(in: VertexOutput) -> @location(0) vec4<f32> {
    // Output is ignored due to write mask, but must return valid type
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}

fn isClipDisabled() -> bool {
    let b = perObject.clipBounds;
    return b.x == 0.0 && b.y == 0.0 && b.z == 0.0 && b.w == 0.0;
}

@fragment
fn fs_cover(in: VertexOutput) -> @location(0) vec4<f32> {
    if (!isClipDisabled()) {
        let p = in.position.xy;
        let b = perObject.clipBounds;
        if (p.x < b.x || p.x > b.z || p.y < b.y || p.y > b.w) {
            discard;
        }
    }
    return perObject.color;
}
