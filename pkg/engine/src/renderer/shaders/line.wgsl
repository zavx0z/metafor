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
  color: vec4<f32>,
  glowIntensity: f32,
  _padding: vec3<f32>, // для выравнивания после glowIntensity
  glowColor: vec4<f32>
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) vertexColor: vec4<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) color: vec3<f32>
) -> VertexOutput {
  var out: VertexOutput;
  let worldPos = (perObject.modelMatrix * vec4<f32>(pos, 1.0)).xyz;
  out.position = globalUniforms.viewProjectionMatrix * vec4<f32>(worldPos, 1.0);
  out.worldPosition = worldPos;
  out.vertexColor = vec4<f32>(color * perObject.color.rgb, perObject.color.a);
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
  let glowFade = exp(-0.5 * normalizedDistance / perObject.glowIntensity);
  
  // Смешиваем базовое затухание и свечение в зависимости от интенсивности
  let finalFade = mix(baseFade, glowFade, min(perObject.glowIntensity * 0.5, 1.0));
  
  // Используем цвет свечения если он задан, иначе цвет вершины
  let glowColor = perObject.glowColor;
  let useGlowColor = glowColor.a > 0.0;
  let finalColor = select(in.vertexColor.rgb, glowColor.rgb, useGlowColor);
  
  return vec4<f32>(finalColor * finalFade, in.vertexColor.a * finalFade);
}
