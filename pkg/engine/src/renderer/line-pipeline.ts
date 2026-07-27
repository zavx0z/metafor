export const LINE_SCENE_BLEND_STATE: GPUBlendState = {
  color: {
    srcFactor: "src-alpha",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
}

export const LINE_OVERLAY_BLEND_STATE: GPUBlendState = {
  color: {
    srcFactor: "src-alpha",
    dstFactor: "one",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
}

export const LINE_SCENE_DEPTH_STATE: GPUDepthStencilState = {
  depthWriteEnabled: true,
  depthCompare: "less",
  format: "depth24plus-stencil8",
}
