#!/usr/bin/env node

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import {classifyWorldOwner, readInterpreterServices} from "./world-owner.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, "../../../..")
const userId = typeof process.getuid === "function" ? process.getuid() : "user"
const runtimeDirectory = join(tmpdir(), `metafor-dev-${userId}`)
const statePath = join(runtimeDirectory, "world.json")
const logPath = join(runtimeDirectory, "world.log")

const services = [
  { name: "force", port: 4000, modulePath: "force/server.ts" },
  { name: "boundary", port: 4001, modulePath: "boundary/server.ts" },
  { name: "dark", port: 4002, modulePath: "dark/server.ts" },
  { name: "matrix", port: 4003, modulePath: "matrix/server.ts" },
  { name: "bulk", port: 4004, modulePath: "bulk/server.ts" },
  { name: "energy", port: 4005, modulePath: "energy/server.ts" },
]

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

const emit = (payload, exitCode = 0) => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exitCode = exitCode
}

const readJson = (path) => {
  if (!existsSync(path)) return undefined

  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return undefined
  }
}

const checkService = async ({ name, port }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_500)

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    })
    const body = await response.json().catch(() => undefined)
    const healthy = response.ok && body?.ok === true
    const requiresInitialization = name === "matrix" || name === "energy"
    const ready = healthy && (!requiresInitialization || body?.initialized === true)

    return {
      name,
      port,
      healthy,
      ready,
      status: response.status,
      ...(body && typeof body === "object" ? { health: body } : {}),
    }
  } catch (error) {
    return {
      name,
      port,
      healthy: false,
      ready: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

const getStatus = async () => {
  const results = await Promise.all(services.map(checkService))
  const healthy = results.filter((service) => service.healthy).length
  const ready = results.filter((service) => service.ready).length
  const state = ready === services.length
    ? "running"
    : healthy === 0
      ? "stopped"
      : healthy === services.length
        ? "starting"
        : "partial"

  return {
    schema: "metafor-dev/world@1",
    ok: state === "running",
    state,
    healthy,
    ready,
    total: services.length,
    services: Object.fromEntries(results.map((service) => [service.name, service])),
  }
}

const processExists = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const getManagedProcess = () => {
  const state = readJson(statePath)

  if (!state || state.root !== repositoryRoot || !processExists(state.pid)) {
    return undefined
  }

  return {
    pid: state.pid,
    startedAt: state.startedAt,
    log: state.log,
  }
}

const describeWorld = (result) => {
  const managedProcess = getManagedProcess()
  const healthyServices = Object.values(result.services)
    .filter((service) => service.healthy)
    .map((service) => service.name)
  const interpreterServices = managedProcess
    ? []
    : readInterpreterServices({repositoryRoot, services})
  const owner = classifyWorldOwner({
    metaforDevOwned: managedProcess !== undefined,
    interpreterServices,
    healthyServices,
  })

  return {
    ...result,
    owner,
    ...(managedProcess ? {managedProcess} : {}),
  }
}

const tail = (path, lineCount) => {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8").split("\n").filter(Boolean).slice(-lineCount)
}

const status = async () => {
  const result = await getStatus()

  emit(describeWorld(result), result.state === "partial" || result.state === "starting" ? 2 : 0)
}

const start = async () => {
  const before = describeWorld(await getStatus())

  if (before.state === "running") {
    emit({ ...before, action: "already-running" })
    return
  }

  if (before.owner !== "none" || before.state !== "stopped") {
    emit({
      ...before,
      action: "refused",
      reason: before.owner === "interpreter"
        ? "interpreter-contour-active"
        : before.state === "partial"
          ? "partial-contour"
          : "contour-not-ready",
      hint: before.owner === "interpreter"
        ? "Use the existing Interpreter contour; do not replace its processes."
        : "Do not start a second contour. Inspect existing listeners and processes.",
    }, 2)
    return
  }

  mkdirSync(runtimeDirectory, { recursive: true })
  const descriptor = openSync(logPath, "a")
  const child = spawn("bun", ["run", "dev:world"], {
    cwd: repositoryRoot,
    detached: true,
    env: {
      ...process.env,
      METAFOR_LOG_IMPULSES: process.env.METAFOR_LOG_IMPULSES ?? "compact",
      METAFOR_WEAK_BACKEND: process.env.METAFOR_WEAK_BACKEND ?? "gpu",
    },
    stdio: ["ignore", descriptor, descriptor],
  })
  closeSync(descriptor)
  child.unref()

  const state = {
    pid: child.pid,
    root: repositoryRoot,
    startedAt: new Date().toISOString(),
    log: logPath,
  }
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)

  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    await delay(300)
    const current = await getStatus()

    if (current.state === "running") {
      emit({ ...describeWorld(current), action: "started" })
      return
    }

    if (!processExists(child.pid)) break
  }

  emit({
    ...describeWorld(await getStatus()),
    action: "failed",
    reason: "contour-did-not-become-healthy",
    logTail: tail(logPath, 40),
  }, 1)
}

const logs = () => {
  const state = readJson(statePath)
  const requested = Number.parseInt(process.argv[3] ?? "80", 10)
  const lines = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 500) : 80

  if (!state || state.root !== repositoryRoot || !state.log) {
    emit({
      schema: "metafor-dev/world@1",
      ok: false,
      action: "no-owned-log",
      hint: "This skill did not start the current contour.",
    }, 2)
    return
  }

  emit({
    schema: "metafor-dev/world@1",
    ok: true,
    action: "logs",
    pid: state.pid,
    log: state.log,
    lines: tail(state.log, lines),
  })
}

const stop = async () => {
  const state = getManagedProcess()

  if (!state) {
    emit({
      ...describeWorld(await getStatus()),
      ok: false,
      action: "refused",
      reason: "contour-not-owned-by-metafor-dev",
    }, 2)
    return
  }

  try {
    process.kill(-state.pid, "SIGTERM")
  } catch {
    process.kill(state.pid, "SIGTERM")
  }

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await delay(250)
    const current = await getStatus()
    if (!processExists(state.pid) && current.state === "stopped") {
      rmSync(statePath, { force: true })
      emit({ ...current, action: "stopped", owner: "none" })
      return
    }
  }

  emit({
    ...describeWorld(await getStatus()),
    action: "timeout",
    reason: "owned-process-did-not-stop-after-sigterm",
  }, 1)
}

const main = async () => {
  const command = process.argv[2] ?? "status"

  if (command === "status") await status()
  else if (command === "start") await start()
  else if (command === "logs") logs()
  else if (command === "stop") await stop()
  else emit({
    schema: "metafor-dev/world@1",
    ok: false,
    error: `Unknown command: ${command}`,
    commands: ["status", "start", "logs", "stop"],
  }, 2)
}

if (import.meta.main) await main()
