import { file } from "bun"
import main from "./index.html"

Bun.serve({
  // Используем порт из переменной окружения $PORT, по умолчанию 3000
  port: process.env.PORT || 3000,
  hostname: "0.0.0.0",
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    "/": main,
    "/JetBrainsMono-Bold.ttf": file("./static/JetBrainsMono-Bold.ttf"),
    "/models/engine/2CylinderEngine.gltf": file("./static/models/engine/2CylinderEngine.gltf"),
    "/models/engine/2CylinderEngine0.bin": file("./static/models/engine/2CylinderEngine0.bin"),
    "/models/bots.glb": file("./static/models/bots.glb"),
    "/models/engine.gltf": file("./static/engine.gltf"),
    "/models/engine.bin": file("./static/engine.bin"),
    "/models/engine.glb": file("./static/engine.glb"),
    "/yoga-wasm-base64-esm.js": file("./node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js"),
  },
})

console.log(`Bun server running at http://0.0.0.0:${process.env.PORT || 3000}`)
