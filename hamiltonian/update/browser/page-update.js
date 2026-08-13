/**
 * A page reload is required only when the current page realm already owns an
 * active main embodiment built from a different module. A follower that has
 * merely retained an older fingerprint in sessionStorage may accept the
 * module it has just imported and birth main later without reloading again.
 *
 * @param {boolean} hasMainEmbodiment
 * @param {string | null | undefined} loadedFingerprint
 * @param {string} nextFingerprint
 */
export function mainRealmRequiresReload(hasMainEmbodiment, loadedFingerprint, nextFingerprint) {
  return hasMainEmbodiment === true &&
    loadedFingerprint !== nextFingerprint
}

/**
 * A served-code revision reloads a page at most once. The producer derives it
 * only from browser artifacts, never from a host incarnation or local build
 * generation. Persisting the accepted revision in sessionStorage therefore
 * prevents both cold-host reloads with unchanged code and duplicate-message
 * reload loops.
 *
 * @param {string | null | undefined} currentRevision
 * @param {string | null | undefined} nextRevision
 */
export function sourceRevisionRequiresReload(currentRevision, nextRevision) {
  return typeof nextRevision === "string" && nextRevision.length > 0 &&
    currentRevision !== nextRevision
}
