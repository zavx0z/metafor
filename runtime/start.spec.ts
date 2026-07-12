import {describe, expect, test} from "bun:test"
import {existsSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

const repositoryRoot = resolve(import.meta.dir, "..")
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

type CapturedLine = {
  stream: "stdout" | "stderr"
  text: string
}

const capture = async (
  stream: ReadableStream<Uint8Array>,
  channel: CapturedLine["stream"],
  lines: CapturedLine[],
): Promise<void> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  while (true) {
    const {done, value} = await reader.read()
    if (value) pending += decoder.decode(value, {stream: !done})
    let newline = pending.indexOf("\n")
    while (newline !== -1) {
      const text = pending.slice(0, newline).replace(/\r$/, "")
      pending = pending.slice(newline + 1)
      if (text) lines.push({stream: channel, text})
      newline = pending.indexOf("\n")
    }
    if (done) break
  }
  pending += decoder.decode()
  if (pending) lines.push({stream: channel, text: pending.replace(/\r$/, "")})
}

const reservePorts = (): number[] => {
  const probes = Array.from({length: 5}, () => Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  }))
  const ports = probes.map((probe) => Number(new URL(probe.url).port))
  for (const probe of probes) probe.stop(true)
  return ports
}

const waitForLine = async (
  process: ReturnType<typeof Bun.spawn>,
  lines: CapturedLine[],
  predicate: (line: string) => boolean,
  timeoutMs = 20_000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = lines.find((line) => predicate(line.text))
    if (found) return found.text
    if (process.exitCode !== null) {
      throw new Error(`Runtime exited with ${process.exitCode}:\n${lines.slice(-40).map((line) => line.text).join("\n")}`)
    }
    await Bun.sleep(20)
  }
  throw new Error(`Timed out waiting for runtime output:\n${lines.slice(-40).map((line) => line.text).join("\n")}`)
}

describe("MetaFor runtime launcher", () => {
  test("starts, registers and activates the core universe without Bulk", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "metafor-runtime-launch-"))
    const database = join(temporary, "boundary.sqlite")
    const [force, boundary, dark, matrix, energy] = reservePorts()
    const lines: CapturedLine[] = []
    const runtime = Bun.spawn({
      cmd: [process.execPath, "runtime/start.ts"],
      cwd: repositoryRoot,
      env: {
        ...inheritedEnv,
        METAFOR_FORCE_PORT: String(force),
        METAFOR_BOUNDARY_PORT: String(boundary),
        METAFOR_DARK_PORT: String(dark),
        METAFOR_MATRIX_PORT: String(matrix),
        METAFOR_ENERGY_PORT: String(energy),
        METAFOR_ROOT: "test/runtime-universe",
        METAFOR_WEAK_BACKEND: "cpu",
        METAFOR_LOG_IMPULSES: "full",
        BOUNDARY_PATH: database,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    void capture(runtime.stdout as ReadableStream<Uint8Array>, "stdout", lines)
    void capture(runtime.stderr as ReadableStream<Uint8Array>, "stderr", lines)

    try {
      await waitForLine(runtime, lines, (line) => line === "[metafor] activated root=test/runtime-universe")
      await waitForLine(runtime, lines, (line) => line.startsWith("[metafor] running "))
      await waitForLine(runtime, lines, (line) => line.includes('"part":"photon"') && line.includes('"value":"idle"'))

      const response = await fetch(`http://127.0.0.1:${force}/health`)
      expect(response.status).toBe(200)
      const health = await response.json() as {
        ok: boolean
        domain: string
        clients: Array<{domain: string; id: string}>
      }
      expect(health.ok).toBe(true)
      expect(health.domain).toBe("force")
      expect(new Set(health.clients.map((client) => client.domain))).toEqual(
        new Set(["boundary", "dark", "energy", "matrix"]),
      )
      expect(existsSync(database)).toBe(true)
      expect(lines.some((line) => line.text.includes("[force] connected: bulk "))).toBe(false)
      expect(lines.some((line) => line.text.includes("interpreter"))).toBe(false)
    } finally {
      if (runtime.exitCode === null) runtime.kill("SIGTERM")
      const code = await Promise.race([
        runtime.exited,
        Bun.sleep(5_000).then(() => null),
      ])
      if (code === null && runtime.exitCode === null) runtime.kill("SIGKILL")
      rmSync(temporary, {recursive: true, force: true})
    }

    expect(runtime.exitCode).toBe(0)
  }, 60_000)
})
