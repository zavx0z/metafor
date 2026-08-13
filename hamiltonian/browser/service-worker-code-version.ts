import {isHamiltonianServiceWorkerCodeVersion} from "../core/service-worker-code-version.js"

// This version belongs only to the executable Service Worker bundle. It is
// intentionally independent from the host/module version and source revision.
export const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.3"

if (!isHamiltonianServiceWorkerCodeVersion(HAMILTONIAN_SERVICE_WORKER_CODE_VERSION)) {
  throw new Error("Hamiltonian Service Worker code version is not valid SemVer")
}
