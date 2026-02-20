import { useState, useEffect } from "react"
import { Worker } from "worker_threads"
import { existsSync } from "fs"
import { fileURLToPath } from "url"

function toParts(version: string) {
  return version.replace(/^v/, "").split(".").map((part) => Number(part) || 0)
}

function isNewerVersion(latest: string, current: string) {
  const a = toParts(latest)
  const b = toParts(current)
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i++) {
    const left = a[i] || 0
    const right = b[i] || 0
    if (left > right) return true
    if (left < right) return false
  }

  return false
}

function resolveWorkerPath() {
  const jsWorker = new URL("../workers/version-checker.js", import.meta.url)
  if (existsSync(fileURLToPath(jsWorker))) {
    return fileURLToPath(jsWorker)
  }

  return fileURLToPath(new URL("../workers/version-checker.ts", import.meta.url))
}

export function useVersionCheck(currentVersion: string, skipCheck = false) {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!skipCheck)
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    if (skipCheck) {
      setIsLoading(false)
      return
    }

    const worker = new Worker(resolveWorkerPath())

    worker.on("message", (msg: any) => {
      if (msg.type === "latest") {
        setLatestVersion(msg.version)
        setIsLoading(false)
        setHasUpdate(isNewerVersion(msg.version, currentVersion))
      } else if (msg.type === "error") {
        setIsLoading(false)
      }
    })

    worker.on("error", () => {
      setIsLoading(false)
    })

    return () => {
      worker.terminate()
    }
  }, [currentVersion, skipCheck])

  return { latestVersion, isLoading, hasUpdate }
}
