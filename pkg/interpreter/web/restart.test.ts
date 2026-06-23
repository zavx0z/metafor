import {describe, expect, test} from "bun:test"
import {interactiveRestartPayload} from "./restart.ts"

describe("interactiveRestartPayload", () => {
  test("defaults UI restart to normal inspect attach", () => {
    expect(interactiveRestartPayload({
      label: "syntax",
      command: ["bun", "--inspect-wait=ws://127.0.0.1:6501/", "test", "syntax.test.ts"],
    })).toEqual({
      label: "syntax",
      command: ["bun", "test", "syntax.test.ts"],
      pauseOnStart: false,
    })
  })

  test("keeps explicit pauseOnStart for first-line debugging", () => {
    expect(interactiveRestartPayload({
      label: "syntax",
      command: ["bun", "test", "syntax.test.ts"],
      pauseOnStart: true,
    })).toEqual({
      label: "syntax",
      command: ["bun", "test", "syntax.test.ts"],
      pauseOnStart: true,
    })
  })

  test("removes split inspect endpoint before rerun", () => {
    expect(interactiveRestartPayload({
      label: "module",
      command: ["bun", "--inspect-brk", "ws://127.0.0.1:6499/", "module.ts"],
    }).command).toEqual(["bun", "module.ts"])
  })

  test("keeps stored breakpoints for the restarted module", () => {
    expect(interactiveRestartPayload({
      label: "module",
      command: ["bun", "module.ts"],
      breakpoints: [{url: "module.ts", line: 10}],
    })).toEqual({
      label: "module",
      command: ["bun", "module.ts"],
      pauseOnStart: false,
      breakpoints: [{url: "module.ts", line: 10}],
    })
  })
})
