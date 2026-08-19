import {describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const packageRoot = fileURLToPath(new URL(".", import.meta.url))

describe("layout Worker policy bundle boundaries", () => {
  test("keeps shared transport policy-neutral and executors exact", async () => {
    const transport = await Bun.file(join(packageRoot, "layout-worker/transport.ts")).text()
    const executor = await Bun.file(join(packageRoot, "layout-worker/executor.ts")).text()
    const fixed = await Bun.file(join(packageRoot, "layout-worker/fixed/executor.ts")).text()
    const adaptive = await Bun.file(join(packageRoot, "layout-worker/adaptive/executor.ts")).text()

    expect(transport).not.toMatch(/@nodes\/layout/)
    expect(executor).not.toMatch(/@nodes\/layout/)
    expect(fixed).toContain('from "@nodes/layout/fixed"')
    expect(fixed).not.toContain("@nodes/layout/adaptive")
    expect(adaptive).toContain('from "@nodes/layout/adaptive"')
    expect(adaptive).not.toContain("@nodes/layout/fixed")
  })

  test("builds isolated fixed/adaptive executors and solver-free clients", async () => {
    const fixedExecutor = await buildFixture("fixed-layout-worker-executor-consumer.ts")
    const adaptiveExecutor = await buildFixture("adaptive-layout-worker-executor-consumer.ts")
    const fixedClient = await buildFixture("fixed-layout-worker-client-consumer.ts")
    const adaptiveClient = await buildFixture("adaptive-layout-worker-client-consumer.ts")

    expect(fixedExecutor.source).toContain("Port has conflicting edge roles")
    expect(fixedExecutor.source).toContain("NO_LEGAL_LAYOUT")
    expect(fixedExecutor.source).not.toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
    expect(adaptiveExecutor.source).toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
    expect(adaptiveExecutor.source).toContain("NO_LEGAL_LAYOUT")
    expect(adaptiveExecutor.source).not.toContain("Port has conflicting edge roles")

    for (const client of [fixedClient, adaptiveClient]) {
      expect(client.source).toContain("Stale layout generation")
      expect(client.source).not.toContain("NO_LEGAL_LAYOUT")
      expect(client.source).not.toContain("NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT")
      expect(client.source).not.toContain("Port has conflicting edge roles")
    }

    expect(fixedExecutor.bytes).toBeLessThan(100_000)
    expect(fixedExecutor.gzipBytes).toBeLessThan(32_000)
    expect(adaptiveExecutor.bytes).toBeLessThan(110_000)
    expect(adaptiveExecutor.gzipBytes).toBeLessThan(36_000)
    expect(fixedClient.bytes).toBeLessThan(8_000)
    expect(adaptiveClient.bytes).toBeLessThan(8_000)
  })
})

async function buildFixture(name: string): Promise<{
  source: string
  bytes: number
  gzipBytes: number
}> {
  const directory = await mkdtemp(join(tmpdir(), "nodes-worker-bundle-"))
  const output = join(directory, "bundle.js")
  try {
    const childProcess = Bun.spawn([
      process.execPath,
      "build",
      join(packageRoot, "fixtures", name),
      "--target=browser",
      "--format=esm",
      "--minify",
      `--outfile=${output}`,
    ], {cwd: packageRoot, stdout: "pipe", stderr: "pipe"})
    const [exitCode, stdout, stderr] = await Promise.all([
      childProcess.exited,
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(`${stdout}\n${stderr}`.trim())
    const bytes = new Uint8Array(await Bun.file(output).arrayBuffer())
    return {
      source: new TextDecoder().decode(bytes),
      bytes: bytes.byteLength,
      gzipBytes: Bun.gzipSync(bytes).byteLength,
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
}
