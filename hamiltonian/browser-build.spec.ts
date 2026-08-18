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

    await buildBrowserEntry("hamiltonian/visual/browser/layout-worker.ts", outdir)
    const layoutWorkerSource = await Bun.file(join(outdir, "layout-worker.js")).text()
    expect(layoutWorkerSource).toContain("runLayoutWorkerRequest")
    expect(layoutWorkerSource).toContain('type: "layout-result"')
    expect(layoutWorkerSource).not.toContain("@nodes/ui")

    await buildBrowserEntry("hamiltonian/browser/service.ts", outdir)
    const serviceWorkerSource = await Bun.file(join(outdir, "service.js")).text()
    expect(serviceWorkerSource).toContain('subjectKind: "service"')
    expect(serviceWorkerSource).toContain('subjectKind: "service-api"')
    expect(serviceWorkerSource).toContain('subjectKind: "service-api-message"')
    expect(serviceWorkerSource).toContain('HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.3"')
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

    const serverRuntimeTypeScript = await Bun.file(join(repositoryRoot, "hamiltonian/server-runtime.ts")).text()
    expect(serverRuntimeTypeScript).toContain('const updateRoot = `${experimentRoot}/update`')
    const watchRootsStart = serverRuntimeTypeScript.indexOf("for (const root of [")
    const watchRootsEnd = serverRuntimeTypeScript.indexOf("]) {", watchRootsStart)
    expect(serverRuntimeTypeScript.slice(watchRootsStart, watchRootsEnd)).toContain("updateRoot")

    const serviceWorkerTypeScript = await Bun.file(join(repositoryRoot, "hamiltonian/browser/service.ts")).text()
    expect(serviceWorkerTypeScript).toContain("new HamiltonianServiceWorkerUpdateController(")
    expect(serviceWorkerTypeScript).toContain("new HamiltonianBrowserReleaseCacheController(")
    expect(serviceWorkerTypeScript).not.toContain("let applicationReady")
    expect(serviceWorkerTypeScript).not.toContain("function isServiceWorkerRelease(")
    expect(serviceWorkerTypeScript).not.toContain("async function prepareVersion(")
    expect(serviceWorkerTypeScript).not.toContain("function isVersionManifest(")
    expect(serviceWorkerTypeScript).not.toContain("let currentVersionState")
    expect(serviceWorkerTypeScript).not.toContain("responseMatchesHash")
    expect(serviceWorkerTypeScript).not.toContain("selectRetainedCaches")
    const serviceWorkerUpdateSource = await Bun.file(join(
      repositoryRoot,
      "hamiltonian/update/browser/service-update.ts",
    )).text()
    expect(serviceWorkerUpdateSource).toContain("this.#updateRegistration")
    expect(serviceWorkerUpdateSource).toContain("#applicationReady")
    expect(serviceWorkerUpdateSource).toContain("isHamiltonianServiceWorkerRelease(target)")
    expect(serviceWorkerUpdateSource).not.toContain("registration.update()")
    const releaseCacheSource = await Bun.file(join(
      repositoryRoot,
      "hamiltonian/update/browser/release-cache.js",
    )).text()
    expect(releaseCacheSource).toContain("export class HamiltonianBrowserReleaseCacheController")
    expect(releaseCacheSource).toContain('this.#fetchResponse("/manifest.json", {headers, cache: "no-store"})')
    expect(releaseCacheSource).toContain("responseMatchesHash(moduleResponse, manifest.sha256)")
    expect(releaseCacheSource).toContain("this.#publish(state)")
    expect(releaseCacheSource).toContain('url.pathname.startsWith("/versions/")')
    expect(releaseCacheSource).not.toContain("../host")
    const versionFetchAdapter = serviceWorkerTypeScript.slice(
      serviceWorkerTypeScript.indexOf('serviceWorkerRuntime.addEventListener("fetch"'),
      serviceWorkerTypeScript.indexOf("function closeWindowChannel"),
    )
    expect(versionFetchAdapter).toContain("browserReleaseCacheController.handlesVersionRequest(event.request)")
    expect(versionFetchAdapter).toContain("browserReleaseCacheController.cachedVersionResponse(event.request)")
    expect(versionFetchAdapter).toContain("Version is not prepared by Hamiltonian")
    expect(versionFetchAdapter).toContain("status: 503")
    expect(serviceWorkerTypeScript).toContain("observation?.ownerId === currentBrowserEntityId")
    expect(serviceWorkerTypeScript).toContain("currentPushReady = true")
    expect(serviceWorkerTypeScript).toContain("await restoreControlBootstrap()")
    expect(serviceWorkerTypeScript).toContain('...(state === "active" ? {reason: null} : {})')
    expect(serviceWorkerTypeScript).toContain('hamiltonianLifecycleEntityId("service", workerRuntimeIncarnation)')
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
    expect(pageSource).not.toContain("const elements = Object.fromEntries")
    expect(pageSource).not.toContain('document.createElement("li")')
    expect(pageSource).not.toContain("document.getElementById")
    expect(pageSource).not.toContain('.addEventListener("click"')
    expect(pageSource).not.toContain("function log(")
    expect(pageSource).toContain("function runOrchestrationAction(actionId)")
    expect(pageSource).toContain('window.addEventListener("keydown"')
    expect(pageSource).toContain('runOrchestrationAction("enable-push")')
    expect(pageSource).toContain('window.addEventListener("hamiltonian-orchestration-action"')
    expect(pageSource).toContain("runOrchestrationAction(action.actionId)")
    expect(pageSource).toContain('from "/update/page-update.js"')
    expect(pageSource).toContain("new HamiltonianPageUpdateController({")
    expect(pageSource).toContain("pageUpdateController.acceptNavigationSourceRevision(")
    expect(pageSource).toContain("pageUpdateController.activateVersion(message)")
    expect(pageSource).toContain("pageUpdateController.acceptSourceRevision(message.revision)")
    expect(pageSource).not.toContain("function activateVersion(")
    expect(pageSource).not.toContain("sourceRevisionStorageKey")
    expect(pageSource).not.toContain('`${message.version}:${message.sha256}`')
    expect(pageSource).not.toContain("mainRealmRequiresReload")
    expect(pageSource).not.toContain("sourceRevisionRequiresReload")

    const browserControlSource = await Bun.file(join(
      repositoryRoot,
      "hamiltonian/core/browser-control.js",
    )).text()
    expect(browserControlSource).not.toContain("mainRealmRequiresReload")
    expect(browserControlSource).not.toContain("sourceRevisionRequiresReload")
    const pageUpdateSource = await Bun.file(join(
      repositoryRoot,
      "hamiltonian/update/browser/page-update.js",
    )).text()
    expect(pageUpdateSource).toContain("export function mainRealmRequiresReload(")
    expect(pageUpdateSource).toContain("export function sourceRevisionRequiresReload(")
    expect(pageUpdateSource).toContain("export class HamiltonianPageUpdateController")
    expect(pageUpdateSource).toContain('const SOURCE_REVISION_STORAGE_KEY = "hamiltonian-source-revision"')
    expect(pageUpdateSource).toContain('const MAIN_VERSION_STORAGE_KEY = "hamiltonian-main-version"')
    expect(pageUpdateSource).toContain("this.#importModule(release.moduleUrl)")
    expect(pageUpdateSource).toContain("this.#birthDedicatedWorker(loadedRelease)")
    expect(pageUpdateSource).toContain("this.#reconcileMain(loadedRelease)")
    expect(pageUpdateSource).not.toContain("../host")
    expect(pageUpdateSource).not.toMatch(/^\s*import\s/m)

    await buildBrowserEntry("hamiltonian/public/app.js", outdir, [
      "/core/monitor.js",
      "/core/lifecycle.js",
      "/core/runtime.js",
      "/core/browser-control.js",
      "/core/orchestration.js",
      "/update/page-update.js",
      "/web-push-client.js",
    ])
    const pageBundle = await Bun.file(join(outdir, "app.js")).text()
    expect(pageBundle).toContain('from "/update/page-update.js"')
    expect(pageBundle).toContain("new HamiltonianPageUpdateController")
  } finally {
    await rm(outdir, {recursive: true, force: true})
  }
})

async function buildBrowserEntry(
  entrypoint: string,
  outdir: string,
  externals: string[] = [],
): Promise<void> {
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
      ...externals.flatMap((external) => ["--external", external]),
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
