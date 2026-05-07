import {describe, expect, test} from "bun:test"
import {SourceMapGenerator} from "source-map-js"
import {sourceMapMapper} from "./source-map.ts"

function inlineSourceMap(): string {
  const generator = new SourceMapGenerator({file: "out.js"})
  generator.addMapping({
    generated: {line: 10, column: 2},
    original: {line: 3, column: 4},
    source: "src/input.ts",
  })
  const encoded = Buffer.from(generator.toString(), "utf8").toString("base64url")
  return `data:application/json;base64,${encoded}`
}

describe("sourceMapMapper", () => {
  test("maps original editor coordinates to generated inspector coordinates", () => {
    const mapper = sourceMapMapper(inlineSourceMap())

    expect(mapper.generatedLocation({
      url: "/repo/src/input.ts",
      line: 2,
      column: 4,
    })).toEqual({
      line: 9,
      column: 2,
      verified: true,
    })
  })

  test("maps generated inspector coordinates back to original editor coordinates", () => {
    const mapper = sourceMapMapper(inlineSourceMap())

    expect(mapper.originalLocation({line: 9, column: 2})).toEqual({
      line: 2,
      column: 4,
      verified: true,
    })
  })

  test("falls back when source map is unavailable", () => {
    expect(sourceMapMapper(undefined).originalLocation({line: 4, column: 7})).toEqual({
      line: 4,
      column: 7,
      verified: true,
    })
  })
})
