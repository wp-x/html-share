'use strict';

/**
 * RFC 4180 CSV 解析器（无依赖）。
 * 支持引号包裹字段、`""` 双引号转义、\r\n / \n / \r 行分隔。
 * 语法错误（未闭合引号、引号后出现非法字符）抛出 Error。
 * 返回行数组，每行是字符串数组；空输入返回 []。
 */
function parseCsv(input) {
  let text = String(input);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8 BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false; // 当前字段是否已有内容或引号（区分 "a," 尾空字段与行尾）
  let afterQuote = false; // 引号字段刚闭合，之后只允许分隔符 / 行尾 / EOF
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        afterQuote = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (fieldStarted) {
        throw new Error(`第 ${rows.length + 1} 行：引号出现在字段中间`);
      }
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      i += 1;
      continue;
    }
    if (afterQuote) {
      throw new Error(`第 ${rows.length + 1} 行：引号闭合后出现非法字符`);
    }
    field += ch;
    fieldStarted = true;
    i += 1;
  }

  if (inQuotes) {
    throw new Error(`第 ${rows.length + 1} 行：存在未闭合的引号`);
  }
  // 文件以行分隔符结尾时不产生多余的空行
  if (fieldStarted || row.length > 0) {
    endRow();
  }
  return rows;
}

module.exports = { parseCsv };
