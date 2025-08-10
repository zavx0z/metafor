import type { Schema, ElementSchema, TextSchema } from "./index.t";
import { parseAttributesForArray } from "./attributes";
import { parseConditionalBlocksForArray } from "./conditionals";
import { processInterpolationsInTemplate } from "./utils";

// Умный парсинг блоков массивов
export function parseArrayBlocks(htmlString: string): string {
  let result = htmlString;
  let i = 0;
  
  while (i < result.length) {
    // Ищем начало блока массива
    const arrayStart = result.indexOf('${', i);
    if (arrayStart === -1) break;
    
    // Извлекаем содержимое выражения
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let j = arrayStart;
    
    while (j < result.length) {
      const char = result[j];
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            break;
          }
        } else if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        }
      } else {
        if (char === stringChar) {
          inString = false;
          stringChar = '';
        } else if (char === '\\') {
          j++; // Пропускаем экранированный символ
        }
      }
      
      j++;
    }
    
    if (braceCount !== 0) {
      i = arrayStart + 2;
      continue;
    }
    
    const arrayExpr = result.substring(arrayStart + 2, j);
    
    // Проверяем, является ли это выражением map
    const mapMatch = arrayExpr.match(/^([^.]+)\.map\s*\(\s*([^)]+)\s*=>\s*(.+)$/);
    if (!mapMatch) {
      i = j + 1;
      continue;
    }
    
    const [, arrayName, itemName, templatePart] = mapMatch;
    
    // Ищем закрывающую скобку для map
    let templateEnd = -1;
    let templateBraceCount = 0;
    let templateInString = false;
    let templateStringChar = '';
    let k = j;
    
    while (k < result.length) {
      const char = result[k];
      
      if (!templateInString) {
        if (char === '(') {
          templateBraceCount++;
        } else if (char === ')') {
          templateBraceCount--;
          if (templateBraceCount === 0) {
            templateEnd = k;
            break;
          }
        } else if (char === '"' || char === "'" || char === '`') {
          templateInString = true;
          templateStringChar = char;
        }
      } else {
        if (char === templateStringChar) {
          templateInString = false;
          templateStringChar = '';
        } else if (char === '\\') {
          k++; // Пропускаем экранированный символ
        }
      }
      
      k++;
    }
    
    if (templateEnd === -1) {
      i = j + 1;
      continue;
    }
    
    const fullTemplate = result.substring(j + 1, templateEnd);
    
    // Извлекаем template literal из скобок
    let templateContent = "";
    if (fullTemplate.trim().startsWith('html`')) {
      const htmlStart = fullTemplate.indexOf('html`');
      const htmlEnd = findClosingBrace(fullTemplate, htmlStart + 5);
      if (htmlEnd !== -1) {
        templateContent = fullTemplate.substring(htmlStart, htmlEnd + 1);
      }
    } else {
      templateContent = fullTemplate.trim();
    }
    
    // Создаем placeholder
    const placeholder = `CONTEXT_ARRAY_${arrayName}_${itemName}`;
    
    // Заменяем блок массива на placeholder
    result = result.substring(0, arrayStart) + placeholder + result.substring(templateEnd + 1);
    
    i = arrayStart + placeholder.length;
  }
  
  return result;
}

// Поиск закрывающей скобки для html``
function findClosingBrace(template: string, startIndex: number): number {
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let i = startIndex;
  
  while (i < template.length) {
    const char = template[i];
    
    if (!inString) {
      if (char === '`') {
        if (braceCount === 0) {
          return i;
        }
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
      } else if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      }
    } else {
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (char === '\\') {
        i++; // Пропускаем экранированный символ
      }
    }
    
    i++;
  }
  
  return -1;
}

// Парсинг дочерних элементов для элементов массива
export function parseChildrenForArrayItem(
  childrenStr: string,
  interpolationMap?: Map<string, string>,
  itemConditionalAttributeMap?: Map<string, { condition: string; trueValue: string; falseValue?: string }>
): (ElementSchema | TextSchema)[] {
  const children: (ElementSchema | TextSchema)[] = [];
  
  if (!childrenStr.trim()) {
    return children;
  }

  // Обрабатываем условные блоки
  const conditionalInfo: Array<{ condition: string; trueTemplate: string; falseTemplate: string }> = [];
  let processedChildren = parseConditionalBlocksForArray(childrenStr, conditionalInfo);
  
  // Обрабатываем интерполяции в template literals
  if (interpolationMap) {
    processedChildren = processInterpolationsInTemplate(processedChildren, interpolationMap);
  }

  // Разбиваем на отдельные элементы
  const elementRegex = /<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>([^<]*(?:<[^>]*>[^<]*)*)<\/\1>/g;
  let match;
  let lastIndex = 0;

  while ((match = elementRegex.exec(processedChildren)) !== null) {
    const [fullMatch, tagName, attributesStr, content] = match;
    const startIndex = match.index;

    // Добавляем текст перед элементом
    if (startIndex > lastIndex) {
      const textBefore = processedChildren.substring(lastIndex, startIndex).trim();
      if (textBefore) {
        children.push(parseTextWithPlaceholdersForArray(textBefore, interpolationMap, conditionalInfo));
      }
    }

    // Парсим атрибуты
    const attributes = parseAttributesForArray(attributesStr, interpolationMap, itemConditionalAttributeMap);

    // Парсим содержимое элемента
    const childElements = parseChildrenForArrayItem(content, interpolationMap, itemConditionalAttributeMap);

    // Создаем элемент
    const element: ElementSchema = {
      type: "el",
      tag: tagName,
      child: childElements
    };

    // Добавляем атрибуты только если они есть
    if (Object.keys(attributes).length > 0) {
      element.attrs = attributes;
    }

    children.push(element);
    lastIndex = startIndex + fullMatch.length;
  }

  // Добавляем оставшийся текст
  if (lastIndex < processedChildren.length) {
    const remainingText = processedChildren.substring(lastIndex).trim();
    if (remainingText) {
      // Проверяем, является ли оставшийся текст условным атрибутом в массиве
      const conditionalAttrMatch = remainingText.match(/<([a-zA-Z][a-zA-Z0-9]*)\s+(CONDITIONAL_ATTR_ITEM_\d+)>/)
      if (conditionalAttrMatch && itemConditionalAttributeMap) {
        const [, tagName, placeholder] = conditionalAttrMatch
        const info = itemConditionalAttributeMap.get(placeholder)
        if (info) {
          // Создаем элемент с условным атрибутом
          const conditionalAttr: any = {
            type: "conditional",
            src: info.condition.split(".")[0] || info.condition,
            key: info.condition.split(".").pop() || info.condition,
            trueValue: info.trueValue,
          }

          // Добавляем falseValue только если оно есть
          if (info.falseValue !== undefined) {
            conditionalAttr.falseValue = info.falseValue
          }

          const element: ElementSchema = {
            type: "el",
            tag: tagName,
            attrs: {
              [info.trueValue]: conditionalAttr,
            },
          }
          children.push(element)
          return children
        }
      }
      children.push(parseTextWithPlaceholdersForArray(remainingText, interpolationMap, conditionalInfo));
    }
  }

  return children;
}

// Парсинг текста с плейсхолдерами для элементов массива
export function parseTextWithPlaceholdersForArray(
  text: string,
  interpolationMap?: Map<string, string>,
  conditionalInfo?: Array<{ condition: string; trueTemplate: string; falseTemplate: string }>
): TextSchema {
  if (!text) {
    return { type: "text", value: "" };
  }

  // Проверяем, является ли текст условным блоком
  if (conditionalInfo) {
    for (let i = 0; i < conditionalInfo.length; i++) {
      const placeholder = `CONDITIONAL_${i}`;
      if (text.trim() === placeholder) {
        const conditional = conditionalInfo[i];
        return {
          type: "text",
          value: "",
          cond: {
            src: conditional.condition,
            key: conditional.condition,
            eq: true
          },
          trueContent: conditional.trueTemplate,
          falseContent: conditional.falseTemplate
        };
      }
    }
  }

  // Проверяем, является ли текст интерполяцией
  if (interpolationMap) {
    for (const [placeholder, interpolation] of interpolationMap) {
      if (text.trim() === placeholder) {
        return {
          type: "text",
          value: {
            src: interpolation,
            key: interpolation
          }
        };
      }
    }
  }

  // Обычный текст
  return { type: "text", value: text };
}