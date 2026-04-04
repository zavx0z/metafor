import type { Fields } from "../../fields.t.ts"
import type { MatterDefinitionParams } from "../../matter.t.ts"
import type { Mass } from "../../metafor.t.ts"
import type { State } from "../../superposition.t.ts"
import type { NodeType } from "./node/index.t"
export type { NodeType }
export type { NodeMeta } from "./node/meta.t"
export type { NodeCondition } from "./node/condition.t"
export type { NodeLogical } from "./node/logical.t"
export type { NodeMap } from "./node/map.t"
export type { NodeText } from "./node/text.t"
export type { NodeElement } from "./node/element.t"

export type { ValueArray } from "./attribute/array.t"
export type { ValueBoolean } from "./attribute/boolean.t"
export type { ValueString } from "./attribute/string.t"
export type { ValueEvent } from "./attribute/event.t"
export type { ValueStyle } from "./attribute/style.t"
export type { ValueStatic, ValueVariable, ValueDynamic } from "./parser.t"

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Функция шаблонизатора, которая принимает параметры { html, fields, mass, state, update }
 * @returns Массив узлов с полной структурой и метаданными о путях к данным
 */
export declare function parse<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends State = State>(
  template: (params: MatterDefinitionParams<ɸ, m, 𝛴>) => void,
): NodeType[]
