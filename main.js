import { createShaderProgram, fullScreenViewport } from "./utils.js"
// await new Promise((res) => import("https://zavx0z.github.io/dev-tools/index.js").then(() => setTimeout(res, 200)))
import "./space.js"

const canvas = document.querySelector("canvas")
const gl = canvas.getContext("webgl2")
fullScreenViewport(gl)
addEventListener("resize", () => fullScreenViewport(gl))

const vertexShaderSource = await fetch("vertexShader.glsl").then((res) => res.text())
const fragmentShaderSource = await fetch("fragmentShader.glsl").then((res) => res.text())

const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource)
gl.useProgram(program)

const positionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0]), gl.STATIC_DRAW)

const positionAttributeLocation = gl.getAttribLocation(program, "position")
gl.enableVertexAttribArray(positionAttributeLocation)
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0)

const iTimeLocation = gl.getUniformLocation(program, "iTime")

let startTime = Date.now()
function draw() {
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  const elapsedTime = (Date.now() - startTime) / 1000.0
  gl.uniform1f(iTimeLocation, elapsedTime)

  gl.drawArrays(gl.POINTS, 0, 1)

  requestAnimationFrame(draw)
}

draw()
