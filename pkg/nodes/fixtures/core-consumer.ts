import type {NodeSystemDocument} from "nodes/types"
import {validateNodeSystemDocument} from "nodes/validation"

export function validateConsumerDocument(document: NodeSystemDocument): number {
  return validateNodeSystemDocument(document).nodes.size
}
