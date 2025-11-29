import { line, quantum, tree } from "./config.js"
import type { LoaderParams } from "./virtual.t.js"
import { Atom } from "@metafor/atom"

function createCanvas() {
  const canvas = document.createElement("canvas")
  canvas.className = "virtual"
  canvas.style.pointerEvents = "none"
  canvas.style.position = "fixed"
  canvas.style.top = "0"
  canvas.style.left = "0"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.zIndex = "1"
  return canvas
}

let pathsRequestPending = false
let pathsDebounceTimer: ReturnType<typeof setTimeout> | null = null
let pathsDebounceDelay = 100 // мс

export async function load({
  src,
  dst = document.body,
  mode = "tree",
  debug = false,
}: LoaderParams): Promise<Function> {
  const canvas = createCanvas()
  dst.append(canvas)

  const worker = new Worker(src, { type: "module" })

  function handleVisibilityChange() {
    const visible = !document.hidden
    debug && console.log(`👁️ Tab visibility changed: ${visible ? "visible" : "hidden"}`)
    worker.postMessage({ type: "visibility-change", visible })
  }

  document.addEventListener("visibilitychange", handleVisibilityChange)

  function handleResize() {
    const width = window.innerWidth
    const height = window.innerHeight
    debug && console.log(`📏 Window resized: ${width}x${height}`)
    worker.postMessage({ type: "resize", width, height })
  }
  window.addEventListener("resize", handleResize)

  const offscreenCanvas = canvas.transferControlToOffscreen()
  worker.postMessage(
    {
      type: "init",
      canvas: offscreenCanvas,
      width: window.innerWidth,
      height: window.innerHeight,
      config: mode === "tree" ? tree : mode === "line" ? line : mode === "quantum" ? quantum : {},
    },
    [offscreenCanvas]
  )

  function requestPathsDebounced() {
    // Устанавливаем флаг, что запрос активен
    pathsRequestPending = true
    // Очищаем предыдущий таймер
    if (pathsDebounceTimer) {
      clearTimeout(pathsDebounceTimer)
    }
    // Устанавливаем новый таймер
    pathsDebounceTimer = setTimeout(() => {
      sendPathsToWorker()
      pathsRequestPending = false
      pathsDebounceTimer = null
    }, pathsDebounceDelay)
  }

  /**
   * Отправка путей частиц в worker
   */
  function sendPathsToWorker() {
    // Получаем пути всех активных частиц из builder
    const activePaths = Atom.getAllAddresses()
    // Если нет активных частиц, не отправляем пустой массив
    if (!activePaths || activePaths.length === 0) {
      debug && console.log("📤 No active particles, skipping paths update")
      return
    }
    debug && console.log("📤 Sending paths to worker:", activePaths)
    // Отправляем обновленные пути в worker
    worker.postMessage({ type: "update-paths", paths: activePaths })
  }

  return new Promise((resolve, reject) => {
    worker.onerror = (error) => {
      console.error("Worker error:", error)
      reject(error)
    }
    worker.onmessage = (event) => {
      if (event.data.type === "worker-ready") {
        debug && console.log("✅ Worker ready, initializing Atom")
        // Отправляем воркеру актуальное состояние сразу, чтобы частицы появились мгновенно
        sendPathsToWorker()
        resolve(function destroy() {
          // Отписываемся от событий
          document.removeEventListener("visibilitychange", handleVisibilityChange)
          window.removeEventListener("resize", handleResize)
          debug && console.log("💥 Terminating virtual worker")
          worker.postMessage({ type: "destroy" })
          worker.terminate()
        })
      } else if (event.data.type === "request-paths") {
        debug && console.log("📥 Worker requested paths")
        requestPathsDebounced()
      }
    }
  })
}
