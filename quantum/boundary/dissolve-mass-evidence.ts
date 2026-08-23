import {constants} from "node:fs"
import {lstat, open} from "node:fs/promises"
import {createHash} from "node:crypto"
import {dirname, join, resolve} from "node:path"
import {massFileName, type MassFileFormat} from "shared/mass.ts"
import {
  BOUNDARY_DISSOLVE_ABSENT_MARKER,
  type BoundaryDissolveMassEvidenceReader,
} from "./dissolve.ts"

export type BoundaryDissolveValidAbsence = Readonly<{
  keyId: string
  format: MassFileFormat
}>

export type BoundaryDissolveMassEvidenceErrorCode =
  | "invalid_mass_identity"
  | "missing_mass"
  | "corrupt_mass"

export class BoundaryDissolveMassEvidenceError extends Error {
  override readonly name = "BoundaryDissolveMassEvidenceError"

  constructor(
    readonly code: BoundaryDissolveMassEvidenceErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const identity = (
  keyId: string,
  format: MassFileFormat,
): string => `${format}:${keyId}`

const checkedFileName = (
  keyId: string,
  format: MassFileFormat,
): string => {
  try {
    if (format !== "json" && format !== "binary") throw new Error()
    return massFileName(keyId, format)
  } catch {
    throw new BoundaryDissolveMassEvidenceError(
      "invalid_mass_identity",
      "Dissolve Mass evidence requires an existing global key identity",
    )
  }
}

/**
 * Read-only evidence adapter for isolated preflight fixtures.
 * It never creates a catalog directory, Mass file or placeholder payload.
 */
export const createIsolatedBoundaryDissolveMassEvidenceReader = (
  root: string,
  validAbsent: readonly BoundaryDissolveValidAbsence[],
): BoundaryDissolveMassEvidenceReader => {
  const catalogRoot = resolve(root)
  const allowed = new Set(validAbsent.map(({keyId, format}) => {
    checkedFileName(keyId, format)
    return identity(keyId, format)
  }))

  return async ({keyId, format}) => {
    const fileName = checkedFileName(keyId, format)
    const target = join(catalogRoot, fileName)
    let rootStat
    try {
      rootStat = await lstat(catalogRoot)
    } catch {
      throw new BoundaryDissolveMassEvidenceError(
        "corrupt_mass",
        "Dissolve Mass catalog root is unavailable",
      )
    }
    if (
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory() ||
      dirname(target) !== catalogRoot
    ) {
      throw new BoundaryDissolveMassEvidenceError(
        "corrupt_mass",
        "Dissolve Mass catalog root is invalid",
      )
    }

    let handle
    try {
      handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (allowed.has(identity(keyId, format))) {
          return Object.freeze({
            kind: "absent",
            marker: BOUNDARY_DISSOLVE_ABSENT_MARKER,
          })
        }
        throw new BoundaryDissolveMassEvidenceError(
          "missing_mass",
          `Mass ${keyId}.${format} is absent without an explicit marker allowance`,
        )
      }
      throw new BoundaryDissolveMassEvidenceError(
        "corrupt_mass",
        `Mass ${keyId}.${format} cannot be opened as a regular file`,
      )
    }

    try {
      const stat = await handle.stat()
      if (!stat.isFile()) {
        throw new BoundaryDissolveMassEvidenceError(
          "corrupt_mass",
          `Mass ${keyId}.${format} is not a regular file`,
        )
      }
      const bytes = await handle.readFile()
      return Object.freeze({
        kind: "present",
        digestSha256: createHash("sha256").update(bytes).digest("hex"),
      })
    } catch (error) {
      if (error instanceof BoundaryDissolveMassEvidenceError) throw error
      throw new BoundaryDissolveMassEvidenceError(
        "corrupt_mass",
        `Mass ${keyId}.${format} cannot be read`,
      )
    } finally {
      await handle.close()
    }
  }
}
