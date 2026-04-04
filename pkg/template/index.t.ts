import type { Fields } from "../../fields.t.ts"
import type { MatterDefinitionParams } from "../../matter.t.ts"
import type { Mass } from "../../metafor.t.ts"
import type { State } from "../../superposition.t.ts"
import type { NodeType } from "./node/index.t.ts"
export type { NodeType }
export type { NodeMeta } from "./node/meta.t.ts"
export type { NodeCondition } from "./node/condition.t.ts"
export type { NodeLogical } from "./node/logical.t.ts"
export type { NodeMap } from "./node/map.t.ts"
export type { NodeText } from "./node/text.t.ts"
export type { NodeElement } from "./node/element.t.ts"

export type { ValueArray } from "./attribute/array.t.ts"
export type { ValueBoolean } from "./attribute/boolean.t.ts"
export type { ValueString } from "./attribute/string.t.ts"
export type { ValueEvent } from "./attribute/event.t.ts"
export type { ValueStyle } from "./attribute/style.t.ts"
export type { ValueStatic, ValueVariable, ValueDynamic } from "./parser.t.ts"

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Функция шаблонизатора, которая принимает параметры { html, fields, mass, state, update }
 * @returns Массив узлов с полной структурой и метаданными о путях к данным
 */
export declare function parse<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends State = State>(
  template: (params: MatterDefinitionParams<ɸ, m, 𝛴>) => void,
): NodeType[]
