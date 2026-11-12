function columns(text) {
  let n = 0;
  for (const c of text) n += c === '\t' ? 4 - n % 4 : 1;
  return n;
}
function alpha(n) {
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(97 + n % 26) + out; n = Math.floor(n / 26); }
  return out;
}
function roman(n) {
  if (n < 1 || n > 3999) return String(n);
  let out = '';
  for (const [v, label] of [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']]) {
    while (n >= v) { out += label; n -= v; }
  }
  return out;
}
function listRows(text) {
  const rows = [];
  let offset = 0, stack = [], fence = null, frontmatter = false, quoteDepth = 0;
  for (const [index, raw] of text.split('\n').entries()) {
    const lineStart = offset; offset += raw.length + 1;
    if (index === 0 && raw.trim() === '---') { frontmatter = true; continue; }
    if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(raw)) frontmatter = false; continue; }
    const quote = raw.match(/^(?:[ \t]*>[ \t]?)+/);
    const prefix = quote ? quote[0].length : 0;
    const q = quote ? (quote[0].match(/>/g) || []).length : 0;
    const line = raw.slice(prefix), indent = columns((line.match(/^[ \t]*/) || [''])[0]);
    const code = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (fence) { if (code && code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; continue; }
    if (code) { fence = code[1]; continue; }
    if (q !== quoteDepth) { stack = []; quoteDepth = q; }
    const match = line.match(/^([ \t]*)(?:(\d+)([.)])|([-+*]))([ \t]+)(.*)$/);
    if (!match || /^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      if (line.trim() && (!stack.length || indent < stack[stack.length-1].contentIndent)) stack = [];
      continue;
    }
    if (!stack.length && indent >= 4) continue;
    while (stack.length && indent < stack[stack.length-1].indent) stack.pop();
    if (stack.length && indent > stack[stack.length-1].indent && indent < stack[stack.length-1].contentIndent) continue;
    const ordered = match[2] !== undefined;
    const kind = ordered ? match[3] : match[4];
    if (!stack.length || indent > stack[stack.length-1].indent) {
      stack.push({indent,contentIndent:indent,kind,count:ordered ? Number(match[2])-1 : 0});
    } else if (kind !== stack[stack.length-1].kind) {
      stack[stack.length-1] = {indent,contentIndent:indent,kind,count:ordered ? Number(match[2])-1 : 0};
    }
    const state = stack[stack.length-1], marker = ordered ? match[2]+match[3] : match[4];
    state.contentIndent = indent + marker.length + columns(match[5]);
    state.count++;
    const depth = stack.length-1, style = depth % 3;
    const label = ordered ? (style === 0 ? String(state.count) : style === 1 ? alpha(state.count) : roman(state.count)) + '.' : ['•','◦','▪'][style];
    const task = /^\[[^\]]\](?:\s|$)/.test(match[6]);
    rows.push({line:index+1,start:lineStart,from:lineStart+prefix+match[1].length,to:lineStart+prefix+match[1].length+marker.length,depth,label,ordered,task,quote:q,prefix:lineStart+prefix});
    const nestedFence = match[6].match(/^(`{3,}|~{3,})/);
    if (nestedFence) fence = nestedFence[1];
  }
  return rows;
}

function numberedHeadings(headings) {
  const counts = [];
  return headings.map(heading => {
    const marker = heading.level <= 3 && heading.text.match(/^(\d{1,9})[.)](?:[ \t]+|$)/);
    if (!marker) return {...heading, label: '', marker: ''};
    const depth = heading.level - 1;
    for (let i = 0; i < depth; i++) if (counts[i] === undefined) counts[i] = 1;
    counts[depth] = counts[depth] === undefined ? Number(marker[1]) : counts[depth] + 1;
    counts.length = heading.level;
    const label = counts.join('.') + (heading.level === 1 ? '.' : '');
    return {...heading, label, marker: marker[0], to: heading.from + marker[0].length};
  });
}

function headingRows(text) {
  let offset = 0, fence = null, frontmatter = false;
  const headings = [], lines = text.split('\n');
  for (let index=0;index<lines.length;index++) {
    const raw=lines[index], start=offset;offset+=raw.length+1;
    if (index===0 && raw.trim()==='---') {frontmatter=true;continue;}
    if(frontmatter){if(/^(---|\.\.\.)\s*$/.test(raw))frontmatter=false;continue;}
    const code=raw.match(/^ {0,3}(`{3,}|~{3,})/);
    if(fence){if(code && code[1][0]===fence[0] && code[1].length>=fence.length)fence=null;continue;}
    if(code){fence=code[1];continue;}
    const atx=raw.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/);
    if(atx){
      const content=atx[2]||'';
      headings.push({line:index+1,start,from:start+raw.length-content.length,level:atx[1].length,text:content.replace(/[ \t]+#+[ \t]*$/,'')});
    } else if(raw.trim() && !/^(?: {4}|\t|\s*[-+*>#]| {0,3}\d{1,9}[.)]\s)/.test(raw) && /^ {0,3}(=+|-+)\s*$/.test(lines[index+1]||'')) {
      headings.push({line:index+1,start,from:start,level:lines[index+1].trim()[0]==='='?1:2,text:raw.trim()});
      offset+=lines[++index].length+1;
    }
  }
  return numberedHeadings(headings);
}

function numberingEnabled(text, defaultValue) {
  const frontmatter=text.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/)?.[1];
  const override=frontmatter?.match(/^heading-numbering:\s*(true|false)\s*(?:#.*)?$/m)?.[1];
  return override===undefined?defaultValue:override==='true';
}
