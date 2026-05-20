import {describe, expect, test} from "bun:test"
import {normaliseSvgRootDimensions} from "./TextureLoader.ts"

describe("normaliseSvgRootDimensions", () => {
  test("adds root dimensions from viewBox when nested elements already have width and height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080"/></svg>`
    const patched = normaliseSvgRootDimensions(svg)

    expect(patched).toContain(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">`)
  })

  test("does not patch svg without viewBox", () => {
    expect(normaliseSvgRootDimensions(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`)).toBeNull()
  })

  test("keeps existing root dimensions", () => {
    const svg = `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`
    expect(normaliseSvgRootDimensions(svg)).toBe(svg)
  })
})
