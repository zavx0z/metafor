export {
  buildMetaPackageTemplate,
} from "./src/template.ts"
export {
  materializeMetaCreatePatch,
} from "./src/create.ts"
export {
  discardSourceCandidates,
  prepareSourceCandidates,
  readSourceRevision,
  readSourceSnapshot,
  readPreparedSource,
  publishWorkingSourceCandidates,
  recoverAndPublishSourceCandidates,
  type PreparedSourceCandidate,
} from "./src/source.ts"
export {
  planMetaMatterPatch,
  type MatterParentSnapshot,
} from "./src/matter.ts"
export {
  planMetaDeclarationPatch,
  assertCanonicalFieldSource,
  type DeclarationMetaSnapshot,
} from "./src/declaration.ts"
