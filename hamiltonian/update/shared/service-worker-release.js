const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

/**
 * The Service Worker code version is a SemVer 2.0.0 identifier carried by the
 * executing bundle itself. The length bound matches a lifecycle attribute.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isHamiltonianServiceWorkerCodeVersion(value) {
  return typeof value === "string" && value.length <= 256 && SEMVER.test(value)
}

/**
 * @param {unknown} value
 * @returns {value is {version: string, sha256: string}}
 */
export function isHamiltonianServiceWorkerRelease(value) {
  return isRecord(value) &&
    isHamiltonianServiceWorkerCodeVersion(value.version) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256)
}

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === "object" && value !== null
}
