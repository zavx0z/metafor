import {describe, expect, test} from "bun:test"
import {
  EDGE_TORUS_GAP_MM,
  ELECTROMAGNETIC_CONTROL_HEIGHT_RATIO,
  buildEdgeConstraintModel,
  buildHermiteBeamModel,
  buildSourceSinkFieldModel,
  constrainSphereOffset,
  defaultHermiteTangentLengths,
  edgeClearanceTransitionDistance,
  fieldShapeControlHeights,
  minimumEdgeTorusCenterDistance,
  requiredEdgeClearance,
  sphereOffsetLimit,
} from "./EdgesLab.ts"

describe("Edges Lab constraint geometry", () => {
  test("documents every adjustable scene parameter in Russian", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()
    const descriptions = [
      "Расстояние центров",
      "Радиус сферы",
      "Безопасный зазор",
      "Дополнительный подъём",
      "Масштаб левого Torus",
      "Масштаб правого Torus",
      "Направление выхода L",
      "Направление входа R",
      "Длина левого вектора",
      "Длина правого вектора",
    ]

    for (const description of descriptions) {
      expect(page).toContain(`Описание параметра ${description}`)
    }
    expect(page).toContain("Описание вспомогательных элементов")
    expect(page).not.toContain('id="edges-torus-radius"')
    expect(page).not.toContain('id="edges-left-sphere-x"')
    expect(page).not.toContain('id="edges-right-sphere-y"')
    expect(page).toContain("Два Torus · «Наш default»")
    expect(page).toContain("Analysis → Torus")
    expect(page).toContain("перетаскиванием левой кнопкой мыши")
    expect(page).toContain("Высота маршрута")
    expect(page).not.toContain("Азимут слева")
    expect(page).toContain("Формула расчёта Edge")
    expect(page).toContain("Составная экспериментальная формула MetaFor")
    expect(page).toContain("Силовая линия «источник → сток»")
    expect(page).toContain("Описание формулы источник — сток")
    expect(page).toContain("Кубическая Hermite-кривая")
    expect(page).toContain("Описание формулы Hermite")
    expect(page).toContain("UT Austin · Hermite curves")
    expect(page).toContain("Euler–Bernoulli beam elements")
    expect(page).toContain("MIT · complex potential")
    expect(page).toContain('id="edges-add-example"')
    expect(page).toContain("Добавить в примеры")
    expect(page).toContain('id="edges-examples-body"')
    expect(page).toContain('id="edges-example')
    expect(page).toContain("cᵣₑq(P)")
    expect(page).not.toContain("Белая расширенная оболочка")
    for (const variable of [
      "p",
      "t",
      "sl",
      "sr",
      "cl",
      "cr",
      "h",
      "dt",
      "c",
      "dh",
      "tl",
      "tr",
      "r-major",
      "r-tube",
      "rho",
      "distance",
      "scale-left",
      "scale-right",
      "span",
    ]) {
      expect(page).toContain(`id="edges-formula-${variable}"`)
      expect(page).toContain(`data-edges-formula-link="${variable}"`)
    }
    expect(page).toContain(".edges-formula-variable.is-highlighted")
    expect(page).toContain("#edges-formula-links path.is-highlighted")
    expect(page).toContain('id="edges-formula-target"')
    expect(page).toContain("pointer-events: stroke")
    const labSource = await Bun.file(
      new URL("./EdgesLab.ts", import.meta.url),
    ).text()
    expect(labSource).toContain('addEventListener("pointerenter", activate)')
    expect(labSource).toContain("registerFormulaMaterial")
    expect(labSource).toContain("thickPolylineGeometry")
    expect(labSource).toContain("drawEdgeExamplePreview")
    expect(labSource).toContain("edgeModelForVariant(example.input, variant)")
    expect(labSource).toContain('fetch("/api/edge-examples"')
    expect(labSource).not.toContain("examplePng")
  })

  test("clamps direct Sphere movement to the circular Torus hole", () => {
    const limit = sphereOffsetLimit({radius: 18, tube: 7}, 2.5)
    const constrained = constrainSphereOffset(12, 9, limit)

    expect(limit).toBe(8.5)
    expect(Math.hypot(constrained.x, constrained.y)).toBeCloseTo(limit)
    expect(constrained.x / constrained.y).toBeCloseTo(12 / 9)
  })

  test("ramps Edge clearance by Torus curvature after leaving a Sphere", () => {
    const left = {x: 0, y: 0, z: 0}
    const right = {x: 100, y: 0, z: 0}
    const sphereRadius = 2.5
    const clearance = 3
    const torusTube = 11.11
    const transition = edgeClearanceTransitionDistance(
      torusTube,
      sphereRadius,
      clearance,
    )

    expect(requiredEdgeClearance(
      left,
      left,
      right,
      sphereRadius,
      clearance,
    )).toBe(0)
    expect(requiredEdgeClearance(
      {x: 0, y: 0, z: sphereRadius},
      left,
      right,
      sphereRadius,
      clearance,
    )).toBe(0)
    expect(requiredEdgeClearance(
      {x: 0, y: 0, z: sphereRadius + transition},
      left,
      right,
      sphereRadius,
      clearance,
      torusTube,
    )).toBeCloseTo(clearance)
    expect(requiredEdgeClearance(
      {x: 0, y: 0, z: sphereRadius + 0.01},
      left,
      right,
      sphereRadius,
      clearance,
      torusTube,
    )).toBeLessThan(0.000004)
    expect(requiredEdgeClearance(
      {x: 0, y: 0, z: sphereRadius + transition + 1},
      left,
      right,
      sphereRadius,
      clearance,
      torusTube,
    )).toBe(clearance)
  })

  test("moves Edge endpoints with independently dragged Spheres", () => {
    const model = buildEdgeConstraintModel({
      centerDistance: 44,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 2,
      leftSphereY: -3,
      rightSphereX: -4,
      rightSphereY: 5,
      torusRadius: 18,
      torusTube: 7,
    })

    expect(model.leftTorusCenter).toEqual({x: -22, y: 0, z: 0})
    expect(model.rightTorusCenter).toEqual({x: 22, y: 0, z: 0})
    expect(model.leftCenter).toEqual({x: -20, y: -3, z: 0})
    expect(model.rightCenter).toEqual({x: 18, y: 5, z: 0})
    expect(model.curve[0]).toEqual(model.leftCenter)
    expect(model.curve.at(-1)).toEqual(model.rightCenter)
  })

  test("separates both saved torus forms by a visible gap", () => {
    const torus = {radius: 18, tube: 7}
    const minimum = minimumEdgeTorusCenterDistance(torus)

    expect(minimum).toBe(52)
    expect(minimum - (torus.radius + torus.tube) * 2)
      .toBe(EDGE_TORUS_GAP_MM)
  })

  test("uses independent Torus scales in spacing and Edge clearance", () => {
    const torus = {radius: 18, tube: 7}
    const leftScale = 0.75
    const rightScale = 1.5
    const minimum = minimumEdgeTorusCenterDistance(
      torus,
      leftScale,
      rightScale,
    )
    const model = buildEdgeConstraintModel({
      centerDistance: minimum,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTorusScale: leftScale,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTorusScale: rightScale,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    })

    expect(minimum).toBe(58.25)
    expect(model.minimumTorusClearance).toBeGreaterThanOrEqual(3)
  })

  test("routes one smooth field line outside both Torus bodies", () => {
    const model = buildEdgeConstraintModel({
      centerDistance: 52,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      torusRadius: 18,
      torusTube: 7,
    })

    expect(model.curve[0]).toEqual(model.leftCenter)
    expect(model.curve.at(-1)).toEqual(model.rightCenter)
    expect(model.leftControl).toEqual({
      x: -26,
      y: 0,
      z: model.controlHeight,
    })
    expect(model.rightControl).toEqual({
      x: 26,
      y: 0,
      z: model.controlHeight,
    })
    expect(model.maximumHeight).toBeCloseTo(model.controlHeight * 0.75)
    expect(model.minimumTorusClearance).toBeGreaterThanOrEqual(3)
    expect(model.curve[1]!.z).toBeGreaterThan(model.curve[0]!.z)
    expect(
      Math.abs(model.curve[1]!.x - model.curve[0]!.x),
    ).toBeLessThan(model.curve[1]!.z - model.curve[0]!.z)
  })

  test("keeps electromagnetic arc proportions as the span grows", () => {
    const model = buildEdgeConstraintModel({
      centerDistance: 200,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      sphereRadius: 2.5,
      torusRadius: 18,
      torusTube: 7,
    })

    expect(model.shapeControlHeight).toBeCloseTo(
      200 * ELECTROMAGNETIC_CONTROL_HEIGHT_RATIO,
    )
    expect(model.controlHeight).toBe(model.shapeControlHeight)
    expect(model.maximumHeight).toBeCloseTo(100)
  })

  test("gives unequal Torus forms unequal field-line shoulders", () => {
    const span = 200
    const leftScale = 0.5
    const rightScale = 2
    const torus = {radius: 27.78, tube: 22.22}
    const shape = fieldShapeControlHeights(
      span,
      (torus.radius + torus.tube) * leftScale,
      (torus.radius + torus.tube) * rightScale,
    )
    const model = buildEdgeConstraintModel({
      centerDistance: span,
      clearance: 0,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTorusScale: leftScale,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTorusScale: rightScale,
      sphereRadius: 0,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    })
    const apexIndex = model.curve.findIndex(
      (point) => point.z === model.maximumHeight,
    )

    expect(shape.right / shape.left).toBeCloseTo(2)
    expect(model.rightControlHeight / model.leftControlHeight).toBeCloseTo(2)
    expect(
      model.rightControlHeight ** 2 / model.leftControlHeight ** 2,
    ).toBeCloseTo(
      rightScale / leftScale,
    )
    expect(apexIndex / (model.curve.length - 1)).toBeGreaterThan(0.5)
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(-1e-6)
  })

  test("derives control height from collision clearance and optional lift", () => {
    const compact = buildEdgeConstraintModel({
      centerDistance: 52,
      clearance: 2,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      torusRadius: 18,
      torusTube: 7,
    })
    const spacious = buildEdgeConstraintModel({
      centerDistance: 52,
      clearance: 5,
      extraLift: 8,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      torusRadius: 18,
      torusTube: 7,
    })

    expect(compact.minimumTorusClearance).toBeGreaterThanOrEqual(2)
    expect(spacious.minimumTorusClearance).toBeGreaterThanOrEqual(5)
    expect(spacious.clearanceControlHeight)
      .toBeGreaterThan(compact.clearanceControlHeight)
    expect(spacious.controlHeight).toBeCloseTo(
      Math.max(spacious.clearanceControlHeight, spacious.shapeControlHeight) + 8,
    )
    expect(spacious.maximumHeight).toBeGreaterThan(compact.maximumHeight)
  })

  test("lets Sphere touch the Torus hole while Edge keeps its own clearance", () => {
    const torus = {radius: 27.78, tube: 22.22}
    const clearance = 3
    const sphereRadius = 2.5
    const boundaryOffset = sphereOffsetLimit(torus, sphereRadius)
    const model = buildEdgeConstraintModel({
      centerDistance: 102,
      clearance,
      extraLift: 0,
      leftSphereX: -boundaryOffset,
      leftSphereY: 0,
      rightSphereX: boundaryOffset,
      rightSphereY: 0,
      sphereRadius,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    })

    expect(boundaryOffset).toBeCloseTo(3.06)
    expect(boundaryOffset + sphereRadius)
      .toBeCloseTo(torus.radius - torus.tube)
    expect(sphereRadius).toBeLessThan(clearance)
    expect(Number.isFinite(model.controlHeight)).toBe(true)
    expect(model.controlHeight).toBeLessThan(100)
    expect(model.minimumTorusClearance).toBeCloseTo(sphereRadius)
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(-1e-6)
    expect(model.curve.every((point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    )).toBe(true)
  })

  test("keeps a 0.9 mm boundary Sphere on a proportional field arc", () => {
    const torus = {radius: 27.78, tube: 22.22}
    const scale = 0.5
    const sphereRadius = 0.9
    const scaledTorus = {
      radius: torus.radius * scale,
      tube: torus.tube * scale,
    }
    const boundaryOffset = sphereOffsetLimit(scaledTorus, sphereRadius)
    const model = buildEdgeConstraintModel({
      centerDistance: 52,
      clearance: 3,
      extraLift: 0,
      leftSphereX: boundaryOffset,
      leftSphereY: 0,
      leftTorusScale: scale,
      rightSphereX: -boundaryOffset,
      rightSphereY: 0,
      rightTorusScale: scale,
      sphereRadius,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    })

    expect(boundaryOffset).toBeCloseTo(1.88)
    expect(model.clearanceTransitionDistance).toBeCloseTo(9)
    expect(model.clearanceControlHeight).toBeLessThan(40)
    expect(model.controlHeight).toBe(model.shapeControlHeight)
    expect(model.maximumHeight).toBeCloseTo(24.12)
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(-1e-6)
  })

  test("builds an exact source-to-sink field circle for equal poles", () => {
    const model = buildSourceSinkFieldModel({
      centerDistance: 102,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      rightSphereX: 0,
      rightSphereY: 0,
      sphereRadius: 2.5,
      torusRadius: 27.78,
      torusTube: 22.22,
    })
    const sourceSink = model.sourceSink

    expect(model.routeVariant).toBe("source-sink")
    expect(sourceSink).toBeDefined()
    expect(sourceSink!.leftStrength).toBeCloseTo(sourceSink!.rightStrength)
    expect(sourceSink!.leftDepartureAngle).toBeCloseTo(Math.PI / 2)
    expect(sourceSink!.rightDepartureAngle).toBeCloseTo(Math.PI / 2)
    expect(sourceSink!.verticalSafetyScale).toBe(1)
    expect(model.curve[0]).toEqual(model.leftCenter)
    expect(model.curve.at(-1)).toEqual(model.rightCenter)
    for (const point of model.curve.slice(1, -1)) {
      expect(point.x ** 2 + point.z ** 2).toBeCloseTo(51 ** 2, 5)
    }
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(0)
  })

  test("bends the source-to-sink line toward the weaker unequal pole", () => {
    const model = buildSourceSinkFieldModel({
      centerDistance: 200,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTorusScale: 0.5,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTorusScale: 2,
      sphereRadius: 2.5,
      torusRadius: 27.78,
      torusTube: 22.22,
    })
    const apex = model.curve.reduce(
      (highest, point) => point.z > highest.z ? point : highest,
      model.curve[0]!,
    )

    expect(model.sourceSink!.rightStrength / model.sourceSink!.leftStrength)
      .toBeCloseTo(2)
    expect(apex.x).toBeLessThan(0)
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(-1e-6)
  })

  test("keeps an extreme dragged Sphere field route finite and safe", () => {
    const sphereRadius = 0.1
    const leftScale = 1
    const rightScale = 2
    const leftLimit = sphereOffsetLimit(
      {radius: 27.78 * leftScale, tube: 22.22 * leftScale},
      sphereRadius,
    )
    const rightLimit = sphereOffsetLimit(
      {radius: 27.78 * rightScale, tube: 22.22 * rightScale},
      sphereRadius,
    )
    const model = buildSourceSinkFieldModel({
      centerDistance: 200,
      clearance: 3,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: leftLimit,
      leftTorusScale: leftScale,
      rightSphereX: 0,
      rightSphereY: -rightLimit,
      rightTorusScale: rightScale,
      sphereRadius,
      torusRadius: 27.78,
      torusTube: 22.22,
    })

    expect(model.sourceSink!.verticalSafetyScale).toBeGreaterThan(1)
    expect(model.minimumSafetyMargin).toBeGreaterThanOrEqual(-1e-6)
    expect(model.curve.every((point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    )).toBe(true)
  })

  test("builds the minimal Hermite curve from endpoint vectors", () => {
    const model = buildHermiteBeamModel({
      centerDistance: 120,
      clearance: 3,
      extraLift: 0,
      leftDirectionDegrees: 60,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTangentLength: 90,
      rightDirectionDegrees: 75,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTangentLength: 120,
      sphereRadius: 2.5,
      torusRadius: 27.78,
      torusTube: 22.22,
    })

    expect(model.routeVariant).toBe("hermite")
    expect(model.curve[0]).toEqual(model.leftCenter)
    expect(model.curve.at(-1)).toEqual(model.rightCenter)
    expect(model.hermite?.leftDirectionDegrees).toBe(60)
    expect(model.hermite?.rightDirectionDegrees).toBe(75)
    expect(model.leftControl.x).toBeCloseTo(-45)
    expect(model.leftControl.z).toBeCloseTo(
      90 * Math.sin(Math.PI / 3) / 3,
    )
    expect(model.rightControl.x).toBeCloseTo(
      60 - 120 * Math.cos(75 * Math.PI / 180) / 3,
    )
    expect(model.rightControl.z).toBeCloseTo(
      120 * Math.sin(75 * Math.PI / 180) / 3,
    )
    expect(model.curve.every((point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    )).toBe(true)
  })

  test("inherits unequal default shoulders from unequal Torus forms", () => {
    const input = {
      centerDistance: 127,
      clearance: 0,
      extraLift: 0,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTorusScale: 0.5,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTorusScale: 2,
      sphereRadius: 0,
      torusRadius: 27.78,
      torusTube: 22.22,
    }
    const composite = buildEdgeConstraintModel(input)
    const hermite = buildHermiteBeamModel(input)
    const defaults = defaultHermiteTangentLengths(
      input.centerDistance,
      (input.torusRadius + input.torusTube) * input.leftTorusScale,
      (input.torusRadius + input.torusTube) * input.rightTorusScale,
    )

    expect(defaults.right / defaults.left).toBeCloseTo(2)
    expect(hermite.hermite?.leftTangentLength).toBeCloseTo(defaults.left)
    expect(hermite.hermite?.rightTangentLength).toBeCloseTo(defaults.right)
    expect(hermite.leftControlHeight).toBeCloseTo(
      composite.leftShapeControlHeight,
    )
    expect(hermite.rightControlHeight).toBeCloseTo(
      composite.rightShapeControlHeight,
    )
    expect(hermite.curve).toHaveLength(composite.curve.length)
    for (const [index, point] of hermite.curve.entries()) {
      expect(point.x).toBeCloseTo(composite.curve[index]!.x)
      expect(point.y).toBeCloseTo(composite.curve[index]!.y)
      expect(point.z).toBeCloseTo(composite.curve[index]!.z)
    }
  })

  test("measures an unsafe Hermite curve without changing it", () => {
    const model = buildHermiteBeamModel({
      centerDistance: 102,
      clearance: 3,
      extraLift: 80,
      leftDirectionDegrees: 90,
      leftSphereX: 0,
      leftSphereY: 0,
      leftTangentLength: 10,
      rightDirectionDegrees: 90,
      rightSphereX: 0,
      rightSphereY: 0,
      rightTangentLength: 10,
      sphereRadius: 2.5,
      torusRadius: 27.78,
      torusTube: 22.22,
    })

    expect(model.clearanceControlScale).toBe(1)
    expect(model.maximumHeight).toBeCloseTo(2.5)
    expect(model.minimumSafetyMargin).toBeLessThan(0)
  })
})
