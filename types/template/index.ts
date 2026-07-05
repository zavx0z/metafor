import type { Fields } from "../metafor/fields.ts"
import type { MatterDefinitionParams } from "../metafor/matter.ts"
import type { Mass } from "../metafor/metafor.ts"
import type { NodeType } from "./node/index.ts"

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Функция шаблонизатора, которая принимает параметры { html, fields, mass, state, update }
 * @returns Массив узлов с полной структурой и метаданными о путях к данным
 */
export declare function parse<ɸ extends Fields = Fields, m extends Mass = Mass, 𝛴 extends string = string>(
  template: (params: MatterDefinitionParams<ɸ, m, 𝛴>) => void,
): NodeType[]
