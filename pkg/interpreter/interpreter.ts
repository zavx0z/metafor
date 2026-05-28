#!/usr/bin/env bun

import {runInterpreter} from "./src/interpreter.ts"
import {inspectModeFromCommand, type InspectMode} from "./src/inspect-mode.ts"

const startupTargets = startupTargetsFromArgs(Bun.argv.slice(2))

await runInterpreter(undefined, startupTargets.length === 0 ? {} : {startupTargets})

type CliStartupTarget = {command: string[]; cwd: string; pauseOnStart: boolean; inspectMode: InspectMode; label?: string}

function startupTargetsFromArgs(rawArgs: string[]): CliStartupTarget[] {
  const args = stripLeadingSeparator(rawArgs)
  if (args.length === 0) return []
  if (!args.includes("--session")) {
    const target = startupTargetFromArgs(args)
    return target === undefined ? [] : [target]
  }

  const targets: CliStartupTarget[] = []
  let i = 0
  while (i < args.length) {
    if (args[i] !== "--session") {
      throw new Error("multiple interpreter processes must use --session <label> -- <command...>")
    }
    const label = args[i + 1]
    if (label === undefined || label === "--" || label === "--session") {
      throw new Error("--session requires a label")
    }
    i += 2
    if (args[i] === "--") i += 1
    const command: string[] = []
    while (i < args.length && args[i] !== "--session") command.push(args[i++]!)
    const target = startupTargetFromArgs(command)
    if (target === undefined) throw new Error(`--session ${label} requires a command`)
    targets.push({...target, label})
  }
  return targets
}

function startupTargetFromArgs(rawArgs: string[]): CliStartupTarget | undefined {
  const args = stripLeadingSeparator(rawArgs)
  if (args.length === 0) return undefined
  const command = normalizeBunTargetCommand(args)
  const inspectMode = inspectModeFromCommand(command) ?? "brk"
  return {
    command,
    cwd: process.cwd(),
    pauseOnStart: inspectMode === "brk",
    inspectMode,
  }
}

function stripLeadingSeparator(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args
}

function normalizeBunTargetCommand(args: string[]): string[] {
  const first = args[0]
  if (isBunCommand(first)) return args
  return ["bun", ...args]
}

function isBunCommand(value: string | undefined): boolean {
  if (value === undefined) return false
  const normalized = value.replaceAll("\\", "/")
  return normalized === "bun" || normalized.endsWith("/bun")
}
