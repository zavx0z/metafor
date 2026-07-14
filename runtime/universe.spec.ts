import {describe, expect, test} from "bun:test"
import type {UniverseSummary} from "./universe.ts"

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

describe("MetaFor universe launcher", () => {
  test("starts the core, completes one causal cycle and exits in --once mode", async () => {
    const child = Bun.spawn({
      cmd: ["bun", "runtime/universe.ts", "--once"],
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...inheritedEnv,
        METAFOR_LOG_IMPULSES: "0",
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
      Bun.sleep(60_000).then(() => {
        child.kill("SIGKILL")
        return -1
      }),
    ])
    const output = await stdout
    const errors = await stderr

    expect(exitCode, errors).toBe(0)
    const ready = output.split("\n").find((line) => line.startsWith("[metafor] universe ready "))
    expect(ready).toBeDefined()
    const summary = JSON.parse(ready!.slice("[metafor] universe ready ".length)) as UniverseSummary
    expect(summary).toMatchObject({
      input: 1,
      output: 2,
      observed: 2,
      sourceState: "complete",
      targetState: "reacted",
    })
    expect(summary.capsuleUrl).toStartWith("http://")
    expect(output).toContain("connected: bulk")
    expect(output).not.toContain("connected: interpreter")
  }, 70_000)
})
