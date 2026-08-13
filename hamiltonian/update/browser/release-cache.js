/** @param {Response} response */
export async function sha256Hex(response) {
  const bytes = await response.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

/** @param {Response | null | undefined} response @param {string} expectedHash */
export async function responseMatchesHash(response, expectedHash) {
  if (!response) return false
  if (response.headers.get("x-hamiltonian-sha256") !== expectedHash) return false
  return await sha256Hex(response.clone()) === expectedHash
}

/**
 * @param {string[]} names
 * @param {string} currentCacheName
 * @param {string | null} [previousCacheName]
 * @param {number} [limit]
 */
export function selectRetainedCaches(names, currentCacheName, previousCacheName = null, limit = 2) {
  const ordered = [...new Set(names)].sort()
  const keep = new Set([currentCacheName])
  if (previousCacheName && ordered.includes(previousCacheName)) keep.add(previousCacheName)
  for (let index = ordered.length - 1; index >= 0 && keep.size < limit; index -= 1) {
    const name = ordered[index]
    if (name) keep.add(name)
  }
  return ordered.filter((name) => keep.has(name))
}
