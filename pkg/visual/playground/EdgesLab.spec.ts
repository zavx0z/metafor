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
      "Радиус ограничителя",
      "Высота слева",
      "Высота справа",
      "Азимут слева",
      "Азимут справа",
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
      constraintRadius: 6,
      leftAzimuthDeg: 0,
      leftHeight: 9,
      leftSphereX: 2,
      leftSphereY: -3,
      rightAzimuthDeg: 180,
      rightHeight: 9,
      rightSphereX: -4,
      rightSphereY: 5,
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

  test("keeps both Bezier controls on their perpendicular guide circles", () => {
    const model = buildEdgeConstraintModel({
      centerDistance: 44,
      constraintRadius: 6,
      leftAzimuthDeg: 25,
      leftHeight: 9,
      leftSphereX: 0,
      leftSphereY: 0,
      rightAzimuthDeg: 205,
      rightHeight: 16,
      rightSphereX: 0,
      rightSphereY: 0,
    })

    expect(model.curve[0]).toEqual(model.leftCenter)
    expect(model.curve.at(-1)).toEqual(model.rightCenter)
    expect(Math.hypot(
      model.leftControl.x - model.leftCenter.x,
      model.leftControl.y - model.leftCenter.y,
    )).toBeCloseTo(6)
    expect(Math.hypot(
      model.rightControl.x - model.rightCenter.x,
      model.rightControl.y - model.rightCenter.y,
    )).toBeCloseTo(6)
    expect(model.leftControl.z).toBe(9)
    expect(model.rightControl.z).toBe(16)
  })

  test("derives asymmetric entry angles and curve height from constraints", () => {
    const lowRight = buildEdgeConstraintModel({
      centerDistance: 44,
      constraintRadius: 6,
      leftAzimuthDeg: 0,
      leftHeight: 9,
      leftSphereX: 0,
      leftSphereY: 0,
      rightAzimuthDeg: 180,
      rightHeight: 9,
      rightSphereX: 0,
      rightSphereY: 0,
    })
    const highRight = buildEdgeConstraintModel({
      centerDistance: 44,
      constraintRadius: 6,
      leftAzimuthDeg: 0,
      leftHeight: 9,
      leftSphereX: 0,
      leftSphereY: 0,
      rightAzimuthDeg: 180,
      rightHeight: 18,
      rightSphereX: 0,
      rightSphereY: 0,
    })

    expect(highRight.leftEntryAngleDeg).toBeCloseTo(lowRight.leftEntryAngleDeg)
    expect(highRight.rightEntryAngleDeg).toBeGreaterThan(
      lowRight.rightEntryAngleDeg,
    )
    expect(highRight.maximumHeight).toBeGreaterThan(lowRight.maximumHeight)
    expect(highRight.approximateLength).toBeGreaterThan(
      lowRight.approximateLength,
    )
  })
})
