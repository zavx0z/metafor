import {describe, expect, test} from "bun:test"
import {Color} from "../math/Color"
import {TextMaterial} from "./TextMaterial"

describe("TextMaterial", () => {
  test("по умолчанию не записывает глубину", () => {
    expect(new TextMaterial().depthWrite).toBe(false)
  })

  test("может включить запись глубины для 3D-текста", () => {
    expect(new TextMaterial({depthWrite: true}).depthWrite).toBe(true)
  })

  test("preserves alpha when cloning an explicit Color", () => {
    const input = new Color(0.25, 0.5, 0.75, 0.4)
    const material = new TextMaterial({color: input})
    expect(material.color).not.toBe(input)
    expect([material.color.r, material.color.g, material.color.b, material.color.a]).toEqual([0.25, 0.5, 0.75, 0.4])
  })
})
