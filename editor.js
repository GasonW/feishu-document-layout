class HeadingNumber extends WidgetType {
  constructor(label) {super();this.label=label;}
  eq(other) {return this.label===other.label;}
  toDOM() {
    const span=document.createElement('span');
    span.className='feishu-heading-number';span.textContent=this.label+' ';
    span.setAttribute('aria-hidden','true');
    return span;
  }
  ignoreEvent() {return true;}
}

function documentExtension(plugin) {
  return ViewPlugin.fromClass(class {
    constructor(view) {this.view=view;plugin.editors.add(view);this.parse(view);this.build(view);}
    destroy() {plugin.editors.delete(this.view);}
    parse(view) {
      const text=view.state.doc.toString();
      this.rows=listRows(text);
      this.headings=numberingEnabled(text,plugin.numberHeadings)?headingRows(text):[];
      this.emptyQuotes=[];
      for(let i=1;i<=view.state.doc.lines;i++) {
        const line=view.state.doc.line(i);
        if(/^(?:[ \t]*>[ \t]*)+$/.test(line.text))this.emptyQuotes.push({line:i,start:line.from});
      }
    }
    update(update) {
      if(update.docChanged || update.transactions.some(t=>t.effects.some(e=>e.is(refreshLayout))))this.parse(update.view);
      if(update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some(t=>t.effects.some(e=>e.is(refreshLayout))) || update.startState.field(editorLivePreviewField,false)!==update.state.field(editorLivePreviewField,false))this.build(update.view);
    }
    build(view) {
      const ranges=[];
      if(!view.state.field(editorLivePreviewField,false)){this.decorations=Decoration.none;return;}
      const active=new Set(view.state.selection.ranges.map(r=>view.state.doc.lineAt(r.head).number));
      const visible=row=>view.visibleRanges.some(r=>row.start>=r.from && row.start<=r.to);
      for(const row of this.emptyQuotes)if(visible(row) && !active.has(row.line))ranges.push(Decoration.line({class:'feishu-empty-quote'}).range(row.start));
      for(const row of this.rows) {
        if(!visible(row))continue;
        ranges.push(Decoration.line({class:'feishu-list-line'+(row.quote?' feishu-quote-list':''),attributes:{style:`--feishu-list-depth:${row.depth};--feishu-quote-depth:${row.quote}`}}).range(row.start));
        if(!row.task && !active.has(row.line)) {
          // The native editor retains quote/list indentation as literal source text.
          if(row.quote && row.from>row.prefix)ranges.push(Decoration.replace({}).range(row.prefix,row.from));
          ranges.push(Decoration.mark({class:'feishu-list-marker',attributes:{'data-label':row.label,'data-kind':row.ordered?'ordered':'bullet'}}).range(row.from,row.to));
        }
      }
      for(const row of this.headings)if(row.label && visible(row)) {
        const line=view.state.doc.line(row.line);
        const editing=view.state.selection.ranges.some(r=>r.from<=line.to && r.to>=line.from);
        if(!editing)ranges.push(Decoration.replace({widget:new HeadingNumber(row.label)}).range(row.from,row.to));
      }
      this.decorations=Decoration.set(ranges,true);
    }
  },{decorations:value=>value.decorations});
}
