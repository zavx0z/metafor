import { initWebGPU, frame, resizeCanvas } from "./webgpu"

async function main() {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement | null
  if (!canvas) {
    console.error("[space] #gpu-canvas not found")
    return
  }

  resizeCanvas(canvas)
  window.addEventListener("resize", () => resizeCanvas(canvas))

  let ctx
  try {
    ctx = await initWebGPU(canvas)
  } catch (err) {
    console.error("[space] WebGPU init failed:", err)
    return
  }

  const start = performance.now()
  function loop() {
    const t = (performance.now() - start) / 1000
    frame(ctx!, t)
    requestAnimationFrame(loop)
  }

  console.log("[space] render loop started")
  requestAnimationFrame(loop)
}

main()
