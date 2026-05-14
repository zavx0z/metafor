// RoundedRectMaterial — SDF-based rounded rectangle (capsule, circle).
//
// Слот в perObject:
//   modelMatrix     [offsetFloats +  0 .. +15]
//   normalMatrix    [offsetFloats + 16 .. +31] (не используется, но layout общий)
//   fill rgba       [offsetFloats + 32 .. +35]
//   border rgba     [offsetFloats + 36 .. +39]
//   size.xy + pad   [offsetFloats + 40 .. +43] (vec4: w, h, 0, 0 — world-units)
//   radii tl/tr/br/bl [offsetFloats + 44 .. +47]
//   borderWidth + opacity + 2 pad [offsetFloats + 48 .. +51]
//   clipBounds      [offsetFloats + 52 .. +55] (xMin, yMin, xMax, yMax screen-px)
//
// Антиалиасинг — fwidth(sdf) даёт screen-correct ширину перехода в 1 px
// независимо от размера меша и DPR.

struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
@binding(0) @group(0) var<uniform> globalUniforms: GlobalUniforms;

struct PerObjectUniforms {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    fill: vec4<f32>,
    border: vec4<f32>,
    size: vec4<f32>,
    radii: vec4<f32>,
    params: vec4<f32>,
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
    // local 2D position в координатах самого меша (centered).
    // PlaneGeometry центрирована вокруг нуля; pos.xy уже в [-w/2, w/2].
    out.localPos = pos.xy;
    return out;
}

fn isClipDisabled() -> bool {
    let b = perObject.clipBounds;
    return b.x == 0.0 && b.y == 0.0 && b.z == 0.0 && b.w == 0.0;
}

/// SDF rounded box (Inigo Quilez):
///   p — точка относительно центра (signed),
///   halfSize — половина размеров,
///   r — радиусы в UI-порядке: x=TL, y=TR, z=BR, w=BL.
/// PlaneGeometry центрирована вокруг нуля; world-y растёт вверх →
/// pos.y > 0 = верхняя половина меша (визуальный верх под camera).
fn sdRoundBox(p: vec2<f32>, halfSize: vec2<f32>, r: vec4<f32>) -> f32 {
    var rr: f32;
    if (p.x <= 0.0 && p.y >  0.0) { rr = r.x; }  // TL
    else if (p.x >  0.0 && p.y >  0.0) { rr = r.y; }  // TR
    else if (p.x >  0.0 && p.y <= 0.0) { rr = r.z; }  // BR
    else                              { rr = r.w; }  // BL
    let q = abs(p) - halfSize + vec2<f32>(rr);
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2<f32>(0.0))) - rr;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (!isClipDisabled()) {
        let sp = in.position.xy;
        let b = perObject.clipBounds;
        if (sp.x < b.x || sp.x > b.z || sp.y < b.y || sp.y > b.w) {
            discard;
        }
    }

    let halfSize = perObject.size.xy * 0.5;
    // Радиусы клампим до min(halfSize.x, halfSize.y), иначе SDF даёт артефакты.
    let rMax = min(halfSize.x, halfSize.y);
    let radii = clamp(perObject.radii, vec4<f32>(0.0), vec4<f32>(rMax));

    let borderWidth = perObject.params.x;
    let opacity = perObject.params.y;

    let p = in.localPos;
    let dOuter = sdRoundBox(p, halfSize, radii);

    // fwidth → ширина одного экранного пикселя в world-units, измеренная
    // через derivatives. Гарантирует ровно ±0.5px переход независимо от
    // dpr и зума.
    let aa = max(fwidth(dOuter), 0.00001);
    let outerMask = 1.0 - smoothstep(-aa, aa, dOuter);

    if (borderWidth <= 0.0) {
        // Только заливка — без border.
        let a = perObject.fill.a * outerMask * opacity;
        if (a <= 0.0) { discard; }
        return vec4<f32>(perObject.fill.rgb, a);
    }

    // Внутренняя граница — тот же rect, уменьшенный на borderWidth.
    let innerHalf = max(halfSize - vec2<f32>(borderWidth), vec2<f32>(0.0));
    let innerRadii = max(radii - vec4<f32>(borderWidth), vec4<f32>(0.0));
    let dInner = sdRoundBox(p, innerHalf, innerRadii);
    let innerMask = 1.0 - smoothstep(-aa, aa, dInner);

    // border region = outer ∧ ¬inner
    let borderStrength = max(outerMask - innerMask, 0.0);
    let fillStrength = innerMask;

    let rgb = perObject.fill.rgb * fillStrength * perObject.fill.a
            + perObject.border.rgb * borderStrength * perObject.border.a;
    let a = (fillStrength * perObject.fill.a + borderStrength * perObject.border.a) * opacity;
    if (a <= 0.0) { discard; }
    // Premultiplied → divide rgb на a чтобы получить straight color,
    // потому что blend pipeline ожидает src-alpha с straight color.
    return vec4<f32>(rgb / max(a, 0.00001), a);
}
