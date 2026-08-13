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
    expect(orchestrationSource).toContain("Service Worker API")
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
    expect(serviceWorkerSource).toContain('subjectKind: "service-worker-api"')
    expect(serviceWorkerSource).toContain('subjectKind: "service-worker-api-message"')
    expect(serviceWorkerSource).toContain('HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.2"')
    expect(serviceWorkerSource).toContain("registration.update()")
    expect(serviceWorkerSource).toContain("applicationReady")
    expect(serviceWorkerSource).toContain("codeVersion: workerCodeVersion")
    expect(serviceWorkerSource).toContain("pageLifecycleSnapshot")
    expect(serviceWorkerSource).toContain("browser-lifecycle-snapshot")
    expect(serviceWorkerSource).toContain("node-system-declaration")
    expect(serviceWorkerSource).toContain("acceptHostNodeSystemDeclaration")
    expect(serviceWorkerSource).toContain("lifecycleSnapshot")
    expect(serviceWorkerSource).toContain("projectHamiltonianLifecycleOwnershipScope")
    expect(serviceWorkerSource).toContain("page-reloaded")
    expect(serviceWorkerSource).toContain("awaitLiveWindowChannels")
    expect(serviceWorkerSource).toContain("includeUncontrolled: true")
    expect(serviceWorkerSource).toContain("windowReattachRequestedAt")
    expect(serviceWorkerSource).toContain("!isCurrentWindowChannel(windows, window)")
    expect(serviceWorkerSource).not.toContain("!liveWindowsRehydrated")
    expect(serviceWorkerSource).toContain("receiveWindowMessage")
    expect(serviceWorkerSource).toContain("page-lifecycle")
    expect(serviceWorkerSource).toContain("Service Worker control socket connected")
    expect(serviceWorkerSource).toContain("lifecycle-retirement")
    expect(serviceWorkerSource).toContain('lastFailure: "worker-replaced"')
    expect(serviceWorkerSource).not.toContain("ServiceWorkerGlobalScope")
    expect(serviceWorkerSource).not.toContain("awaiting-heartbeat")
    expect(serviceWorkerSource).not.toContain("continuity")
    expect(serviceWorkerSource).not.toContain("currentBrowserEntityId??workerEntityId")
    expect(serviceWorkerSource).not.toContain("MessagePort")
    expect(serviceWorkerSource).not.toContain('subjectKind: "controller"')
    expect(serviceWorkerSource).not.toContain('subjectKind: "message-port"')

    const serviceWorkerTypeScript = await Bun.file(join(repositoryRoot, "hamiltonian/browser/service-worker.ts")).text()
    expect(serviceWorkerTypeScript).toContain("observation?.ownerId === currentBrowserEntityId")
    expect(serviceWorkerTypeScript).toContain("currentPushReady = true")
    expect(serviceWorkerTypeScript).toContain("await restoreControlBootstrap()")
    expect(serviceWorkerTypeScript).toContain('...(state === "active" ? {reason: null} : {})')
    expect(serviceWorkerTypeScript).toContain('hamiltonianLifecycleEntityId("service-worker", workerRuntimeIncarnation)')
    const directBrowserCloseCodes = [...serviceWorkerTypeScript.matchAll(/\.close\(\s*(\d+)/g)]
      .map(([, code]) => Number(code))
    expect(directBrowserCloseCodes.filter((code) => code >= 1001 && code <= 2999)).toEqual([])
    expect(serviceWorkerTypeScript).toContain("rejectHamiltonianControlSocket(")
    expect(serviceWorkerTypeScript).toContain(
      "!socketSlot.isCurrent(openedSocket) || openedSocket.readyState !== WebSocket.OPEN",
    )
    const pageLifecycleBranch = serviceWorkerTypeScript.slice(
      serviceWorkerTypeScript.indexOf('if (pageMessage.kind === "page-lifecycle")'),
      serviceWorkerTypeScript.indexOf('if (pageMessage.kind === "register-push-subscription")'),
    )
    expect(serviceWorkerTypeScript).toContain("projectPageLifecycleForBrowserJournal(")
    expect(pageLifecycleBranch).toContain("workerLifecycleJournal?.observe(pageMessage.envelope)")
    expect(pageLifecycleBranch).toContain("pageLifecycleMayEnterBrowserJournal(pageMessage.envelope, workerEntityId)")
    expect(pageLifecycleBranch).toContain("pageLifecycleChangesNodeSystem(pageMessage.envelope)")
    const pageLifecycleDeclarationSource = await Bun.file(join(
      repositoryRoot,
      "hamiltonian/browser/page-lifecycle-declaration.ts",
    )).text()
    expect(pageLifecycleDeclarationSource).toContain(
      'envelope.observation.type === "entity" || envelope.observation.type === "transport"',
    )
    expect(serviceWorkerTypeScript).not.toContain("observation?.ownerId === observation?.subjectId")

    const pageSource = await Bun.file(join(repositoryRoot, "hamiltonian/public/app.js")).text()
    expect(pageSource).not.toContain("ownerId: attachedWorkerEntityId")
    expect(pageSource).not.toContain("ownerId: previousWorkerEntityId")
    expect(pageSource).toContain('attributes: {state: "standby", heartbeat: "paused", reason}')
    expect(pageSource).toContain('disposition === "request" || disposition === "silent"')
    expect(pageSource).toContain("pageLifecycleSnapshot: pageLifecycleJournal.snapshot()")
    expect(pageSource).toContain("receiveHamiltonianLifecycleSnapshot(pageLifecycleJournal.snapshot())")
    expect(pageSource).toContain("receiveHamiltonianNodeSystemDeclaration")
    expect(pageSource).toContain("serviceWorkerTransportId")
    expect(pageSource).toContain("attachServiceWorkerChannel")
    expect(pageSource).toContain('kind: "window-heartbeat"')
    expect(pageSource).toContain("predecessorPageIncarnation")
    expect(pageSource).toContain('kind: "page-lifecycle"')
    expect(pageSource).not.toContain("MessageChannel")
    expect(pageSource).not.toContain("MessagePort")
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
