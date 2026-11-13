const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname+'/images.js','utf8'),ctx);
const rows=text=>ctx.imageRows(text);
const ref=(text,row,index=0)=>ctx.imageIdentity(rows(text)[row],index);
const move=(text,a,b,side)=>ctx.applyImageChanges(text,ctx.moveImage(text,a,b,side));

test('image rows preserve wiki sizes, encoded paths and Markdown titles',()=>{
  const text='![[Folder/My image.png|320]] ![B](<Folder/other image.png> "title") ![C](photo(2).png)';
  const found=rows(text)[0].images;
  assert.equal(found.length,3);
  assert.equal(found[0].width,320);
  assert.equal(found[1].target,'Folder/other image.png');
  assert.equal(found[2].target,'photo(2).png');
  assert.equal(found.map(i=>i.raw).join(' '),text);
});
test('dragging joins and reorders images while preserving surrounding prose',()=>{
  const text='# Sample\n\n![[a.png]]\n\nParagraph stays here.\n\n![B](b.png)\n\nTail';
  const joined=move(text,ref(text,1),ref(text,0),'right');
  assert.equal(joined,'# Sample\n\n![[a.png]] ![B](b.png)\n\nParagraph stays here.\n\n\n\nTail');
  const reordered=move(joined,ref(joined,0,1),ref(joined,0),'left');
  assert.equal(rows(reordered)[0].images[0].target,'b.png');
  assert.equal(rows(reordered)[0].images.length,2);
});
test('three images can split into a new row and join again',()=>{
  const text='![[a.png]] ![[b.png]] ![[c.png]]';
  const split=move(text,ref(text,0,1),ref(text,0),'bottom');
  assert.equal(split,'![[a.png]] ![[c.png]]\n\n![[b.png]]');
  assert.equal(move(split,ref(split,1),ref(split,0,1),'left'),text+'\n\n');
});
test('captions travel with their image and round-trip special text safely',()=>{
  let text='![[a.png]]\n\n![[b.png]]';
  const caption='第一行\n第二行 <script> & --> 图片说明';
  const changed=ctx.replaceImageMetadata(text,ref(text,1),()=>({id:'image-b',caption}));
  text=ctx.applyImageChanges(text,[changed]);
  assert.equal(rows(text)[1].images[0].meta.caption,caption);
  const joined=move(text,ref(text,1),ref(text,0),'left');
  assert.equal(rows(joined)[0].images[0].meta.caption,caption);
  assert.equal(ctx.findImage(rows(joined),{id:'image-b'}).image.target,'b.png');
  assert.ok(!rows(joined)[0].images[0].raw.includes('<script>'));
});
test('duplicate embeds receive separate captions and stale identities stop safely',()=>{
  const text='![[same.png]] ![[same.png]]';
  const change=ctx.replaceImageMetadata(text,ref(text,0,1),()=>({id:'second',caption:'Second occurrence'}));
  const after=ctx.applyImageChanges(text,[change]);
  assert.equal(rows(after)[0].images[0].meta,null);
  assert.equal(rows(after)[0].images[1].meta.caption,'Second occurrence');
  assert.throws(()=>ctx.replaceImageMetadata('![[different.png]]',ref(text,0),()=>({caption:'wrong'})),/图片位置/);
});
test('code, frontmatter, inline prose and other embeds use their native renderer',()=>{
  const text='---\ncover: a.png\n---\n```md\n![[a.png]]\n```\n    ![[b.png]]\nText ![[c.png]]\n> ![[d.png]]\n- Item\n  ![[nested.png]]\n![[note.md]]\n![[file.pdf]]\n<!--\n![[hidden.png]]\n-->\n![[real.png]]';
  assert.equal(rows(text).length,1);
  assert.equal(rows(text)[0].images[0].target,'real.png');
});
test('CRLF notes retain their line endings when splitting images',()=>{
  const text='# Title\r\n\r\n![[a.png]] ![[b.png]]\r\n\r\nEnd';
  const after=move(text,ref(text,0,1),ref(text,0),'bottom');
  assert.equal(after,'# Title\r\n\r\n![[a.png]]\r\n\r\n![[b.png]]\r\n\r\nEnd');
});
