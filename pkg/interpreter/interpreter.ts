#!/usr/bin/env bun

import {runInterpreter} from "./src/interpreter.ts"
import {inspectModeFromCommand, type InspectMode} from "./src/inspect-mode.ts"

const startupTarget = consumeStartupTarget(Bun.argv.slice(2))

await runInterpreter(undefined, startupTarget === undefined ? {} : {startupTarget})

type CliStartupTarget = {command: string[]; cwd: string; pauseOnStart: boolean; inspectMode: InspectMode}

function consumeStartupTarget(rawArgs: string[]): CliStartupTarget | undefined {
  const state = globalThis as typeof globalThis & {__metaforInterpreterStartupTargetConsumed?: boolean}
  if (state.__metaforInterpreterStartupTargetConsumed === true) return undefined
  const target = startupTargetFromArgs(rawArgs)
  if (target !== undefined) state.__metaforInterpreterStartupTargetConsumed = true
  return target
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
