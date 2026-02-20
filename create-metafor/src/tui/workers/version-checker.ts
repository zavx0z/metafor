import { parentPort } from "worker_threads"

async function checkLatestVersion() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    const response = await fetch("https://registry.npmjs.org/create-metafor/latest", {
      headers: {
        "cache-control": "no-cache",
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`npm registry responded with ${response.status}`)
    }

    const data: any = await response.json()
    parentPort?.postMessage({ type: "latest", version: data.version })
  } catch (error: any) {
    parentPort?.postMessage({ type: "error", error: error.message })
  } finally {
    clearTimeout(timeout)
  }
}

checkLatestVersion()
