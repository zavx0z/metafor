import {resolve} from "node:path"
import type {MetaAddress} from "@metafor/types/metafor/graph"

export const MF117_SOURCE = "zavx0z/inference" as MetaAddress
export const MF117_TARGET = "zavx0z/lada" as MetaAddress
export const MF117_OPERATION = "inference-to-lada" as const
export const MF117_RETENTION = "retain-until-explicit-gc" as const

export const MF117_REPOSITORY_ROOT = resolve(import.meta.dir, "..")
export const MF117_STATE_DIRECTORY = resolve(
  Bun.env.MF117_STATE_DIRECTORY?.trim() ||
    resolve(MF117_REPOSITORY_ROOT, ".metafor", "mf117"),
)
export const MF117_CANDIDATE_DIRECTORY = resolve(
  MF117_REPOSITORY_ROOT,
  ".metafor",
  "candidates",
  "mf115-detached-20260727T115625Z",
)

export const MF117_COMMAND_SCHEMA = "metafor/mf117-command/v1" as const
export const MF117_PREFLIGHT_SCHEMA = "metafor/mf117-preflight/v1" as const
export const MF117_BOUNDARY_PREFLIGHT_METHOD =
  "boundary.internal.mf117.preflight" as const
export const MF117_BOUNDARY_ADMIT_METHOD =
  "boundary.internal.mf117.admit" as const
export const MF117_BOUNDARY_QUIESCENT_METHOD =
  "boundary.internal.mf117.quiescent" as const
export const MF117_BOUNDARY_COMMIT_METHOD =
  "boundary.internal.mf117.commit" as const
export const MF117_BOUNDARY_COMPLETE_METHOD =
  "boundary.internal.mf117.complete" as const
export const MF117_BOUNDARY_RECEIPT_METHOD =
  "boundary.internal.mf117.receipt" as const
export const MF117_BOUNDARY_VERIFY_METHOD =
  "boundary.internal.mf117.verify" as const
export const MF117_ENERGY_EVIDENCE_METHOD =
  "energy.internal.mf117.massEvidence" as const
export const MF117_ENERGY_PREFLIGHT_METHOD =
  "energy.internal.mf117.preflight" as const
export const MF117_ENERGY_FENCE_METHOD =
  "energy.internal.mf117.fence" as const
export const MF117_ENERGY_RETARGET_METHOD =
  "energy.internal.mf117.retarget" as const
export const MF117_ENERGY_VERIFY_METHOD =
  "energy.internal.mf117.verify" as const
export const MF117_BULK_PREFLIGHT_METHOD =
  "bulk.internal.mf117.preflight" as const
export const MF117_BULK_PROMOTE_METHOD =
  "bulk.internal.mf117.promote" as const
export const MF117_BULK_VERIFY_METHOD =
  "bulk.internal.mf117.verify" as const
