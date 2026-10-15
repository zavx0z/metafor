import {expect, test} from "bun:test"
import {join} from "node:path"
import {createPackageBuilder} from "@metafor/tech-build"
import {buildFixture} from "./fixture"

const hungChild = [process.execPath, "-e", "setInterval(() => {}, 1000)"]

for (const scenario of [
  {name: "typecheck", fixture: "single", stage: "typecheck"},
  {name: "compiler", fixture: "plugin", stage: "compiler"},
] as const) {
  test(`lifetime abort settles owned ${scenario.name} process and prevents another build`, async () => {
    const fixture = await buildFixture(join(import.meta.dir, `fixture/${scenario.fixture}`))
    const controller = new AbortController()
    const children: Bun.Subprocess[] = []
    let resolveStarted!: () => void
    const started = new Promise<void>(resolve => {resolveStarted = resolve})
    let report: string | undefined
    const spawn = ((command: string[], options: Parameters<typeof Bun.spawn>[1]) => {
      const typecheck = command.includes("--silent")
      const shouldHang = scenario.name === "typecheck" ? typecheck : !typecheck
      if (!shouldHang) return Bun.spawn(command, options)
      expect(options?.signal).toBe(controller.signal)
      expect(options?.killSignal).toBe("SIGKILL")
      expect(options?.detached).toBe(true)
      if (options?.stdin instanceof Blob) {
        void options.stdin.text().then((value) => {report = JSON.parse(value).report})
      }
      const child = Bun.spawn(hungChild, options)
      children.push(child)
      resolveStarted()
      return child
    }) as typeof Bun.spawn
    try {
      const builder = createPackageBuilder({resolvePackage: () => fixture.root, signal: controller.signal, spawn})
      const building = builder.buildPackage(fixture.name)
      await started
      controller.abort("owner close")
      const result = await Promise.race([building, Bun.sleep(3000).then(() => {throw new Error("Build did not settle after abort")})])
      expect(result.success).toBe(false)
      expect(result.stage).toBe(scenario.stage)
      expect(result.outputs).toEqual([])
      for (const child of children) {
        await child.exited
        expect(child.signalCode).toBe("SIGKILL")
        expect(() => process.kill(child.pid, 0)).toThrow()
      }
      if (report) expect(await Bun.file(report).exists()).toBe(false)
      await expect(builder.buildPackage(fixture.name)).rejects.toThrow()
      expect(children).toHaveLength(1)
    } finally {
      controller.abort()
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
      await Promise.all(children.map(child => child.exited))
      await fixture.cleanup()
    }
  })
}

test("lifetime abort stops the package-owned Bun typecheck script", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/single"))
  const controller = new AbortController()
  let scriptPid: number | undefined
  try {
    const manifestPath = join(fixture.root, "package.json")
    const manifest = await Bun.file(manifestPath).json()
    manifest.scripts.typecheck = "bun ./hang-typecheck.ts"
    await Bun.write(manifestPath, JSON.stringify(manifest))
    await Bun.write(join(fixture.root, "hang-typecheck.ts"),
      'await Bun.write("../typecheck-pid", String(process.pid))\nsetInterval(() => {}, 1000)\n')
    const builder = createPackageBuilder({resolvePackage: () => fixture.root, signal: controller.signal})
    const building = builder.buildPackage(fixture.name)
    for (let attempt = 0; attempt < 200; attempt++) {
      const pidFile = Bun.file(join(fixture.directory, "typecheck-pid"))
      if (await pidFile.exists()) {scriptPid = Number(await pidFile.text()); break}
      await Bun.sleep(10)
    }
    expect(scriptPid).toBeGreaterThan(0)
    controller.abort("owner close")
    const result = await Promise.race([building, Bun.sleep(3000).then(() => {throw new Error("Typecheck did not settle")})])
    expect(result.success).toBe(false)
    expect(result.stage).toBe("typecheck")
    expect(() => process.kill(scriptPid!, 0)).toThrow()
  } finally {
    controller.abort()
    if (scriptPid) try {process.kill(scriptPid, "SIGKILL")} catch {}
    await fixture.cleanup()
  }
})

test("caller abort stops checkPackage without disabling its builder", async () => {
  const fixture = await buildFixture(join(import.meta.dir, "fixture/single"))
  const lifetime = new AbortController()
  const caller = new AbortController()
  let scriptPid: number | undefined
  try {
    const manifestPath = join(fixture.root, "package.json")
    const manifest = await Bun.file(manifestPath).json()
    const regularTypecheck = manifest.scripts.typecheck
    manifest.scripts.typecheck = "bun ./hang-typecheck.ts"
    await Bun.write(manifestPath, JSON.stringify(manifest))
    await Bun.write(join(fixture.root, "hang-typecheck.ts"),
      'await Bun.write("../caller-typecheck-pid", String(process.pid))\nsetInterval(() => {}, 1000)\n')
    const builder = createPackageBuilder({resolvePackage: () => fixture.root, signal: lifetime.signal})
    const checking = builder.checkPackage(fixture.name, {signal: caller.signal})
    for (let attempt = 0; attempt < 200; attempt++) {
      const pidFile = Bun.file(join(fixture.directory, "caller-typecheck-pid"))
      if (await pidFile.exists()) {scriptPid = Number(await pidFile.text()); break}
      await Bun.sleep(10)
    }
    expect(scriptPid).toBeGreaterThan(0)
    caller.abort("caller cancelled")
    await expect(Promise.race([checking, Bun.sleep(3000).then(() => {throw new Error("Check did not settle")})]))
      .rejects.toBe("caller cancelled")
    expect(() => process.kill(scriptPid!, 0)).toThrow()
    expect(lifetime.signal.aborted).toBe(false)
    manifest.scripts.typecheck = regularTypecheck
    await Bun.write(manifestPath, JSON.stringify(manifest))
    expect((await builder.checkPackage(fixture.name)).exitCode).toBe(0)
  } finally {
    lifetime.abort()
    caller.abort()
    if (scriptPid) try {process.kill(scriptPid, "SIGKILL")} catch {}
    await fixture.cleanup()
  }
})
