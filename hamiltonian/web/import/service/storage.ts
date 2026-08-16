import type {Module} from "./loader"

/** Сменяемые browser modules и принадлежащие им Cache Storage. */
export const modules = {
  "@import/main": {
    endpoint: "/code?module=@import/main",
    cache: "import",
  },
  "@import/service": {
    endpoint: "/code?module=@import/service",
    cache: "import",
  },
  "@internal/rpc": {
    endpoint: "/code?module=@internal/rpc",
    cache: "internal",
  },
} as const satisfies Record<string, Module>

export type ModuleName = keyof typeof modules

/** Internal RPC module, из которого importer формирует Service Worker-контур. */
export const rpc = modules["@internal/rpc"]

/** Находит cache policy только для известного канонического package name. */
export function moduleByName(name: string): Module | null {
  if (Object.hasOwn(modules, name)) return modules[name as ModuleName]
  return null
}
