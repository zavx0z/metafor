// splitter.ts
var VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var TAG_LOOKAHEAD = /(?=<\/?[A-Za-z][A-Za-z0-9:-]*[^>]*>|<\/?meta-[^>]*>|<\/?meta-\$\{[^}]*\}[^>]*>)/gi;
var isValidTagName = (name) => /^[A-Za-z][A-Za-z0-9:-]*$/.test(name) && !name.includes("*") || name.startsWith("meta-");
var shouldIgnoreAt = (input, i) => input[i + 1] === "!" || input[i + 1] === "?";
var extractMainHtmlBlock = (render) => {
  const src = Function.prototype.toString.call(render);
  const firstIndex = src.indexOf("html`");
  if (firstIndex === -1)
    throw new Error("функция render не содержит html`");
  const lastBacktick = src.lastIndexOf("`");
  if (lastBacktick === -1 || lastBacktick <= firstIndex)
    throw new Error("render function does not contain html`");
  const htmlContent = src.slice(firstIndex + 5, lastBacktick);
  return htmlContent.replace(/!0/g, "true").replace(/!1/g, "false");
};
var scanHtmlTags = (input, offset = 0) => {
  const out = [];
  TAG_LOOKAHEAD.lastIndex = 0;
  let m;
  while ((m = TAG_LOOKAHEAD.exec(input)) !== null) {
    const localIndex = m.index;
    if (shouldIgnoreAt(input, localIndex)) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1;
      continue;
    }
    const tagStart = localIndex;
    let tagEnd = -1;
    let i = localIndex + 1;
    while (i < input.length) {
      const char = input[i];
      if (char === ">") {
        tagEnd = i + 1;
        break;
      } else if (char === '"' || char === "'") {
        const quote = char;
        i++;
        while (i < input.length && input[i] !== quote) {
          if (input[i] === "\\") {
            i++;
            i++;
          } else if (input[i] === "$" && i + 1 < input.length && input[i + 1] === "{") {
            i += 2;
            let braceCount = 1;
            while (i < input.length && braceCount > 0) {
              if (input[i] === "{")
                braceCount++;
              else if (input[i] === "}")
                braceCount--;
              i++;
            }
          } else {
            i++;
          }
        }
        if (i < input.length)
          i++;
      } else if (char === "$" && i + 1 < input.length && input[i + 1] === "{") {
        i += 2;
        let braceCount = 1;
        while (i < input.length && braceCount > 0) {
          if (input[i] === "{")
            braceCount++;
          else if (input[i] === "}")
            braceCount--;
          i++;
        }
      } else {
        i++;
      }
    }
    if (tagEnd === -1) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1;
      continue;
    }
    const full = input.slice(tagStart, tagEnd);
    let name = "";
    let isValidName = false;
    const tagNameMatch = full.match(/^<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s|>|\/)/i);
    if (tagNameMatch) {
      name = (tagNameMatch[1] || "").toLowerCase();
      isValidName = isValidTagName(tagNameMatch[1] || "");
    }
    if (!isValidName) {
      const metaMatch = full.match(/^<\/?(meta-\$\{[^}]+\})/i);
      if (metaMatch) {
        name = metaMatch[1] || "";
        isValidName = true;
      }
    }
    if (!isValidName) {
      TAG_LOOKAHEAD.lastIndex = localIndex + 1;
      continue;
    }
    let kind;
    if (full.startsWith("</"))
      kind = "close";
    else if (full.endsWith("/>"))
      kind = "self";
    else if (VOID_TAGS.has(name) && !name.startsWith("meta-"))
      kind = "void";
    else
      kind = "open";
    out.push({ text: full, index: offset + localIndex, name, kind });
    TAG_LOOKAHEAD.lastIndex = tagEnd;
  }
  return out;
};
var extractHtmlElements = (input) => {
  const tags = scanHtmlTags(input);
  const out = [];
  let cursor = 0;
  const pushText = (chunk, index) => {
    let processedChunk = "";
    let i = 0;
    if (chunk.startsWith("`") || chunk.match(/^\s*:\s*html`/) || chunk.match(/`\}\s*$/) || chunk.match(/^\s*`\}\s*$/) || chunk.match(/^\s+`\)\}\s*$/) || chunk.match(/^\s*`\s*:\s*html`\s*$/)) {
      return;
    }
    if (chunk.match(/^\s*`\)\}\s*\n\s*$/)) {
      return;
    }
    if (chunk.includes("`)}")) {
      return;
    }
    while (i < chunk.length) {
      if (chunk[i] === "$" && i + 1 < chunk.length && chunk[i + 1] === "{") {
        const startPos = i;
        i += 2;
        let braceCount = 1;
        while (i < chunk.length && braceCount > 0) {
          if (chunk[i] === "{")
            braceCount++;
          else if (chunk[i] === "}")
            braceCount--;
          i++;
        }
        if (braceCount === 0) {
          processedChunk += chunk.slice(startPos, i);
        } else {
          break;
        }
      } else {
        processedChunk += chunk[i];
        i++;
      }
    }
    if (processedChunk.trim().length > 0) {
      out.push({ text: processedChunk, index, name: "", kind: "text" });
    }
  };
  for (const tag of tags) {
    if (tag.index > cursor) {
      pushText(input.slice(cursor, tag.index), cursor);
    }
    out.push(tag);
    cursor = tag.index + tag.text.length;
  }
  if (cursor < input.length) {
    pushText(input.slice(cursor), cursor);
  }
  return out;
};

// hierarchy.ts
var createMapNode = (text, child) => ({
  type: "map",
  text,
  child
});
var createConditionNode = (text, trueBranch, falseBranch) => ({
  type: "cond",
  text,
  true: trueBranch,
  false: falseBranch
});
var getProcessableElements = (hierarchy) => hierarchy.filter((item) => item.type === "el" || item.type === "text" || item.type === "meta");
var processMultipleMaps = (mapInfos, processableElements) => {
  const elementsPerMap = Math.ceil(processableElements.length / mapInfos.length);
  const mapNodes = [];
  for (let i = 0;i < mapInfos.length; i++) {
    const mapInfo = mapInfos[i];
    const startIndex = i * elementsPerMap;
    const endIndex = Math.min(startIndex + elementsPerMap, processableElements.length);
    const mapElements = processableElements.slice(startIndex, endIndex);
    if (mapElements.length > 0 && mapInfo) {
      mapNodes.push(createMapNode(mapInfo.text, mapElements));
    }
  }
  return mapNodes;
};
var processMultipleConditions = (conditionInfos, processableElements) => {
  const elementsPerCondition = Math.ceil(processableElements.length / conditionInfos.length);
  const conditionNodes = [];
  for (let i = 0;i < conditionInfos.length; i++) {
    const condInfo = conditionInfos[i];
    const startIndex = i * elementsPerCondition;
    const endIndex = Math.min(startIndex + elementsPerCondition, processableElements.length);
    const conditionElements = processableElements.slice(startIndex, endIndex);
    if (conditionElements.length >= 2 && condInfo) {
      const trueBranch = conditionElements[0];
      const falseBranch = conditionElements[1];
      if (trueBranch && falseBranch) {
        conditionNodes.push(createConditionNode(condInfo.text, trueBranch, falseBranch));
      }
    }
  }
  return conditionNodes;
};
var makeHierarchy = (html, elements) => {
  const hierarchy = [];
  const stack = [];
  const conditionStack = [];
  const mapStack = [];
  for (let i = 0;i < elements.length; i++) {
    const element = elements[i];
    if (!element)
      continue;
    if (element.kind === "open" || element.kind === "self") {
      if (element.name && element.name.startsWith("meta-")) {
        const metaNode = {
          tag: element.name,
          type: "meta",
          text: element.text || ""
        };
        const sliceStart2 = i === 0 ? 0 : (elements[i - 1]?.index || 0) + (elements[i - 1]?.text?.length || 0);
        const sliceEnd2 = element.index || 0;
        const slice2 = html.slice(sliceStart2, sliceEnd2);
        const mapMatch2 = slice2.match(/(\w+(?:\.\w+)*\.map\([^)]*\))/);
        if (mapMatch2) {
          const mapText = mapMatch2[1] || "";
          const mapEnd = slice2.indexOf(mapText) + mapText.length;
          const afterMap = slice2.slice(mapEnd);
          let finalMapText = mapText;
          if (afterMap.match(/^\s*=>\s*html`/)) {
            finalMapText += "`";
          }
          const parent = stack.length > 0 ? stack[stack.length - 1]?.element || null : null;
          const startChildIndex = parent && (parent.type === "el" || parent.type === "meta") && parent.child ? parent.child.length : 0;
          mapStack.push({ parent, text: finalMapText, startChildIndex });
        }
        const condMatch2 = slice2.match(/\$\{([^?]+)\?/);
        if (condMatch2) {
          const parent = stack.length > 0 ? stack[stack.length - 1]?.element || null : null;
          conditionStack.push({ parent, text: (condMatch2[1] || "").trim() });
        }
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          if (parent && parent.element && (parent.element.type === "el" || parent.element.type === "meta")) {
            if (!parent.element.child)
              parent.element.child = [];
            parent.element.child.push(metaNode);
          }
        } else {
          hierarchy.push(metaNode);
        }
        if (element.kind === "open") {
          stack.push({ tag: element, element: metaNode });
        }
        continue;
      }
      const nodeElement = {
        tag: element.name || "",
        type: "el",
        text: element.text || ""
      };
      const sliceStart = i === 0 ? 0 : (elements[i - 1]?.index || 0) + (elements[i - 1]?.text?.length || 0);
      const sliceEnd = element.index || 0;
      const slice = html.slice(sliceStart, sliceEnd);
      const mapMatch = slice.match(/(\w+(?:\.\w+)*\.map\([^)]*\))/);
      if (mapMatch) {
        const mapText = mapMatch[1] || "";
        const mapEnd = slice.indexOf(mapText) + mapText.length;
        const afterMap = slice.slice(mapEnd);
        let finalMapText = mapText;
        if (afterMap.match(/^\s*=>\s*html`/)) {
          finalMapText += "`";
        }
        const parent = stack.length > 0 ? stack[stack.length - 1]?.element || null : null;
        const startChildIndex = parent && parent.type === "el" && parent.child ? parent.child.length : 0;
        mapStack.push({ parent, text: finalMapText, startChildIndex });
      }
      const condMatch = slice.match(/\$\{([^?]+)\?/);
      if (condMatch) {
        const parent = stack.length > 0 ? stack[stack.length - 1]?.element || null : null;
        conditionStack.push({ parent, text: (condMatch[1] || "").trim() });
      }
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent && parent.element && (parent.element.type === "el" || parent.element.type === "meta")) {
          if (!parent.element.child)
            parent.element.child = [];
          parent.element.child.push(nodeElement);
        }
      } else {
        hierarchy.push(nodeElement);
      }
      if (element.kind === "open") {
        stack.push({ tag: element, element: nodeElement });
      }
    } else if (element.kind === "close") {
      if (element.name && element.name.startsWith("meta-")) {
        if (stack.length > 0) {
          const lastStackItem = stack[stack.length - 1];
          if (lastStackItem && lastStackItem.tag.name === (element.name || "")) {
            const parentElement = lastStackItem.element;
            if (parentElement.type === "meta") {
              const mapInfo = mapStack.find((m) => m.parent === parentElement);
              if (mapInfo && parentElement.child && parentElement.child.length > 0) {
                const startIdx = Math.max(0, mapInfo.startChildIndex);
                const beforeChildren = parentElement.child.slice(0, startIdx);
                const mapChildren = parentElement.child.slice(startIdx);
                parentElement.child = [...beforeChildren, createMapNode(mapInfo.text, mapChildren)];
                mapStack.splice(mapStack.indexOf(mapInfo), 1);
              }
            }
            const condInfos = conditionStack.filter((c) => c.parent === parentElement);
            for (const condInfo of condInfos) {
              if (parentElement.child && parentElement.child.length >= 2) {
                let processedAnyCondition = false;
                for (let i2 = parentElement.child.length - 1;i2 >= 1; i2--) {
                  const trueBranch = parentElement.child[i2 - 1];
                  const falseBranch = parentElement.child[i2];
                  if (trueBranch && falseBranch && trueBranch.type === "meta" && falseBranch.type === "meta") {
                    parentElement.child.splice(i2 - 1, 2, createConditionNode(condInfo.text, trueBranch, falseBranch));
                    processedAnyCondition = true;
                    break;
                  }
                }
                if (processedAnyCondition) {
                  conditionStack.splice(conditionStack.indexOf(condInfo), 1);
                }
              }
            }
            stack.pop();
          }
        }
        continue;
      }
      if (stack.length > 0) {
        const lastStackItem = stack[stack.length - 1];
        if (lastStackItem && lastStackItem.tag.name === (element.name || "")) {
          const parentElement = lastStackItem.element;
          if (parentElement.type === "el") {
            const mapInfos = mapStack.filter((m) => m.parent === parentElement);
            if (mapInfos.length > 0 && parentElement.child && parentElement.child.length > 0) {
              if (mapInfos.length > 1) {
                const mapableElements = parentElement.child.filter((item) => item.type === "el" || item.type === "text" || item.type === "meta");
                const elementsPerMap = Math.ceil(mapableElements.length / mapInfos.length);
                const newChildren = [];
                for (let i2 = 0;i2 < mapInfos.length; i2++) {
                  const mapInfo = mapInfos[i2];
                  if (!mapInfo)
                    continue;
                  const startIndex = i2 * elementsPerMap;
                  const endIndex = Math.min(startIndex + elementsPerMap, mapableElements.length);
                  const mapElements = mapableElements.slice(startIndex, endIndex);
                  if (mapElements.length > 0) {
                    newChildren.push(createMapNode(mapInfo.text, mapElements));
                  }
                }
                const nonMapElements = parentElement.child.filter((item) => !(item.type === "el" || item.type === "text" || item.type === "meta"));
                newChildren.push(...nonMapElements);
                parentElement.child = newChildren;
                for (const mapInfo of mapInfos) {
                  mapStack.splice(mapStack.indexOf(mapInfo), 1);
                }
              } else {
                const mapInfo = mapInfos[0];
                if (mapInfo && parentElement.child && parentElement.child.length > 0) {
                  const startIdx = Math.max(0, mapInfo.startChildIndex);
                  const beforeChildren = parentElement.child.slice(0, startIdx);
                  const mapChildren = parentElement.child.slice(startIdx);
                  parentElement.child = [...beforeChildren, createMapNode(mapInfo.text, mapChildren)];
                  mapStack.splice(mapStack.indexOf(mapInfo), 1);
                }
              }
            }
          }
          if (parentElement.type === "el") {
            const condInfos = conditionStack.filter((c) => c.parent === parentElement);
            for (const condInfo of condInfos) {
              if (parentElement.child && parentElement.child.length >= 2) {
                let processedAnyCondition = false;
                for (let i2 = parentElement.child.length - 1;i2 >= 1; i2--) {
                  const trueBranch = parentElement.child[i2 - 1];
                  const falseBranch = parentElement.child[i2];
                  if (trueBranch && falseBranch && trueBranch.type === "el" && falseBranch.type === "el") {
                    parentElement.child.splice(i2 - 1, 2, createConditionNode(condInfo.text, trueBranch, falseBranch));
                    processedAnyCondition = true;
                    break;
                  }
                }
                if (processedAnyCondition) {
                  conditionStack.splice(conditionStack.indexOf(condInfo), 1);
                }
              }
            }
          }
          stack.pop();
        }
      }
    } else if (element.kind === "text") {
      const textNode = {
        type: "text",
        text: element.text || ""
      };
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent && parent.element && (parent.element.type === "el" || parent.element.type === "meta")) {
          if (!parent.element.child)
            parent.element.child = [];
          parent.element.child.push(textNode);
        }
      } else {
        hierarchy.push(textNode);
      }
    }
  }
  const topLevelMapInfos = mapStack.filter((m) => m.parent === null);
  const topLevelConditions = conditionStack.filter((c) => c.parent === null);
  if (topLevelMapInfos.length > 0 || topLevelConditions.length > 0) {
    const newHierarchy = [];
    const processableElements = getProcessableElements(hierarchy);
    if (topLevelMapInfos.length > 0 && topLevelConditions.length > 0) {
      if (processableElements.length > 0) {
        const mapInfo = topLevelMapInfos[0];
        const mapElement = processableElements[0];
        if (mapInfo && mapElement) {
          newHierarchy.push(createMapNode(mapInfo.text, [mapElement]));
        }
        const remainingElements = processableElements.slice(1);
        if (remainingElements.length >= 2) {
          const condInfo = topLevelConditions[0];
          const trueBranch = remainingElements[0];
          const falseBranch = remainingElements[1];
          if (condInfo && trueBranch && falseBranch) {
            newHierarchy.push(createConditionNode(condInfo.text, trueBranch, falseBranch));
          }
        }
      }
    } else if (topLevelMapInfos.length > 1) {
      newHierarchy.push(...processMultipleMaps(topLevelMapInfos, processableElements));
    } else if (topLevelMapInfos.length === 1) {
      const mapInfo = topLevelMapInfos[0];
      if (mapInfo && processableElements.length > 0) {
        newHierarchy.push(createMapNode(mapInfo.text, processableElements));
      }
    } else if (topLevelConditions.length > 1) {
      newHierarchy.push(...processMultipleConditions(topLevelConditions, processableElements));
    } else if (topLevelConditions.length === 1) {
      const condInfo = topLevelConditions[0];
      if (processableElements.length >= 2 && condInfo) {
        const trueBranch = processableElements[0];
        const falseBranch = processableElements[1];
        if (trueBranch && falseBranch) {
          newHierarchy.push(createConditionNode(condInfo.text, trueBranch, falseBranch));
        }
      }
    }
    const nonProcessableElements = hierarchy.filter((item) => !(item.type === "el" || item.type === "text" || item.type === "meta"));
    newHierarchy.push(...nonProcessableElements);
    hierarchy.splice(0, hierarchy.length, ...newHierarchy);
  }
  return hierarchy;
};

// attributes.ts
function formatExpression(expr) {
  return expr.replace(/\s+/g, " ").trim();
}
function matchBalancedBraces(s, startAfterBraceIndex) {
  let depth = 1;
  for (let i = startAfterBraceIndex;i < s.length; i++) {
    const ch = s[i];
    if (ch === "{")
      depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0)
        return i + 1;
    }
  }
  return -1;
}
function matchSimpleBraces(s, startIndex) {
  let depth = 1;
  for (let i = startIndex + 1;i < s.length; i++) {
    const ch = s[i];
    if (ch === "{")
      depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0)
        return i + 1;
    }
  }
  return -1;
}
function matchDoubleBraces(s, startIndex) {
  let depth = 1;
  for (let i = startIndex + 2;i < s.length; i++) {
    const ch = s[i];
    if (ch === "{")
      depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0)
        return i + 1;
    }
  }
  return -1;
}
function isFullyDynamicToken(token) {
  const v = token.trim();
  if (!(v.startsWith("${") && v.endsWith("}")))
    return false;
  const end = matchBalancedBraces(v, 2);
  return end === v.length;
}
function classifyValue(token) {
  if (isFullyDynamicToken(token))
    return "dynamic";
  if (token.includes("${"))
    return "mixed";
  return "static";
}
function normalizeValueForOutput(token) {
  if (isFullyDynamicToken(token)) {
    const v = token.trim();
    return formatExpression(v.slice(2, -1));
  }
  return formatExpression(token);
}
function isEmptyAttributeValue(value) {
  if (value === null)
    return false;
  if (value.includes("${"))
    return false;
  const normalized = normalizeValueForOutput(value);
  return normalized === "" || normalized.trim() === "";
}
function splitTopLevel(raw, sep) {
  const out = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  const push = () => {
    const t = buf.trim();
    if (t)
      out.push(t);
    buf = "";
  };
  for (let i = 0;i < raw.length; i++) {
    const ch = raw[i];
    if (!inSingle && !inDouble && ch === "$" && raw[i + 1] === "{") {
      const end = matchBalancedBraces(raw, i + 2);
      if (end === -1) {
        buf += ch;
        continue;
      } else {
        buf += raw.slice(i, end);
        i = end - 1;
        continue;
      }
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === sep) {
      push();
      continue;
    }
    buf += ch;
  }
  push();
  return out;
}
function splitBySpace(raw) {
  const out = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  const push = () => {
    const t = buf.trim();
    if (t)
      out.push(t);
    buf = "";
  };
  for (let i = 0;i < raw.length; i++) {
    const ch = raw[i];
    if (inSingle || inDouble) {
      buf += ch;
      if (inSingle && ch === "'")
        inSingle = false;
      else if (inDouble && ch === '"')
        inDouble = false;
      continue;
    }
    if (ch === "$" && raw[i + 1] === "{") {
      const end = matchBalancedBraces(raw, i + 2);
      if (end === -1) {
        buf += raw.slice(i);
        break;
      } else {
        buf += raw.slice(i, end);
        i = end - 1;
        continue;
      }
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      buf += ch;
      continue;
    }
    if (ch && /\s/.test(ch)) {
      push();
      while (i + 1 < raw.length && /\s/.test(raw[i + 1] || ""))
        i++;
      continue;
    }
    buf += ch;
  }
  push();
  return out;
}
var splitByComma = (raw) => splitTopLevel(raw, ",");
var splitBySemicolon = (raw) => splitTopLevel(raw, ";");
var BUILTIN_LIST_SPLITTERS = {
  class: { fn: splitBySpace, delim: " " },
  rel: { fn: splitBySpace, delim: " " },
  headers: { fn: splitBySpace, delim: " " },
  itemref: { fn: splitBySpace, delim: " " },
  ping: { fn: splitBySpace, delim: " " },
  sandbox: { fn: splitBySpace, delim: " " },
  sizes: { fn: splitBySpace, delim: " " },
  "accept-charset": { fn: splitBySpace, delim: " " },
  accept: { fn: splitByComma, delim: "," },
  allow: { fn: splitBySemicolon, delim: ";" },
  srcset: {
    fn: (raw) => splitByComma(raw).map((s) => s.trim()).filter(Boolean),
    delim: ","
  },
  coords: {
    fn: (raw) => splitTopLevel(raw, ",").map((s) => s.trim()).filter(Boolean),
    delim: ","
  }
};
function getBuiltinResolved(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("aria-") && lower !== "aria-hidden")
    return { fn: splitBySpace, delim: " " };
  return BUILTIN_LIST_SPLITTERS[lower] || null;
}
function readAttributeRawValue(inside, cursor) {
  const len = inside.length;
  while (cursor < len && /\s/.test(inside[cursor] ?? ""))
    cursor++;
  if (cursor >= len)
    return { value: "", nextIndex: cursor };
  const first = inside[cursor];
  if (first === '"' || first === "'") {
    const quote = first;
    cursor++;
    let v2 = "";
    while (cursor < len) {
      const c = inside[cursor];
      if (c === "$" && inside[cursor + 1] === "{") {
        if (inside[cursor + 2] === "{") {
          const end = matchDoubleBraces(inside, cursor);
          if (end === -1) {
            v2 += inside.slice(cursor);
            return { value: v2, nextIndex: len };
          } else {
            v2 += inside.slice(cursor, end);
            cursor = end;
            continue;
          }
        } else {
          const end = matchBalancedBraces(inside, cursor + 2);
          if (end === -1) {
            v2 += inside.slice(cursor);
            return { value: v2, nextIndex: len };
          } else {
            v2 += inside.slice(cursor, end);
            cursor = end;
            continue;
          }
        }
      }
      if (c === quote) {
        cursor++;
        break;
      }
      v2 += c;
      cursor++;
    }
    return { value: v2, nextIndex: cursor };
  }
  let v = "";
  while (cursor < len) {
    const c = inside[cursor];
    if (c === ">" || c && /\s/.test(c))
      break;
    if (c === "$" && inside[cursor + 1] === "{") {
      if (inside[cursor + 2] === "{") {
        const end = matchDoubleBraces(inside, cursor);
        if (end === -1) {
          v += inside.slice(cursor);
          return { value: v, nextIndex: len };
        } else {
          v += inside.slice(cursor, end);
          cursor = end;
          continue;
        }
      } else {
        const end = matchBalancedBraces(inside, cursor + 2);
        if (end === -1) {
          v += inside.slice(cursor);
          return { value: v, nextIndex: len };
        } else {
          v += inside.slice(cursor, end);
          cursor = end;
          continue;
        }
      }
    }
    v += c;
    cursor++;
  }
  return { value: v, nextIndex: cursor };
}
function sliceInsideTag(tagSource) {
  if (!tagSource.startsWith("<"))
    return "";
  let i = 1;
  while (i < tagSource.length) {
    const ch = tagSource[i];
    if (ch === ">" || /\s/.test(ch ?? ""))
      break;
    if (ch === "$" && tagSource[i + 1] && tagSource[i + 1] === "{") {
      const end = matchBalancedBraces(tagSource, i + 2);
      if (end === -1)
        break;
      i = end;
      continue;
    }
    i++;
  }
  if (i < tagSource.length && tagSource[i] === ">") {
    const afterGt = tagSource.slice(i + 1).trim();
    if (afterGt && !afterGt.startsWith(">")) {
      i = tagSource.indexOf(" ", i + 1);
      if (i === -1)
        i = tagSource.length;
    }
  }
  if (i >= tagSource.length || tagSource[i] === ">")
    return "";
  let j = i;
  let out = "";
  let inSingle = false;
  let inDouble = false;
  while (j < tagSource.length) {
    const ch = tagSource[j];
    if (ch === "$" && tagSource[j + 1] && tagSource[j + 1] === "{") {
      const end = matchBalancedBraces(tagSource, j + 2);
      if (end === -1) {
        out += tagSource.slice(j);
        break;
      }
      out += tagSource.slice(j, end);
      j = end;
      continue;
    }
    if (ch === "{") {
      const end = matchSimpleBraces(tagSource, j);
      if (end === -1) {
        out += tagSource.slice(j);
        break;
      }
      out += tagSource.slice(j, end);
      j = end;
      continue;
    }
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      out += ch;
      j++;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      out += ch;
      j++;
      continue;
    }
    if (!inSingle && !inDouble && ch === ">")
      break;
    out += ch;
    j++;
  }
  return out;
}
var parseAttributes = (tagSource) => {
  const inside = sliceInsideTag(tagSource);
  const len = inside.length;
  let i = 0;
  const result = {};
  const ensure = {
    event: () => result.event ??= {},
    array: () => result.array ??= {},
    string: () => result.string ??= {},
    boolean: () => result.boolean ??= {},
    object: () => result.object ??= {}
  };
  while (i < len) {
    while (i < len && /\s/.test(inside[i] || ""))
      i++;
    if (i >= len)
      break;
    if (inside[i] === "$" && inside[i + 1] === "{") {
      const braceStart = i;
      const braceEnd = matchBalancedBraces(inside, i + 2);
      if (braceEnd === -1)
        break;
      const braceContent = inside.slice(braceStart + 2, braceEnd - 1);
      const parts = braceContent.split("&&").map((s) => s.trim());
      if (parts.length >= 2) {
        const attributeName = parts[parts.length - 1]?.replace(/['"]/g, "");
        if (attributeName) {
          const condition = parts.slice(0, -1).join(" && ");
          ensure.boolean()[attributeName] = {
            type: "dynamic",
            value: condition || ""
          };
        }
      }
      i = braceEnd;
      continue;
    }
    const nameStart = i;
    while (i < len) {
      const ch = inside[i];
      if (!ch || /\s/.test(ch) || ch === "=")
        break;
      i++;
    }
    const name = inside.slice(nameStart, i);
    if (!name)
      break;
    if (name === "/") {
      continue;
    }
    if (name.startsWith("on")) {
      while (i < len && /\s/.test(inside[i] || ""))
        i++;
      let value2 = null;
      if (inside[i] === "=") {
        i++;
        const r = readAttributeRawValue(inside, i);
        value2 = r.value;
        i = r.nextIndex;
      }
      const eventValue = value2 ? formatExpression(value2.slice(2, -1)) : "";
      ensure.event()[name] = eventValue;
      continue;
    }
    if (name === "style") {
      while (i < len && /\s/.test(inside[i] || ""))
        i++;
      let value2 = null;
      if (inside[i] === "=") {
        i++;
        const r = readAttributeRawValue(inside, i);
        value2 = r.value;
        i = r.nextIndex;
      }
      const styleValue = value2 ? value2.startsWith("${{") ? value2.slice(3, -2).trim() ? `{ ${formatExpression(value2.slice(3, -2))} }` : "{}" : formatExpression(value2.slice(2, -1)) : "{}";
      ensure.object()[name] = styleValue;
      continue;
    }
    if (name === "context" || name === "core") {
      while (i < len && /\s/.test(inside[i] || ""))
        i++;
      let value2 = null;
      if (inside[i] === "=") {
        i++;
        const r = readAttributeRawValue(inside, i);
        value2 = r.value;
        i = r.nextIndex;
      }
      const objectValue = value2 ? value2.startsWith("${{") ? value2.slice(3, -2).trim() ? `{ ${formatExpression(value2.slice(3, -2))} }` : "{}" : formatExpression(value2.slice(2, -1)) : "{}";
      ensure.object()[name] = objectValue;
      continue;
    }
    while (i < len && /\s/.test(inside[i] || ""))
      i++;
    let value = null;
    let hasQuotes = false;
    if (inside[i] === "=") {
      i++;
      hasQuotes = inside[i] === '"' || inside[i] === "'";
      const r = readAttributeRawValue(inside, i);
      value = r.value;
      i = r.nextIndex;
    } else {}
    if (name === "class") {
      if (isEmptyAttributeValue(value)) {
        continue;
      }
      const tokens = splitBySpace(value ?? "");
      if (tokens.length === 1) {
        ensure.string()[name] = {
          type: classifyValue(value ?? ""),
          value: normalizeValueForOutput(value ?? "")
        };
        continue;
      }
      const out = tokens.map((tok) => ({
        type: classifyValue(tok),
        value: normalizeValueForOutput(tok)
      }));
      ensure.array()[name] = out;
      continue;
    }
    {
      const resolved = getBuiltinResolved(name);
      if (resolved) {
        if (isEmptyAttributeValue(value)) {
          continue;
        }
        const tokens = resolved.fn(value ?? "");
        if (tokens.length === 1) {
          ensure.string()[name] = {
            type: classifyValue(value ?? ""),
            value: normalizeValueForOutput(value ?? "")
          };
          continue;
        }
        const out = tokens.map((tok) => ({
          type: classifyValue(tok),
          value: normalizeValueForOutput(tok)
        }));
        ensure.array()[name] = out;
        continue;
      }
    }
    if (!hasQuotes && (value === null || value === "true" || value === "false" || value && isFullyDynamicToken(value) && !value.includes("?") && !value.includes(":") || value && isFullyDynamicToken(value) && value.includes("?") && value.includes(":") && (value.includes("true") || value.includes("false")))) {
      if (value && isFullyDynamicToken(value)) {
        ensure.boolean()[name] = { type: "dynamic", value: normalizeValueForOutput(value) };
      } else {
        ensure.boolean()[name] = { type: "static", value: value === "true" || value === null };
      }
      continue;
    }
    if (!isEmptyAttributeValue(value)) {
      ensure.string()[name] = {
        type: classifyValue(value ?? ""),
        value: normalizeValueForOutput(value ?? "")
      };
    }
  }
  return result;
};
var extractAttributes = (hierarchy) => {
  return hierarchy.map((node) => {
    if (node.type === "el") {
      const parsedAttributes = parseAttributes(node.text);
      const result = {
        tag: node.tag,
        type: "el",
        ...parsedAttributes
      };
      if (node.child) {
        result.child = node.child.map((child) => {
          if (child.type === "el") {
            return extractAttributes([child])[0];
          }
          if (child.type === "map" || child.type === "cond") {
            return extractAttributes([child])[0];
          }
          return child;
        });
      }
      return result;
    }
    if (node.type === "meta") {
      const parsedAttributes = parseAttributes(node.text);
      const result = {
        tag: node.tag,
        type: "meta",
        ...parsedAttributes
      };
      if (node.child) {
        result.child = node.child.map((child) => {
          if (child.type === "el") {
            return extractAttributes([child])[0];
          }
          if (child.type === "map" || child.type === "cond") {
            return extractAttributes([child])[0];
          }
          return child;
        });
      }
      return result;
    }
    if (node.type === "map" && node.child) {
      return {
        ...node,
        child: node.child.map((child) => {
          if (child.type === "el") {
            return extractAttributes([child])[0];
          }
          if (child.type === "meta") {
            return extractAttributes([child])[0];
          }
          if (child.type === "map" || child.type === "cond") {
            return extractAttributes([child])[0];
          }
          return child;
        })
      };
    }
    if (node.type === "cond") {
      return {
        ...node,
        true: extractAttributes([node.true])[0],
        false: extractAttributes([node.false])[0]
      };
    }
    return node;
  });
};

// data.ts
var VARIABLE_WITH_DOTS_PATTERN = /([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g;
var VALID_VARIABLE_PATTERN = /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/;
var MAP_PATTERN = /(\w+(?:\.\w+)*)\.map\(([^)]*)\)/;
var UPDATE_OBJECT_PATTERN = /update\(\s*\{([^}]+)\}\s*\)/;
var OBJECT_KEY_PATTERN = /([a-zA-Z_$][\w$]*)\s*:/g;
var CONDITIONAL_OPERATORS_PATTERN = /\?.*:/;
var WHITESPACE_PATTERN = /\s+/g;
var TEMPLATE_WRAPPER_PATTERN = /^\$\{|\}$/g;
var ARGUMENTS_PREFIX = "";
var findVariableInMapStack = (variable, context) => {
  if (!context.mapContextStack?.length)
    return null;
  const variableParts = variable.split(".");
  const variableName = variableParts[0] || "";
  for (let i = context.mapContextStack.length - 1;i >= 0; i--) {
    const mapContext = context.mapContextStack[i];
    if (!mapContext?.params.includes(variableName))
      continue;
    const levelsUp = context.mapContextStack.length - 1 - i;
    const prefix = "../".repeat(levelsUp);
    const paramIndex = mapContext.params.indexOf(variableName);
    return paramIndex === 0 ? buildItemPath(prefix, variableParts, mapContext.isDestructured) : `${prefix}[index]`;
  }
  return null;
};
var buildItemPath = (prefix, variableParts, isDestructured) => {
  const hasProperty = variableParts.length > 1;
  if (isDestructured) {
    return hasProperty ? `${prefix}[item]/${variableParts.slice(1).join("/")}` : `${prefix}[item]/${variableParts[0]}`;
  }
  return hasProperty ? `${prefix}[item]/${variableParts.slice(1).join("/")}` : `${prefix}[item]`;
};
var resolveDataPath = (variable, context) => {
  const mapStackPath = findVariableInMapStack(variable, context);
  if (mapStackPath !== null) {
    return mapStackPath;
  }
  if (context.mapParams && context.mapParams.length > 0) {
    const variableParts = variable.split(".");
    const mapParamVariable = variableParts[0] || "";
    if (context.mapParams.includes(mapParamVariable)) {
      const paramIndex = context.mapParams.indexOf(mapParamVariable);
      if (paramIndex === 0) {
        if (variableParts.length > 1) {
          const propertyPath = variableParts.slice(1).join("/");
          return `[item]/${propertyPath}`;
        } else {
          return "[item]";
        }
      } else {
        return "[index]";
      }
    } else if (variableParts[0] && context.mapParams.includes(variableParts[0])) {
      const paramIndex = context.mapParams.indexOf(variableParts[0]);
      if (paramIndex === 0) {
        if (variableParts.length > 1) {
          const propertyPath = variableParts.slice(1).join("/");
          return `[item]/${propertyPath}`;
        } else {
          return "[item]";
        }
      } else {
        return "[index]";
      }
    } else if (context.mapParams.includes(variable)) {
      const paramIndex = context.mapParams.indexOf(variable);
      if (paramIndex === 0) {
        return `[item]/${variable}`;
      } else {
        return "[index]";
      }
    } else {
      if (variable.startsWith("core.")) {
        return `/${variable.replace(/\./g, "/")}`;
      }
      if (context.currentPath && context.currentPath.includes("[item]")) {
        if (context.pathStack && context.pathStack.length > 1) {
          const mapLevels = context.pathStack.filter((path) => path.includes("[item]")).length;
          const levelsUp = mapLevels - 1;
          const prefix = "../".repeat(levelsUp);
          const propertyPath = variableParts.length > 1 ? variableParts.slice(1).join("/") : variable;
          return `${prefix}[item]/${propertyPath}`;
        } else {
          return `[item]/${variable.replace(/\./g, "/")}`;
        }
      } else {
        return `[item]/${variable.replace(/\./g, "/")}`;
      }
    }
  } else if (context.currentPath && !context.currentPath.includes("[item]")) {
    return `${context.currentPath}/${variable.replace(/\./g, "/")}`;
  } else {
    return `/${variable.replace(/\./g, "/")}`;
  }
};
var extractBaseVariable = (variable) => {
  if (variable.includes("(")) {
    const beforeMethod = variable.split(/\.\w+\(/).shift()?.trim();
    if (beforeMethod && VALID_VARIABLE_PATTERN.test(beforeMethod)) {
      return beforeMethod;
    }
  }
  return variable;
};
var parseEventExpression = (eventValue, context = { pathStack: [], level: 0 }) => {
  const hasConditionalOperators = CONDITIONAL_OPERATORS_PATTERN.test(eventValue) && !eventValue.includes("=>");
  if (hasConditionalOperators) {
    return null;
  }
  const hasTemplateLiteral = eventValue.includes("${");
  if (hasTemplateLiteral) {
    return null;
  }
  if (eventValue.includes("update(")) {
    const objectMatch = eventValue.match(UPDATE_OBJECT_PATTERN);
    if (objectMatch) {
      const objectContent = objectMatch[1] || "";
      const keyMatches = objectContent.match(OBJECT_KEY_PATTERN) || [];
      const keys = keyMatches.map((match) => match.replace(/\s*:$/, "").trim());
      if (keys.length > 0) {
        const variableMatches2 = objectContent.match(VARIABLE_WITH_DOTS_PATTERN) || [];
        const uniqueVariables2 = [...new Set(variableMatches2)].filter((variable) => {
          return variable.length > 1 && !variable.startsWith('"') && !variable.startsWith("'") && !variable.includes('"') && !variable.includes("'") && variable !== "true" && variable !== "false";
        });
        let result = {
          upd: keys.length === 1 ? keys[0] || "" : keys
        };
        if (uniqueVariables2.length > 0) {
          const paths2 = uniqueVariables2.map((variable) => resolveDataPath(variable, context)).filter((path) => path && path.length > 0);
          if (paths2.length > 0) {
            result.data = paths2.length === 1 ? paths2[0] : paths2;
          }
        }
        let expr2 = eventValue;
        if (uniqueVariables2.length > 0) {
          uniqueVariables2.forEach((variable, index) => {
            expr2 = expr2.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[${index}]}`);
          });
        }
        result.expr = expr2.replace(TEMPLATE_WRAPPER_PATTERN, "").replace(WHITESPACE_PATTERN, " ").trim();
        return result;
      }
    }
  }
  const variableMatches = eventValue.match(VARIABLE_WITH_DOTS_PATTERN) || [];
  if (variableMatches.length === 0) {
    return null;
  }
  const hasArrowFunction = eventValue.includes("=>");
  const uniqueVariables = [...new Set(variableMatches)].filter((variable) => {
    return variable.length > 1 && !variable.startsWith('"') && !variable.startsWith("'") && !variable.includes('"') && !variable.includes("'");
  });
  if (uniqueVariables.length === 0) {
    return null;
  }
  const paths = uniqueVariables.map((variable) => resolveDataPath(variable, context));
  let expr = eventValue;
  uniqueVariables.forEach((variable, index) => {
    expr = expr.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[${index}]}`);
  });
  if (!expr.includes("${")) {
    expr = expr.replace(/^\$\{/, "").replace(/\}$/, "");
  }
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim();
  if (!hasArrowFunction && uniqueVariables.length === 1 && (expr === `\${${ARGUMENTS_PREFIX}[0]}` || expr === `${ARGUMENTS_PREFIX}[0]`)) {
    return {
      data: paths[0] || ""
    };
  }
  return {
    data: paths.length === 1 ? paths[0] || "" : paths,
    expr
  };
};
var createUnifiedExpression = (value, variables) => {
  let expr = value;
  const stringLiterals = [];
  let protectedExpr = expr.replace(/"[^"]*"/g, (match) => {
    stringLiterals.push(match);
    return `__STRING_${stringLiterals.length - 1}__`;
  }).replace(/'[^']*'/g, (match) => {
    stringLiterals.push(match);
    return `__STRING_${stringLiterals.length - 1}__`;
  });
  variables.forEach((variable, index) => {
    const exactRegex = new RegExp(`\\$\\{${variable.replace(/\./g, "\\.")}\\}`, "g");
    protectedExpr = protectedExpr.replace(exactRegex, `\${${ARGUMENTS_PREFIX}[${index}]}`);
    const insideRegex = new RegExp(`\\$\\{([^}]*?)\\b${variable.replace(/\./g, "\\.")}\\b([^}]*?)\\}`, "g");
    protectedExpr = protectedExpr.replace(insideRegex, (match, before, after) => {
      if (before.trim() === "" && after.trim() === "") {
        return match;
      }
      return `\${${before}${ARGUMENTS_PREFIX}[${index}]${after}}`;
    });
  });
  protectedExpr = protectedExpr.replace(WHITESPACE_PATTERN, " ").trim();
  stringLiterals.forEach((literal, index) => {
    protectedExpr = protectedExpr.replace(`__STRING_${index}__`, literal);
  });
  return protectedExpr;
};
var processStringAttributes = (stringAttrs, context) => {
  const result = {};
  for (const [key, attr] of Object.entries(stringAttrs)) {
    if (attr.type === "static") {
      result[key] = attr.value;
    } else if (attr.type === "dynamic" || attr.type === "mixed") {
      const hasBraces = attr.value.includes("${");
      const valueWithBraces = hasBraces ? attr.value : `\${${attr.value}}`;
      const templateResult = parseTemplateLiteral(valueWithBraces, context);
      if (templateResult && templateResult.data) {
        const isSimpleVariable = !hasBraces && !attr.value.includes(" ") && !attr.value.includes("+") && !attr.value.includes("-") && !attr.value.includes("*") && !attr.value.includes("/") && !attr.value.includes("?") && !attr.value.includes(":") && !attr.value.includes("!");
        if (templateResult.expr && typeof templateResult.expr === "string" && !isSimpleVariable) {
          result[key] = {
            data: templateResult.data,
            expr: templateResult.expr
          };
        } else {
          result[key] = {
            data: Array.isArray(templateResult.data) ? templateResult.data[0] || "" : templateResult.data
          };
        }
      } else {
        result[key] = attr.value;
      }
    }
  }
  return result;
};
var processEventAttributes = (eventAttrs, context) => {
  const result = {};
  for (const [key, value] of Object.entries(eventAttrs)) {
    const eventResult = parseEventExpression(value, context);
    if (eventResult) {
      if (eventResult.upd) {
        const eventObj = {
          expr: eventResult.expr || "",
          upd: eventResult.upd
        };
        if (eventResult.data) {
          eventObj.data = eventResult.data;
        }
        result[key] = eventObj;
      } else if (eventResult.data) {
        if (eventResult.expr && typeof eventResult.expr === "string") {
          result[key] = {
            data: eventResult.data,
            expr: eventResult.expr
          };
        } else {
          result[key] = {
            data: Array.isArray(eventResult.data) ? eventResult.data[0] || "" : eventResult.data
          };
        }
      } else {
        if (value && value.trim() !== "") {
          result[key] = {
            data: value
          };
        }
      }
    } else {
      if (value && value.trim() !== "") {
        result[key] = {
          data: value
        };
      }
    }
  }
  if (Object.keys(result).length === 0) {
    return {};
  }
  return result;
};
var processArrayAttributes = (arrayAttrs, context) => {
  const result = {};
  for (const [key, values] of Object.entries(arrayAttrs)) {
    result[key] = values.map((item) => {
      if (item.type === "static") {
        return { value: item.value };
      } else if (item.type === "dynamic" || item.type === "mixed") {
        const templateResult = parseTemplateLiteral(item.value, context);
        if (templateResult && templateResult.data) {
          if (templateResult.expr && typeof templateResult.expr === "string") {
            return {
              data: templateResult.data,
              expr: templateResult.expr
            };
          } else {
            return {
              data: Array.isArray(templateResult.data) ? templateResult.data[0] || "" : templateResult.data
            };
          }
        } else {
          const variableMatches = item.value.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g) || [];
          if (variableMatches.length > 0) {
            const paths = variableMatches.map((variable) => resolveDataPath(variable, context));
            let expr = item.value;
            variableMatches.forEach((variable, index) => {
              expr = expr.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `${ARGUMENTS_PREFIX}[${index}]`);
            });
            return {
              data: paths.length === 1 ? paths[0] || "" : paths,
              expr: `\${${expr}}`
            };
          } else {
            return { value: item.value };
          }
        }
      } else {
        return { value: item.value };
      }
    });
  }
  return result;
};
var processBooleanAttributes = (booleanAttrs, context) => {
  const result = {};
  for (const [key, attr] of Object.entries(booleanAttrs)) {
    if (attr.type === "static") {
      result[key] = Boolean(attr.value);
    } else if (attr.type === "dynamic" || attr.type === "mixed") {
      const booleanValue = String(attr.value);
      const variableMatches = booleanValue.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/g) || [];
      if (variableMatches.length > 0) {
        const paths = variableMatches.map((variable) => resolveDataPath(variable, context));
        let expr = booleanValue;
        variableMatches.forEach((variable, index) => {
          expr = expr.replace(new RegExp(`\\b${variable.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[${index}]}`);
        });
        if (paths.length === 1) {
          result[key] = {
            data: paths[0] || ""
          };
        } else {
          result[key] = {
            data: paths,
            expr
          };
        }
      } else {
        result[key] = false;
      }
    }
  }
  return result;
};
var processObjectAttributes = (objectAttrs, context) => {
  const result = {};
  for (const [key, objectValue] of Object.entries(objectAttrs)) {
    const objectValueStr = String(objectValue);
    const objectMatch = objectValueStr.match(/\{\s*([^}]+)\s*\}/);
    if (objectMatch && objectMatch[1]) {
      const objectContent = objectMatch[1];
      const objectResult = {};
      const propertyMatches = objectContent.match(/([a-zA-Z-]+)\s*:\s*([^,}]+)/g) || [];
      propertyMatches.forEach((propertyMatch) => {
        const match = propertyMatch.match(/([a-zA-Z-]+)\s*:\s*(.+)/);
        if (match && match[1] && match[2]) {
          const propertyName = match[1];
          const propertyValue = match[2];
          const trimmedValue = propertyValue.trim();
          const variableMatch = trimmedValue.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)/);
          if (variableMatch && variableMatch[1]) {
            const variable = variableMatch[1];
            const dataPath = resolveDataPath(variable, context);
            objectResult[propertyName] = dataPath;
          } else {
            objectResult[propertyName] = trimmedValue;
          }
        }
      });
      result[key] = objectResult;
    } else {
      result[key] = { [key]: objectValueStr };
    }
  }
  return result;
};
var parseMap = (mapText, context = { pathStack: [], level: 0 }) => {
  const mapMatch = mapText.match(MAP_PATTERN);
  if (!mapMatch) {
    return { path: "" };
  }
  const dataPath = mapMatch[1] || "";
  const paramsText = mapMatch[2] || "";
  const { params, isDestructured } = extractMapParams(paramsText.replace(/^\(|\)$/g, ""));
  if (dataPath.includes(".") && context.mapParams && context.mapParams.length > 0) {
    const parts = dataPath.split(".");
    const relativePath = parts[parts.length - 1] || "";
    const newParseMapContext2 = {
      path: `[item]/${relativePath}`,
      params,
      isDestructured,
      level: context.level + 1
    };
    const newContext2 = {
      ...context,
      currentPath: `[item]/${relativePath}`,
      pathStack: [...context.pathStack, `[item]/${relativePath}`],
      mapParams: params,
      level: context.level + 1,
      mapContextStack: [...context.mapContextStack || [], newParseMapContext2]
    };
    return {
      path: `[item]/${relativePath}`,
      context: newContext2,
      metadata: { params }
    };
  }
  if (!dataPath.includes(".") && context.currentPath && context.currentPath.includes("[item]")) {
    const newParseMapContext2 = {
      path: `[item]/${dataPath}`,
      params,
      isDestructured,
      level: context.level + 1
    };
    const newContext2 = {
      ...context,
      currentPath: `[item]/${dataPath}`,
      pathStack: [...context.pathStack, `[item]/${dataPath}`],
      mapParams: params,
      level: context.level + 1,
      mapContextStack: [...context.mapContextStack || [], newParseMapContext2]
    };
    return {
      path: `[item]/${dataPath}`,
      context: newContext2,
      metadata: { params }
    };
  }
  if (!dataPath.includes(".") && context.mapParams && context.mapParams.length > 0) {
    const newParseMapContext2 = {
      path: `[item]/${dataPath}`,
      params,
      isDestructured,
      level: context.level + 1
    };
    const newContext2 = {
      ...context,
      currentPath: `[item]/${dataPath}`,
      pathStack: [...context.pathStack, `[item]/${dataPath}`],
      mapParams: params,
      level: context.level + 1,
      mapContextStack: [...context.mapContextStack || [], newParseMapContext2]
    };
    return {
      path: `[item]/${dataPath}`,
      context: newContext2,
      metadata: { params }
    };
  }
  const absolutePath = `/${dataPath.replace(/\./g, "/")}`;
  const newParseMapContext = {
    path: absolutePath,
    params,
    isDestructured,
    level: context.level + 1
  };
  const newContext = {
    ...context,
    currentPath: absolutePath,
    pathStack: [...context.pathStack, absolutePath],
    mapParams: params,
    level: context.level + 1,
    mapContextStack: [...context.mapContextStack || [], newParseMapContext]
  };
  return {
    path: absolutePath,
    context: newContext,
    metadata: { params }
  };
};
var extractMapParams = (paramsText) => {
  const cleanParams = paramsText.replace(/\s+/g, "").trim();
  if (!cleanParams)
    return { params: [], isDestructured: false };
  const destructureMatch = cleanParams.match(/\{([^}]+)\}/);
  const isDestructured = !!destructureMatch;
  const params = destructureMatch?.[1] ? destructureMatch[1].split(",").map((p) => p.trim()) : cleanParams.split(",").map((p) => p.trim());
  return { params, isDestructured };
};
var parseCondition = (condText, context = { pathStack: [], level: 0 }) => {
  const cleanCondText = cleanConditionText(condText);
  const pathMatches = cleanCondText.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || [];
  if (pathMatches.length === 0)
    return { path: "" };
  const expression = extractConditionExpression(cleanCondText);
  const paths = pathMatches.length === 1 ? resolveDataPath(pathMatches[0] || "", context) : pathMatches.map((variable) => resolveDataPath(variable, context));
  return { path: paths, metadata: { expression } };
};
var cleanConditionText = (condText) => {
  let cleanText = condText.replace(/html`[^`]*`/g, "");
  if (cleanText.includes("Index")) {
    const indexMatches = cleanText.match(/([a-zA-Z_$][\w$]*\s*[=!<>]+\s*[0-9]+)/g) || [];
    return indexMatches.length > 0 ? indexMatches.join(" && ") : cleanText;
  }
  return cleanText.includes("?") ? cleanText.split("?")[0]?.trim() || cleanText : cleanText;
};
var extractConditionExpression = (condText) => {
  if (condText.includes("Index")) {
    const indexMatches = condText.match(/([a-zA-Z_$][\w$]*\s*[=!<>]+\s*[0-9]+)/g) || [];
    if (indexMatches.length > 0) {
      let logicalExpression = indexMatches.join(" && ");
      const pathMatches2 = logicalExpression.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || [];
      pathMatches2.forEach((path, index) => {
        logicalExpression = logicalExpression.replace(new RegExp(`\\b${path.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[${index}]}`);
      });
      return logicalExpression.replace(/\s+/g, " ").trim();
    }
  }
  const pathMatches = condText.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || [];
  const hasComplexOperations = /[%+\-*/===!===!=<>().]/.test(condText);
  const hasLogicalOperators = /[&&||]/.test(condText);
  if (pathMatches.length === 1 && !hasComplexOperations && !hasLogicalOperators) {
    return `\${${ARGUMENTS_PREFIX}[0]}`;
  }
  let expression = condText;
  pathMatches.forEach((path, index) => {
    expression = expression.replace(new RegExp(`\\b${path.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[${index}]}`);
  });
  return expression.replace(/\s+/g, " ").trim();
};
var formatTextByHtmlStandards = (text) => {
  return text.replace(/\s+/g, " ").trim();
};
var formatStaticText = (text) => {
  if (text.trim().length === 0) {
    return "";
  }
  if (text.includes(`
`) || text.includes("\t") || /\s{3,}/.test(text)) {
    return formatTextByHtmlStandards(text);
  }
  return text;
};
var parseText = (text, context = { pathStack: [], level: 0 }) => {
  if (!text.includes("${")) {
    return {
      type: "text",
      value: formatStaticText(text)
    };
  }
  const hasConditionalOperators = /\?.*:/.test(text);
  const hasLogicalOperators = /[&&||]/.test(text);
  if (hasConditionalOperators || hasLogicalOperators) {
    const templateResult = parseTemplateLiteral(text, context);
    if (templateResult && templateResult.data) {
      return {
        type: "text",
        data: templateResult.data,
        ...templateResult.expr && { expr: templateResult.expr }
      };
    }
  }
  const parts = splitText(text);
  const dynamicParts = parts.filter((part) => part.type === "dynamic").map((part) => {
    const varMatch = part.text.match(/\$\{([^}]+)\}/);
    const variable = varMatch?.[1] || "";
    if (variable.startsWith('"') || variable.startsWith("'") || variable.includes('"') || variable.includes("'")) {
      return null;
    }
    const baseVariable = extractBaseVariable(variable);
    const path = resolveDataPath(baseVariable, context);
    return {
      path,
      text: part.text
    };
  }).filter((part) => part !== null);
  const firstDynamicPart = dynamicParts[0];
  const mainPath = firstDynamicPart ? firstDynamicPart.path : "";
  if (dynamicParts.length === 0 && parts.some((part) => part.type === "dynamic")) {
    const staticText = parts.filter((part) => part.type === "dynamic").map((part) => {
      const varMatch = part.text.match(/\$\{([^}]+)\}/);
      const variable = varMatch?.[1] || "";
      if (variable.startsWith('"') && variable.endsWith('"')) {
        return variable.slice(1, -1);
      }
      if (variable.startsWith("'") && variable.endsWith("'")) {
        return variable.slice(1, -1);
      }
      return "";
    }).join("");
    if (staticText) {
      return {
        type: "text",
        value: formatStaticText(staticText)
      };
    }
  }
  if (parts.length === 1 && parts[0] && parts[0].type === "dynamic") {
    const dynamicText = parts[0].text;
    const variable = dynamicText.match(/\$\{([^}]+)\}/)?.[1] || "";
    const hasComplexExpression = variable.includes("(");
    if (hasComplexExpression) {
      const baseVariable = dynamicParts[0]?.path.replace(/^\//, "").replace(/\//g, ".") || "";
      let expr = variable;
      if (baseVariable) {
        expr = expr.replace(new RegExp(`\\b${baseVariable.replace(/\./g, "\\.")}\\b`, "g"), `\${${ARGUMENTS_PREFIX}[0]}`);
      }
      return {
        type: "text",
        data: mainPath,
        expr: createUnifiedExpression(expr, [])
      };
    }
    return {
      type: "text",
      data: mainPath
    };
  }
  if (dynamicParts.length > 1) {
    const expr = parts.map((part) => {
      if (part.type === "static")
        return part.text;
      const index = dynamicParts.findIndex((dp) => dp.text === part.text);
      return `\${${ARGUMENTS_PREFIX}[${index}]}`;
    }).join("");
    return {
      type: "text",
      data: dynamicParts.map((part) => part.path),
      expr: createUnifiedExpression(expr, [])
    };
  }
  const hasStaticText = parts.some((part) => part.type === "static" && part.text.trim() !== "");
  const hasWhitespace = parts.some((part) => part.type === "static" && /\s/.test(part.text));
  if (hasStaticText || hasWhitespace) {
    const expr = parts.map((part) => {
      if (part.type === "static")
        return part.text;
      return `\${${ARGUMENTS_PREFIX}[0]}`;
    }).join("");
    return {
      type: "text",
      data: mainPath,
      expr: createUnifiedExpression(expr, [])
    };
  }
  return {
    type: "text",
    data: mainPath
  };
};
var splitText = (text) => {
  const parts = [];
  let currentIndex = 0;
  const varMatches = text.match(/\$\{[^}]+\}/g) || [];
  for (const varMatch of varMatches) {
    const varIndex = text.indexOf(varMatch, currentIndex);
    if (varIndex > currentIndex) {
      const staticPart = text.slice(currentIndex, varIndex);
      parts.push({ type: "static", text: staticPart });
    }
    parts.push({ type: "dynamic", text: varMatch });
    currentIndex = varIndex + varMatch.length;
  }
  if (currentIndex < text.length) {
    const staticPart = text.slice(currentIndex);
    parts.push({ type: "static", text: staticPart });
  }
  return parts;
};
var parseTemplateLiteral = (value, context = { pathStack: [], level: 0 }) => {
  if (!value.includes("${")) {
    return null;
  }
  const templateMatches = value.match(/\$\{([^}]+)\}/g) || [];
  if (templateMatches.length === 0) {
    return null;
  }
  const variables = [];
  templateMatches.forEach((match) => {
    const content = match.slice(2, -1);
    const stringLiterals = [];
    let protectedContent = content.replace(/"[^"]*"/g, (match2) => {
      stringLiterals.push(match2);
      return `__STRING_${stringLiterals.length - 1}__`;
    }).replace(/'[^']*'/g, (match2) => {
      stringLiterals.push(match2);
      return `__STRING_${stringLiterals.length - 1}__`;
    });
    const variableMatches = protectedContent.match(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g) || [];
    variableMatches.forEach((variable) => {
      if (variable.length > 1 && !variable.startsWith("__STRING_") && !variable.startsWith("STRING") && variable !== "true" && variable !== "false" && variable !== "null" && variable !== "undefined" && !variables.includes(variable) && !["div", "btn", "text", "bg", "theme", "static", "value", "mixed", "user"].includes(variable)) {
        variables.push(variable);
      }
    });
  });
  if (variables.length === 0) {
    return null;
  }
  const paths = variables.map((variable) => resolveDataPath(variable, context));
  let expr = value;
  variables.forEach((variable, index) => {
    expr = expr.replace(new RegExp(`\\$\\{([^}]*)\\b${variable.replace(/\./g, "\\.")}\\b([^}]*)\\}`, "g"), (match, before, after) => {
      return `\${${before}${ARGUMENTS_PREFIX}[${index}]${after}}`;
    });
  });
  expr = expr.replace(WHITESPACE_PATTERN, " ").trim();
  return {
    data: paths.length === 1 ? paths[0] || "" : paths,
    expr
  };
};
var createNodeDataMap = (node, context = { pathStack: [], level: 0 }) => {
  const mapData = parseMap(node.text, context);
  return {
    type: "map",
    data: Array.isArray(mapData.path) ? mapData.path[0] || "" : mapData.path,
    child: node.child ? node.child.map((child) => createNodeDataElement(child, mapData.context || context)) : []
  };
};
var createNodeDataCondition = (node, context = { pathStack: [], level: 0 }) => {
  const condData = parseCondition(node.text, context);
  const isSimpleCondition = !Array.isArray(condData.path) || condData.path.length === 1;
  const processedData = condData.path;
  const hasOperatorsOrMethods = condData.metadata?.expression && /[%+\-*/&&||===!===!=<>().]/.test(condData.metadata.expression);
  const needsExpression = !isSimpleCondition || hasOperatorsOrMethods;
  return {
    type: "cond",
    data: isSimpleCondition ? Array.isArray(processedData) ? processedData[0] || "" : processedData || "" : processedData || [],
    ...needsExpression && condData.metadata?.expression ? { expr: condData.metadata.expression } : {},
    true: createNodeDataElement(node.true, context),
    false: createNodeDataElement(node.false, context)
  };
};
var createNodeDataMeta = (node, context = { pathStack: [], level: 0 }) => {
  let result;
  if (node.tag.includes("${")) {
    const tagMatch = node.tag.match(/meta-(\${[^}]+})/);
    if (tagMatch && tagMatch[1]) {
      const dynamicTag = tagMatch[1];
      const variableMatch = dynamicTag.match(/\${([^}]+)}/);
      if (variableMatch && variableMatch[1]) {
        const variable = variableMatch[1];
        const dataPath = resolveDataPath(variable, context);
        if (dataPath) {
          result = {
            tag: {
              data: dataPath,
              expr: createUnifiedExpression(`meta-${dynamicTag}`, [variable])
            },
            type: "meta"
          };
        } else {
          result = {
            tag: node.tag,
            type: "meta"
          };
        }
      } else {
        result = {
          tag: node.tag,
          type: "meta"
        };
      }
    } else {
      result = {
        tag: node.tag,
        type: "meta"
      };
    }
  } else {
    result = {
      tag: node.tag,
      type: "meta"
    };
  }
  if (node.string) {
    result.string = processStringAttributes(node.string, context);
  }
  if (node.event) {
    const eventAttrs = processEventAttributes(node.event, context);
    if (Object.keys(eventAttrs).length > 0) {
      result.event = eventAttrs;
    }
  }
  if (node.array) {
    result.array = processArrayAttributes(node.array, context);
  }
  if (node.boolean) {
    result.boolean = processBooleanAttributes(node.boolean, context);
  }
  if (node.object) {
    result.object = processObjectAttributes(node.object, context);
  }
  if (node.child && node.child.length > 0) {
    result.child = node.child.map((child) => createNodeDataElement(child, context));
  }
  return result;
};
var createNodeDataElement = (node, context = { pathStack: [], level: 0 }) => {
  if (node.type === "map") {
    return createNodeDataMap(node, context);
  }
  if (node.type === "cond") {
    return createNodeDataCondition(node, context);
  }
  if (node.type === "text") {
    return parseText(node.text, context);
  }
  if (node.type === "el") {
    const result = {
      tag: node.tag,
      type: "el"
    };
    if (node.child) {
      result.child = node.child.map((child) => createNodeDataElement(child, context));
    }
    if (node.string) {
      result.string = processStringAttributes(node.string, context);
    }
    if (node.event) {
      const eventAttrs = processEventAttributes(node.event, context);
      if (Object.keys(eventAttrs).length > 0) {
        result.event = eventAttrs;
      }
    }
    if (node.array) {
      result.array = processArrayAttributes(node.array, context);
    }
    if (node.boolean) {
      result.boolean = processBooleanAttributes(node.boolean, context);
    }
    if (node.object) {
      result.object = processObjectAttributes(node.object, context);
    }
    return result;
  }
  if (node.type === "meta") {
    return createNodeDataMeta(node, context);
  }
  return node;
};
var enrichWithData = (hierarchy, context = { pathStack: [], level: 0 }) => {
  return hierarchy.map((node) => createNodeDataElement(node, context));
};

// index.ts
var parse = (render) => {
  const mainHtml = extractMainHtmlBlock(render);
  const elements = extractHtmlElements(mainHtml);
  const hierarchy = makeHierarchy(mainHtml, elements);
  const attributes = extractAttributes(hierarchy);
  const enrichedHierarchy = enrichWithData(attributes);
  return enrichedHierarchy;
};
export {
  parse
};
