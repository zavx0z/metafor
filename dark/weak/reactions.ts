import type {MetaDSL} from "../.."
import type {Wimp} from "@store/wimp/sqlite"
import type {ReactionsSchema} from "../../reactions.t.ts"

export async function fillReactions(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  const rs = dsl.reactions as ReactionsSchema | undefined
  if (!rs) return

  for (const [id, r] of Object.entries(rs.reactions)) {
    const reaction = await wimp.reactions.add({
      key: id,
      label: r.label,
      desc: r.desc ?? null,
      cond: r.cond,
      src: r.src,
    })
    const reactionUuid = await reaction.uuid()
    for (const fieldKey of r.read ?? []) {
      await reaction.read.add(fieldKey)
    }
    for (const fieldKey of r.write ?? []) {
      await reaction.write.add(fieldKey)
    }
    for (const [state, reactionIds] of Object.entries(rs.superposition)) {
      if (reactionIds.includes(id)) {
        await reaction.states.add(state)
      }
    }
  }
}
