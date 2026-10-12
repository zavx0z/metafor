/**
Version-local artifact file addresses shared by preparation and storage.
They describe one package graph, without choosing a root or active version.
@packageDocumentation
*/
import {generatedPackageArtifactPrefix, isGeneratedPackageArtifactKey, isPackageArtifactKey, type PackageArtifactKey} from "./artifact"
import {isPackageEnvironment, type PackageEnvironment} from "./environment"

/**
Version-relative file address shared by build materialization and installed
storage. It selects no storage root or version. Public suffix comes from the
verified graph, never from a source lookup during installed execution. Source-map
companions use their sourceMapFor artifact address with an appended .map.
*/
export function packageVersionArtifactPath(env: PackageEnvironment, artifact: PackageArtifactKey, publicExtension?: string): string {
  if (!isPackageEnvironment(env) || !isPackageArtifactKey(artifact)) throw new Error("Invalid package artifact file address")
  if (artifact === ".") return `${env}.js`
  if (isGeneratedPackageArtifactKey(artifact)) {
    const suffix = artifact.slice(generatedPackageArtifactPrefix.length)
    if (!/^(?:entry|chunk|asset)\//.test(suffix)) throw new Error(`Generated package artifact is outside derived output roots: ${artifact}`)
    return `.cosmos/${env}/${suffix}`
  }
  if (typeof publicExtension !== "string" || !/^\.[A-Za-z0-9._+-]+$/.test(publicExtension)) throw new Error(`Invalid public artifact extension: ${artifact}`)
  return `.public/${env}/${artifact.slice(2)}/.cosmos-artifact${publicExtension}`
}
