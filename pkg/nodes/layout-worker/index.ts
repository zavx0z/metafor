/** Compatibility fixed-policy entrypoint. New code should import exact client/executor subpaths. */
export {FixedLayoutWorkerClient, FixedLayoutWorkerClient as LayoutWorkerClient} from "./fixed/client.ts"
export {
  runFixedLayoutWorkerRequest,
  runFixedLayoutWorkerRequest as runLayoutWorkerRequest,
} from "./fixed/executor.ts"
