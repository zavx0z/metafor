/** Возвращает постоянный Cache Storage владельца package namespace. */
export function browserPackageCache(name: string | null) {
  if (name === "@cosmos/startup") return "startup"
  if (name === "@cosmos/release") return "release"
  if (name?.startsWith("@internal/")) return "internal"
  if (name?.startsWith("@metafor/")) return "metafor"
  return null
}
