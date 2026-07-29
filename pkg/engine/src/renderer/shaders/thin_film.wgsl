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
    baseColor: vec4<f32>,
    rimColor: vec4<f32>,
    filmParams: vec4<f32>,
    highlightParams: vec4<f32>,
};
@binding(0) @group(1) var<uniform> perObject: PerObjectUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) worldNormal: vec3<f32>,
};

@vertex
fn vs_main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOutput {
    var out: VertexOutput;
    let worldPosition = perObject.modelMatrix * vec4<f32>(position, 1.0);
    out.position = globalUniforms.viewProjectionMatrix * worldPosition;
    out.worldPosition = worldPosition.xyz;
    out.worldNormal = normalize(
        (perObject.normalMatrix * vec4<f32>(normal, 0.0)).xyz
    );
    return out;
}

@fragment
fn fs_main(
    in: VertexOutput,
    @builtin(front_facing) frontFacing: bool
) -> @location(0) vec4<f32> {
    let rawNormal = normalize(in.worldNormal);
    let normal = select(-rawNormal, rawNormal, frontFacing);
    let viewDirection = normalize(sceneUniforms.cameraPosition - in.worldPosition);
    let facing = clamp(abs(dot(normal, viewDirection)), 0.0, 1.0);
    let fresnel = pow(1.0 - facing, 1.7);

    let opacity = perObject.filmParams.x;
    let rimStrength = perObject.filmParams.y;
    let iridescence = perObject.filmParams.z;
    let filmThickness = perObject.filmParams.w;
    let highlightSize = clamp(perObject.highlightParams.x, 0.0, 1.0);

    // Bounded interference waves modulate the material colors. The rim color
    // remains the source of every highlight instead of a fixed spectrum.
    let phase = (
        (1.0 - facing) * 16.0 +
        dot(rawNormal, vec3<f32>(1.7, 2.3, 1.1))
    ) * filmThickness;
    let interference = 0.52 + 0.48 * cos(
        vec3<f32>(phase, phase + 2.094, phase + 4.189)
    );
    let glowColor = clamp(
        perObject.rimColor.rgb,
        vec3<f32>(0.0),
        vec3<f32>(1.0)
    );
    let filmTint = mix(
        perObject.baseColor.rgb,
        glowColor,
        0.28 + interference.r * 0.62
    );
    let highlightTint = mix(
        glowColor,
        vec3<f32>(1.0),
        0.08 + interference.g * 0.18
    );
    let membraneColor = mix(
        perObject.baseColor.rgb,
        filmTint,
        iridescence * (0.25 + fresnel * 0.75)
    );
    let spectralRim = mix(
        glowColor,
        highlightTint,
        iridescence * interference.b * 0.42
    );
    let outerRim = smoothstep(0.42, 0.98, fresnel);

    let keyLight = normalize(vec3<f32>(-0.58, -0.72, 0.62));
    let fillLight = normalize(vec3<f32>(0.62, -0.66, -0.24));
    let keyHalf = normalize(keyLight + viewDirection);
    let fillHalf = normalize(fillLight + viewDirection);
    let keyFacing = max(dot(normal, keyHalf), 0.0);
    let fillFacing = max(dot(normal, fillHalf), 0.0);
    let keyHighlight = pow(keyFacing, mix(120.0, 12.0, highlightSize));
    let keySheen = pow(keyFacing, mix(12.0, 3.0, highlightSize));
    let fillHighlight = pow(fillFacing, mix(60.0, 7.0, highlightSize));
    let highlightEnergy = mix(1.0, 0.72, highlightSize);

    // A wide reflection band keeps the membrane readable between the pin
    // highlights and the silhouette, like a large softbox on a soap bubble.
    let bandCoordinate = dot(normal, normalize(vec3<f32>(0.22, -0.93, 0.29)));
    let reflectionBand = pow(
        max(0.0, 1.0 - abs(bandCoordinate - 0.72) * 5.5),
        2.2
    );

    let color =
        perObject.baseColor.rgb * 0.025 +
        membraneColor * (0.045 + fresnel * 0.24) +
        spectralRim * fresnel * rimStrength * 0.62 +
        glowColor * outerRim * 0.22 +
        highlightTint * keyHighlight * 1.2 * highlightEnergy +
        glowColor * keySheen * 0.2 * highlightEnergy +
        mix(glowColor, highlightTint, 0.42) *
            fillHighlight * 0.32 * highlightEnergy +
        filmTint * reflectionBand * (0.18 + fresnel * 0.28);
    let alpha = clamp(
        opacity * (0.045 + fresnel * 0.955) +
        keyHighlight * 0.4 +
        keySheen * 0.035 +
        fillHighlight * 0.065 +
        reflectionBand * 0.035,
        0.0,
        0.92
    );

    return vec4<f32>(color, alpha);
}
