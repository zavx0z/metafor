import { spawn } from "child_process"
import { existsSync, rmSync } from "fs"
import os from "os"
import { join } from "path"

const PACKAGE_NAME = "create-metafor"

export interface UpdateCommand {
  command: string
  args: string[]
  label: string
}

export interface RestartCommand {
  command: string
  args: string[]
}

export function getSelfUpdateCommand(userAgent = process.env.npm_config_user_agent || ""): UpdateCommand {
  const ua = userAgent.toLowerCase()

  if (ua.includes("bun/")) {
    return {
      command: "bun",
      args: ["add", "-g", `${PACKAGE_NAME}@latest`],
      label: "bun add -g create-metafor@latest",
    }
  }

  if (ua.includes("pnpm/")) {
    return {
      command: "pnpm",
      args: ["add", "-g", `${PACKAGE_NAME}@latest`],
      label: "pnpm add -g create-metafor@latest",
    }
  }

  return {
    command: "npm",
    args: ["install", "-g", `${PACKAGE_NAME}@latest`, "--force"],
    label: "npm install -g create-metafor@latest --force",
  }
}

function cleanupNpxCache() {
  const home = os.homedir()
  const candidates = [
    join(home, ".npm", "_npx"),
    join(home, ".cache", "npm", "_npx"),
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
    }
  }
}

export async function runSelfUpdate(): Promise<{ ok: boolean, error?: string, command: UpdateCommand }> {
  const updateCommand = getSelfUpdateCommand()

  return new Promise((resolve) => {
    const child = spawn(updateCommand.command, updateCommand.args, {
      stdio: "inherit",
    })

    child.on("error", (error: Error) => {
      resolve({
        ok: false,
        error: error.message,
        command: updateCommand,
      })
    })

    child.on("close", (code) => {
      if (code === 0) {
        cleanupNpxCache()
        resolve({ ok: true, command: updateCommand })
        return
      }

      resolve({
        ok: false,
        error: `exit code ${code}`,
        command: updateCommand,
      })
    })
  })
}

export function getRestartCommand(argv = process.argv): RestartCommand {
  if (argv.length <= 1) {
    return {
      command: process.execPath,
      args: [],
    }
  }

  return {
    command: process.execPath,
    args: argv.slice(1),
  }
}

export function restartCurrentProcess(argv = process.argv): boolean {
  const restartCommand = getRestartCommand(argv)

  try {
    const child = spawn(restartCommand.command, restartCommand.args, {
      stdio: "inherit",
      detached: true,
      env: {
        ...process.env,
        CREATE_METAFOR_JUST_UPDATED: "true",
      },
    })

    child.unref()
    return true
  } catch {
    return false
  }
}
