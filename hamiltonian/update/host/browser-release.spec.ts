import {describe, expect, test} from "bun:test"
import {
  hamiltonianBrowserManifest,
  hamiltonianBrowserSourceRevision,
  hamiltonianServiceWorkerRelease,
  hamiltonianVersionedModuleRelease,
} from "./browser-release.ts"

describe("Hamiltonian browser release projection", () => {
  test("projects distinct module and Service Worker releases from their exact bytes", () => {
    const module = hamiltonianVersionedModuleRelease("module/v1", "module bytes")
    const serviceWorker = hamiltonianServiceWorkerRelease(
      'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0";\nworker bytes',
    )

    expect(hamiltonianBrowserManifest("stable-host", module, serviceWorker)).toEqual({
      identity: "stable-host",
      version: "module/v1",
      moduleUrl: "/versions/module%2Fv1/module.js",
      sha256: "5c073b6de205a83e4df87dcd07111be224ad4435a8c08ca0ba10e68dcf38fe92",
      serviceWorker: {
        version: "1.1.0",
        sha256: "d228cdac1afd6d9e5edb75e5b3505fa63b62bd40e95af279528b5626739f5661",
      },
    })
    expect(serviceWorker.sha256).not.toBe(module.sha256)
  })

  test("does not materialize a manifest from an invalid Service Worker bundle", () => {
    let manifest: ReturnType<typeof hamiltonianBrowserManifest> | undefined
    expect(() => {
      manifest = hamiltonianBrowserManifest(
        "stable-host",
        hamiltonianVersionedModuleRelease("module-v1", "module bytes"),
        hamiltonianServiceWorkerRelease("worker bundle without executable SemVer"),
      )
    }).toThrow("Hamiltonian Service Worker bundle lacks a valid code SemVer")
    expect(manifest).toBeUndefined()
  })

  test("keys the canonical source revision by every served browser artifact", () => {
    const served = {
      orchestrationBundle: "orchestration-a",
      layoutWorkerBundle: "layout-worker-a",
      serviceWorkerBundle: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-a',
      webPushClientBundle: "web-push-client-a",
      directlyServedText: {
        "/app.js": "app-a",
        "/core/browser-control.js": "browser-control-a",
        "/update/page-update.js": "page-update-a",
      },
    }
    const revision = hamiltonianBrowserSourceRevision(served)

    expect(hamiltonianBrowserSourceRevision({
      ...served,
      directlyServedText: {
        "/core/browser-control.js": "browser-control-a",
        "/update/page-update.js": "page-update-a",
        "/app.js": "app-a",
      },
    })).toBe(revision)
    expect(revision).toBe("source:fc8aed8779ec909a1371d1c74233680d32152e31b52545d35f54075a95409473")

    for (const changedArtifacts of [
      {...served, orchestrationBundle: "orchestration-b"},
      {...served, layoutWorkerBundle: "layout-worker-b"},
      {...served, serviceWorkerBundle: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-b'},
      {...served, webPushClientBundle: "web-push-client-b"},
      {
        ...served,
        directlyServedText: {...served.directlyServedText, "/app.js": "app-b"},
      },
      {
        ...served,
        directlyServedText: {
          ...served.directlyServedText,
          "/update/page-update.js": "page-update-b",
        },
      },
    ]) {
      expect(hamiltonianBrowserSourceRevision(changedArtifacts)).not.toBe(revision)
    }
  })
})
