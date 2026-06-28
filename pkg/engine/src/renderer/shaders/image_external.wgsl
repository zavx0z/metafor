struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    color: vec4<f32>,
    clipBounds: vec4<f32>,
    imageViewBox: vec4<f32>,
    imageParams: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

@binding(0) @group(2) var imageSampler: sampler;
@binding(1) @group(2) var imageTexture: texture_external;

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

fn isClipDisabled() -> bool {
    let b = perObject.clipBounds;
    return b.x == 0.0 && b.y == 0.0 && b.z == 0.0 && b.w == 0.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (!isClipDisabled()) {
        let p = in.position.xy;
        let b = perObject.clipBounds;
        if (p.x < b.x || p.x > b.z || p.y < b.y || p.y > b.w) {
            discard;
        }
    }

    let vb = perObject.imageViewBox;
    let opacity = perObject.imageParams.x;
    let boxAspect = max(perObject.imageParams.y, 0.0001);
    let fitMode = perObject.imageParams.z;
    let sourceAspect = max(perObject.imageParams.w, 0.0001);
    let imageAspect = max((sourceAspect * vb.z) / max(vb.w, 0.0001), 0.0001);

    var uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
    var alpha = 1.0;

    if (fitMode > 0.5) {
        var rect = vec4<f32>(0.0, 0.0, 1.0, 1.0);
        if (imageAspect > boxAspect) {
            rect.w = 1.0;
            rect.z = boxAspect / imageAspect;
            rect.y = (1.0 - rect.z) * 0.5;
        } else {
            rect.z = 1.0;
            rect.w = imageAspect / boxAspect;
            rect.x = (1.0 - rect.w) * 0.5;
        }
        if (uv.x < rect.x || uv.x > rect.x + rect.w || uv.y < rect.y || uv.y > rect.y + rect.z) {
            return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
        uv = (uv - rect.xy) / rect.wz;
    } else {
        if (imageAspect > boxAspect) {
            let sourceW = boxAspect / imageAspect;
            let sourceX = (1.0 - sourceW) * 0.5;
            uv.x = sourceX + uv.x * sourceW;
        } else {
            let sourceH = imageAspect / boxAspect;
            let sourceY = (1.0 - sourceH) * 0.5;
            uv.y = sourceY + uv.y * sourceH;
        }
    }

    let sourceUv = vec2<f32>(vb.x + uv.x * vb.z, vb.y + uv.y * vb.w);
    let color = textureSampleBaseClampToEdge(imageTexture, imageSampler, sourceUv);
    return vec4<f32>(color.rgb, color.a * opacity * alpha);
}
