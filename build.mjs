import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const prelude=`'use strict';\nconst {Plugin,MarkdownView,PluginSettingTab,Setting,editorLivePreviewField,editorInfoField,Menu,Notice,setIcon}=require('obsidian');\nconst {ViewPlugin,Decoration,WidgetType,EditorView}=require('@codemirror/view');\nconst {StateEffect,StateField,Prec}=require('@codemirror/state');\nconst refreshLayout=StateEffect.define();\n`;
await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
const source=await Promise.all(['layout.js','images.js','editor.js','image-view.js','plugin.js'].map(f=>readFile(new URL(f,import.meta.url),'utf8')));
await writeFile(new URL('./dist/main.js',import.meta.url),prelude+source.join('\n'));
for(const file of ['styles.css','manifest.json'])await copyFile(new URL(file,import.meta.url),new URL('./dist/'+file,import.meta.url));
