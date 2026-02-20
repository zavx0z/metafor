import { parentPort } from "worker_threads"

async function checkLatestVersion() {
  try {
    const response = await fetch("https://registry.npmjs.org/create-metafor/latest")
    const data: any = await response.json()
    parentPort?.postMessage({ type: "latest", version: data.version })
  } catch (error: any) {
    parentPort?.postMessage({ type: "error", error: error.message })
  }
}

checkLatestVersion()
