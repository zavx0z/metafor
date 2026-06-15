import {extendGrammar, insertBefore, type PatternDefinition, type PatternGrammar} from "./pattern-engine.ts"

const clikeGrammar: PatternGrammar = {
  "comment": [
    {pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/, lookbehind: true, greedy: true},
    {pattern: /(^|[^\\:])\/\/.*/, lookbehind: true, greedy: true},
  ],
  "string": {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    greedy: true,
  },
  "class-name": {
    pattern: /(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,
    lookbehind: true,
    inside: {
      "punctuation": /[.\\]/,
    },
  },
  "keyword": /\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,
  "boolean": /\b(?:false|true)\b/,
  "function": /\b\w+(?=\()/,
  "number": /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
  "operator": /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
  "punctuation": /[{}[\];(),.:]/,
}

const javascriptGrammar = extendGrammar(clikeGrammar, {
  "class-name": [
    clikeGrammar["class-name"] as PatternDefinition,
    {
      pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,
      lookbehind: true,
    },
  ],
  "keyword": [
    {
      pattern: /((?:^|\})\s*)catch\b/,
      lookbehind: true,
    },
    {
      pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
      lookbehind: true,
    },
  ],
  "function": /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  "number": {
    pattern: /(^|[^\w$])(?:NaN|Infinity|0[bB][01]+(?:_[01]+)*n?|0[oO][0-7]+(?:_[0-7]+)*n?|0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?|\d+(?:_\d+)*n|(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?)(?![\w$])/,
    lookbehind: true,
  },
  "operator": /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/,
})

const className = javascriptGrammar["class-name"]
if (Array.isArray(className)) {
  const first = className[0]
  if (typeof first !== "undefined" && !(first instanceof RegExp) && "pattern" in first) {
    first.pattern = /(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/
  }
}

insertBefore(javascriptGrammar, "keyword", {
  "regex": {
    pattern: /((?:^|[=(:,!?\[{};\n]|(?:\b(?:return|yield)))\s*)\/(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyusv]{0,8}/,
    lookbehind: true,
    greedy: true,
  },
  "function-variable": {
    pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
    alias: "function",
  },
  "parameter": [
    {
      pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
      lookbehind: true,
    },
    {
      pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
      lookbehind: true,
    },
    {
      pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
      lookbehind: true,
    },
  ],
  "constant": /\b[A-Z](?:[A-Z_]|\dx?)*\b/,
})

insertBefore(javascriptGrammar, "string", {
  "hashbang": {
    pattern: /^#!.*/,
    greedy: true,
    alias: "comment",
  },
  "template-string": {
    pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
    greedy: true,
  },
  "string-property": {
    pattern: /((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,
    lookbehind: true,
    greedy: true,
    alias: "property",
  },
})

insertBefore(javascriptGrammar, "operator", {
  "literal-property": {
    pattern: /((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,
    lookbehind: true,
    alias: "property",
  },
})

const typescriptGrammar = extendGrammar(javascriptGrammar, {
  "class-name": {
    pattern: /(\b(?:class|extends|implements|instanceof|interface|new|type)\s+)(?!keyof\b)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?:\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?/,
    lookbehind: true,
    greedy: true,
    inside: null,
  },
  "builtin": /\b(?:Array|Function|Promise|any|boolean|console|never|number|string|symbol|unknown)\b/,
})

insertBefore(typescriptGrammar, "builtin", {
  "primitive-type": /\b(?:any|boolean|never|number|string|symbol|unknown)\b/,
})

const tsKeyword = typescriptGrammar["keyword"]
if (Array.isArray(tsKeyword)) {
  tsKeyword.push(
    /\b(?:abstract|declare|is|keyof|readonly|require)\b/,
    /\b(?:asserts|infer|interface|module|namespace|type)\b(?=\s*(?:[{_$a-zA-Z\xA0-\uFFFF]|$))/,
    /\btype\b(?=\s*(?:[\{*]|$))/,
  )
}
delete typescriptGrammar["parameter"]
delete typescriptGrammar["literal-property"]

const typeInside = extendGrammar(typescriptGrammar, {})
delete typeInside["class-name"]
;(typescriptGrammar["class-name"] as {inside: PatternGrammar | null}).inside = typeInside

insertBefore(typescriptGrammar, "function", {
  "decorator": {
    pattern: /@[$\w\xA0-\uFFFF]+/,
    inside: {
      "at": {
        pattern: /^@/,
        alias: "operator",
      },
      "function": /^[\s\S]+/,
    },
  },
  "generic-function": {
    pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>(?=\s*\()/,
    greedy: true,
    inside: {
      "function": /^#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*/,
      "generic": {
        pattern: /<[\s\S]+/,
        alias: "class-name",
        inside: typeInside,
      },
    },
  },
})

const xmlGrammar: PatternGrammar = {
  "comment": {
    pattern: /<!--(?:(?!<!--)[\s\S])*?-->/,
    greedy: true,
  },
  "prolog": {
    pattern: /<\?[\s\S]+?\?>/,
    greedy: true,
  },
  "doctype": {
    pattern: /<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,
    greedy: true,
    inside: {
      "internal-subset": {
        pattern: /(^[^\[]*\[)[\s\S]+(?=\]>$)/,
        lookbehind: true,
        greedy: true,
      },
      "string": {
        pattern: /"[^"]*"|'[^']*'/,
        greedy: true,
      },
      "punctuation": /^<!|>$|[[\]]/,
      "doctype-tag": /^DOCTYPE/i,
      "name": /[^\s<>'"]+/,
    },
  },
  "cdata": {
    pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
    greedy: true,
  },
  "tag": {
    pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
    greedy: true,
    inside: {
      "tag": {
        pattern: /^<\/?[^\s>\/]+/,
        inside: {
          "tag-punctuation": /^<\/?/,
          "namespace": /^[^\s>\/:]+:/,
        },
      },
      "attr-value": {
        pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
        inside: {
          "string": {
            pattern: /(=\s*)("[^"]*"|'[^']*'|[^\s'">=]+)/,
            lookbehind: true,
          },
          "punctuation": [
            {
              pattern: /^=/,
              alias: "attr-equals",
            },
            {
              pattern: /^(\s*)["']|["']$/,
              lookbehind: true,
            },
          ],
        },
      },
      "tag-punctuation": /\/?>/,
      "attr-name": {
        pattern: /[^\s>\/]+/,
        inside: {
          "namespace": /^[^\s>\/:]+:/,
        },
      },
    },
  },
  "entity": [
    {
      pattern: /&[\da-z]{1,8};/i,
      alias: "named-entity",
    },
    /&#x?[\da-f]{1,8};/i,
  ],
}

const htmlGrammar = extendGrammar(xmlGrammar, {})

const cssString = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/

const cssGrammar: PatternGrammar = {
  "comment": /\/\*[\s\S]*?\*\//,
  "atrule": {
    pattern: RegExp(`@[\\w-](?:${/[^;{\s"']|\s+(?!\s)/.source}|${cssString.source})*?(?:;|(?=\\s*\\{))`),
    inside: {
      "rule": /^@[\w-]+/,
      "selector-function-argument": {
        pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
        lookbehind: true,
        alias: "selector",
      },
      "keyword": {
        pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
        lookbehind: true,
      },
      "string": cssString,
      "punctuation": /[(){};:,]/,
    },
  },
  "url": {
    pattern: RegExp(`\\burl\\((?:${cssString.source}|${/(?:[^\\\r\n()"']|\\[\s\S])*/.source})\\)`, "i"),
    greedy: true,
    inside: {
      "function": /^url/i,
      "punctuation": /^\(|\)$/,
      "string": {
        pattern: RegExp(`^${cssString.source}$`),
        alias: "url",
      },
    },
  },
  "selector": {
    pattern: RegExp(`(^|[{}\\s])[^{}\\s](?:[^{};"'\\s]|\\s+(?![\\s{])|${cssString.source})*(?=\\s*\\{)`),
    lookbehind: true,
  },
  "string": {
    pattern: cssString,
    greedy: true,
  },
  "hex-color": /#[\da-f]{3,8}\b/i,
  "number": /\b\d+(?:\.\d+)?(?:%|[a-z]+)?\b/i,
  "property": {
    pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
    lookbehind: true,
  },
  "keyword": /\b(?:absolute|auto|block|center|fixed|flex|grid|inherit|initial|inline|none|relative|solid|sticky|unset)\b/i,
  "important": /!important\b/i,
  "function": {
    pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
    lookbehind: true,
  },
  "punctuation": /[(){};:,]/,
}

const jsonString = /"(?:\\(?:["\\/bfnrt]|u[\dA-Fa-f]{4}|[\s\S])|[^"\\\r\n])*"/

const jsonGrammar: PatternGrammar = {
  "property": {
    pattern: RegExp(`${jsonString.source}(?=\\s*:)`),
    greedy: true,
  },
  "string": {
    pattern: jsonString,
    greedy: true,
  },
  "number": /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?/,
  "boolean": /\b(?:false|true)\b/,
  "keyword": /\bnull\b/,
  "punctuation": /[{}[\],:]/,
}

insertBefore(htmlGrammar, "cdata", {
  "style": {
    pattern: /(<style\b[^>]*>)[\s\S]*?(?=<\/style>)/i,
    lookbehind: true,
    greedy: true,
    inside: cssGrammar,
  },
  "script": {
    pattern: /(<script\b[^>]*>)[\s\S]*?(?=<\/script>)/i,
    lookbehind: true,
    greedy: true,
    inside: typescriptGrammar,
  },
  "inline-template": /{{[\s\S]*?}}/,
})

const sqlGrammar: PatternGrammar = {
  "comment": {
    pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\/\/|#).*)/,
    lookbehind: true,
  },
  "variable": [
    {
      pattern: /@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/,
      greedy: true,
    },
    /@[\w.$]+/,
  ],
  "string": {
    pattern: /(^|[^@\\])("|')(?:\\[\s\S]|(?!\2)[^\\]|\2\2)*\2/,
    greedy: true,
    lookbehind: true,
  },
  "identifier": {
    pattern: /(^|[^@\\])`(?:\\[\s\S]|[^`\\]|``)*`/,
    greedy: true,
    lookbehind: true,
    inside: {
      "punctuation": /^`|`$/,
    },
  },
  "function": /\b(?:AVG|COUNT|FIRST|FORMAT|LAST|LCASE|LEN|MAX|MID|MIN|MOD|NOW|ROUND|SUM|UCASE)(?=\s*\()/i,
  "keyword": /\b(?:ACTION|ADD|AFTER|ALGORITHM|ALL|ALTER|ANALYZE|ANY|APPLY|AS|ASC|AUTHORIZATION|AUTO_INCREMENT|BACKUP|BDB|BEGIN|BERKELEYDB|BIGINT|BINARY|BIT|BLOB|BOOL|BOOLEAN|BREAK|BROWSE|BTREE|BULK|BY|CALL|CASCADED?|CASE|CHAIN|CHAR(?:ACTER|SET)?|CHECK(?:POINT)?|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMNS?|COMMENT|COMMIT(?:TED)?|COMPUTE|CONNECT|CONSISTENT|CONSTRAINT|CONTAINS(?:TABLE)?|CONTINUE|CONVERT|CREATE|CROSS|CURRENT(?:_DATE|_TIME|_TIMESTAMP|_USER)?|CURSOR|CYCLE|DATA(?:BASES?)?|DATE(?:TIME)?|DAY|DBCC|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFINER|DELAYED|DELETE|DELIMITERS?|DENY|DESC|DESCRIBE|DETERMINISTIC|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DISTRIBUTED|DO|DOUBLE|DROP|DUMMY|DUMP(?:FILE)?|DUPLICATE|ELSE(?:IF)?|ENABLE|ENCLOSED|END|ENGINE|ENUM|ERRLVL|ERRORS|ESCAPED?|EXCEPT|EXEC(?:UTE)?|EXISTS|EXIT|EXPLAIN|EXTENDED|FETCH|FIELDS|FILE|FILLFACTOR|FIRST|FIXED|FLOAT|FOLLOWING|FOR(?: EACH ROW)?|FORCE|FOREIGN|FREETEXT(?:TABLE)?|FROM|FULL|FUNCTION|GEOMETRY(?:COLLECTION)?|GLOBAL|GOTO|GRANT|GROUP|HANDLER|HASH|HAVING|HOLDLOCK|HOUR|IDENTITY(?:COL|_INSERT)?|IF|IGNORE|IMPORT|INDEX|INFILE|INNER|INNODB|INOUT|INSERT|INT|INTEGER|INTERSECT|INTERVAL|INTO|INVOKER|ISOLATION|ITERATE|JOIN|KEYS?|KILL|LANGUAGE|LAST|LEAVE|LEFT|LEVEL|LIMIT|LINENO|LINES|LINESTRING|LOAD|LOCAL|LOCK|LONG(?:BLOB|TEXT)|LOOP|MATCH(?:ED)?|MEDIUM(?:BLOB|INT|TEXT)|MERGE|MIDDLEINT|MINUTE|MODE|MODIFIES|MODIFY|MONTH|MULTI(?:LINESTRING|POINT|POLYGON)|NATIONAL|NATURAL|NCHAR|NEXT|NO|NONCLUSTERED|NULLIF|NUMERIC|OFF?|OFFSETS?|ON|OPEN(?:DATASOURCE|QUERY|ROWSET)?|OPTIMIZE|OPTION(?:ALLY)?|ORDER|OUT(?:ER|FILE)?|OVER|PARTIAL|PARTITION|PERCENT|PIVOT|PLAN|POINT|POLYGON|PRECEDING|PRECISION|PREPARE|PREV|PRIMARY|PRINT|PRIVILEGES|PROC(?:EDURE)?|PUBLIC|PURGE|QUICK|RAISERROR|READS?|REAL|RECONFIGURE|REFERENCES|RELEASE|RENAME|REPEAT(?:ABLE)?|REPLACE|REPLICATION|REQUIRE|RESIGNAL|RESTORE|RESTRICT|RETURN(?:ING|S)?|REVOKE|RIGHT|ROLLBACK|ROUTINE|ROW(?:COUNT|GUIDCOL|S)?|RTREE|RULE|SAVE(?:POINT)?|SCHEMA|SECOND|SELECT|SERIAL(?:IZABLE)?|SESSION(?:_USER)?|SET(?:USER)?|SHARE|SHOW|SHUTDOWN|SIMPLE|SMALLINT|SNAPSHOT|SOME|SONAME|SQL|START(?:ING)?|STATISTICS|STATUS|STRIPED|SYSTEM_USER|TABLES?|TABLESPACE|TEMP(?:ORARY|TABLE)?|TERMINATED|TEXT(?:SIZE)?|THEN|TIME(?:STAMP)?|TINY(?:BLOB|INT|TEXT)|TOP?|TRAN(?:SACTIONS?)?|TRIGGER|TRUNCATE|TSEQUAL|TYPES?|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNION|UNIQUE|UNLOCK|UNPIVOT|UNSIGNED|UPDATE(?:TEXT)?|USAGE|USE|USER|USING|VALUES?|VAR(?:BINARY|CHAR|CHARACTER|YING)|VIEW|WAITFOR|WARNINGS|WHEN|WHERE|WHILE|WITH(?: ROLLUP|IN)?|WORK|WRITE(?:TEXT)?|YEAR)\b/i,
  "boolean": /\b(?:FALSE|NULL|TRUE)\b/i,
  "number": /\b0x[\da-f]+\b|\b\d+(?:\.\d*)?|\B\.\d+\b/i,
  "operator": /[-+*\/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?|\b(?:AND|BETWEEN|DIV|ILIKE|IN|IS|LIKE|NOT|OR|REGEXP|RLIKE|SOUNDS LIKE|XOR)\b/i,
  "punctuation": /[;[\]()`,.]/,
}

export type PatternLanguageId = "typescript" | "javascript" | "markup" | "xml" | "css" | "json" | "sql"

export const patternLanguages: Record<PatternLanguageId, PatternGrammar> = {
  typescript: typescriptGrammar,
  javascript: javascriptGrammar,
  markup: htmlGrammar,
  xml: xmlGrammar,
  css: cssGrammar,
  json: jsonGrammar,
  sql: sqlGrammar,
}
