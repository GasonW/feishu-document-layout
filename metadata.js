function creationTimestamp(ctime) {
  const date=new Date(ctime),pad=n=>String(n).padStart(2,'0');
  if(!Number.isFinite(ctime)||ctime<=0||Number.isNaN(date.getTime()))throw new Error('File creation time is unavailable.');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

class CreationMetadata {
  constructor(plugin) {this.plugin=plugin;this.app=plugin.app;this.pending=new Map();this.active=true;}
  load() {
    const plugin=this.plugin;
    plugin.register(()=>{this.active=false;});
    this.app.workspace.onLayoutReady(()=>{
      if(!this.active)return;
      plugin.registerEvent(this.app.vault.on('create',file=>{
        if(plugin.recordCreationTime)void this.add(file);
      }));
    });
    plugin.addCommand({id:'add-creation-time',name:'Add creation time to this note',checkCallback:checking=>{
      const file=this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if(!file)return false;
      if(!checking)void this.add(file,true);
      return true;
    }});
    plugin.addCommand({id:'fill-creation-times',name:'Fill missing creation times in all notes',callback:()=>void this.fillMissing()});
  }
  async fillMissing() {
    if(!this.active||this.bulkRunning)return;
    this.bulkRunning=true;
    const files=this.app.vault.getMarkdownFiles(),result={added:0,existing:0,errors:[],cancelled:false};
    const progress=new Notice('正在补全笔记创建时间…',0);
    try {
      for(let i=0;i<files.length;i++) {
        if(!this.active){result.cancelled=true;break;}
        const status=await this.add(files[i],false,false);
        if(status==='added'||status==='existing')result[status]++;
        else if(status==='error')result.errors.push(files[i].path);
        else if(status==='cancelled'){result.cancelled=true;break;}
        if((i+1)%25===0)progress.setMessage(`正在补全创建时间：${i+1}/${files.length}`);
      }
    } finally {progress.hide();this.bulkRunning=false;}
    new Notice(`${result.cancelled?'补全已停止':'补全完成'}：新增 ${result.added} 篇，保留 ${result.existing} 篇，失败 ${result.errors.length} 篇。`+(result.errors.length?'\n请检查这些笔记的 YAML：'+result.errors.slice(0,3).join('、'):''),10000);
    return result;
  }
  async add(file,notify=false,reportError=true) {
    if(!this.active||!(file instanceof TFile)||file.extension.toLowerCase()!=='md')return;
    let task=this.pending.get(file);
    if(!task) {
      task=this.write(file).catch(()=>{
        if(reportError)new Notice('无法写入创建时间：'+file.basename+'。请检查笔记属性中的 YAML 是否有效，以及文件是否仍然存在。');
        return 'error';
      });
      this.pending.set(file,task);
      void task.finally(()=>{if(this.pending.get(file)===task)this.pending.delete(file);});
    }
    const result=await task;
    if(notify&&result!=='error'&&result!=='cancelled')new Notice(result==='added'?'已添加创建时间。':'已保留现有 created 属性。');
    return result;
  }
  async write(file) {
    const timestamp=creationTimestamp(file.stat.ctime);
    const info=getFrontMatterInfo(await this.app.vault.read(file));
    const metadata=info.exists?(parseYaml(info.frontmatter)??{}):{};
    if(typeof metadata!=='object'||Array.isArray(metadata))throw new Error('Frontmatter must be a mapping.');
    if(Object.prototype.hasOwnProperty.call(metadata,'created'))return 'existing';
    if(!this.active)return 'cancelled';
    let result='existing';
    await this.app.fileManager.processFrontMatter(file,frontmatter=>{
      if(!this.active){result='cancelled';return;}
      if(!Object.prototype.hasOwnProperty.call(frontmatter,'created')) {
        frontmatter.created=timestamp;
        result='added';
      }
    });
    return result;
  }
}
