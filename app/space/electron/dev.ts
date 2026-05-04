import { spawn } from "bun"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const URL_TARGET = "http://127.0.0.1:1420"

async function buildMain() {
  console.log("[dev] building main process...")
  const result = await Bun.build({
    entrypoints: [join(root, "electron/main.ts")],
    outdir: join(root, "out"),
    target: "node",
    format: "cjs",
    external: ["electron"],
    sourcemap: "linked",
    naming: { entry: "main.cjs" },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error("main build failed")
  }
}

async function waitForPort(port: number, host = "127.0.0.1", timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const sock = await Bun.connect({
        hostname: host,
        port,
        socket: { data() {}, open() {}, close() {}, drain() {}, error() {} },
      })
      sock.end()
      return
    } catch {
      await Bun.sleep(150)
    }
  }
  throw new Error(`renderer dev server did not start on ${host}:${port} within ${timeoutMs}ms`)
}

async function findElectronBinary(): Promise<string> {
  // Walk up from app/space looking for node_modules/.bin/electron
  let dir = root
  while (true) {
    const candidate = join(dir, "node_modules", ".bin", "electron")
    if (await Bun.file(candidate).exists()) return candidate
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  throw new Error("electron binary not found in any node_modules/.bin (run `bun install`)")
}

async function main() {
  await buildMain()

  console.log("[dev] starting renderer dev server on", URL_TARGET)
  const server = spawn({
    cmd: ["bun", "--hot", "server.ts"],
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, PORT: "1420" },
  })

  const cleanup = () => {
    try {
      server.kill()
    } catch {}
  }
  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })

  try {
    await waitForPort(1420)
  } catch (err) {
    cleanup()
    throw err
  }

  const electronBin = await findElectronBinary()
  console.log("[dev] launching electron:", electronBin)

  const electronProc = spawn({
    cmd: [electronBin, join(root, "out/main.cjs")],
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, SPACE_DEV_URL: URL_TARGET, ELECTRON_ENABLE_LOGGING: "1" },
  })

  const code = await electronProc.exited
  cleanup()
  process.exit(code ?? 0)
}

main().catch((err) => {
  console.error("[dev] fatal:", err)
  process.exit(1)
})
