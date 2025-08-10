import type { ConditionalInfo } from "./index.t";

// Извлечение содержимого из template literals
export function extractTemplateContent(template: string, startIndex: number): { content: string; endIndex: number } | null {
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let i = startIndex;
  
  while (i < template.length) {
    const char = template[i];
    
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return {
            content: template.substring(startIndex, i + 1),
            endIndex: i + 1
          };
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
        i++; // Пропускаем экранированный символ
      }
    }
    
    i++;
  }
  
  return null;
}

// Поиск закрывающей скобки для html``
export function findClosingBrace(template: string, startIndex: number): number {
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

// Умный парсинг условных блоков для обработки вложенных template literals
export function parseConditionalBlocksSmart(
  htmlString: string,
  conditionalInfo: ConditionalInfo[]
): string {
  let result = htmlString;
  let counter = 0;
  let i = 0;
  
  while (i < result.length) {
    // Ищем начало условного блока
    const conditionalStart = result.indexOf('${', i);
    if (conditionalStart === -1) break;
    
    // Извлекаем содержимое условного выражения
    const conditionalContent = extractTemplateContent(result, conditionalStart);
    if (!conditionalContent) {
      i = conditionalStart + 2;
      continue;
    }
    
    const conditionalExpr = conditionalContent.content.slice(2, -1); // Убираем ${ и }
    
    // Проверяем, является ли это тернарным оператором
    const ternaryMatch = conditionalExpr.match(/^([^?]+)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    if (!ternaryMatch) {
      i = conditionalContent.endIndex;
      continue;
    }
    
    const [, condition, truePart, falsePart] = ternaryMatch;
    
    // Извлекаем true template
    let trueTemplate = "";
    let trueStart = conditionalContent.endIndex;
    
    if (truePart.trim().startsWith('html`')) {
      const htmlStart = truePart.indexOf('html`');
      const htmlContent = findClosingBrace(truePart, htmlStart + 5);
      if (htmlContent !== -1) {
        trueTemplate = truePart.substring(htmlStart, htmlContent + 1);
      }
    } else {
      trueTemplate = truePart.trim();
    }
    
    // Извлекаем false template
    let falseTemplate = "";
    
    if (falsePart.trim().startsWith('html`')) {
      const htmlStart = falsePart.indexOf('html`');
      const htmlContent = findClosingBrace(falsePart, htmlStart + 5);
      if (htmlContent !== -1) {
        falseTemplate = falsePart.substring(htmlStart, htmlContent + 1);
      }
    } else {
      falseTemplate = falsePart.trim();
    }
    
    // Создаем placeholder и сохраняем информацию
    const placeholder = `CONDITIONAL_${counter}`;
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: trueTemplate || "",
      falseTemplate: falseTemplate || ""
    });
    
    // Заменяем условный блок на placeholder
    result = result.substring(0, conditionalStart) + placeholder + result.substring(conditionalContent.endIndex);
    
    counter++;
    i = conditionalStart + placeholder.length;
  }
  
  return result;
}

// Парсинг условных блоков
export function parseConditionalBlocks(
  htmlString: string,
  conditionalInfo: ConditionalInfo[]
): string {
  let result = htmlString;
  let counter = 0;

  // Сначала обрабатываем тернарные операторы с помощью умного парсера
  result = parseConditionalBlocksSmart(result, conditionalInfo);
  counter = conditionalInfo.length;

  // Обрабатываем логические AND операторы
  const andPattern = /\$\{([^}]+)\s*&&\s*([^}]+)\}/g;
  let match;
  
  while ((match = andPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, trueTemplate] = match;
    const placeholder = `CONDITIONAL_${counter}`;
    
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: trueTemplate.trim(),
      falseTemplate: ""
    });
    
    result = result.replace(fullMatch, placeholder);
    counter++;
  }

  // Обрабатываем логические OR операторы
  const orPattern = /\$\{([^}]+)\s*\|\|\s*([^}]+)\}/g;
  
  while ((match = orPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, falseTemplate] = match;
    const placeholder = `CONDITIONAL_${counter}`;
    
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: condition.trim(),
      falseTemplate: falseTemplate.trim()
    });
    
    result = result.replace(fullMatch, placeholder);
    counter++;
  }

  return result;
}

// Парсинг условных блоков для массивов
export function parseConditionalBlocksForArray(
  htmlString: string,
  conditionalInfo: ConditionalInfo[]
): string {
  let result = htmlString;
  let counter = 0;

  // Обрабатываем тернарные операторы
  const ternaryPattern = /\$\{([^}]+)\s*\?\s*([^:]+)\s*:\s*([^}]+)\}/g;
  let match;
  
  while ((match = ternaryPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, trueTemplate, falseTemplate] = match;
    const placeholder = `CONDITIONAL_${counter}`;
    
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: trueTemplate.trim(),
      falseTemplate: falseTemplate.trim()
    });
    
    result = result.replace(fullMatch, placeholder);
    counter++;
  }

  // Обрабатываем логические AND операторы
  const andPattern = /\$\{([^}]+)\s*&&\s*([^}]+)\}/g;
  
  while ((match = andPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, trueTemplate] = match;
    const placeholder = `CONDITIONAL_${counter}`;
    
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: trueTemplate.trim(),
      falseTemplate: ""
    });
    
    result = result.replace(fullMatch, placeholder);
    counter++;
  }

  // Обрабатываем логические OR операторы
  const orPattern = /\$\{([^}]+)\s*\|\|\s*([^}]+)\}/g;
  
  while ((match = orPattern.exec(htmlString)) !== null) {
    const [fullMatch, condition, falseTemplate] = match;
    const placeholder = `CONDITIONAL_${counter}`;
    
    conditionalInfo.push({
      condition: condition.trim(),
      trueTemplate: condition.trim(),
      falseTemplate: falseTemplate.trim()
    });
    
    result = result.replace(fullMatch, placeholder);
    counter++;
  }

  return result;
}

// Рекурсивный парсинг условных блоков
export function parseConditionalBlocksRecursively(
  htmlString: string,
  conditionalInfo: ConditionalInfo[]
): string {
  let result = htmlString;
  let previousResult = "";
  let iteration = 0;
  const maxIterations = 100; // Защита от бесконечного цикла
  
  // Итеративно обрабатываем условные блоки, пока есть изменения
  while (result !== previousResult && iteration < maxIterations) {
    previousResult = result;
    
    // Обрабатываем один уровень условных блоков
    result = parseConditionalBlocks(result, conditionalInfo);
    
    // Обрабатываем вложенные условные блоки в trueTemplate и falseTemplate
    const newConditionals: ConditionalInfo[] = [];
    for (const conditional of conditionalInfo) {
      if (conditional.trueTemplate) {
        const processedTrue = parseConditionalBlocks(conditional.trueTemplate, newConditionals);
        conditional.trueTemplate = processedTrue;
      }
      if (conditional.falseTemplate) {
        const processedFalse = parseConditionalBlocks(conditional.falseTemplate, newConditionals);
        conditional.falseTemplate = processedFalse;
      }
    }
    
    // Добавляем новые условные блоки в основной список
    conditionalInfo.push(...newConditionals);
    
    iteration++;
  }
  
  return result;
}

