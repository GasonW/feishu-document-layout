function imageElement(doc, tag, cls, text) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function imageButton(parent, label, icon, action) {
  const button = imageElement(parent.ownerDocument,'button','feishu-image-button');
  button.type = 'button';button.title = label;button.setAttribute('aria-label',label);
  if (icon) setIcon(button,icon);else button.textContent = label;
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();action(event);});
  parent.append(button);
  return button;
}

class ImageRowWidget extends WidgetType {
  constructor(layout,row,path) {super();this.layout=layout;this.row=row;this.path=path;}
  eq(other) {return this.path===other.path && this.row.raw===other.row.raw && this.row.from===other.row.from;}
  toDOM(view) {return this.layout.renderRow(this.row,this.path,view.dom.ownerDocument,()=>view.requestMeasure());}
  ignoreEvent() {return true;}
}

function imageEditorExtension(layout) {
  const build = state=>{
    if (!state.field(editorLivePreviewField,false)) return Decoration.none;
    const path = state.field(editorInfoField,false)?.file?.path;
    if (!path) return Decoration.none;
    const rows = imageRows(state.doc.toString()), ranges=[];
    for (const row of rows) {
      const editing = state.selection.ranges.some(r=>r.from<=row.to && r.to>=row.from);
      if (!editing) ranges.push(Decoration.replace({widget:new ImageRowWidget(layout,row,path),block:true}).range(row.from,row.to));
    }
    return Decoration.set(ranges,true);
  };
  return StateField.define({
    create:build,
    update(value,tr) {
      return tr.docChanged || tr.selection || tr.effects.some(e=>e.is(refreshLayout)) || tr.startState.field(editorLivePreviewField,false)!==tr.state.field(editorLivePreviewField,false) ? build(tr.state) : value;
    },
    provide:field=>EditorView.decorations.from(field)
  });
}

class ImageLayouts {
  constructor(plugin) {this.plugin=plugin;this.app=plugin.app;this.cards=new WeakMap();this.queue=Promise.resolve();}
  load() {
    const p=this.plugin;
    this.extension=imageEditorExtension(this);
    p.registerEditorExtension(Prec.highest(this.extension));
    p.registerMarkdownPostProcessor((el,ctx)=>this.reading(el,ctx));
    p.registerDomEvent(document,'pointermove',event=>this.move(event),true);
    p.registerDomEvent(document,'pointerup',event=>this.release(event),true);
    p.registerDomEvent(document,'pointercancel',()=>this.cancel(),true);
    p.registerDomEvent(document,'keydown',event=>{if(event.key==='Escape')this.cancel();},true);
    p.register(()=>{
      this.cancel();
      this.app.workspace.iterateAllLeaves(leaf=>{if(leaf.view instanceof MarkdownView)leaf.view.previewMode.rerender(true);});
    });
  }
  reading(el,ctx) {
    if(el.closest('.feishu-image-row'))return;
    for(const paragraph of el.matches('p')?[el]:el.querySelectorAll('p')) {
      if(!paragraph.querySelector('img,.internal-embed') || paragraph.closest('blockquote,li,td,th'))continue;
      const info=ctx.getSectionInfo(paragraph);
      if(!info)continue;
      const rows=imageRows(info.text).filter(r=>r.line-1>=info.lineStart && r.line-1<=info.lineEnd);
      if(!rows.length)continue;
      const section=info.text.split('\n').slice(info.lineStart,info.lineEnd+1);
      if(section.some((line,i)=>line.trim() && !rows.some(r=>r.line-1===info.lineStart+i)))continue;
      const content=paragraph.ownerDocument.createDocumentFragment();
      for(const row of rows)content.append(this.renderRow(row,ctx.sourcePath,paragraph.ownerDocument));
      paragraph.replaceWith(content);
    }
  }
  source(image,path) {
    if(/^https?:\/\//i.test(image.target))return image.target;
    let target=image.target;
    try {target=decodeURIComponent(target);} catch {}
    const file=this.app.metadataCache.getFirstLinkpathDest(target.split('#')[0],path);
    return file ? this.app.vault.getResourcePath(file) : null;
  }
  renderRow(row,path,doc,measure=()=>{}) {
    const root=imageElement(doc,'div','feishu-image-row');
    root.setAttribute('aria-label','图片行');
    row.images.forEach((image,index)=>{
      const ref=imageIdentity(row,index), card=imageElement(doc,'figure','feishu-image-card');
      const surface=imageElement(doc,'div','feishu-image-surface');
      const img=imageElement(doc,'img','feishu-layout-image');
      img.alt=image.alt;img.draggable=false;
      const src=this.source(image,path);
      if(src)img.src=src;
      else surface.append(imageElement(doc,'span','feishu-image-missing','找不到图片：'+image.target));
      img.addEventListener('load',()=>{
        card.style.flexGrow=String(img.naturalWidth/Math.max(img.naturalHeight,1));
        if(row.images.length===1)root.style.maxWidth=(image.width || img.naturalWidth)+'px';
        measure();
      });
      img.addEventListener('error',()=>{img.hidden=true;surface.append(imageElement(doc,'span','feishu-image-missing','无法加载图片：'+image.target));measure();});
      surface.append(img);card.append(surface);
      const controls=imageElement(doc,'div','feishu-image-toolbar');
      imageButton(controls,image.meta?.caption?'编辑图注':'添加图注','captions',()=>this.editCaption(card,path,ref,image.meta?.caption||'',measure));
      if(row.images.length>1)imageButton(controls,'图片排版','ellipsis',event=>this.menu(event,path,row,index));
      surface.append(controls);
      if(image.meta?.caption){
        const caption=imageElement(doc,'figcaption','feishu-image-caption',String(image.meta.caption));
        caption.tabIndex=0;caption.setAttribute('aria-label','编辑图注：'+image.meta.caption);
        caption.addEventListener('click',()=>this.editCaption(card,path,ref,image.meta.caption,measure));
        caption.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();this.editCaption(card,path,ref,image.meta.caption,measure);}});
        card.append(caption);
      }
      surface.addEventListener('pointerdown',event=>{
        if(event.button!==0 || event.target.closest('button'))return;
        event.preventDefault();event.stopPropagation();
        this.cancel();this.drag={path,ref,card,root,x:event.clientX,y:event.clientY,moved:false};
      });
      surface.addEventListener('dragstart',event=>event.preventDefault());
      this.cards.set(card,{path,ref});root.append(card);
    });
    return root;
  }
  menu(event,path,row,index) {
    const ref=imageIdentity(row,index), menu=new Menu();
    if(index>0)menu.addItem(item=>item.setTitle('向左移动').setIcon('arrow-left').onClick(()=>void this.reorder(path,ref,imageIdentity(row,index-1),'left')));
    if(index<row.images.length-1)menu.addItem(item=>item.setTitle('向右移动').setIcon('arrow-right').onClick(()=>void this.reorder(path,ref,imageIdentity(row,index+1),'right')));
    if(row.images.length>1)menu.addItem(item=>item.setTitle('移到下一行').setIcon('arrow-down').onClick(()=>void this.reorder(path,ref,imageIdentity(row,index===0?1:0),'bottom')));
    menu.showAtMouseEvent(event);
  }
  move(event) {
    const drag=this.drag;if(!drag)return;
    if(!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    if(!drag.moved){
      drag.moved=true;drag.card.classList.add('is-dragging');
      this.indicator=imageElement(document,'div','feishu-image-drop-indicator');document.body.append(this.indicator);
      this.hint=imageElement(document,'div','feishu-image-drag-hint');document.body.append(this.hint);
      document.body.classList.add('feishu-image-dragging');
    }
    event.preventDefault();
    const card=document.elementFromPoint(event.clientX,event.clientY)?.closest('.feishu-image-card');
    const hit=card && this.cards.get(card);
    this.drop=null;this.indicator.hidden=true;
    if(hit && hit.path===drag.path && card!==drag.card){
      const box=card.querySelector('.feishu-image-surface').getBoundingClientRect();
      const y=(event.clientY-box.top)/box.height;
      const side=y<.22?'top':y>.78?'bottom':event.clientX<box.left+box.width/2?'left':'right';
      this.drop={...hit,side};
      const vertical=side==='left'||side==='right', row=card.parentElement.getBoundingClientRect();
      Object.assign(this.indicator.style,{left:(vertical?(side==='left'?box.left:box.right):row.left)+'px',top:(vertical?box.top:(side==='top'?row.top:row.bottom))+'px',width:(vertical?3:row.width)+'px',height:(vertical?box.height:3)+'px'});
      this.indicator.hidden=false;
      this.hint.textContent=vertical?'松开并排显示':'松开单独成行';
    } else this.hint.textContent='拖到图片左 / 右侧并排，上 / 下方换行';
    this.hint.style.left=Math.min(event.clientX+16,window.innerWidth-290)+'px';this.hint.style.top=(event.clientY+20)+'px';
    const scroller=drag.card.closest('.cm-scroller,.markdown-preview-view');
    if(scroller){const b=scroller.getBoundingClientRect();if(event.clientY<b.top+36)scroller.scrollTop-=18;else if(event.clientY>b.bottom-36)scroller.scrollTop+=18;}
  }
  release(event) {
    const drag=this.drag, drop=this.drop;
    if(!drag)return;
    if(drag.moved){event.preventDefault();event.stopPropagation();}
    this.cancel();
    if(drop)void this.reorder(drag.path,drag.ref,drop.ref,drop.side);
  }
  cancel() {
    this.drag?.card.classList.remove('is-dragging');this.drag=null;this.drop=null;
    this.indicator?.remove();this.hint?.remove();this.indicator=null;this.hint=null;
    document.body.classList.remove('feishu-image-dragging');
  }
  async reorder(path,source,target,side) {
    try {await this.change(path,text=>moveImage(text,source,target,side));} catch(error){new Notice(error.message);}
  }
  change(path,makeChanges) {
    const task=this.queue.then(async()=>{
      const file=this.app.vault.getFileByPath(path);if(!file)throw new Error('找不到这篇笔记。');
      let editor;
      this.app.workspace.iterateAllLeaves(leaf=>{
        if(leaf.view instanceof MarkdownView && leaf.view.file?.path===path && leaf.view.getMode()==='source')editor=leaf.view.editor;
      });
      if(editor){
        const changes=makeChanges(editor.getValue());
        if(changes.length)editor.transaction({changes:changes.map(c=>({from:editor.offsetToPos(c.from),to:editor.offsetToPos(c.to),text:c.insert}))});
      } else await this.app.vault.process(file,text=>applyImageChanges(text,makeChanges(text)));
    });
    this.queue=task.catch(()=>{});
    return task;
  }
  async metadata(path,ref,update) {
    let meta;
    await this.change(path,text=>{
      const change=replaceImageMetadata(text,ref,old=>update({...old,id:old.id||crypto.randomUUID()}));
      meta=change.meta;return [change];
    });
    return meta;
  }
  editCaption(card,path,ref,value,measure) {
    if(card.querySelector('textarea')){card.querySelector('textarea').focus();return;}
    const doc=card.ownerDocument,caption=card.querySelector('figcaption')||imageElement(doc,'figcaption','feishu-image-caption');
    const input=imageElement(doc,'textarea','feishu-image-caption-input');
    input.value=value;input.placeholder='添加图片说明…';input.setAttribute('aria-label','图片说明');input.rows=1;
    caption.replaceChildren(input);card.append(caption);
    const resize=()=>{input.style.height='auto';input.style.height=input.scrollHeight+'px';measure();};
    input.addEventListener('input',resize);
    let done=false;
    const cancel=()=>{if(done)return;done=true;caption.textContent=value;if(!value)caption.remove();measure();};
    const save=async()=>{
      if(done)return;
      const text=input.value.trim();
      if(text===value){cancel();return;}
      done=true;input.disabled=true;
      try {
        await this.metadata(path,ref,meta=>({...meta,caption:text}));
        caption.textContent=text;if(!text)caption.remove();measure();
      }catch(error){done=false;input.disabled=false;input.focus();new Notice(error.message);}
    };
    input.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();cancel();}
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save();}
    });
    input.addEventListener('blur',()=>void save());
    input.addEventListener('pointerdown',event=>event.stopPropagation());
    input.focus();resize();
  }
}
