import {isHamiltonianServiceWorkerCodeVersion} from "../shared/service-worker-release.js"

export interface HamiltonianBrowserSourceArtifacts {
  orchestrationBundle: string
  layoutWorkerBundle: string
  serviceWorkerBundle: string
  webPushClientBundle: string
  directlyServedText: Readonly<Record<string, string>>
}

export interface HamiltonianServiceWorkerRelease {
  version: string
  sha256: string
}

export interface HamiltonianVersionedModuleRelease {
  version: string
  moduleUrl: string
  sha256: string
}

export interface HamiltonianBrowserManifest extends HamiltonianVersionedModuleRelease {
  identity: string
  serviceWorker: HamiltonianServiceWorkerRelease
}

function sha256Hex(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex") as string
}

export function hamiltonianVersionedModuleRelease(
  version: string,
  source: string,
): HamiltonianVersionedModuleRelease {
  return {
    version,
    moduleUrl: `/versions/${encodeURIComponent(version)}/module.js`,
    sha256: sha256Hex(source),
  }
}

export function hamiltonianServiceWorkerRelease(source: string): HamiltonianServiceWorkerRelease {
  const version = source.match(/HAMILTONIAN_SERVICE_WORKER_CODE_VERSION\s*=\s*["']([^"']+)["']/)?.[1]
  if (!isHamiltonianServiceWorkerCodeVersion(version)) {
    throw new Error("Hamiltonian Service Worker bundle lacks a valid code SemVer")
  }
  return {
    version,
    sha256: sha256Hex(source),
  }
}

export function hamiltonianBrowserManifest(
  identity: string,
  module: HamiltonianVersionedModuleRelease,
  serviceWorker: HamiltonianServiceWorkerRelease,
): HamiltonianBrowserManifest {
  return {
    identity,
    ...module,
    serviceWorker,
  }
}

export function hamiltonianBrowserSourceRevision(
  artifacts: HamiltonianBrowserSourceArtifacts,
): string {
  const canonicalArtifacts = Object.entries({
    ...artifacts.directlyServedText,
    "/orchestration.js": artifacts.orchestrationBundle,
    "/layout-worker.js": artifacts.layoutWorkerBundle,
    "/sw-entry.js": artifacts.serviceWorkerBundle,
    "/web-push-client.js": artifacts.webPushClientBundle,
  })
    .sort(([left], [right]) => left.localeCompare(right))
  return `source:${sha256Hex(JSON.stringify(canonicalArtifacts))}`
}
