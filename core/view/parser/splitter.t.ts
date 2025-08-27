export type TagKind = "open" | "close" | "self" | "void"
export type TagToken = { text: string; index: number; name: string; kind: TagKind }
