/** Имена независимых Cache Storage для изменяемых module layers. */
export type ModuleCacheName = "internal" | "metafor"

/**
 * Определяет module cache только из стабильного endpoint.
 *
 * Startup не знает состав modules. Он различает лишь служебную логику
 * Hamiltonian под `/internal/*` и будущую среду MetaFor под `/metafor/*`.
 * Cache открывается лениво только после фактического запроса соответствующего
 * module.
 *
 * @param request - HTTP request загружаемого module.
 * @returns Имя Cache Storage либо `null` для немодульного endpoint.
 */
export function moduleCacheName(request: Request): ModuleCacheName | null {
  const pathname = new URL(request.url).pathname
  if (pathname.startsWith("/internal/")) return "internal"
  if (pathname.startsWith("/metafor/")) return "metafor"
  return null
}
