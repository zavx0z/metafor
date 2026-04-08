// Uniforms для настроек стекла
struct GlassUniforms {
    tintColor: vec4<f32>,
    opacity: f32,
    blurIntensity: f32,
};

@group(1) @binding(0) var<uniform> glassUniforms: GlassUniforms;
@group(1) @binding(1) var mySampler: sampler;
@group(1) @binding(2) var blurredTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>
) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(position, 1.0);
    output.uv = uv;
    return output;
}

@fragment
fn fs_main(
    @builtin(position) frag_coord: vec4<f32>,
    @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {
    // Получаем UV экранных координат
    let textureSize = vec2<f32>(textureDimensions(blurredTexture));
    let screenUV = frag_coord.xy / textureSize;
    
    // Сэмплируем размытую текстуру фона
    let blurredColor = textureSample(blurredTexture, mySampler, screenUV);
    
    // Применяем тонирование
    let tintedColor = mix(blurredColor.rgb, glassUniforms.tintColor.rgb, glassUniforms.tintColor.a);
    
    // Возвращаем с учетом прозрачности
    return vec4<f32>(tintedColor, glassUniforms.opacity);
}
