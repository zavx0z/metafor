import type {LayoutWorkerSuccess} from "./worker.ts"

/** Pending request state owned by LayoutWorkerClient. */
export type PendingLayout = Readonly<{
  generation: number
  resolve(value: LayoutWorkerSuccess): void
  reject(error: Error): void
}>
