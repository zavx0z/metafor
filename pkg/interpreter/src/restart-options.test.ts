import {describe, expect, test} from "bun:test"
import {restartInspectOptionsFromParams} from "./restart-options.ts"

describe("restartInspectOptionsFromParams", () => {
  test("uses normal inspect attach by default", () => {
    expect(restartInspectOptionsFromParams({})).toEqual({
      inspectMode: "inspect",
      pauseOnStart: false,
    })
  })

  test("uses inspect-brk only for explicit pauseOnStart true", () => {
    expect(restartInspectOptionsFromParams({pauseOnStart: true})).toEqual({
      inspectMode: "brk",
      pauseOnStart: true,
    })
    expect(restartInspectOptionsFromParams({pauseOnStart: false})).toEqual({
      inspectMode: "inspect",
      pauseOnStart: false,
    })
  })
})
