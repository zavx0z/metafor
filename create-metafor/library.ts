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
  recoverAndPublishSourceCandidates,
  type PreparedSourceCandidate,
} from "./src/source.ts"
export {
  planMetaMatterPatch,
  type MatterParentSnapshot,
} from "./src/matter.ts"
export {
  planMetaDeclarationPatch,
  type DeclarationMetaSnapshot,
} from "./src/declaration.ts"
