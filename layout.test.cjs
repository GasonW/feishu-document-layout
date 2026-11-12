const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname+'/layout.js','utf8'),context);
const run=(fn,input)=>JSON.parse(JSON.stringify(context[fn](input)));

test('nested numbering resumes its parent and restarts siblings',()=>{
  const rows=run('listRows','1. A\n   1. B\n      1. C\n      2. D\n   2. E\n2. F');
  assert.deepEqual(rows.map(r=>r.label),['1.','a.','i.','ii.','b.','2.']);
});
test('quoted lists keep quote and list depth independently',()=>{
  const rows=run('listRows','> Summary\n>\n> - A\n>   - B\n>     - C\n>\n> 1. D\n>    1. E\n>       1. F');
  assert.deepEqual(rows.map(r=>r.label),['•','◦','▪','1.','a.','i.']);
  assert.deepEqual(rows.map(r=>r.quote),[1,1,1,1,1,1]);
});
test('frontmatter, code fences, and thematic breaks stay literal',()=>{
  assert.equal(run('listRows','---\n- yaml\n---\n```md\n- code\n```\n---\n> ```md\n> 1. code\n> ```\n- real').length,1);
  assert.deepEqual(run('headingRows','---\ntitle: example\n---\n```md\n# Code\n```\n# Real').map(r=>r.text),['Real']);
});
test('ordered headings number across repeated names and ancestor changes',()=>{
  const text='# 1. A\n## 1. Same\n### 1. Detail\n## 1. Same\n# 1. B\n## 1. Child';
  assert.deepEqual(run('headingRows',text).map(r=>r.label),['1.','1.1','1.1.1','1.2','2.','2.1']);
  assert.deepEqual(run('headingRows','# 1. Inserted\n'+text).map(r=>r.label),['1.','2.','2.1','2.1.1','2.2','3.','3.1']);
});
test('mixed heading styles share the ordered heading sequence',()=>{
  const text='# Plain\n# 1. A\n## 1. B\n### 1. C\n## Plain section\n### 1. D\n## 1. E\n# Plain chapter\n## 1. F\n# 1. G\n## 1. H';
  assert.deepEqual(run('headingRows',text).map(r=>r.label),['','1.','1.1','1.1.1','','1.1.2','1.2','','1.3','2.','2.1']);
});
test('ordered headings fill missing ancestors and honor the initial list value',()=>{
  assert.deepEqual(run('headingRows','## 1. A\n### 1. B\n# 1. C\n## 1. D').map(r=>r.label),['1.1','1.1.1','2.','2.1']);
  assert.deepEqual(run('headingRows','# 3. A\n## 4) B\n## 1. C\n# 1. D').map(r=>r.label),['3.','3.4','3.5','4.']);
});
test('ordered heading markers have precise editable ranges',()=>{
  const text='# 1. **A**\n## 1. B\n### 1.\n## 1.1 Fixed\n## 2025 年度目标\n# 1\\. Literal\n1. List\n---';
  const rows=run('headingRows',text);
  assert.deepEqual(rows.map(r=>r.label),['1.','1.1','1.1.1','','','']);
  assert.deepEqual(rows.filter(r=>r.marker).map(r=>text.slice(r.from,r.to)),['1. ','1. ','1.']);
  assert.deepEqual(run('headingRows','Title\n=====\nChild\n-----').map(r=>r.text),['Title','Child']);
});
test('a note can override the vault default in either direction',()=>{
  assert.equal(context.numberingEnabled('---\nheading-numbering: false\n---\n# A',true),false);
  assert.equal(context.numberingEnabled('---\nheading-numbering: true\n---\n# A',false),true);
  assert.equal(context.numberingEnabled('# A',true),true);
});
