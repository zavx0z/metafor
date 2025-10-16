import type { Key } from "./field.t"

export type Primitive = string | number | boolean

export type AddOp = { op: "add"; path: string; value: Primitive }
export type RemoveOp = { op: "remove"; path: string }
export type MoveOp = { op: "move"; from: string; path: string }
export type Patch = AddOp | RemoveOp | MoveOp

// Тип для работы с ключами массивов
export type ArrayKey = Key | number | string
