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
test('headings number across repeated names and ancestor changes',()=>{
  const text='# A\n## Same\n### Detail\n## Same\n# B\n## Child';
  assert.deepEqual(run('headingRows',text).map(r=>r.label),['1.','1.1','1.1.1','1.2','2.','2.1']);
  assert.deepEqual(run('headingRows','# Inserted\n'+text).map(r=>r.label),['1.','2.','2.1','2.1.1','2.2','3.','3.1']);
});
test('missing heading levels use existing ancestors and manual numbers remain intact',()=>{
  assert.deepEqual(run('headingRows','## A\n### B\n## C').map(r=>r.label),['1.','1.1','2.']);
  assert.deepEqual(run('headingRows','# 1. Existing\n## 2025 年度目标\n### 1.1.1 Manual').map(r=>r.label),['','1.1','']);
  assert.deepEqual(run('headingRows','Title\n=====\nChild\n-----').map(r=>r.label),['1.','1.1']);
});
test('a note can override the vault default in either direction',()=>{
  assert.equal(context.numberingEnabled('---\nheading-numbering: false\n---\n# A',true),false);
  assert.equal(context.numberingEnabled('---\nheading-numbering: true\n---\n# A',false),true);
  assert.equal(context.numberingEnabled('# A',true),true);
});
