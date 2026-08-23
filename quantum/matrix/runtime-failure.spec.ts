import {describe, expect, test} from "bun:test"

describe("Matrix critical runtime failure", () => {
  test("returns the failure to Force processing and exits the process", async () => {
    const child = Bun.spawn({
      cmd: [process.execPath, "matrix/tests/fixtures/runtime-failure.ts"],
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        FORCE_ADDRESS: "ws://127.0.0.1:1/ws",
        FORCE_RECONNECT: "0",
        METAFOR_WEAK_BACKEND: "cpu",
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(5_000).then(() => null),
    ])
    if (exitCode === null) child.kill("SIGKILL")

    const stderr = await new Response(child.stderr).text()
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Force onImpulse failed")
    expect(stderr).toContain("Expected string")
  })
})
