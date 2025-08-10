/**
 * HTML Template Parser - модуль для парсинга HTML шаблонов в JSON схемы
 * @module TemplateParser
 */

import type { Schema } from "./index.t";
import { parseHtmlToSchema as parseHtmlToSchemaUtil } from "./utils";

// Основная функция парсинга HTML в схему
export function parseHtmlToSchema(htmlString: string): Schema {
  return parseHtmlToSchemaUtil(htmlString);
}

// Алиас для обратной совместимости
export function parseTemplate(htmlString: string): Schema {
  return parseHtmlToSchemaUtil(htmlString);
}

// Экспортируем все функции из модулей для обратной совместимости
export * from "./attributes";
export * from "./conditionals";
export * from "./arrays";
export * from "./utils";

// Экспортируем типы
export * from "./index.t";