import {describe, expect, test} from "bun:test"
import {Color} from "../math"
import {ThinFilmMaterial} from "./ThinFilmMaterial"

describe("ThinFilmMaterial", () => {
  test("has a bounded one-pass surface parameter set", () => {
    const material = new ThinFilmMaterial({
      color: new Color(0.1, 0.2, 0.3),
      filmThickness: 99,
      highlightSize: 99,
      iridescence: -1,
      opacity: 2,
      rimStrength: 99,
    })

    expect(material.isGlassMaterial).toBe(true)
    expect(material.color).toEqual(new Color(0.1, 0.2, 0.3))
    expect(material.opacity).toBe(1)
    expect(material.rimStrength).toBe(8)
    expect(material.iridescence).toBe(0)
    expect(material.filmThickness).toBe(4)
    expect(material.highlightSize).toBe(1)
  })

  test("does not retain mutable caller colors", () => {
    const color = new Color(0.2, 0.4, 0.8)
    const material = new ThinFilmMaterial({color})

    color.setRGB(1, 0, 0)

    expect(material.color).toEqual(new Color(0.2, 0.4, 0.8))
    expect(material.highlightSize).toBe(0)
  })
})
