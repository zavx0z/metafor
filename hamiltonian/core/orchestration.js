export const HAMILTONIAN_LOCAL_WINDOW_ACTION_IDS = Object.freeze([
  "open-window",
  "rebirth-worker",
  "reload-main",
  "reconnect",
  "reload",
])

const HAMILTONIAN_LOCAL_WINDOW_ACTION_ID_SET = new Set(HAMILTONIAN_LOCAL_WINDOW_ACTION_IDS)

/** @param {string} deviceId @param {string} tabId */
export function hamiltonianWindowNodeId(deviceId, tabId) {
  return `window:${encodeURIComponent(deviceId || "unknown")}:${encodeURIComponent(tabId || "unknown")}`
}

/** @param {string} pageIncarnation */
export function hamiltonianPageNodeId(pageIncarnation) {
  return `page:${encodeURIComponent(pageIncarnation || "unknown")}`
}

/** @param {string} deviceId */
export function hamiltonianBrowserNodeId(deviceId) {
  return `browser:${encodeURIComponent(deviceId || "unknown")}`
}

/** @param {string} userAgent */
export function hamiltonianBrowserRuntimeName(userAgent) {
  if (/YaBrowser\//.test(userAgent)) return "Yandex Browser"
  if (/Edg\//.test(userAgent)) return "Microsoft Edge"
  if (/Firefox\//.test(userAgent)) return "Firefox"
  if (/(?:Chrome|CriOS)\//.test(userAgent)) return "Chrome"
  if (/Chromium\//.test(userAgent)) return "Chromium"
  if (/Safari\//.test(userAgent)) return "Safari"
  return "Браузер"
}

/**
 * Accepts only an allowlisted action addressed to this exact local page.
 * The DOM event is an adapter boundary, not authority: actual lifecycle guards
 * remain in the action implementation.
 *
 * @param {unknown} value
 * @param {string} deviceId
 * @param {string} tabId
 * @param {string} [pageIncarnation]
 * @returns {{nodeId: string, actionId: string} | null}
 */
export function parseLocalHamiltonianWindowAction(value, deviceId, tabId, pageIncarnation) {
  const record = objectValue(value)
  const nodeId = stringValue(record?.nodeId)
  const actionId = stringValue(record?.actionId)
  const acceptedNodeIds = new Set([
    hamiltonianWindowNodeId(deviceId, tabId),
    hamiltonianPageNodeId(pageIncarnation ?? ""),
  ])
  if (!acceptedNodeIds.has(nodeId)) return null
  if (!HAMILTONIAN_LOCAL_WINDOW_ACTION_ID_SET.has(actionId)) return null
  return {nodeId, actionId}
}

/** @param {unknown} value @returns {Record<string, unknown> | null} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null
}

/** @param {unknown} value */
function stringValue(value) {
  return typeof value === "string" ? value : ""
}
