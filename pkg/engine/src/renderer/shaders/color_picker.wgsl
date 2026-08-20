struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    hsva: vec4<f32>,
    geometry: vec4<f32>,
    checkerPrimary: vec4<f32>,
    checkerSecondary: vec4<f32>,
    checkerParams: vec4<f32>,
    clipBounds: vec4<f32>,
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

fn hsvToRgb(hsv: vec3<f32>) -> vec3<f32> {
    let p = abs(fract(vec3<f32>(hsv.x) + vec3<f32>(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return hsv.z * mix(vec3<f32>(1.0), clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), hsv.y);
}

fn outsideClip(position: vec4<f32>) -> bool {
    let bounds = perObject.clipBounds;
    let clipEnabled = bounds.z > bounds.x && bounds.w > bounds.y;
    return clipEnabled && (
        position.x < bounds.x || position.y < bounds.y ||
        position.x > bounds.z || position.y > bounds.w
    );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (outsideClip(in.position)) {
        discard;
    }
    let size = max(perObject.geometry.xy, vec2<f32>(0.0001));
    let mode = perObject.geometry.z;
    let opacity = perObject.geometry.w;
    let uv = vec2<f32>(
        in.localPos.x / size.x + 0.5,
        0.5 - in.localPos.y / size.y
    );

    if (mode < 0.5) {
        let shortest = max(min(size.x, size.y), 0.0001);
        let point = vec2<f32>(in.localPos.x, -in.localPos.y) * (2.0 / shortest);
        let saturation = length(point);
        if (saturation > 1.0) {
            discard;
        }
        let hue = fract(atan2(point.y, point.x) / 6.28318530718 + 1.0);
        return vec4<f32>(hsvToRgb(vec3<f32>(hue, saturation, perObject.hsva.z)), opacity);
    }

    let level = select(perObject.hsva.w, clamp(1.0 - uv.y, 0.0, 1.0), mode < 2.5);
    if (mode < 1.5) {
        return vec4<f32>(vec3<f32>(level), opacity);
    }

    let rgb = hsvToRgb(vec3<f32>(perObject.hsva.x, perObject.hsva.y, perObject.hsva.z));
    let checkerCell = vec2<f32>(max(perObject.checkerParams.x, 0.0001));
    let checkerIndex = floor((uv * size) / checkerCell);
    let checker = select(perObject.checkerPrimary.rgb, perObject.checkerSecondary.rgb, i32(checkerIndex.x + checkerIndex.y) % 2 == 0);
    let composite = mix(checker, rgb, level);
    return vec4<f32>(composite, opacity);
}
