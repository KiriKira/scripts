// Deliberate YAML subset: proxy lists, block/flow maps, scalars and scalar lists.
// No eval, dependencies, aliases, tags or general-purpose YAML execution.
function splitFlow(text, separator = ',') {
  const parts = [];
  let start = 0, quote = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i++; continue; }
      if (c === quote) {
        if (quote === "'" && text[i + 1] === "'") { i++; continue; }
        quote = '';
      }
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i)); start = i + 1;
    }
  }
  if (quote || depth !== 0) throw new Error('Invalid YAML flow value');
  parts.push(text.slice(start));
  return parts;
}
function uncomment(text) {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i++; continue; }
      if (c === quote) {
        if (quote === "'" && text[i + 1] === "'") { i++; continue; }
        quote = '';
      }
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trim();
  }
  return text.trim();
}
function scalar(raw) {
  const value = uncomment(raw);
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { throw new Error('Invalid YAML quoted scalar'); }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error('Invalid YAML quoted scalar');
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error('Invalid YAML list');
    return value === '[]' ? [] : splitFlow(value.slice(1, -1)).map(scalar);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^[&*!|>]/.test(value)) throw new Error('Unsupported YAML feature');
  return value;
}
function field(text, target) {
  const match = text.match(/^([^:]+):(?:\s+|$)(.*)$/);
  if (!match) throw new Error('Invalid YAML proxy field');
  const key = String(scalar(match[1].trim()));
  // Null prototype objects avoid YAML keys changing the object's prototype.
  target[key] = scalar(match[2]);
  return key;
}
function parseBlock(lines) {
  const result = Object.create(null);
  if (lines.length === 1 && lines[0].text.startsWith('{')) {
    const flow = lines[0].text;
    if (!flow.endsWith('}')) throw new Error('Invalid YAML proxy map');
    for (const entry of splitFlow(flow.slice(1, -1))) field(entry.trim(), result);
    return result;
  }
  const fieldIndent = Math.min(...lines.filter(line => line.text).map(line => line.indent));
  let listKey = '';
  for (const { text, indent } of lines) {
    if (!text) continue;
    if (indent === fieldIndent) {
      listKey = field(text, result);
    } else if (indent > fieldIndent && text.startsWith('- ') && listKey === 'alpn') {
      if (!Array.isArray(result[listKey])) result[listKey] = [];
      result[listKey].push(scalar(text.slice(2)));
    }
    // Other nested protocol options are outside the supported trojan/HY2 subset.
  }
  return result;
}
export function parseClash(input) {
  let text = String(input).replace(/^\uFEFF/, '');
  if (!/^proxies\s*:/m.test(text)) {
    try {
      const binary = atob(text.replace(/\s/g, ''));
      text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    } catch { throw new Error('Expected Clash YAML with a proxies section'); }
  }
  const proxies = [];
  let inSection = false, listIndent = null, current = [];
  const flush = () => {
    if (current.length) proxies.push(parseBlock(current));
    current = []; // Critical: the final item must never be flushed twice.
  };
  for (const raw of text.split(/\r?\n/)) {
    const content = uncomment(raw.trimStart());
    if (!content) continue;
    const indent = raw.length - raw.trimStart().length;
    if (!inSection) {
      if (/^proxies\s*:\s*(?:\[\])?$/.test(content) && indent === 0) {
        inSection = true;
        if (content.endsWith('[]')) break;
      }
      continue;
    }
    if (indent === 0 && !content.startsWith('-')) { flush(); break; }
    if (listIndent === null && /^-(?:\s|$)/.test(content)) listIndent = indent;
    if (indent === listIndent && /^-(?:\s|$)/.test(content)) {
      flush();
      const value = content.slice(1).trimStart();
      if (value) current.push({ text: value, indent: indent + 2 });
    } else if (listIndent !== null && indent > listIndent) {
      current.push({ text: content, indent });
    }
  }
  flush();
  return proxies;
}
