import type {ActionParams} from "@metafor/types/metafor/action"
import type {InferMetaEnergy, InferMetaFields, InferMetaMass, InferMetaValues} from "@metafor/types/metafor/schema"
import type {inferredMeta} from "../meta-inference.typing.spec"

/** Test-only standalone process contract derives all context from the owning declaration. */
export declare namespace InferenceProcess {
  type Input = ActionParams<InferMetaFields<typeof inferredMeta>, InferMetaMass<typeof inferredMeta>, InferMetaValues<typeof inferredMeta>, InferMetaEnergy<typeof inferredMeta>> & {proof?: string}
}

/** Separate process implementation; no duplicated Fields/Mass/Energy interface. */
export default async function runInferenceProcess(input: InferenceProcess.Input): Promise<string> {
  return input.value.title
}
