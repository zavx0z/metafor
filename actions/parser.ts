import type { ParsedProcess } from "./parser.t"
import type { ActionChain } from "./index.t"
import type { ContextSchema } from "../context"

const pattern = {
  dot: /context\.(\w+)/g,
  destructParams: /context:\s*{([^}]+)}/g,
  destructBody: /(?:const|let|var)\s*{([^}]+)}\s*=\s*context(?:\s*,\s*{([^}]+)}\s*=\s*context)*/g,
  update: /update\(\s*{([^}]+)}\s*\)/g,
}

export function parseFunction(fn: Function, allowWrite: boolean = true) {
  const code = fn.toString()
  const read = new Set<string>()
  const write = new Set<string>()
  let match
  while ((match = pattern.dot.exec(code)) !== null) {
    if (match && typeof match[1] === "string" && match[1].length > 0) {
      read.add(match[1])
    }
  }
  while ((match = pattern.destructParams.exec(code)) !== null) {
    const s = typeof match[1] === "string" ? match[1] : ""
    if (s.length > 0) {
      s.split(",")
        .map((p) => p?.trim())
        .filter(Boolean)
        .forEach((p) => read.add(p))
    }
  }
  for (const match of code.matchAll(pattern.destructBody)) {
    if (match && Array.isArray(match)) {
      const m1 = typeof match[1] === "string" ? match[1] : undefined
      const m2 = typeof match[2] === "string" ? match[2] : undefined
      const propsArr = [m1, m2].filter((v): v is string => typeof v === "string" && v.length > 0)
      const props = propsArr.length > 0 ? propsArr.join(",") : ""
      if (props.length > 0) {
        props
          .split(",")
          .map((p) => p?.trim()?.split(":")[0]?.trim() ?? "")
          .filter(Boolean)
          .forEach((p) => read.add(p))
      }
    }
  }
  while ((match = pattern.update.exec(code)) !== null) {
    const s = typeof match[1] === "string" ? match[1] : ""
    if (s.length > 0) {
      s.split(",")
        .map((p) => p?.split(":")[0]?.trim() ?? "")
        .filter(Boolean)
        .forEach((p) => write.add(p))
    }
  }
  return { read: Array.from(read), write: allowWrite ? Array.from(write) : [] }
}

export function parseProcess(process: any): ParsedProcess {
  const result: ParsedProcess = {}
  if (process.action) {
    const parsed = parseFunction(process.action, false)
    result.action = { fn: process.action, read: parsed.read }
  }
  if (typeof process.success === "function") {
    const parsed = parseFunction(process.success)
    result.success = { fn: process.success, ...parsed }
  }
  if (typeof process.error === "function") {
    const parsed = parseFunction(process.error)
    result.error = { fn: process.error, ...parsed }
  }
  return result
}

export function parseChain<C extends ContextSchema, Res>(chain: ActionChain<C, Res>): ParsedProcess {
  return parseProcess(chain.getResult())
}

export function parseChainsObject(obj: Record<string, any>): Record<string, ParsedProcess> {
  const result: Record<string, ParsedProcess> = {}
  for (const key in obj) {
    if (obj[key]) {
      result[key] = parseProcess(obj[key])
    }
  }
  return result
}
