import { line, quantum, tree } from "./config.js"
import type { LoaderParams } from "./virtual.t.js"

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

export function load({ src, dst = document.body, mode = "tree", debug = false }: LoaderParams) {
  const canvas = createCanvas()
  dst.append(canvas)

  const worker = new Worker(src, { type: "module" })
  worker.onerror = (error) => {
    console.error("Worker error:", error)
    console.error("Error details:", error.message, error.filename, error.lineno)
  }
  worker.onmessage = (event) => {
    if (event.data.type === "worker-ready") {
      debug && console.log("✅ Worker ready, initializing Atom")
      // this.initializeAtom()
    } else if (event.data.type === "request-paths") {
      debug && console.log("📥 Worker requested paths")
      // this.requestPathsDebounced()
    }
  }

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

  return function () {
    // Отписываемся от событий
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("resize", handleResize)
    debug && console.log("💥 Terminating worker")
    worker.postMessage({ type: "destroy" })
    worker.terminate()
  }
}
