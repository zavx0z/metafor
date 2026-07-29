export type VisualLayoutSlug = "centered-nested" | "outside-in"

export type VisualLayoutStatus = "in-progress" | "ready"

export type VisualLayout = Readonly<{
  description: string
  label: string
  slug: VisualLayoutSlug
  status: VisualLayoutStatus
}>

export const defineVisualLayout = (
  layout: VisualLayout,
): VisualLayout => Object.freeze({...layout})
