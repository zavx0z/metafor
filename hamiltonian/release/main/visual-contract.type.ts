/** Compile-only contract: named Visual exports доступны env `main` без build. */
export type VisualRuntime = (typeof import("@internal/visual"))["runtime"]
