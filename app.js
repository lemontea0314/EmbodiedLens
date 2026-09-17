'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>EL.finite(v)?Number(v).toFixed(d):'—', pct=v=>EL.finite(v)?(v*100).toFixed(1)+'%':'—', short=v=>v?String(v).slice(0,7):'STOP';
const palette={blue:'#315fa8',green:'#367451',teal:'#008f9c',orange:'#b66c13',red:'#b83f45',ink:'#203345',muted:'#65788a'};
const state={episodes:[],context:[],visible:[],model:null,selected:null,cohort:null,mode:'representative',step:0,stepReason:'',candidate:null,page:0,pin:null,notes:{},history:[],fingerprint:'',duplicates:0,sourceFiles:[],worker:null,generation:0};
const graphCache=new WeakMap();
function graphFor(e){if(!graphCache.has(e.topology))graphCache.set(e.topology,EL.graph(e.topology));return graphCache.get(e.topology);}
function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function log(action,details={}){state.history.push({at:new Date().toISOString(),action,...details});}
function selectOptions(id,values,preferred){const old=preferred??$(id).value;$(id).innerHTML='<option value="">All</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$(id).value=values.includes(old)?old:'';}
function contextEpisodes(){return state.episodes.filter(e=>(!$('dataset').value||e.dataset===$('dataset').value)&&(!$('agent').value||e.model_id===$('agent').value)&&(!$('split').value||e.split===$('split').value));}
const eventMatch={global:e=>e.analysis.unloggedChoices>0,partial:e=>e.analysis.partialSteps>0,revisit:e=>e.analysis.revisits>0,conflict:e=>e.analysis.conflicts>0,reference:e=>e.analysis.referenceConflicts>0,progress:e=>e.analysis.negativeSteps>0,poststop:e=>e.analysis.postStopRoute};
function visibleEpisodes(){const query=$('search').value.trim().toLowerCase(),outcome=$('outcome').value,event=$('event').value;return state.context.filter(e=>(!query||[e.episode_id,e.scan_id,e.instruction].join(' ').toLowerCase().includes(query))&&(outcome==='all'||outcome==='unknown'&&(!e.metricValid||e.success===null)||outcome==='success'&&e.metricValid&&e.success===true||outcome==='failure'&&e.metricValid&&e.success===false)&&(event==='all'||eventMatch[event]?.(e)));}
function refit(){
 state.context=contextEpisodes();state.model=EL.cluster(state.context,Number($('clusterK').value),$('featureSet').value==='outcome');
 state.model.maxNE=Math.max(1,...state.context.filter(e=>e.metricValid&&EL.finite(e.nav_error)).map(e=>e.nav_error));
 state.cohort=null;state.mode='representative';state.page=0;log('fit',{context:filterState(),k:state.model.k,seedARI:state.model.seedARI});filterAndRender();
}
function filterState(){return Object.fromEntries(['dataset','agent','split','clusterK','featureSet','outcome','event','search','hops'].map(id=>[id,$(id).value]));}
function filterAndRender(){
 state.visible=visibleEpisodes();
 if(!state.visible.length){state.selected=null;state.cohort=null;state.candidate=null;}
 else{
  if(state.cohort===null||!state.visible.some(e=>state.model.byKey[e.key]===state.cohort))state.cohort=state.model.byKey[state.visible[0].key];
  const pool=state.visible.filter(e=>state.model.byKey[e.key]===state.cohort),cases=EL.cases(pool,state.model,state.cohort);
  if(state.mode!=='manual'||!state.visible.includes(state.selected)){const item=cases[state.mode]||cases.representative;state.mode=cases[state.mode]?state.mode:'representative';setEpisode(item?.episode,false);}
 }
 render();
}
function setEpisode(e,record=true){state.selected=e??null;state.candidate=null;if(!e)return;state.cohort=state.model.byKey[e.key];state.step=e.defaultStep.index;state.stepReason=e.defaultStep.reason;state.page=Math.max(0,Math.floor(state.visible.indexOf(e)/8));if(record)log('episode',{key:e.key,mode:state.mode,step:state.step});}
function chooseEpisode(e,mode='manual'){state.mode=mode;setEpisode(e);render();}
function chooseCohort(i){state.cohort=i;state.mode='representative';const pool=state.visible.filter(e=>state.model.byKey[e.key]===i);setEpisode(EL.cases(pool,state.model,i).representative?.episode);render();}
function setStep(index){const e=state.selected;if(!e)return;state.step=Math.max(0,Math.min(e.steps.length-1,index));state.candidate=null;state.stepReason='Manually selected';log('step',{key:e.key,index:state.step});renderLinked();}
function currentStep(){return state.selected?.steps[state.step];}
function outcomeLabel(e){return !e.metricValid||e.success===null?'Unavailable':e.success?'Success':'Failure';}
function tag(text,kind=''){return `<span class="tag ${kind}">${esc(text)}</span>`;}
function renderAudit(){
 const a=EL.audit(state.context),sr=a.metricEpisodes?EL.wilson(a.successes,a.metricEpisodes):[null,null];
 const items=[[a.episodes.toLocaleString(),'episodes in reference collection'],[pct(a.successRate),`SR · ${a.successes}/${a.metricEpisodes} valid labels`],[a.scans,'scans'],[pct(a.partialSteps/a.steps),`Incomplete local mass · ${a.partialSteps} steps`],[a.missingChosen.toLocaleString(),'Unlogged global choices'],[a.revisitingEpisodes,'episodes with full-path revisits']];
 $('auditStats').innerHTML=items.map(([v,t],i)=>`<div class="stat ${i===3||i===4?'warn':''}"><b>${v}</b><span>${esc(t)}</span></div>`).join('');
 const splits=[...new Set(state.episodes.map(e=>e.split))].map(split=>{const x=EL.audit(state.episodes.filter(e=>e.split===split));return `<tr><td>${esc(split)}</td><td>${x.episodes}</td><td>${pct(x.successRate)}</td><td>${fmt(x.meanSPL)}</td><td>${x.metricEpisodes?'trace metrics':'Invalid goal/reference; outcomes disabled'}</td></tr>`;}).join('');
 $('auditContent').innerHTML=`<div class="audit-grid"><div><table><tr><td>Candidate probabilities</td><td>Raw p preserved; ${a.partialSteps}/${a.steps} steps with incomplete coverage; ${a.invalidScores} invalid steps. No renormalization.</td></tr><tr><td>Action identity</td><td>Full viewpoint ID; ${a.duplicateActions} steps with repeated direction labels. ${a.missingChosen} chosen actions missing from the local table.</td></tr><tr><td>Graph distance check</td><td>${a.distanceMismatches} valid steps differ from XYZ shortest-path distance by more than 0.05 m.</td></tr><tr><td>Images / rollouts</td><td>${a.imageCandidates} candidates have image links; ${a.rollouts} provided rollout records (validated separately in the alternative view).</td></tr><tr><td>After STOP</td><td>${a.postStopEpisodes} episodes end at a different location from the last decision. STOP distance is distinct from final NE.</td></tr></table><table class="split-table"><thead><tr><th>Split</th><th>N</th><th>SR</th><th>SPL</th><th>Validity</th></tr></thead><tbody>${splits}</tbody></table></div><div><ul><li>Exported failure_type is heuristic. Outcomes use Success / Failure; revisits and global choices are overlapping events.</li><li>Recorded uncertainty is normalized global entropy. The local table is not the complete global action space.</li><li>Grounding gap, candidate evidence, and utility/risk are proxies. The clause index is time-based. They do not establish model attention or failure causes.</li><li>The graph oracle measures geometric goal cost. Reference paths provide a different baseline. Successful episodes can contain conflicts.</li><li>Test outcomes are disabled unless explicitly marked metrics_valid:true.</li><li>Descriptive Wilson 95% SR interval: ${pct(sr[0])}–${pct(sr[1])}. Instructions sharing a route are dependent; this is not a significance test.</li></ul><p class="paper-note">Local analysis:  ${state.episodes.length} deduplicated records; removed  ${state.duplicates} duplicate keys. Data remain local.</p></div></div>`;
 $('fitNote').textContent=`Reference collection ${state.context.length} · actual ${state.model.groups.length} cohorts · two-initialization ARI ${fmt(state.model.seedARI,3)}`;
 $('fingerprint').textContent=`analysis fingerprint ${state.fingerprint}`;
}
const NS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs={},text){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>{if(v!==null&&v!==undefined)e.setAttribute(k,String(v));});if(text!==undefined)e.textContent=text;return e;}
function add(svg,tag,attrs,text){const e=svgEl(tag,attrs,text);svg.appendChild(e);return e;}
function clear(id){const svg=$(id);svg.replaceChildren();return svg;}
function label(svg,x,y,text,opts={}){return add(svg,'text',{x,y,fill:palette.ink,'font-size':12,...opts},text);}
function title(element,text){element.appendChild(svgEl('title',{},text));}
function poly(points){return points.length?'M'+points.map(p=>p.join(',')).join(' L'):'';}
function renderCohorts(){
 const model=state.model,visibleKeys=new Set(state.visible.map(e=>e.key)),byKey=new Map(state.context.map(e=>[e.key,e]));
 $('cohortTable').replaceChildren();const svg=svgEl('svg',{id:'cohortSVG',viewBox:`0 0 940 ${72+model.groups.length*64}`,role:'img','aria-label':'Cohort distributions; select a row to retrieve its representative'});$('cohortTable').appendChild(svg);
 label(svg,15,25,'Cohort / shown',{ 'font-size':13});label(svg,140,25,'SR · N valid',{'font-size':12});
 const feats=model.features.slice(0,6),all=state.context.map(e=>EL.FEATURES.map(f=>f.get(e)));
 const ranges=feats.map((_,j)=>[EL.quantile(all.map(r=>r[j]),0)??0,EL.quantile(all.map(r=>r[j]),1)??1]);
 feats.forEach((f,j)=>{const x=246+j*113;label(svg,x,24,f.label,{'font-size':11});label(svg,x,42,`${fmt(ranges[j][0])} — ${fmt(ranges[j][1])}`,{'font-size':9,fill:palette.muted});});
 model.groups.forEach((g,i)=>{
  const es=g.keys.map(k=>byKey.get(k)),count=g.keys.filter(k=>visibleKeys.has(k)).length,y=75+i*64;
  add(svg,'rect',{x:5,y:y-21,width:930,height:59,rx:5,fill:state.cohort===i?'#e9f2fc':i%2?'#f8fafc':'#fff',stroke:state.cohort===i?'#6e95c2':'none'});
  label(svg,15,y,`C${i+1}`,{'font-weight':700,'font-size':15});label(svg,15,y+18,`${count} / ${es.length}`,{'font-size':11,fill:palette.muted});
  const valid=es.filter(e=>e.metricValid&&typeof e.success==='boolean'),sr=EL.mean(valid.map(e=>+e.success));label(svg,140,y,`${pct(sr)} · ${valid.length}`,{'font-size':12});
  add(svg,'rect',{x:140,y:y+10,width:82,height:6,fill:'#dce3e9'});if(sr!==null)add(svg,'rect',{x:140,y:y+10,width:82*sr,height:6,fill:palette.green});
  feats.forEach((f,j)=>{const vals=es.map(e=>EL.FEATURES[j].get(e)).filter(EL.finite),[min,max]=ranges[j],x=246+j*113,s=v=>x+(max===min?.5:(v-min)/(max-min))*93;
   add(svg,'line',{x1:x,y1:y,x2:x+93,y2:y,stroke:'#bdcbd8'});
   for(let t=0;t<vals.length;t+=Math.max(1,Math.ceil(vals.length/50)))add(svg,'line',{x1:s(vals[t]),y1:y-9,x2:s(vals[t]),y2:y+9,stroke:'#9baec0','stroke-opacity':.25});
   const q1=EL.quantile(vals,.25),q3=EL.quantile(vals,.75),med=EL.quantile(vals,.5);if(med!==null){add(svg,'rect',{x:s(q1),y:y-5,width:Math.max(2,s(q3)-s(q1)),height:10,fill:'#bfd1e2'});add(svg,'line',{x1:s(med),y1:y-11,x2:s(med),y2:y+11,stroke:palette.ink,'stroke-width':2});label(svg,x,y+25,fmt(med),{'font-size':10,fill:palette.muted});}
  });
  const hit=add(svg,'rect',{x:5,y:y-21,width:930,height:59,fill:'transparent',role:'button',tabindex:count?0:-1,'aria-label':`Select C${i+1}，${count} visible episodes`,style:count?'cursor:pointer':'opacity:.4'});title(hit,`C${i+1} · ${count} eligible · SR is descriptive only`);hit.addEventListener('click',()=>{if(count)chooseCohort(i);});hit.addEventListener('keydown',ev=>{if(count&&['Enter',' '].includes(ev.key)){ev.preventDefault();chooseCohort(i);}});
 });
 $('sensitivity').textContent=`K=${model.k}; nonempty groups ${model.groups.length}; starts at sorted positions 0 and N/3: ARI=${fmt(model.seedARI,3)}(initialization sensitivity only; not generalization or bootstrap stability).${model.withOutcomes?'Outcomes included for sensitivity comparison only; separation is not an independent discovery.':'Outcomes excluded by default.'} Filtering preserves centers and scales. Dataset/agent/split/K changes refit the groups.`;
 renderCases();
}
function renderCases(){
 if(!state.selected){$('caseSelector').innerHTML='<div class="empty">No matching episodes. Adjust the filters.</div>';return;}
 const pool=state.visible.filter(e=>state.model.byKey[e.key]===state.cohort),cases=EL.cases(pool,state.model,state.cohort);
 const definitions=[['representative','★ Representative','Nearest real episode to centroid'],['severe','! Severe failure','Highest valid failure severity'],['boundary','◇ Boundary case','Smallest cohort margin']];
 $('caseSelector').innerHTML=`<div class="case-head"><b>C${state.cohort+1} · ${pool.length} eligible</b><span>Cohort selection opens Representative</span></div><div class="cases">${definitions.map(([mode,title,desc])=>{const item=cases[mode];return `<button class="case ${state.mode===mode?'active':''}" data-mode="${mode}" ${item?'':'disabled'} aria-pressed="${state.mode===mode}"><b>${title}</b><span>${item?'#'+esc(item.episode.episode_id):mode==='severe'?'No valid failed episodes':'No other cohort'}</span><span>${desc}${item?' · '+fmt(mode==='severe'?-item.score:item.score,3):''}</span></button>`;}).join('')}</div>`;
 $('caseSelector').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseEpisode(cases[b.dataset.mode].episode,b.dataset.mode));
}
function renderList(){
 const max=Math.max(1,Math.ceil(state.visible.length/8));state.page=Math.min(state.page,max-1);const page=state.visible.slice(state.page*8,(state.page+1)*8);
 $('listCount').textContent=`${state.visible.length} matching`;
 $('episodeList').innerHTML=`<table><thead><tr><th>Episode / scan</th><th>Cohort</th><th>Outcome</th><th>Steps</th><th>Events</th></tr></thead><tbody>${page.map(e=>`<tr data-key="${esc(e.key)}" class="${e===state.selected?'selected':''}" tabindex="0"><td><b>${esc(e.episode_id)}</b><br><small class="muted">${esc(e.scan_id)}</small></td><td>C${state.model.byKey[e.key]+1}</td><td>${tag(outcomeLabel(e),e.metricValid?(e.success?'green':'warn'):'')}</td><td>${e.steps.length}</td><td>${e.analysis.unloggedChoices?tag('G '+e.analysis.unloggedChoices,'warn'):''} ${e.analysis.revisits?tag('↶ '+e.analysis.revisits):''}</td></tr>`).join('')}</tbody></table>`;
 $('episodeList').querySelectorAll('tr[data-key]').forEach(row=>{row.onclick=()=>chooseEpisode(state.visible.find(e=>e.key===row.dataset.key));row.onkeydown=ev=>{if(ev.key==='Enter')row.click();};});
 $('pageInfo').textContent=`${state.page+1} / ${max}`;$('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page===max-1;
 renderComparison();
}
function renderComparison(){const e=state.selected,p=state.pin;if(!p||!e){$('comparison').innerHTML='<p class="muted">Pin an episode, then retrieve another case for descriptive comparison.</p>';return;}
 const rows=[['SPL',e.metricValid?fmt(e.spl):'—',p.metricValid?fmt(p.spl):'—'],['NE (m)',e.metricValid?fmt(e.nav_error):'—',p.metricValid?fmt(p.nav_error):'—'],['nDTW',e.metricValid?fmt(e.ndtw):'—',p.metricValid?fmt(p.ndtw):'—'],['Full-path revisits',e.analysis.revisits,p.analysis.revisits],['Geometric-conflict steps',e.analysis.conflicts,p.analysis.conflicts],['Unlogged chosen actions',e.analysis.unloggedChoices,p.analysis.unloggedChoices]];
 $('comparison').innerHTML=`<table class="comparison-table"><thead><tr><th>Metric</th><th>Current #${esc(e.episode_id)}</th><th>Pinned #${esc(p.episode_id)}</th></tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(v=>`<td>${v}</td>`).join('')+'</tr>').join('')}</tbody></table><p class="muted">${e.scan_id===p.scan_id?'Same scan':'Different scans; coordinates cannot be overlaid directly'}; no semantic temporal alignment.</p>`;
}
function renderSelection(){const e=state.selected;if(!e){$('selectionTitle').textContent='No matching episodes';$('selectionReason').textContent='Clear filters to resume analysis';$('selectionMetrics').textContent='';return;}
 $('selectionTitle').textContent=`C${state.cohort+1} · #${e.episode_id} · ${state.mode==='manual'?'Manual episode':state.mode}`;
 $('selectionReason').textContent=`${e.dataset} / ${e.model_id} / ${e.split} / ${e.scan_id} · ${state.stepReason}`;
 $('selectionMetrics').innerHTML=[['SR',e.metricValid?(e.success===null?'—':e.success?'1':'0'):'N/A'],['SPL',e.metricValid?fmt(e.spl):'N/A'],['NE',e.metricValid?fmt(e.nav_error)+' m':'N/A'],['nDTW',e.metricValid?fmt(e.ndtw):'N/A']].map(([k,v])=>`<span>${k} <b>${v}</b></span>`).join('');
}
function drawMap(svg,e,options={}){
 const g=graphFor(e),s=currentStep(),W=options.width||1000,H=options.height||410,base=[...e.route,...(e.metricValid?e.gt_path:[]),s?.viewpoint_id,...(options.extra||[])];
 const keep=EL.neighborhood(g,base,Number($('hops').value)),nodes=[...keep].map(v=>g.nodes.get(v)).filter(n=>n&&EL.finite(n.x)&&EL.finite(n.y));
 if(!nodes.length){label(svg,25,50,'No valid topology coordinates · route unavailable');return null;}
 const xs=nodes.map(n=>+n.x),ys=nodes.map(n=>+n.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min((W-100)/Math.max(.5,maxX-minX),(H-90)/Math.max(.5,maxY-minY));
 const pos=v=>{const n=g.nodes.get(v);return n&&EL.finite(n.x)&&EL.finite(n.y)?[W/2+(n.x-(minX+maxX)/2)*scale,H/2-(n.y-(minY+maxY)/2)*scale]:null;};
 for(const v of keep)for(const [u]of g.adj.get(v)||[])if(keep.has(u)&&v<u){const a=pos(v),b=pos(u);if(a&&b)add(svg,'line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#d5dfe7','stroke-width':1});}
 for(const v of keep){const p=pos(v);if(p)add(svg,'circle',{cx:p[0],cy:p[1],r:2.8,fill:'#fff',stroke:'#a1b4c4'});}
 const path=(ids,color,width=3,dash=null)=>{let segment=[];const flush=()=>{if(segment.length>1)add(svg,'path',{d:poly(segment),stroke:color,'stroke-width':width,fill:'none','stroke-dasharray':dash,'stroke-linejoin':'round','stroke-linecap':'round'});segment=[];};for(const v of ids){const p=pos(v);if(!p){flush();continue;}segment.push(p);}flush();};
 if(e.metricValid)path(e.gt_path,palette.green,2,'7 5');path(e.route,options.factualColor||palette.blue,3);
 const goal=pos(e.goal_viewpoint);if(e.metricValid&&goal){add(svg,'circle',{cx:goal[0],cy:goal[1],r:9,fill:'none',stroke:palette.green,'stroke-width':2});label(svg,goal[0]+12,goal[1]-9,'goal',{'font-size':11,fill:palette.green});}
 const lineM=Math.max(1,Math.round(70/scale));add(svg,'line',{x1:24,y1:H-22,x2:24+lineM*scale,y2:H-22,stroke:palette.muted,'stroke-width':2});label(svg,24,H-29,`${lineM} m (XY)`,{'font-size':10,fill:palette.muted});
 return {pos,path,g};
}
function renderRoute(){const svg=clear('routeSVG'),e=state.selected;if(!e){$('routeNote').textContent='';return;}const s=currentStep(),m=drawMap(svg,e,{extra:s.candidates.map(c=>c.viewpoint_id).filter(Boolean)});if(!m)return;
 m.path(s.diagnostic.transition,palette.teal,6);s.candidates.forEach(c=>{const p=m.pos(c.viewpoint_id);if(p)add(svg,'path',{d:`M${p[0]},${p[1]-5}l5,5 -5,5 -5,-5Z`,fill:'#fff',stroke:palette.orange,'stroke-width':1.5});});
 e.steps.forEach((t,i)=>{const p=m.pos(t.viewpoint_id);if(!p)return;const node=add(svg,'circle',{cx:p[0],cy:p[1],r:i===state.step?8:5,fill:i===state.step?palette.teal:palette.blue,stroke:'#fff','stroke-width':1.5,role:'button',tabindex:0,'aria-label':`Select decision step ${i}`,class:'selected-node'});title(node,`step ${i} · ${t.viewpoint_id}`);node.onclick=()=>setStep(i);node.onkeydown=ev=>{if(ev.key==='Enter')setStep(i);};label(svg,p[0]+8,p[1]-8,`t${i}`,{'font-size':10});});
 $('routeNote').textContent=`${e.steps.length} decision points; complete path:  ${e.route.length} node visits; ${e.analysis.revisits} repeated arrivals. ${e.analysis.postStopRoute?'The path includes a post-STOP return; the endpoint differs from the last decision. ':''} Context uses a fixed BFS radius. Coordinates are a planar projection.`;
}
function renderDecisionSummary(){const e=state.selected,s=currentStep();if(!e||!s){$('decisionSummary').textContent='';$('instruction').textContent='';return;}const d=s.diagnostic,c=d.chosen;
 const facts=[['Selected',`t${state.step} · ${s.viewpoint_id}`],['Chosen',c?`${c.action} → ${c.viewpoint_id??'STOP'}${c.unlogged?' · probability not logged':''}`:'Unknown / ambiguous'],['Reference',d.reference?`${short(d.reference.viewpoint_id)} · ${d.referenceConflict?'reference disagreement':'consistent'}`:'Unavailable'],['Graph oracle',typeof d.conflict==='boolean'?`${d.conflict?'Geometric conflict':'geometrically consistent'} · ${d.oracleSource}`:'Insufficient evidence'],['Regret',EL.finite(d.regret)?`${fmt(d.regret)} m · movement cost + remaining distance - current distance`:EL.finite(d.stopDistance)?`STOP at ${fmt(d.stopDistance)} m · threshold 3 m`:'Unavailable'],['Coverage',`${pct(s.audit.mass)} local mass · ${s.audit.missingChosen?'chosen absent':'chosen identified'}`]];
 $('decisionSummary').innerHTML=facts.map(([k,v])=>`<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`).join('');$('instruction').textContent=e.instruction;
}
function renderRibbon(){const svg=clear('ribbonSVG'),e=state.selected;if(!e){$('stepLabel').textContent='—';return;}const W=Math.max(1140,e.steps.length*69+175),H=430,left=170,cw=(W-left-15)/e.steps.length;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.width=W+'px';
 const defs=add(svg,'defs');const p=add(defs,'pattern',{id:'missingHatch',width:6,height:6,patternUnits:'userSpaceOnUse'});add(p,'rect',{width:6,height:6,fill:'#edf0f4'});add(p,'path',{d:'M0 6L6 0',stroke:'#b3bdc8','stroke-width':1});
 [['Local rank 1',75],['Local rank 2',108],['Local rank 3',141],['Local rank 4',174],['Chosen identity',208],['Graph / reference',242],['Local probability mass',279],['Global entropy (trace)',321],['Δ distance progress (m)',365],['Traversal revisit',406]].forEach(([t,y])=>label(svg,12,y,t,{'font-size':11,fill:palette.muted}));
 const dpMax=Math.max(.01,...e.steps.map(s=>Math.abs(s.diagnostic.progressDelta??0)));
 e.steps.forEach((s,i)=>{const x=left+i*cw,m=x+cw/2,sorted=s.candidates.slice().sort((a,b)=>(b.probability??-1)-(a.probability??-1)),d=s.diagnostic;
  add(svg,'rect',{x,y:13,width:cw-1,height:409,rx:3,fill:i===state.step?'#eaf2fd':i%2?'#f8fafc':'#fff',stroke:i===state.step?'#7aa3ca':'none'});label(svg,m,36,`t${i}`,{'text-anchor':'middle','font-size':12,'font-weight':600});
  sorted.slice(0,4).forEach((c,r)=>{const y=63+r*33,ch=EL.same(d.chosen,c),or=d.oracleIds.includes(c.viewpoint_id);const box=add(svg,'rect',{x:x+5,y,width:cw-11,height:25,rx:4,fill:ch?'#cfe0f5':'#edf1f5',stroke:ch?palette.blue:'#d3dde6','stroke-width':ch?2:1});title(box,`${c.action} · ${c.viewpoint_id??'STOP'} · raw p ${c.probability}`);label(svg,m,y+11,short(c.viewpoint_id),{'font-size':9,'text-anchor':'middle'});label(svg,m,y+22,fmt(c.probability,3),{'font-size':8,fill:palette.muted,'text-anchor':'middle'});if(or)add(svg,'path',{d:`M${m},${y-1}l4,-6 h-8Z`,fill:palette.green});});
  const rank=d.chosen&&!d.chosen.unlogged?sorted.findIndex(c=>EL.same(d.chosen,c))+1:null;
  label(svg,m,208,d.chosen?.unlogged?'G · unlogged':rank?`rank ${rank}`:'?',{'text-anchor':'middle','font-size':10,fill:d.chosen?.unlogged?palette.orange:palette.blue});
  label(svg,m,242,`${d.conflict===true?'◆':d.conflict===false?'·':'?'} ${d.referenceConflict?'R':''}`,{'text-anchor':'middle',fill:d.conflict?palette.red:palette.muted,'font-size':13});
  add(svg,'rect',{x:x+7,y:263,width:cw-15,height:18,fill:'url(#missingHatch)'});add(svg,'rect',{x:x+7,y:263,width:(cw-15)*EL.clamp(s.audit.mass),height:18,fill:'#4b77ab'});title(svg.lastChild,`Raw local mass ${s.audit.mass} · unlogged mass is not a candidate distribution`);
  const entropy=EL.finite(s.uncertainty)?EL.clamp(s.uncertainty):null,shade=entropy===null?245:Math.round(240-130*entropy);add(svg,'rect',{x:x+7,y:299,width:cw-15,height:26,rx:3,fill:`rgb(${shade},${shade},${shade})`});label(svg,m,316,fmt(s.uncertainty),{'text-anchor':'middle','font-size':10,fill:entropy>.6?'#fff':palette.ink});
  const dp=d.progressDelta;if(EL.finite(dp)){add(svg,'rect',{x:m-16,y:dp>=0?353-16*Math.abs(dp)/dpMax:353,width:32,height:Math.max(1,16*Math.abs(dp)/dpMax),fill:dp<0?palette.red:palette.green});label(svg,m,381,(dp>0?'+':'')+fmt(dp),{'font-size':10,'text-anchor':'middle',fill:dp<0?palette.red:palette.green});}else label(svg,m,365,'—',{'text-anchor':'middle'});
  label(svg,m,410,String(d.traversalRevisits),{'text-anchor':'middle','font-size':12,fill:d.traversalRevisits?palette.orange:palette.muted});
  const hit=add(svg,'rect',{x,y:13,width:cw-1,height:409,fill:'transparent',role:'button',tabindex:0,'aria-label':`Inspect step ${i}`,style:'cursor:pointer'});hit.onclick=()=>setStep(i);hit.onkeydown=ev=>{if(ev.key==='Enter')setStep(i);};
 });$('stepLabel').textContent=`${state.step} / ${e.steps.length-1}`;$('prevStep').disabled=state.step===0;$('nextStep').disabled=state.step===e.steps.length-1;
}
function candidateCost(e,s,c){if(!e.metricValid||c.viewpoint_id===null)return {distance:null,cost:null};const g=graphFor(e),d=EL.distances(g,e.goal_viewpoint),edge=g.adj.get(s.viewpoint_id)?.find(([v])=>v===c.viewpoint_id),dc=d.get(c.viewpoint_id);return {distance:EL.finite(dc)?dc:null,cost:edge&&EL.finite(dc)?edge[1]+dc:null};}
function currentCandidates(){const s=currentStep();if(!s)return[];const sorted=s.candidates.slice().sort((a,b)=>(b.probability??-1)-(a.probability??-1));if(s.diagnostic.chosen?.unlogged)sorted.push(s.diagnostic.chosen);return sorted;}
function renderCandidates(){const svg=clear('bearingSVG'),e=state.selected,s=currentStep();if(!e||!s){$('candidateRows').textContent='';$('candidateWarning').textContent='';$('imageEvidence').textContent='';return;}
 const cs=currentCandidates();if(!state.candidate||!cs.some(c=>EL.same(c,state.candidate)))state.candidate=cs.find(c=>s.diagnostic.oracleIds.includes(c.viewpoint_id))||cs[0]||null;
 $('candidateWarning').innerHTML=`${tag(`raw local mass ${pct(s.audit.mass)}`,s.audit.partial?'warn':'')} ${s.audit.missingChosen?tag('Global choice probability unavailable','warn'):''} ${s.audit.invalidScores?tag('Invalid probabilities; distribution interpretation unavailable','red'):''}<span> Ranks apply only to exported local candidates.</span>`;
 add(svg,'line',{x1:45,y1:92,x2:750,y2:92,stroke:'#a4b5c4'});[-180,-90,0,90,180].forEach(deg=>label(svg,45+(deg+180)/360*705,120,`${deg}°`,{'text-anchor':'middle','font-size':11,fill:palette.muted}));
 cs.forEach((c,i)=>{if(!EL.finite(c.bearing)||c.viewpoint_id===null)return;const deg=((c.bearing*180/Math.PI+180)%360+360)%360-180,x=45+(deg+180)/360*705,y=70-(i%3)*18;add(svg,'line',{x1:x,y1:92,x2:x,y2:y,stroke:'#bdcbd7'});const dot=add(svg,'circle',{cx:x,cy:y,r:5+9*Math.sqrt(EL.clamp(c.probability??0)),fill:EL.same(s.diagnostic.chosen,c)?palette.blue:'#fff',stroke:s.diagnostic.oracleIds.includes(c.viewpoint_id)?palette.green:palette.orange,'stroke-width':2});title(dot,`#${i+1} ${c.viewpoint_id} raw p=${c.probability}`);label(svg,x,y-14,`#${i+1}`,{'text-anchor':'middle','font-size':10});});
 $('candidateRows').innerHTML=cs.map((c,i)=>{const cost=candidateCost(e,s,c),ch=EL.same(s.diagnostic.chosen,c),or=s.diagnostic.oracleIds.includes(c.viewpoint_id),deg=EL.finite(c.bearing)?((c.bearing*180/Math.PI+180)%360+360)%360-180:null;return `<tr data-candidate="${i}" class="${ch?'chosen':''} ${or?'oracle':''} ${EL.same(state.candidate,c)?'selected':''}"><td>${c.unlogged?'G':i+1}</td><td title="${esc(c.viewpoint_id??'STOP')}"><b>${esc(short(c.viewpoint_id))}</b><small>${esc(c.action)}</small></td><td>${fmt(c.probability,4)}<div class="prob"><i style="width:${100*EL.clamp(c.probability??0)}%"></i></div></td><td>${fmt(deg,0)}°</td><td>${fmt(cost.distance)}</td><td>${fmt(cost.cost)}</td><td>${ch?tag('Chosen'):''}${or?tag('Graph','green'):''}${c.unlogged?tag('Unlogged','warn'):''}</td></tr>`;}).join('');
 $('candidateRows').querySelectorAll('tr').forEach(row=>row.onclick=()=>{state.candidate=cs[+row.dataset.candidate];log('candidate',{step:state.step,key:e.key,candidate:state.candidate.viewpoint_id});renderCandidates();renderAlternative();});
 const img=state.candidate?.image;const safe=typeof img==='string'&&(/^(https?:|data:image\/(png|jpeg|webp);base64,)/i.test(img)||/^(\.\.?\/|images\/|assets\/)/.test(img));
 $('imageEvidence').innerHTML=safe?`<b>Selected candidate image from trace</b><img src="${esc(img)}" alt="Candidate observation">`:'No observation image is available. Grounding and attention cannot be inferred from these records.';
}
function matchRollout(e,s,c){
 const pools=[...(e.counterfactuals||[]),...(s.counterfactuals||[])];
 return pools.find(cf=>{
  if(Number(cf.step??cf.t)!==s.t)return false;
  const vp=cf.alternative_viewpoint_id??cf.viewpoint_id,action=cf.alternative_action??cf.action;
  const identity=c.viewpoint_id!==null?vp!=null&&String(vp)===c.viewpoint_id:vp==null&&String(action).toLowerCase()==='stop';
  const path=EL.flatten(cf.trajectory??cf.path??cf.counterfactual_path??[]);
  return identity&&path.length>0&&cf.proxy!==true;
 })||null;
}
function renderAlternative(){const svg=clear('alternativeSVG'),e=state.selected,s=currentStep(),c=state.candidate;if(!e||!s||!c){$('alternativeMode').textContent='No candidate available';$('alternativeMetrics').textContent='';$('note').value='';return;}
 const cf=matchRollout(e,s,c),g=graphFor(e),geometry=e.metricValid&&c.viewpoint_id?EL.shortestPath(g,c.viewpoint_id,e.goal_viewpoint):[],cost=candidateCost(e,s,c),provided=cf?EL.flatten(cf.trajectory??cf.path??cf.counterfactual_path):[];
 const m=drawMap(svg,e,{width:720,height:340,extra:[c.viewpoint_id,...geometry,...provided].filter(Boolean),factualColor:'#9ba7b3'});
 $('alternativeMode').innerHTML=cf?`${tag('Provided rollout · imported','green')}<p>Matched by episode, step, and viewpoint. Results are imported; execution and intervention controls have not been verified by this system.</p>`:`${tag('Geometry only · no DUET rollout','warn')}<p>${esc(short(c.viewpoint_id))}: the orange dashed line is a shortest continuation on the static graph, not predicted agent behavior. Only geometric cost is reported.</p>`;
 if(m){if(cf)m.path(provided,palette.green,4);else if(geometry.length){m.path(geometry,palette.orange,3,'7 5');const edge=g.adj.get(s.viewpoint_id)?.some(([v])=>v===c.viewpoint_id);if(edge)m.path([s.viewpoint_id,c.viewpoint_id],palette.orange,4);else if(c.unlogged&&EL.same(c,s.diagnostic.chosen))m.path(s.diagnostic.transition,palette.teal,4);}const cur=m.pos(s.viewpoint_id);if(cur){add(svg,'circle',{cx:cur[0],cy:cur[1],r:7,fill:palette.teal});label(svg,cur[0]+10,cur[1]-10,'current',{'font-size':11});}}
 const values=cf?[['CF NE',fmt(EL.number(cf.nav_error??cf.counterfactual_ne))],['CF SPL',fmt(EL.number(cf.spl??cf.counterfactual_spl))],['Provided success',typeof(cf.success??cf.counterfactual_success)==='boolean'?String(cf.success??cf.counterfactual_success):'—']]:[['Raw p',fmt(c.probability,4)],['Goal distance',fmt(cost.distance)+' m'],['Edge + remaining',fmt(cost.cost)+' m']];
 $('alternativeMetrics').innerHTML=values.map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('');$('note').value=state.notes[e.key+'|'+state.step]||'';$('noteStatus').textContent=state.notes[e.key+'|'+state.step]?'Saved in this session. Export the analysis record to keep it.':'';
}
function renderLinked(){renderSelection();renderRoute();renderDecisionSummary();renderRibbon();renderCandidates();renderAlternative();renderComparison();}
function render(){renderAudit();renderCohorts();renderList();renderLinked();}
function download(name,content,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSVG(id){const svg=$(id);if(!svg)return;const clone=svg.cloneNode(true);clone.setAttribute('xmlns',NS);clone.setAttribute('font-family','Segoe UI, sans-serif');const box=svg.viewBox.baseVal;clone.setAttribute('width',box.width);clone.setAttribute('height',box.height);clone.removeAttribute('style');download(`EmbodiedLens_${id}_${state.selected?.episode_id??'corpus'}.svg`,new XMLSerializer().serializeToString(clone),'image/svg+xml');}
function exportSession(){
 const model=state.model?Object.fromEntries(['k','withOutcomes','features','mu','sd','imputation','sse','seedARI','groups'].map(k=>[k,state.model[k]])):null;
 const record={version:EL.VERSION,fingerprint:state.fingerprint,sourceFiles:state.sourceFiles,exportedAt:new Date().toISOString(),filters:filterState(),selectedKey:state.selected?.key,selectedStep:state.step,selectedCandidate:state.candidate?{viewpoint_id:state.candidate.viewpoint_id,action:state.candidate.action}:null,caseMode:state.mode,pinnedKey:state.pin?.key,notes:state.notes,history:state.history,model,audit:EL.audit(state.context),selection:state.selected?{id:state.selected.episode_id,analysis:state.selected.analysis,diagnostic:currentStep()?.diagnostic}:null};
 const text=JSON.stringify(record,null,2);if(exportSession.url)URL.revokeObjectURL(exportSession.url);exportSession.url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 $('recordDownload').href=exportSession.url;$('recordText').value=text;$('recordDialog').showModal();
}
async function restoreSession(file){try{const record=JSON.parse(await file.text());if(record.version!==EL.VERSION)throw new Error('Analysis record version mismatch');if(record.fingerprint!==state.fingerprint)throw new Error('Data fingerprint mismatch. Load the original data first.');for(const [k,v]of Object.entries(record.filters||{}))if($(k))$(k).value=v;state.notes=record.notes||{};state.history=record.history||[];refit();const e=state.visible.find(e=>e.key===record.selectedKey);if(e){state.mode=record.caseMode||'manual';setEpisode(e,false);state.step=Math.max(0,Math.min(e.steps.length-1,record.selectedStep||0));state.stepReason='Restored analysis record';state.candidate=currentCandidates().find(c=>EL.same(c,record.selectedCandidate))||null;}state.pin=state.episodes.find(e=>e.key===record.pinnedKey)||null;render();toast('Restored filters, episode, step, candidate, pinned case, and notes.');}catch(err){toast(err.message);}}
async function loadFiles(files){
 if(!files.length)return;state.generation++;const generation=state.generation;if(state.worker)state.worker.terminate();$('status').textContent='Loading...';$('loadReal').disabled=true;
 state.worker=new Worker('worker.js');state.worker.onmessage=({data})=>{if(generation!==state.generation)return;if(data.type==='progress'){$('status').textContent=data.message;return;}if(data.type==='error'){$('status').textContent='Import failed: '+data.message;$('loadReal').disabled=false;state.worker.terminate();return;}
  if(data.type==='ready'){state.episodes=data.episodes;state.fingerprint=data.fingerprint;state.duplicates=data.duplicates;state.sourceFiles=data.sourceFiles;state.pin=null;state.notes={};state.history=[];state.selected=null;
   selectOptions('dataset',[...new Set(state.episodes.map(e=>e.dataset))]);selectOptions('agent',[...new Set(state.episodes.map(e=>e.model_id))]);selectOptions('split',[...new Set(state.episodes.map(e=>e.split))],state.episodes.some(e=>e.split==='val_unseen')?'val_unseen':'');
   $('search').value='';$('outcome').value='all';$('event').value='all';refit();$('status').textContent=`${state.episodes.length.toLocaleString()} episodes · loaded locally`;$('loadReal').disabled=false;state.worker.terminate();state.worker=null;
  }};state.worker.onerror=err=>{$('status').textContent='Data processing failed: '+(err.message||'Check that the local server is running, then reload the data.');$('loadReal').disabled=false;state.worker?.terminate();state.worker=null;};state.worker.postMessage({files});
}
async function loadReal(){try{$('status').textContent='Reading bundled real traces...';const response=await fetch('data/duet_r2r_val_unseen.compact.json');if(!response.ok)throw new Error('Bundled data unavailable. Import JSON/JSONL.');const blob=await response.blob();await loadFiles([new File([blob],'duet_r2r_val_unseen.compact.json',{type:'application/json'})]);}catch(err){$('status').textContent=err.message;}}
$('fileInput').onchange=ev=>{loadFiles([...ev.target.files]);ev.target.value='';};$('loadReal').onclick=loadReal;
['dataset','agent','split','clusterK','featureSet'].forEach(id=>$(id).onchange=refit);
['outcome','event'].forEach(id=>$(id).onchange=()=>{state.page=0;log('filter',filterState());filterAndRender();});let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.page=0;filterAndRender();},180);};
$('clearFilters').onclick=()=>{$('search').value='';$('outcome').value='all';$('event').value='all';state.page=0;filterAndRender();};
$('prevPage').onclick=()=>{state.page--;renderList();};$('nextPage').onclick=()=>{state.page++;renderList();};$('prevStep').onclick=()=>setStep(state.step-1);$('nextStep').onclick=()=>setStep(state.step+1);$('hops').onchange=()=>{renderRoute();renderAlternative();};
$('pinCase').onclick=()=>{state.pin=state.selected;renderComparison();};$('clearPin').onclick=()=>{state.pin=null;renderComparison();};
$('saveNote').onclick=()=>{if(!state.selected)return;state.notes[state.selected.key+'|'+state.step]=$('note').value;log('note',{key:state.selected.key,step:state.step});$('noteStatus').textContent='Saved in this session. Export the analysis record to keep it.';};
$('exportSession').onclick=exportSession;$('sessionInput').onchange=ev=>{if(ev.target.files[0])restoreSession(ev.target.files[0]);ev.target.value='';};document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportSVG(b.dataset.export));
$('closeRecord').onclick=()=>$('recordDialog').close();$('restorePasted').onclick=()=>{restoreSession(new Blob([$('recordText').value]));$('recordDialog').close();};
window.addEventListener('error',ev=>{console.error(ev.error);$('status').textContent='Page error: '+ev.message;});
$('status').textContent='Import a trace file or download and prepare the R2R/DUET data.';

$('compactLayout').onclick=()=>{const active=document.body.classList.toggle('compact-layout');$('compactLayout').setAttribute('aria-pressed',String(active));$('compactLayout').textContent=active?'Comfortable layout':'Compact layout';};
