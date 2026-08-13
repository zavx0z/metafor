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
