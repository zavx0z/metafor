/** @param {WebGL2RenderingContext} gl */
export const fullScreenViewport = (gl) => {
  const canvas = gl.canvas
  if (canvas instanceof OffscreenCanvas) throw new Error("Получен OffscreenCanvas")
  const displayWidth = canvas.clientWidth
  const displayHeight = canvas.clientHeight
  console.log("displayWidth", displayWidth, "displayHeight", displayHeight, "pixelRatio", window.devicePixelRatio)
  canvas.width = displayWidth
  canvas.height = displayHeight
  gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight)
}
export function createShaderProgram(gl, vertexShaderSource, fragmentShaderSource) {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vertexShader, vertexShaderSource)
  gl.compileShader(vertexShader)
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.error("ERROR compiling vertex shader!", gl.getShaderInfoLog(vertexShader))
    return
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fragmentShader, fragmentShaderSource)
  gl.compileShader(fragmentShader)
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error("ERROR compiling fragment shader!", gl.getShaderInfoLog(fragmentShader))
    return
  }

  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("ERROR linking program!", gl.getProgramInfoLog(program))
    return
  }

  return program
}
