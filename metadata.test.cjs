const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture(initial={},body='# Note\n\nKeep this text.\n') {
  const notices=[],events={},ready=[],cleanups=[];
  class TFile {constructor(){this.extension='md';this.basename='Note';this.stat={ctime:new Date(2024,1,3,4,5,6).getTime()};}}
  const file=new TFile();
  const info=text=>{
    const match=text.match(/^---\n([\s\S]*?)\n---\n/);
    return {exists:!!match,frontmatter:match?.[1]||''};
  };
  let text=initial===null?body:'---\n'+JSON.stringify(initial)+'\n---\n'+body,writes=0;
  const app={
    workspace:{onLayoutReady:fn=>ready.push(fn),getActiveViewOfType:()=>({file})},
    vault:{read:async()=>text,getMarkdownFiles:()=>[file],on:(event,fn)=>{events[event]=fn;return fn;}},
    fileManager:{processFrontMatter:async(file,fn)=>{
      const header=info(text),metadata=header.exists?JSON.parse(header.frontmatter):{};
      fn(metadata);writes++;
      text='---\n'+JSON.stringify(metadata)+'\n---\n'+(header.exists?text.replace(/^---\n[\s\S]*?\n---\n/,''):text);
    }}
  };
  const plugin={app,recordCreationTime:true,register:fn=>cleanups.push(fn),registerEvent:()=>{},addCommand:()=>{}};
  const context=vm.createContext({TFile,MarkdownView:class {},Notice:class {constructor(text){notices.push(text);}setMessage(){}hide(){}},getFrontMatterInfo:info,parseYaml:JSON.parse});
  vm.runInContext(fs.readFileSync(__dirname+'/metadata.js','utf8'),context);
  const Metadata=vm.runInContext('CreationMetadata',context),service=new Metadata(plugin);
  return {service,plugin,app,file,events,ready,cleanups,notices,get text(){return text;},get writes(){return writes;},set text(value){text=value;}};
}

test('adds local file creation time while retaining properties and note content',async()=>{
  const f=fixture({title:'标题',tags:['notes']});
  assert.equal(await f.service.add(f.file),'added');
  assert.match(f.text,/"created":"2024-02-03T04:05:06"/);
  assert.match(f.text,/"title":"标题","tags":\["notes"\]/);
  assert.ok(f.text.endsWith('# Note\n\nKeep this text.\n'));
  assert.equal(await f.service.add(f.file),'existing');
  assert.equal(f.writes,1);
});
test('preserves any existing created property, including an intentional empty value',async()=>{
  for(const created of ['2020-01-02T03:04:05','',null,0,false]) {
    const f=fixture({created}),before=f.text;
    assert.equal(await f.service.add(f.file),'existing');
    assert.equal(f.text,before);
    assert.equal(f.writes,0);
  }
});
test('adds frontmatter to a plain note and coalesces concurrent requests',async()=>{
  const f=fixture(null);
  await Promise.all([f.service.add(f.file),f.service.add(f.file)]);
  assert.equal(f.writes,1);
  assert.ok(f.text.startsWith('---\n'));
  assert.ok(f.text.endsWith('# Note\n\nKeep this text.\n'));
});
test('keeps a property inserted by another writer before the atomic update',async()=>{
  const f=fixture(null),process=f.app.fileManager.processFrontMatter;
  f.app.fileManager.processFrontMatter=async(file,fn)=>{
    f.text='---\n{"created":"2020-01-01T00:00:00"}\n---\n# Note\n';
    return process(file,fn);
  };
  assert.equal(await f.service.add(f.file),'existing');
  assert.match(f.text,/2020-01-01T00:00:00/);
});
test('starts automatic recording after vault initialization and respects the toggle',async()=>{
  const f=fixture(null);f.service.load();
  assert.equal(f.events.create,undefined);
  f.ready[0]();
  f.plugin.recordCreationTime=false;f.events.create(f.file);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.writes,0);
  f.plugin.recordCreationTime=true;f.events.create(f.file);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.writes,1);
});
test('invalid YAML or creation time produces no write; non-Markdown files are ignored',async()=>{
  const badYaml=fixture(null);badYaml.text='---\n{invalid\n---\n# Note';
  assert.equal(await badYaml.service.add(badYaml.file),'error');
  assert.equal(badYaml.writes,0);assert.equal(badYaml.notices.length,1);
  const badTime=fixture(null);badTime.file.stat.ctime=NaN;
  assert.equal(await badTime.service.add(badTime.file),'error');assert.equal(badTime.writes,0);
  const image=fixture(null);image.file.extension='png';
  await image.service.add(image.file);assert.equal(image.writes,0);
});
test('unloading before layout ready prevents a late subscription',()=>{
  const f=fixture(null);f.service.load();f.cleanups[0]();f.ready[0]();
  assert.equal(f.events.create,undefined);
});
test('bulk fill is repeatable and cannot run twice concurrently',async()=>{
  const f=fixture(null);
  const first=f.service.fillMissing();
  assert.equal(await f.service.fillMissing(),undefined);
  assert.equal((await first).added,1);
  const second=await f.service.fillMissing();
  assert.equal(second.added,0);assert.equal(second.existing,1);assert.equal(f.writes,1);
});
test('bulk fill skips malformed notes and continues to the next note',async()=>{
  const f=fixture(null),good=new f.file.constructor();f.file.path='Bad.md';good.path='Good.md';
  f.app.vault.getMarkdownFiles=()=>[f.file,good];
  const read=f.app.vault.read;
  f.app.vault.read=file=>file===f.file?'---\n{invalid\n---\n# Bad':read(file);
  const result=await f.service.fillMissing();
  assert.equal(result.added,1);assert.equal(result.errors[0],'Bad.md');assert.equal(f.writes,1);
});
