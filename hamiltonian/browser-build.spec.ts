import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))

test("builds the real orchestration and isolated layout Worker bundles", async () => {
  const outdir = await mkdtemp(join(tmpdir(), "hamiltonian-browser-build."))
  try {
    await buildBrowserEntry("hamiltonian/browser/orchestration.ts", outdir)
    const orchestrationSource = await Bun.file(join(outdir, "orchestration.js")).text()
    expect(orchestrationSource).toContain("ГАМИЛЬТОНИАН · ЖИВАЯ ОРКЕСТРАЦИЯ")
    expect(orchestrationSource).toContain("ServiceWorker controller")
    expect(orchestrationSource).toContain("subscribeHamiltonianLifecycle")
    expect(orchestrationSource).toContain("new HamiltonianLifecycleProjection")
    expect(orchestrationSource).toContain("hamiltonianLifecycleSource")
    expect(orchestrationSource).toContain("hamiltonianLifecycleSequence")
    expect(orchestrationSource).toContain('new Worker("/layout-worker.js"')
    expect(orchestrationSource).toContain("new LayoutWorkerClient")
    expect(orchestrationSource).toContain("struct GlobalUniforms")
    expect(orchestrationSource).not.toContain("mesh_basic-")
    expect(orchestrationSource).not.toMatch(/if \(nodeId !== null\)\s+inspector\d*\.setOpen\(true\)/)

    await buildBrowserEntry("hamiltonian/browser/layout-worker.ts", outdir)
    const layoutWorkerSource = await Bun.file(join(outdir, "layout-worker.js")).text()
    expect(layoutWorkerSource).toContain("runLayoutWorkerRequest")
    expect(layoutWorkerSource).toContain('type: "layout-result"')
    expect(layoutWorkerSource).not.toContain("@nodes/ui")

    await buildBrowserEntry("hamiltonian/browser/service-worker.ts", outdir)
    const serviceWorkerSource = await Bun.file(join(outdir, "service-worker.js")).text()
    expect(serviceWorkerSource).toContain('subjectKind: "service-worker"')
    expect(serviceWorkerSource).toContain('subjectKind: "controller"')
    expect(serviceWorkerSource).toContain('subjectKind: "message-port"')
    expect(serviceWorkerSource).toContain("Service Worker control socket connected")
    expect(serviceWorkerSource).toContain("lifecycle-retirement")
    expect(serviceWorkerSource).toContain('lastFailure: "worker-replaced"')
    expect(serviceWorkerSource).not.toContain("ServiceWorkerGlobalScope")
    expect(serviceWorkerSource).not.toContain("awaiting-heartbeat")
    expect(serviceWorkerSource).not.toContain("continuity")
  } finally {
    await rm(outdir, {recursive: true, force: true})
  }
})

async function buildBrowserEntry(entrypoint: string, outdir: string): Promise<void> {
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "build",
      entrypoint,
      "--target=browser",
      "--format=esm",
      "--sourcemap=inline",
      "--outdir",
      outdir,
    ],
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(exitCode, `${stdout}\n${stderr}`.trim()).toBe(0)
}
