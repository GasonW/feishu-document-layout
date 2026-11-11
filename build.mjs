import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const prelude=`'use strict';\nconst {Plugin,MarkdownView,PluginSettingTab,Setting,editorLivePreviewField}=require('obsidian');\nconst {ViewPlugin,Decoration,WidgetType}=require('@codemirror/view');\nconst {StateEffect}=require('@codemirror/state');\nconst refreshLayout=StateEffect.define();\n`;
await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
const source=await Promise.all(['layout.js','editor.js','plugin.js'].map(f=>readFile(new URL(f,import.meta.url),'utf8')));
await writeFile(new URL('./dist/main.js',import.meta.url),prelude+source.join('\n'));
for(const file of ['styles.css','manifest.json'])await copyFile(new URL(file,import.meta.url),new URL('./dist/'+file,import.meta.url));
