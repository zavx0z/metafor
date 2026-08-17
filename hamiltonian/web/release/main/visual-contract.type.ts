/** Compile-only contract: named Visual exports доступны release composition без build. */
export type VisualRuntime = (typeof import("@internal/visual"))["runtime"]
