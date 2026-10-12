#!/usr/bin/env bun
import {resolve} from "node:path"
import {runBootstrap, type BootstrapOptions} from "./bootstrap"

const help = `MetaFor

bun metafor.mjs --port 4444 --data-dir ./data --meta-root ../project/meta.ts

  --port <number>       Порт экземпляра, по умолчанию 4444
  --data-dir <path>     Директория данных, по умолчанию ./.metafor
  --meta-root <path>    Корневая Meta для первого заполнения Boundary

Первый запуск подготовленного выпуска:
  --release <sha256>    Digest кандидата; после запуска выбор сохраняется
  --code-dir <path>     Поставка с каталогом release; без него кандидат уже в data-dir/store
  --help               Показать справку
`

/** Parses the Bun CLI without starting processes or accessing instance data. */
export function parseMetaforArguments(args: readonly string[], cwd = process.cwd()): BootstrapOptions | "help" {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return "help"
  const values = new Map<string, string>()
  const allowed = new Set(["port", "data-dir", "meta-root", "release", "code-dir"])
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`)
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator < 0 ? undefined : separator)
    if (!allowed.has(name)) throw new Error(`Unknown option: --${name}`)
    if (values.has(name)) throw new Error(`Repeated option: --${name}`)
    const value = separator < 0 ? args[++i] : argument.slice(separator + 1)
    if (!value || value.startsWith("--")) throw new Error(`Missing value: --${name}`)
    values.set(name, value)
  }
  const portValue = values.get("port") ?? "4444"
  const port = Number(portValue)
  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Port must be an integer between 1 and 65535")
  const initialDigest = values.get("release")
  if (initialDigest !== undefined && !/^[0-9a-f]{64}$/.test(initialDigest))
    throw new Error("Release must be a lowercase SHA-256 digest")
  return {
    dataRoot: resolve(cwd, values.get("data-dir") ?? ".metafor"), port,
    ...(values.has("meta-root") ? {metaRoot: resolve(cwd, values.get("meta-root")!)} : {}),
    ...(values.has("code-dir") ? {codeRoot: resolve(cwd, values.get("code-dir")!)} : {}),
    ...(initialDigest === undefined ? {} : {initialDigest}),
  }
}

/** CLI owns only argument/configuration validation; startup owns the release process. */
export async function runMetaforCli(args: readonly string[]) {
  const options = parseMetaforArguments(args)
  if (options === "help") {
    console.log(help)
    return
  }
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {await runBootstrap({...options, signal: controller.signal})}
  finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
  }
}

/** Keeps nested startup/cleanup causes visible without dumping cyclic or unbounded diagnostics. */
export function formatMetaforError(error: unknown): string {
  const lines: string[] = []
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number) => {
    if (lines.length >= 12 || depth > 4 || seen.has(value)) return
    seen.add(value)
    const prefix = "  ".repeat(depth)
    if (!(value instanceof Error)) {
      lines.push(`${prefix}${String(value).slice(0, 1000)}`)
      return
    }
    lines.push(`${prefix}${value.name}: ${value.message.slice(0, 1000)}`)
    if (value instanceof AggregateError) for (const item of value.errors.slice(0, 8)) visit(item, depth + 1)
    if (value.cause !== undefined) visit(value.cause, depth + 1)
  }
  visit(error, 0)
  return lines.join("\n")
}

if (import.meta.main) {
  try {await runMetaforCli(process.argv.slice(2))}
  catch (error) {
    console.error(`MetaFor: ${formatMetaforError(error)}`)
    process.exitCode = 1
  }
}
