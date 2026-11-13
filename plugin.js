module.exports = class FeishuDocumentLayout extends Plugin {
  async onload() {
    const data=await this.loadData();
    this.widths=data?.widths||{};
    this.numberHeadings=data?.numberHeadings??true;
    this.editors=new Set();this.documents=new Map();this.headingContexts=new WeakMap();
    document.body.classList.add('feishu-document-layout');
    this.registerEditorExtension(documentExtension(this));
    this.images=new ImageLayouts(this);this.images.load();
    this.addSettingTab(new LayoutSettings(this.app,this));
    this.addCommand({id:'toggle-heading-numbering',name:'Toggle numbered heading rendering in this note',checkCallback:checking=>{
      const file=this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if(!file)return false;
      if(!checking)void this.toggleNote(file);
      return true;
    }});
    this.registerMarkdownPostProcessor(async(el,ctx)=>{
      const info=ctx.getSectionInfo(el);
      const model=info?this.model(info.text):await this.document(ctx.sourcePath);
      if(!model)return;
      for(const heading of el.querySelectorAll('h1,h2,h3')) {
        this.headingContexts.set(heading,ctx);
        this.decorateHeading(heading,ctx,model);
      }
    });
    this.registerEvent(this.app.metadataCache.on('changed',file=>{this.documents.delete(file.path);this.schedule();}));
    this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.schedule()));
    this.registerDomEvent(document,'pointermove',e=>this.pointerMove(e));
    this.registerDomEvent(document,'pointerdown',e=>this.pointerDown(e),true);
    this.registerDomEvent(document,'pointerup',()=>this.finishDrag());
    this.registerDomEvent(document,'pointercancel',()=>this.finishDrag());
    this.registerDomEvent(document,'dblclick',e=>this.resetWidth(e),true);
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.schedule()));
    this.registerEvent(this.app.vault.on('rename',(file,old)=>{
      if (this.widths[old]) {this.widths[file.path]=this.widths[old];delete this.widths[old];void this.persist();}
    }));
    this.registerEvent(this.app.vault.on('delete',file=>{
      if(this.widths[file.path]) {delete this.widths[file.path];void this.persist();}
    }));
    const observer = new MutationObserver(()=>this.schedule());
    observer.observe(this.app.workspace.containerEl,{childList:true,subtree:true});
    this.register(()=>{
      observer.disconnect();clearTimeout(this.timer);
      document.body.classList.remove('feishu-column-resizing','feishu-document-layout');
      if(this.hoverCell)this.hoverCell.style.cursor='';
      this.app.workspace.containerEl.querySelectorAll('[data-feishu-number]').forEach(el=>this.applyHeadingNumber(el,null));
      this.app.workspace.containerEl.querySelectorAll('.feishu-sized-table').forEach(table=>this.clearWidth(table));
    });
    this.app.workspace.onLayoutReady(()=>this.schedule());
  }
  persist() { return this.saveData({widths:this.widths,numberHeadings:this.numberHeadings}); }
  async toggleNote(file) {
    const model=await this.document(file.path);
    if(model)await this.app.fileManager.processFrontMatter(file,f=>{f['heading-numbering']=!model.enabled;});
  }
  schedule() { clearTimeout(this.timer);this.timer=setTimeout(()=>{this.applySaved();this.updateReading();void this.updateOutline();},80); }
  decorateHeading(heading,ctx,model) {
    const section=ctx.getSectionInfo(heading);
    const row=model.headings.find(h=>section && h.line-1>=section.lineStart && h.line-1<=section.lineEnd && h.level===Number(heading.tagName[1]) && this.plain(h.text)===this.plain(heading.textContent));
    this.applyHeadingNumber(heading,model.enabled?row:null);
  }
  applyHeadingNumber(element,row) {
    if(!row?.label) {
      delete element.dataset.feishuNumber;
      element.querySelectorAll('.feishu-heading-source').forEach(span=>span.replaceWith(...span.childNodes));
      return;
    }
    element.dataset.feishuNumber=row.label;
    if(element.querySelector('.feishu-heading-source'))return;
    const marker=element.textContent.match(/^\d{1,9}[.)](?:[ \t]+|$)/)?.[0];
    if(!marker)return;
    const walker=element.ownerDocument.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    let remaining=marker.length;
    for(const node of nodes) {
      if(!remaining)break;
      const length=Math.min(remaining,node.length);
      if(!length)continue;
      const range=element.ownerDocument.createRange();range.setStart(node,0);range.setEnd(node,length);
      const span=element.ownerDocument.createElement('span');span.className='feishu-heading-source';
      range.surroundContents(span);remaining-=length;
    }
  }
  updateReading() {
    const models=new Map();
    for(const heading of this.app.workspace.containerEl.querySelectorAll('.markdown-rendered h1,.markdown-rendered h2,.markdown-rendered h3')) {
      const ctx=this.headingContexts.get(heading),info=ctx?.getSectionInfo(heading);if(!info)continue;
      if(!models.has(info.text))models.set(info.text,this.model(info.text));
      this.decorateHeading(heading,ctx,models.get(info.text));
    }
  }
  plain(text) {return text.replace(/!?\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`~]/g,'').trim();}
  model(text) {return {headings:headingRows(text),enabled:numberingEnabled(text,this.numberHeadings)};}
  async document(path) {
    const file=this.app.vault.getFileByPath(path);if(!file)return null;
    let data=this.documents.get(path);
    if(!data || data.mtime!==file.stat.mtime){data={mtime:file.stat.mtime,...this.model(await this.app.vault.cachedRead(file))};this.documents.set(path,data);}
    return data;
  }
  async updateOutline() {
    const file=this.app.workspace.getActiveFile();if(!file)return;
    const model=await this.document(file.path);if(!model || this.app.workspace.getActiveFile()!==file)return;
    for(const leaf of this.app.workspace.getLeavesOfType('outline')) {
      const rows=[...model.headings];
      for(const item of leaf.view.containerEl.querySelectorAll('.tree-item-inner')) {
        const index=rows.findIndex(h=>this.plain(h.text)===this.plain(item.textContent));
        if(index<0){this.applyHeadingNumber(item,null);continue;}
        const row=rows.splice(index,1)[0];
        this.applyHeadingNumber(item,model.enabled?row:null);
      }
    }
  }
  refresh() {
    this.documents.clear();
    for(const view of this.editors)view.dispatch({effects:refreshLayout.of(null)});
    this.app.workspace.iterateAllLeaves(leaf=>{if(leaf.view instanceof MarkdownView)leaf.view.previewMode.rerender(true);});
    this.schedule();
  }
  tables(view) { return [...view.containerEl.querySelectorAll('.markdown-preview-view table,.cm-table-widget table')].filter(t=>t.querySelector('thead')); }
  identity(table) {
    let found=null;
    this.app.workspace.iterateAllLeaves(leaf=>{
      const v=leaf.view;
      if(!(v instanceof MarkdownView)||!v.file||!v.containerEl.contains(table)) return;
      const signature=t=>JSON.stringify([...t.querySelectorAll('thead th')].map(c=>(c.querySelector(':scope > .table-cell-wrapper') || c).textContent.trim()));
      const sig=signature(table), peers=this.tables(v).filter(t=>signature(t)===sig);
      found={path:v.file.path,key:sig+'::'+peers.indexOf(table)};
    });
    return found;
  }
  setWidths(table,widths) {
    table.classList.add('feishu-sized-table');
    table.style.setProperty('table-layout','fixed');
    const cells=[...table.querySelectorAll('thead tr:first-child th')];
    for(const row of table.rows) for(let i=0;i<row.cells.length;i++) row.cells[i].style.width=widths[i]+'%';
    let group=table.querySelector(':scope > colgroup');
    if(!group){group=document.createElement('colgroup');table.prepend(group);}
    if(group.children.length!==cells.length) group.replaceChildren(...cells.map(()=>document.createElement('col')));
    [...group.children].forEach((c,i)=>{c.style.width=widths[i]+'%';});
  }
  applySaved() {
    if(this.drag) return;
    this.app.workspace.iterateAllLeaves(leaf=>{
      if(!(leaf.view instanceof MarkdownView)) return;
      for(const table of this.tables(leaf.view)){
        const id=this.identity(table), widths=id && this.widths[id.path]?.[id.key];
        if(widths?.length===table.querySelectorAll('thead th').length) this.setWidths(table,widths);
      }
    });
  }
  handle(event) {
    const cell=event.target instanceof Element && event.target.closest('th');
    const table=cell?.closest('table');
    if(!table||!table.closest('.markdown-preview-view,.cm-table-widget')) return null;
    const cells=[...table.querySelectorAll('thead tr:first-child th')];
    const index=cells.findIndex((c,i)=>i<cells.length-1 && Math.abs(event.clientX-c.getBoundingClientRect().right)<=7);
    if(index<0) return null;
    return {cell:cells[index],table,cells,index};
  }
  pointerDown(e) {
    if(e.button!==0) return;
    const hit=this.handle(e);if(!hit)return;
    const id=this.identity(hit.table);if(!id)return;
    e.preventDefault();e.stopPropagation();
    const pixels=hit.cells.map(c=>c.getBoundingClientRect().width),total=pixels.reduce((a,b)=>a+b,0);
    this.drag={...hit,id,start:e.clientX,total,pixels,widths:pixels.map(w=>w/total*100)};
    document.body.classList.add('feishu-column-resizing');
  }
  pointerMove(e) {
    if(!this.drag){
      const hit=this.handle(e);
      if(this.hoverCell && this.hoverCell!==hit?.cell)this.hoverCell.style.cursor='';
      this.hoverCell=hit?.cell;if(hit)hit.cell.style.cursor='col-resize';
      return;
    }
    const d=this.drag, i=d.index, min=Math.min(64,(d.pixels[i]+d.pixels[i+1])/3);
    const delta=Math.max(min-d.pixels[i],Math.min(e.clientX-d.start,d.pixels[i+1]-min));
    d.widths=d.pixels.map((w,n)=>(w+(n===i?delta:n===i+1?-delta:0))/d.total*100);
    this.setWidths(d.table,d.widths);
    e.preventDefault();
  }
  finishDrag() {
    if(!this.drag)return;
    const {id,widths}=this.drag;
    (this.widths[id.path] ||= {})[id.key]=widths;
    this.drag=null;document.body.classList.remove('feishu-column-resizing');void this.persist();
  }
  resetWidth(e) {
    const hit=this.handle(e);if(!hit)return;
    const id=this.identity(hit.table);if(!id)return;
    e.preventDefault();e.stopPropagation();
    delete this.widths[id.path]?.[id.key];
    this.clearWidth(hit.table);
    void this.persist();
  }
  clearWidth(table) {
    table.classList.remove('feishu-sized-table');table.style.removeProperty('table-layout');
    table.querySelectorAll('th,td,col').forEach(c=>c.style.removeProperty('width'));
  }
};

class LayoutSettings extends PluginSettingTab {
  display() {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('渲染标题有序编号').setDesc('将 # 1.、## 1.、### 1. 按标题层级显示为 1.、1.1、1.1.1。在需要编号的标题中输入有序标记即可。').addToggle(toggle=>toggle.setValue(this.plugin.numberHeadings).onChange(async value=>{
      this.plugin.numberHeadings=value;await this.plugin.persist();this.plugin.refresh();
    }));
  }
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
}
