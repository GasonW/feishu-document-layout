// Image-only Markdown lines form rows. The original embed syntax stays portable.
function imageToken(text, start) {
  if (text.startsWith('![[', start)) {
    const end = text.indexOf(']]', start + 3);
    if (end < 0) return null;
    const parts = text.slice(start + 3, end).split('|');
    if (!/\.(?:avif|apng|bmp|gif|jpe?g|png|svg|webp)(?:[#?]|$)/i.test(parts[0])) return null;
    const size = parts.at(-1)?.match(/^(\d+)(?:x\d+)?$/);
    return {end:end + 2, target:parts[0], alt:size ? parts[0] : (parts[1] || parts[0]), width:size ? Number(size[1]) : null};
  }
  if (!text.startsWith('![', start)) return null;
  let i = start + 2;
  for (; i < text.length; i++) {
    if (text[i] === '\\') {i++;continue;}
    if (text[i] === ']') break;
  }
  if (text.slice(i, i + 2) !== '](') return null;
  const alt = text.slice(start + 2, i);
  const begin = i + 2;
  let depth = 1, quote = null, angle = false;
  for (i = begin; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {i++;continue;}
    if (quote) {if (ch === quote) quote = null;continue;}
    if (angle) {if (ch === '>') angle = false;continue;}
    if (ch === '<') {angle = true;continue;}
    if ((ch === '"' || ch === "'") && /\s/.test(text[i - 1])) {quote = ch;continue;}
    if (ch === '(') depth++;
    if (ch === ')' && --depth === 0) break;
  }
  if (depth !== 0) return null;
  const content = text.slice(begin, i).trim();
  const target = content.startsWith('<') ? content.slice(1, content.indexOf('>')) : content.replace(/\s+["'][\s\S]*["']$/, '');
  if (!target || /^(?:javascript|data|file):/i.test(target)) return null;
  return {end:i + 1, target:target.replace(/\\([()\s])/g, '$1'), alt, width:null};
}

function imageRows(text) {
  const rows = [];
  let start = 0, fence = null, yaml = false, htmlComment = false;
  const lines = text.split('\n');
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line], content = raw.replace(/\r$/, ''), from = start;
    start += raw.length + 1;
    if (line === 0 && content === '---') {yaml = true;continue;}
    if (yaml) {if (/^(---|\.\.\.)\s*$/.test(content)) yaml = false;continue;}
    const code = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {if (code && code[1][0] === fence[0] && code[1].length >= fence.length) fence = null;continue;}
    if (code) {fence = code[1];continue;}
    if (htmlComment) {if (content.includes('-->')) htmlComment = false;continue;}
    if (/^\s*<!--/.test(content)) {htmlComment = !content.includes('-->');continue;}
    if (/^\s/.test(content)) continue;
    let pos = 0;
    const images = [];
    while (pos < content.length) {
      const begin = pos, image = imageToken(content, pos);
      if (!image) break;
      const token = content.slice(begin, image.end);
      pos = image.end;
      let meta = null;
      const marker = content.slice(pos).match(/^\s*<!-- fdl-image (.*?) -->/);
      if (marker) {
        try {meta = JSON.parse(marker[1]);} catch {break;}
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) break;
        pos += marker[0].length;
      }
      images.push({...image, token, meta, raw:content.slice(begin, pos)});
      pos += content.slice(pos).match(/^\s*/)[0].length;
    }
    if (images.length && pos === content.length) rows.push({line:line + 1, from, to:from + content.length, raw:content, images});
  }
  return rows;
}

function imageIdentity(row, index) {
  return {id:row.images[index].meta?.id, from:row.from, raw:row.raw, index};
}

function findImage(rows, ref) {
  if (ref.id) {
    const matches = rows.flatMap(row=>row.images.flatMap((image,index)=>image.meta?.id === ref.id ? [{row,image,index}] : []));
    return matches.length === 1 ? matches[0] : null;
  }
  const matches = rows.filter(row=>row.raw === ref.raw);
  const row = matches.find(row=>row.from === ref.from) || (matches.length === 1 ? matches[0] : null);
  return row?.images[ref.index] ? {row,image:row.images[ref.index],index:ref.index} : null;
}

function serializeImage(image, meta = image.meta) {
  if (!meta) return image.token;
  const json = JSON.stringify(meta).replace(/[<>&]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return image.token + ' <!-- fdl-image ' + json + ' -->';
}

function replaceImageMetadata(text, ref, update) {
  const found = findImage(imageRows(text), ref);
  if (!found) throw new Error('图片位置已变化，请重新选择图片。');
  const {row,image,index} = found;
  const meta = update({...image.meta});
  const replacement = row.images.map((item,i)=>i === index ? serializeImage(item,meta) : item.raw).join(' ');
  return {from:row.from,to:row.to,insert:replacement,meta};
}

function moveImage(text, source, target, side) {
  const rows = imageRows(text), a = findImage(rows,source), b = findImage(rows,target);
  if (!a || !b) throw new Error('图片位置已变化，请重新拖动。');
  if (a.row === b.row && a.index === b.index) return [];
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const inline = side === 'left' || side === 'right';
  const items = a.row.images.filter((_,i)=>i !== a.index).map(i=>i.raw);
  if (a.row === b.row) {
    if (inline) items.splice(b.index - (a.index < b.index ? 1 : 0) + (side === 'right' ? 1 : 0),0,a.image.raw);
    const insert = inline ? items.join(' ') : side === 'top' ? a.image.raw + newline + newline + items.join(' ') : items.join(' ') + newline + newline + a.image.raw;
    return [{from:a.row.from,to:a.row.to,insert}];
  }
  const dest = b.row.images.map(i=>i.raw);
  if (inline) dest.splice(b.index + (side === 'right' ? 1 : 0),0,a.image.raw);
  const insert = inline ? dest.join(' ') : side === 'top' ? a.image.raw + newline + newline + b.row.raw : b.row.raw + newline + newline + a.image.raw;
  return [{from:a.row.from,to:a.row.to,insert:items.join(' ')},{from:b.row.from,to:b.row.to,insert}].sort((x,y)=>x.from-y.from);
}

function applyImageChanges(text, changes) {
  for (const c of [...changes].sort((a,b)=>b.from-a.from)) text = text.slice(0,c.from) + c.insert + text.slice(c.to);
  return text;
}
