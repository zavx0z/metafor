import {describe, expect, test} from "bun:test"
import {buildEdgeConstraintModel} from "./EdgesLab.ts"

describe("Edges Lab constraint geometry", () => {
  test("documents every adjustable scene parameter in Russian", async () => {
    const page = await Bun.file(
      new URL("./index.html", import.meta.url),
    ).text()
    const descriptions = [
      "Расстояние центров",
      "Радиус тора",
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
  })

  test("keeps both Bezier controls on their perpendicular guide circles", () => {
    const model = buildEdgeConstraintModel({
      centerDistance: 44,
      constraintRadius: 6,
      leftAzimuthDeg: 25,
      leftHeight: 9,
      rightAzimuthDeg: 205,
      rightHeight: 16,
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
      rightAzimuthDeg: 180,
      rightHeight: 9,
    })
    const highRight = buildEdgeConstraintModel({
      centerDistance: 44,
      constraintRadius: 6,
      leftAzimuthDeg: 0,
      leftHeight: 9,
      rightAzimuthDeg: 180,
      rightHeight: 18,
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
