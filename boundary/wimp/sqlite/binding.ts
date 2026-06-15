import type {MatterRelationBindingValue} from "./matter.t.ts"

const FIELD_PATH_PREFIXES = ["/value/", "/fields/"] as const

export const normalizeMatterBindingPath = (path: string): string => {
  const prefix = FIELD_PATH_PREFIXES.find((item) => path.startsWith(item))
  if (!prefix) return path

  const [key] = path.slice(prefix.length).split(/[./\[]/, 1)
  return key || path
}

export const normalizeMatterBindingValue = (value: MatterRelationBindingValue): MatterRelationBindingValue => {
  if (typeof value === "string" || value.data === undefined) return value

  return {
    ...value,
    data: Array.isArray(value.data)
      ? value.data.map(normalizeMatterBindingPath)
      : normalizeMatterBindingPath(value.data),
  }
}
