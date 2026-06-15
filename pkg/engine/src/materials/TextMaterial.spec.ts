import { describe, expect, test } from "bun:test"
import { TextMaterial } from "./TextMaterial"

describe("TextMaterial", () => {
  test("по умолчанию не записывает глубину", () => {
    expect(new TextMaterial().depthWrite).toBe(false)
  })

  test("может включить запись глубины для 3D-текста", () => {
    expect(new TextMaterial({ depthWrite: true }).depthWrite).toBe(true)
  })
})
