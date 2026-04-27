export type FieldUuidByKey = Map<string, string>
export type StateUuidByName = Map<string, string>

export type ReactionRow = {
  uuid: string
  key: string
  label: string
  desc: string | null
  cond_source: string
  update_source: string
}
