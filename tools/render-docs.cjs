'use strict';
// Small static renderer for the Markdown shipped in this project; no runtime dependency.
const fs=require('node:fs'),path=require('node:path'),base=path.resolve(__dirname,'..');
const pages=[['USER_GUIDE.md','guide.html','使用说明'],['RESEARCH_REPORT.md','research.html','研究报告'],['VALIDATION.md','validation.html','验证记录'],['TRACE_SCHEMA.md','schema.html','日志建议']];
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inline=s=>escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>{const local=pages.find(p=>p[0]===url);return `<a href="${local?local[1]:url}">${label}</a>`;}).replace(/&lt;(https?:\/\/[^&]+)&gt;/g,'<a href="$1">$1</a>');
function render(md){
 const lines=md.split(/\r?\n/),out=[];let i=0;
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
  if(line.startsWith('```')){const body=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))body.push(lines[i++]);i++;out.push('<pre><code>'+escape(body.join('\n'))+'</code></pre>');continue;}
  const h=line.match(/^(#{1,6})\s+(.+)/);if(h){out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
  if(line.startsWith('|')){const rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++]);const cells=r=>r.trim().slice(1,-1).split('|').map(x=>x.trim());out.push('<div class="scroll"><table><thead><tr>'+cells(rows[0]).map(x=>'<th>'+inline(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(2).map(r=>'<tr>'+cells(r).map(x=>'<td>'+inline(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;}
  const list=line.match(/^(-|\d+\.)\s+/);if(list){const kind=list[1]==='-'?'ul':'ol',items=[];while(i<lines.length&&/^(-|\d+\.)\s+/.test(lines[i]))items.push('<li>'+inline(lines[i++].replace(/^(-|\d+\.)\s+/,''))+'</li>');out.push(`<${kind}>${items.join('')}</${kind}>`);continue;}
  const p=[];while(i<lines.length&&lines[i].trim()&&!/^(#|```|\||- |\d+\. )/.test(lines[i]))p.push(lines[i++]);out.push('<p>'+inline(p.join(' '))+'</p>');
 }return out.join('\n');
}
const css='body{margin:0;color:#203345;background:#eef2f5;font:16px/1.9 "Segoe UI","Microsoft YaHei",sans-serif}nav{padding:14px 24px;background:#203e5b;display:flex;gap:24px;flex-wrap:wrap}nav a{color:white;text-decoration:none}main{max-width:980px;margin:28px auto;background:white;padding:35px 48px;border-radius:12px}h1{font-size:29px;line-height:1.5}h2{font-size:23px;margin-top:40px;border-top:1px solid #dce4eb;padding-top:20px}h3{font-size:19px}a{color:#315fa8}code{background:#edf3f8;padding:2px 5px;border-radius:3px;overflow-wrap:anywhere;font-size:14px}pre{background:#edf3f8;padding:16px;overflow:auto}pre code{white-space:pre}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.7}th,td{text-align:left;vertical-align:top;border:1px solid #dce4eb;padding:10px}th{background:#edf3f8}.scroll{overflow:auto}li{margin:8px 0}@media(max-width:700px){main{padding:20px;margin:8px}body{font-size:15px}}@media print{nav{display:none}main{padding:0;margin:0}body{background:white}}';
for(const [source,target,title]of pages){const body=render(fs.readFileSync(path.join(base,source),'utf8'));fs.writeFileSync(path.join(base,target),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EmbodiedLens 3.0 · ${title}</title><style>${css}</style><nav><a href="index.html">← 分析系统</a>${pages.map(p=>`<a href="${p[1]}">${p[2]}</a>`).join('')}</nav><main>${body}</main></html>`);}
console.log('Rendered '+pages.length+' offline documentation pages.');
