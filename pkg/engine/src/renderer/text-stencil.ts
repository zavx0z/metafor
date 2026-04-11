export const TEXT_STENCIL_FACE_STATE = {
  compare: "always",
  failOp: "keep",
  depthFailOp: "keep",
  passOp: "increment-wrap",
} as const satisfies GPUStencilFaceState

export const TEXT_STENCIL_BACK_FACE_STATE = {
  compare: "always",
  failOp: "keep",
  depthFailOp: "keep",
  passOp: "decrement-wrap",
} as const satisfies GPUStencilFaceState

export const TEXT_COVER_FACE_STATE = {
  compare: "not-equal",
  failOp: "keep",
  depthFailOp: "keep",
  passOp: "zero",
} as const satisfies GPUStencilFaceState
