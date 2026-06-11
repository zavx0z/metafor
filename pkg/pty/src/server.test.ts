import {describe, expect, test} from "bun:test"
import {PtyTerminalProbeResponder, terminalEnv} from "./server.ts"

describe("terminalEnv", () => {
  test("adds color and terminal metadata for host PTY sessions", () => {
    const env = terminalEnv({PATH: "/bin", NO_COLOR: "1"})

    expect(env.TERM).toBe("xterm-256color")
    expect(env.COLORTERM).toBe("truecolor")
    expect(env.CLICOLOR).toBe("1")
    expect(env.COLORFGBG).toBe("15;0")
    expect(env.CLICOLOR_FORCE).toBeUndefined()
    expect(env.FORCE_COLOR).toBeUndefined()
    expect(env.TERM_PROGRAM).toBe("iTerm.app")
    expect(env.TERM_PROGRAM_VERSION).toBe("3.5")
    expect(env.NO_COLOR).toBeUndefined()
  })

  test("keeps explicit terminal metadata from the parent environment", () => {
    const env = terminalEnv({
      PATH: "/bin",
      CLICOLOR_FORCE: "1",
      COLORFGBG: "7;0",
      FORCE_COLOR: "3",
      TERM_PROGRAM: "WezTerm",
      TERM_PROGRAM_VERSION: "20260401",
    })

    expect(env.COLORFGBG).toBe("7;0")
    expect(env.CLICOLOR_FORCE).toBeUndefined()
    expect(env.FORCE_COLOR).toBeUndefined()
    expect(env.TERM_PROGRAM).toBe("WezTerm")
    expect(env.TERM_PROGRAM_VERSION).toBe("20260401")
  })
})

describe("PtyTerminalProbeResponder", () => {
  test("answers terminal color, device attribute, and cursor position probes", () => {
    const responses: string[] = []
    const responder = new PtyTerminalProbeResponder((data) => responses.push(data))

    responder.write("\x1b]10;?\x1b\\\x1b]11;?")
    responder.write("\x07\x1b]12;?\x1b\\\x1b[c\x1b[6n")

    expect(responses).toEqual([
      "\x1b]10;rgb:d7dd/e8ff/fbff\x1b\\",
      "\x1b]11;rgb:0e10/151a/20ff\x1b\\",
      "\x1b]12;rgb:94e2/d5ff/ffff\x1b\\",
      "\x1b[?1;2c",
      "\x1b[1;1R",
    ])
  })
})
