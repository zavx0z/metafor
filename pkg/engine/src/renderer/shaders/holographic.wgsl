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
    hologramParams: vec4<f32>,
    patternParams: vec4<f32>,
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
    let silhouette = pow(1.0 - facing, 2.8);

    let opacity = perObject.hologramParams.x;
    let rimStrength = perObject.hologramParams.y;
    let scanDensity = perObject.hologramParams.z;
    let scanSharpness = perObject.hologramParams.w;
    let irregularity = perObject.patternParams.x;
    let patternOffset = perObject.patternParams.y;
    let bandRadius = perObject.patternParams.z;
    let bandHalfWidth = perObject.patternParams.w;
    let signalPosition = in.worldPosition.xy;

    // World-space interference avoids the discontinuity of polar angles. The
    // three low-cost carriers form a continuous, uneven projection signal
    // without textures, cells, hard masks or a second render pass.
    let driftA = 0.5 + 0.5 * sin(
        dot(signalPosition, vec2<f32>(0.091, 0.057)) + patternOffset
    );
    let driftB = 0.5 + 0.5 * cos(
        dot(signalPosition, vec2<f32>(-0.043, 0.127)) - patternOffset * 0.73
    );
    let microSignal = 0.5 + 0.5 * sin(
        dot(signalPosition, vec2<f32>(1.37, -1.91)) +
        driftA * 2.4 +
        patternOffset
    );
    let interference = driftA * 0.62 + driftB * 0.38;
    let emission = mix(1.0, 0.22 + interference * 1.35, irregularity);

    // Concentric carriers reinforce an orbital Field instead of cutting it
    // into a screen-space grid. A small continuous drift keeps the projection
    // visibly unstable without introducing an angular seam.
    let scanWarp = (driftA - 0.5) * irregularity * 0.8;
    let scanPhase = length(signalPosition) * scanDensity * 6.2831853 +
        patternOffset + scanWarp;
    let scanCarrier = 0.5 + 0.5 * cos(scanPhase);
    let scan = pow(scanCarrier, mix(2.2, 8.0, scanSharpness));

    // Orbital Fields provide their radius and half-width. This produces a
    // luminous, slightly unstable silhouette on both boundaries while generic
    // Sphere/Torus holograms keep the view-angle contour only.
    let bandEnabled = select(0.0, 1.0, bandHalfWidth > 0.0001);
    let bandDistance = abs(length(signalPosition) - bandRadius) /
        max(bandHalfWidth, 0.0001);
    let edgeCoordinate = clamp(bandDistance, 0.0, 1.0);
    let edgeHalo = pow(edgeCoordinate, 2.0) * bandEnabled;
    let edgeCore = pow(edgeCoordinate, 10.0) * bandEnabled;
    let edgePulse = 0.28 + pow(interference, 1.4) * 1.42 +
        microSignal * 0.12;
    let edgeSignal = (edgeHalo * 0.38 + edgeCore * 0.78) * edgePulse;

    let baseColor = clamp(
        perObject.color.rgb,
        vec3<f32>(0.0),
        vec3<f32>(1.0)
    );
    let luminousColor = mix(baseColor, vec3<f32>(1.0), 0.16);
    // The surface is unlit and emissive: view angle only reinforces its colored
    // contour, never producing a white reflective or lacquered highlight.
    let bodyEnergy = (0.52 + scan * 0.18) * emission;
    let contourEnergy = silhouette * rimStrength * 0.42 *
        (0.78 + scan * 0.22);
    let color =
        baseColor * bodyEnergy * 2.8 +
        luminousColor * (contourEnergy * 1.35 + edgeSignal * 2.35);
    let alpha = clamp(
        opacity * (
            (0.23 + scan * 0.08) * (0.55 + emission * 0.45) +
            silhouette * 0.22 +
            edgeSignal * 0.22
        ),
        0.0,
        0.62
    );

    return vec4<f32>(color, alpha);
}
