import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

describe("Universe launcher", () => {
  test("births all five domains and exits cleanly in once mode", async () => {
    const directory = mkdtempSync(join(tmpdir(), "metafor-universe-"))
    temporaryDirectories.push(directory)
    const basePort = 44_000 + (process.pid % 1_000) * 10
    const child = Bun.spawn({
      cmd: ["bun", "runtime/universe.ts", "--once"],
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        BOUNDARY_PATH: join(directory, "boundary.sqlite"),
        DARK_HISTORY_PATH: join(directory, "dark-history.jsonl"),
        FORCE_RECONNECT: "0",
        METAFOR_LOG_IMPULSES: "0",
        METAFOR_UNIVERSE_PORT_BASE: String(basePort),
        METAFOR_WEAK_BACKEND: "cpu",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = new Response(child.stdout as ReadableStream<Uint8Array>).text()
    const stderr = new Response(child.stderr as ReadableStream<Uint8Array>).text()
    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(45_000).then(() => {
        child.kill("SIGKILL")
        return -1
      }),
    ])
    const output = await stdout
    const errors = await stderr

    expect(exitCode, errors).toBe(0)
    expect(output).toContain("[metafor] Universe born")
    expect(output).toContain(`\"force\":${basePort}`)
    expect(output).toContain("\"backend\":\"cpu\"")
  }, 50_000)
})
