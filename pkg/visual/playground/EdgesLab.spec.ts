import {describe, expect, test} from "bun:test"
import {
  EDGE_TORUS_GAP_MM,
  buildEdgeConstraintModel,
  constrainSphereOffset,
  minimumEdgeTorusCenterDistance,
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
  })

  test("clamps direct Sphere movement to the circular Torus hole", () => {
    const limit = sphereOffsetLimit({radius: 18, tube: 7}, 2.5)
    const constrained = constrainSphereOffset(12, 9, limit)

    expect(limit).toBe(8.5)
    expect(Math.hypot(constrained.x, constrained.y)).toBeCloseTo(limit)
    expect(constrained.x / constrained.y).toBeCloseTo(12 / 9)
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
    expect(spacious.controlHeight).toBeGreaterThan(compact.controlHeight + 8)
    expect(spacious.maximumHeight).toBeGreaterThan(compact.maximumHeight)
  })

  test("keeps a finite smooth field line when Sphere reaches its clearance boundary", () => {
    const torus = {radius: 27.78, tube: 22.22}
    const clearance = 3
    const boundaryOffset = torus.radius - torus.tube - clearance
    const model = buildEdgeConstraintModel({
      centerDistance: 102,
      clearance,
      extraLift: 0,
      leftSphereX: -boundaryOffset,
      leftSphereY: 0,
      rightSphereX: boundaryOffset,
      rightSphereY: 0,
      torusRadius: torus.radius,
      torusTube: torus.tube,
    })

    expect(boundaryOffset).toBeCloseTo(2.56)
    expect(Number.isFinite(model.controlHeight)).toBe(true)
    expect(model.controlHeight).toBeLessThan(500)
    expect(model.minimumTorusClearance).toBeGreaterThanOrEqual(clearance - 1e-6)
    expect(model.curve.every((point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    )).toBe(true)
  })
})
