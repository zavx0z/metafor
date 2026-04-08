struct GlobalUniforms {
    viewProjectionMatrix: mat4x4<f32>,
};
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
    normalMatrix: mat4x4<f32>,
    color: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) viewPosition: vec3<f32>,
    @location(1) viewNormal: vec3<f32>,
};

@vertex
fn vs_main(
    @location(0) pos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) instanceMatrix0: vec4<f32>,
    @location(3) instanceMatrix1: vec4<f32>,
    @location(4) instanceMatrix2: vec4<f32>,
    @location(5) instanceMatrix3: vec4<f32>
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
    
    var worldPosition: vec4<f32>;
    var worldNormal: vec3<f32>;

    worldPosition = worldMatrix * vec4<f32>(pos, 1.0);
    
    // Для нормалей используем верхнюю левую 3x3 часть матрицы инстанса
    // Это корректно для вращений и равномерного масштаба
    // Для неравномерного масштаба нужно использовать обратную транспонированную матрицу,
    // но в WGSL нет встроенной функции inverse, поэтому упрощаем
    let instanceNormalMatrix = mat3x3<f32>(
        instanceMatrix0.xyz,
        instanceMatrix1.xyz,
        instanceMatrix2.xyz
    );
    
    // Комбинируем нормальные матрицы
    let combinedNormalMatrix = perObject.normalMatrix * mat4x4<f32>(
        vec4<f32>(instanceNormalMatrix[0], 0.0),
        vec4<f32>(instanceNormalMatrix[1], 0.0),
        vec4<f32>(instanceNormalMatrix[2], 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
    
    worldNormal = (combinedNormalMatrix * vec4<f32>(normal, 0.0)).xyz;

    out.position = globalUniforms.viewProjectionMatrix * worldPosition;
    out.viewPosition = (sceneUniforms.viewMatrix * worldPosition).xyz;
    out.viewNormal = (sceneUniforms.viewNormalMatrix * vec4<f32>(worldNormal, 0.0)).xyz;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let ambient = vec3<f32>(0.1, 0.1, 0.1);
    var totalDiffuse = vec3<f32>(0.0, 0.0, 0.0);
    let normal = normalize(in.viewNormal);

    for (var i: u32 = 0u; i < sceneUniforms.numLights; i = i + 1u) {
        let light = sceneUniforms.lights[i];
        let lightDir = normalize(light.position.xyz - in.viewPosition);
        let diffuseStrength = max(dot(normal, lightDir), 0.0);
        let intensity = light.color.a;
        totalDiffuse = totalDiffuse + light.color.rgb * diffuseStrength * intensity;
    }

    let finalColor = perObject.color.rgb * (ambient + totalDiffuse);
    return vec4<f32>(finalColor, perObject.color.a);
}