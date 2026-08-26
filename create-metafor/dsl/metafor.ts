/**
Строгий builder сериализуемой MetaDSL.

Вызовы builder сохраняют обязательный порядок деклараций. Matter использует
browser-safe parser `@zavx0z/template`, затем проецирует допустимый XML-like
синтаксис в `MatterSchema`. State-условия создают Axion, dynamic enum `src`
создаёт Fuzzy, а `map()` по array Field создаёт Macho.

@example
```typescript
export default MetaFor("user-profile")
  .fields((field) => ({
    mode: field.enum("summary", "details").required("summary"),
    userId: field.number.required(0),
  }))
  .superposition({idle: null})
  .mass(() => ({}))
  .energy()
  .processes()
  .reactions()
  .matter(({value, html}) => html`
    <meta-for
      src="demo/user-${value.mode}"
      fields=${{userId: value.userId}} />
  `)
  .bulk()
```

@packageDocumentation
*/
import { fieldSchema } from "./fields.ts"
import type { Fields, Field } from "@metafor/types/metafor/fields"
import { parseMatter } from "./matter.ts"

import { validateNoUnconditionalCycles } from "./superposition.ts"
import type { SuperpositionInput, SuperpositionInputCheck, SuperpositionStateKeys } from "@metafor/types/metafor/superposition"
import { reactionsSchema } from "./reactions.ts"
import type { ReactionsDeclaration } from "@metafor/types/metafor/reactions"
import { processesSchema } from "./process.ts"
import type { ProcessesDeclaration } from "@metafor/types/metafor/process"
import { serializeStyle } from "./style.ts"
import type { MatterDeclaration } from "@metafor/types/metafor/matter"

import type {
  MetaForConfig,
  BulkDeclaration,
  MetaDSL,
  BulkSchema,
  Energy,
  EnergyInputCheck,
  MetaForFn,
} from "@metafor/types/metafor/schema"
import {massFactory, normalizeMassDeclarations} from "./mass.ts"

const createMetaForRuntime = function (name: string, config?: MetaForConfig) {
  const desc = config?.desc
  const dev = config?.dev ?? globalThis.DEV ?? false
  return {
    fields<ɸ extends Fields>(schema: (field: Field) => ɸ) {
      const fields = fieldSchema(schema)
      return {
        superposition<const ψ extends Record<string, unknown>>(
          superposition: ψ,
          ..._check: SuperpositionInputCheck<ɸ, ψ>
        ) {
          type 𝛴 = SuperpositionStateKeys<ψ>
          const normalizedSuperposition = superposition as SuperpositionInput<ɸ, ψ>
          validateNoUnconditionalCycles(normalizedSuperposition)
          return {
            mass<Schema extends Record<string, import("@metafor/types/metafor/mass").MassDeclaration>>(
              declaration: (mass: import("@metafor/types/metafor/mass").MassFactory) => Schema,
            ) {
              const mass = declaration(massFactory)
              return {
                energy<e extends Energy = {}>(..._check: EnergyInputCheck<e>) {
                  void _check
                  const dslFields = Object.entries(fields).map(([key, definition]) => ({key, ...definition}))
                  const dslSuperposition = Object.entries(normalizedSuperposition).map(([name, transitions]) => ({name, transitions}))
                  const schema: MetaDSL<ɸ, 𝛴, import("@metafor/types/metafor/mass").MassHandles<Schema>, e> = {
                    name,
                    superposition: dslSuperposition,
                    fields: dslFields,
                    mass: normalizeMassDeclarations(mass),
                  }
                  if (desc) schema.desc = desc
                  return {
                    processes(process: ProcessesDeclaration<ɸ, 𝛴, import("@metafor/types/metafor/mass").MassHandles<Schema>, ψ, e> = () => []) {
                      const processes = processesSchema(process, Object.keys(fields))
                      if (processes) {
                        schema.processes = Object.entries(processes).map(([key, declaration]) => ({key, declaration}))
                      }
                      return {
                        reactions(reaction: ReactionsDeclaration<ɸ, 𝛴, import("@metafor/types/metafor/mass").MassHandles<Schema>> = () => []) {
                          const reactions = reactionsSchema(reaction)
                          if (reactions) {
                            schema.reactions = Object.entries(reactions.reactions).map(([key, config]) => ({
                              key,
                              label: config.label,
                              desc: config.desc ?? null,
                              sources: config.sources,
                              src: config.src,
                              read: config.read,
                              write: config.write,
                              massRead: config.massRead,
                              massWrite: config.massWrite,
                              states: Object.entries(reactions.superposition)
                                .filter(([, reactionIds]) => reactionIds.includes(key))
                                .map(([state]) => state),
                            }))
                          }
                          return {
                            matter(matter?: MatterDeclaration<ɸ, import("@metafor/types/metafor/mass").MassHandles<Schema>, 𝛴, e>) {
                              if (matter) schema.matter = parseMatter(matter, fields, name)
                              return {
                                bulk(bulk?: BulkDeclaration): MetaDSL<ɸ, 𝛴, import("@metafor/types/metafor/mass").MassHandles<Schema>, e> {
                                  if (bulk && "view" in bulk) {
                                    schema.bulk = { view: serializeStyle(bulk.view as any) } as BulkSchema
                                  }
                                  return schema
                                },
                              }
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

// The public MetaForFn declaration remains the single strict DSL contract.
// Keeping the runtime builder non-contextual prevents TypeScript from recursively
// expanding that contract while it infers every intermediate implementation object.
globalThis.MetaFor = createMetaForRuntime as MetaForFn
export const MetaFor = globalThis.MetaFor
