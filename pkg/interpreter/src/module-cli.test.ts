import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {startupModulesFromArgs, startupTargetsFromArgs} from "./module-cli.ts"

const cwd = "/repo/metafor"

describe("interpreter module CLI", () => {
  test("starts a test module from a relative path", () => {
    const [module] = startupModulesFromArgs(["dark/server.spec.ts", "-timeout=2147483647"], cwd)

    expect(module?.id).toBe("dark-server.spec.ts")
    expect(module?.label).toBe("dark/server.spec.ts")
    expect(module?.modulePath).toBe(join(cwd, "dark/server.spec.ts"))
    expect(module?.command).toEqual(["bun", "test", "--timeout=2147483647", join(cwd, "dark/server.spec.ts")])
    expect(module?.pauseOnStart).toBe(false)
    expect(module?.inspectMode).toBe("inspect")
  })

  test("splits modules by path and keeps params on the preceding module", () => {
    const modules = startupModulesFromArgs([
      "dark/server.spec.ts",
      "-timeout=2147483647",
      "pkg/interpreter/src/syntax.test.ts",
      "--bail",
    ], cwd)

    expect(modules.map((module) => module.label)).toEqual([
      "dark/server.spec.ts",
      "pkg/interpreter/src/syntax.test.ts",
    ])
    expect(modules[0]?.command).toEqual(["bun", "test", "--timeout=2147483647", join(cwd, "dark/server.spec.ts")])
    expect(modules[1]?.command).toEqual(["bun", "test", "--bail", join(cwd, "pkg/interpreter/src/syntax.test.ts")])
  })

  test("supports absolute entrypoint modules", () => {
    const modulePath = join(cwd, "module.ts")
    const [module] = startupModulesFromArgs([modulePath, "-flag=value"], cwd)

    expect(module?.label).toBe("module.ts")
    expect(module?.command).toEqual(["bun", modulePath, "--flag=value"])
  })

  test("supports explicit inspect-wait without passing it to the module", () => {
    const modulePath = join(cwd, "module.ts")
    const [module] = startupModulesFromArgs([modulePath, "--inspect-wait", "-flag=value"], cwd)

    expect(module?.command).toEqual(["bun", modulePath, "--flag=value"])
    expect(module?.inspectMode).toBe("wait")
    expect(module?.pauseOnStart).toBe(false)
  })

  test("separates sqlite database paths from runnable modules", () => {
    const targets = startupTargetsFromArgs([
      "dark/server.spec.ts",
      "-timeout=2147483647",
      "energy/energy.spec.ts",
      "dark/tmp/boundary.sqlite",
    ], cwd)

    expect(targets.modules.map((module) => module.label)).toEqual([
      "dark/server.spec.ts",
      "energy/energy.spec.ts",
    ])
    expect(targets.sqliteDatabases).toEqual([join(cwd, "dark/tmp/boundary.sqlite")])
  })

  test("rejects params before the first module path", () => {
    expect(() => startupModulesFromArgs(["-timeout=1", "module.ts"], cwd)).toThrow("must follow a module path")
  })
})
