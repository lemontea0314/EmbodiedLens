/* EmbodiedLens 3.0: data semantics and reproducible analysis. No browser dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EL=api;})(typeof self!=='undefined'?self:globalThis,function(){
 'use strict';
 const VERSION='3.0.0', EPS=1e-6;
 const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const number=v=>finite(v)?Number(v):null;
 const mean=a=>{const v=a.filter(finite).map(Number);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
 const quantile=(a,q)=>{const b=a.filter(finite).map(Number).sort((a,b)=>a-b);if(!b.length)return null;const p=(b.length-1)*q,i=Math.floor(p);return b[i]+(b[i+1]===undefined?0:(b[i+1]-b[i])*(p-i));};
 const clamp=v=>Math.min(1,Math.max(0,v));
 const id=v=>v==null?null:String(v);
 const key=e=>JSON.stringify([e.dataset,e.model_id,e.split,e.scan_id,e.episode_id]);
 const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
 const same=(a,b)=>!!a&&!!b&&(a.viewpoint_id!==null&&b.viewpoint_id!==null?a.viewpoint_id===b.viewpoint_id:a.viewpoint_id===null&&b.viewpoint_id===null&&a.action.toLowerCase()==='stop'&&b.action.toLowerCase()==='stop');
 function flatten(path){const out=[];for(const seg of path||[])for(const x of Array.isArray(seg)?seg:[seg]){const v=id(x);if(v!==null&&out.at(-1)!==v)out.push(v);}return out;}
 function chosen(s){
  if(s.chosen_viewpoint_id!==null){const c=s.candidates.find(c=>c.viewpoint_id===s.chosen_viewpoint_id);return c||{viewpoint_id:s.chosen_viewpoint_id,action:'global target',probability:null,bearing:null,unlogged:true};}
  if(s.chosen_action.toLowerCase()==='stop')return s.candidates.find(c=>c.viewpoint_id===null&&c.action.toLowerCase()==='stop')||{viewpoint_id:null,action:'stop',probability:null,unlogged:true};
  const matches=s.candidates.filter(c=>c.action===s.chosen_action);return matches.length===1?matches[0]:null;
 }
 function normalize(raw,index,topologies){
  const e={...raw,episode_id:id(raw.episode_id??raw.instr_id??raw.id??index),dataset:String(raw.dataset??'Unknown'),model_id:String(raw.model_id??raw.agent??'Unknown'),split:String(raw.split??'unknown'),scan_id:String(raw.scan_id??raw.scan??'unknown')};
  e.instruction=String(e.instruction??'');e.clauses=Array.isArray(e.clauses)?e.clauses.map(String):e.instruction.split(/[,.;!?]+/).filter(Boolean);
  e.gt_path=Array.isArray(e.gt_path)?e.gt_path.map(String):[];e.goal_viewpoint=id(e.goal_viewpoint??e.gt_path.at(-1));
  e.metricValid=raw.metrics_valid===true||(!/test/i.test(e.split)&&raw.metrics_valid!==false&&e.gt_path.length>1);
  e.success=typeof raw.success==='boolean'?raw.success:raw.success===1?true:raw.success===0?false:null;
  e.spl=number(e.spl);e.nav_error=number(e.nav_error??e.ne);e.ndtw=number(e.ndtw);
  e.topology=e.topology||topologies?.[e.topology_id??e.scan_id]||{nodes:[],edges:[]};
  e.topology={...e.topology,nodes:Array.isArray(e.topology.nodes)?e.topology.nodes:[],edges:Array.isArray(e.topology.edges)?e.topology.edges:[]};
  e.trajectory=Array.isArray(e.trajectory)?e.trajectory:[];
  e.steps=(Array.isArray(e.steps)?e.steps:[]).map((s,i)=>({
   ...s,t:number(s.t)??i,viewpoint_id:id(s.viewpoint_id),chosen_viewpoint_id:id(s.chosen_viewpoint_id),chosen_action:String(s.chosen_action??'unknown'),
   distance_to_goal:number(s.distance_to_goal),goal_progress:number(s.goal_progress),uncertainty:number(s.uncertainty),
   candidates:(Array.isArray(s.candidates)?s.candidates:[]).map(c=>({...c,action:String(c.action??'unknown'),viewpoint_id:id(c.viewpoint_id),probability:number(c.probability??c.prob??c.score),bearing:number(c.bearing),image:c.image??c.image_url??c.thumbnail??null}))
  }));
  e.key=key(e);return e;
 }
 function parse(text,jsonl=false){
  const entries=jsonl?text.split(/\r?\n/).filter(s=>s.trim()).map((s,i)=>{try{return JSON.parse(s);}catch(err){throw new Error(`JSONL line ${i+1}: ${err.message}`);}}):[JSON.parse(text)];
  return entries.flatMap(obj=>{const es=Array.isArray(obj)?obj:obj.episodes??(obj.steps?[obj]:null);if(!es)throw new Error('Missing episodes / steps array');return es.map((e,i)=>normalize(e,i,obj.topologies));});
 }
 function graph(topology){
  const nodes=new Map(topology.nodes.map(n=>[String(n.id),n])),adj=new Map([...nodes.keys()].map(k=>[k,[]]));let weightsValid=true;
  for(const edge of topology.edges){const a=id(Array.isArray(edge)?edge[0]:edge.source),b=id(Array.isArray(edge)?edge[1]:edge.target),A=nodes.get(a),B=nodes.get(b);if(!A||!B)continue;
   const explicit=number(Array.isArray(edge)?edge[2]:edge.weight);const hasCoords=[A.x,A.y,B.x,B.y].every(finite);
   const w=explicit!==null&&explicit>=0?explicit:hasCoords?Math.hypot(A.x-B.x,A.y-B.y,(number(A.z)??0)-(number(B.z)??0)):null;
   if(w===null){weightsValid=false;continue;}adj.get(a).push([b,w]);adj.get(b).push([a,w]);
  }return {nodes,adj,weightsValid,distances:new Map()};
 }
 function distances(g,target){
  if(g.distances.has(target))return g.distances.get(target);
  const d=new Map([...g.nodes.keys()].map(v=>[v,Infinity]));if(!g.nodes.has(target))return d;
  const queue=new Set(g.nodes.keys());d.set(target,0);
  while(queue.size){let v=null,best=Infinity;for(const k of queue)if(d.get(k)<best){v=k;best=d.get(k);}if(v===null)break;queue.delete(v);
   for(const [u,w]of g.adj.get(v)||[])if(best+w<d.get(u))d.set(u,best+w);
  }g.distances.set(target,d);return d;
 }
 function pathLength(g,path){let sum=0;for(let i=1;i<path.length;i++){const edge=g.adj.get(path[i-1])?.find(([v])=>v===path[i]);if(!edge)return null;sum+=edge[1];}return sum;}
 function shortestPath(g,start,goal){const d=distances(g,goal);if(!finite(d.get(start)))return[];const out=[start],seen=new Set(out);while(out.at(-1)!==goal){const v=out.at(-1),next=(g.adj.get(v)||[]).filter(([u,w])=>!seen.has(u)&&Math.abs(w+d.get(u)-d.get(v))<1e-4).sort((a,b)=>a[0].localeCompare(b[0]))[0];if(!next)return[];out.push(next[0]);seen.add(next[0]);}return out;}
 function delta(e,i){const s=e.steps[i],prev=e.steps[i-1];if(!prev||!e.metricValid)return null;
  // Prefer unclipped physical progress: negative = moving farther from the goal, in metres.
  if(finite(s.distance_to_goal)&&finite(prev.distance_to_goal))return prev.distance_to_goal-s.distance_to_goal;
  return null;
 }
 function reference(e,s){if(!e.metricValid)return null;const i=e.gt_path.indexOf(s.viewpoint_id);if(i<0)return null;
  const target=e.gt_path[i+1];return target===undefined?{action:'stop',viewpoint_id:null}:s.candidates.find(c=>c.viewpoint_id===target)||{action:'GT-next',viewpoint_id:target,unlogged:true};
 }
 function analyzeEpisode(e,g){
  const route=flatten(e.trajectory.length?e.trajectory:e.steps.map(s=>s.viewpoint_id));e.route=route;
  const seen=new Set();let revisits=0;for(const v of route){if(seen.has(v))revisits++;seen.add(v);}
  const goalDistances=e.metricValid&&e.goal_viewpoint?distances(g,e.goal_viewpoint):new Map();
  const startDistance=goalDistances.get(route[0]),len=pathLength(g,route);
  e.analysis={revisits,revisitRatio:route.length?revisits/route.length:0,routeLength:len,startDistance:finite(startDistance)?startDistance:null};
  e.steps.forEach((s,i)=>{
   const c=chosen(s),ref=reference(e,s),rawMass=s.candidates.reduce((v,c)=>v+(finite(c.probability)?c.probability:0),0);
   const validScores=s.candidates.every(c=>finite(c.probability)&&c.probability>=0&&c.probability<=1);
   s.audit={mass:rawMass,partial:validScores&&rawMass<.99,invalidScores:!validScores||rawMass>1.01,missingChosen:!!c?.unlogged,ambiguousChosen:c===null,duplicateActions:new Set(s.candidates.map(c=>c.action)).size<s.candidates.length};
   const cur=s.viewpoint_id,dcur=goalDistances.get(cur);s.diagnostic={chosen:c,reference:ref,referenceConflict:!!c&&!!ref&&!same(c,ref),progressDelta:delta(e,i),oracleIds:[],regret:null,oracleSource:null,transition:[],traversalRevisits:0};
   // DUET logs a global destination at decision i; segment i+1 records the physical traversal.
   const segment=Array.isArray(e.trajectory[i+1])?e.trajectory[i+1].map(String):[];
   let transition=c?.viewpoint_id&&segment.at(-1)===c.viewpoint_id?[cur,...segment.filter((v,j)=>j>0||v!==cur)]:[];
   if(!transition.length&&c?.viewpoint_id&&g.adj.get(cur)?.some(([v])=>v===c.viewpoint_id))transition=[cur,c.viewpoint_id];
   s.diagnostic.transition=transition;
   const prior=new Set(flatten(e.trajectory.slice(0,i+1)));s.diagnostic.traversalRevisits=transition.slice(1).filter(v=>prior.has(v)).length;
   if(!e.metricValid||!g.weightsValid||!finite(dcur)||!c)return;
   // Goal-reaching oracle (exact goal, not language compliance or benchmark success threshold).
   const neighbors=g.adj.get(cur)||[];
   const optimal=neighbors.filter(([v,w])=>finite(goalDistances.get(v))&&Math.abs(w+goalDistances.get(v)-dcur)<1e-4).map(([v])=>v);
   s.diagnostic.oracleIds=dcur<EPS?[null]:optimal;s.diagnostic.oracleSource='3D graph shortest path to exact goal';
   if(c.action.toLowerCase()==='stop'&&c.viewpoint_id===null){s.diagnostic.conflict=dcur>=3;s.diagnostic.stopDistance=dcur;}
   else if(transition.length>1&&finite(pathLength(g,transition))&&finite(goalDistances.get(c.viewpoint_id))){
    s.diagnostic.regret=Math.max(0,pathLength(g,transition)+goalDistances.get(c.viewpoint_id)-dcur);
    s.diagnostic.conflict=s.diagnostic.regret>1e-4;
   }else{s.diagnostic.conflict=null;}
  });
  const ds=e.steps.map(s=>s.diagnostic);const first=ds.findIndex(d=>d.conflict===true);
  let minimum=Infinity,at=0;ds.forEach((d,i)=>{if(finite(d.progressDelta)&&d.progressDelta<minimum){minimum=d.progressDelta;at=i;}});
  e.defaultStep={index:first>=0?first:minimum<0?at:0,reason:first>=0?'First graph decision conflict':minimum<0?'Largest negative distance-progress delta':'Start · no conflict / negative progress'};
  e.analysis.conflicts=ds.filter(d=>d.conflict===true).length;e.analysis.referenceConflicts=ds.filter(d=>d.referenceConflict).length;
  e.analysis.coverage=ds.filter(d=>typeof d.conflict==='boolean').length/e.steps.length;
  e.analysis.negativeSteps=ds.filter(d=>finite(d.progressDelta)&&d.progressDelta<-.01).length;
  e.analysis.unloggedChoices=e.steps.filter(s=>s.audit.missingChosen).length;
  e.analysis.partialSteps=e.steps.filter(s=>s.audit.partial).length;
  e.analysis.postStopRoute=e.steps.at(-1)?.chosen_action.toLowerCase()==='stop'&&route.at(-1)!==e.steps.at(-1)?.viewpoint_id;
  e.analysis.distanceMismatch=e.steps.filter(s=>finite(s.distance_to_goal)&&finite(goalDistances.get(s.viewpoint_id))&&Math.abs(s.distance_to_goal-goalDistances.get(s.viewpoint_id))>.05).length;
  return e;
 }
 const FEATURES=[
  {key:'entropyMean',label:'Entropy',unit:'0–1',get:e=>mean(e.steps.map(s=>s.uncertainty))},
  {key:'entropyMax',label:'Peak entropy',unit:'0–1',get:e=>quantile(e.steps.map(s=>s.uncertainty),1)},
  {key:'revisitRatio',label:'Traversal revisit',unit:'ratio',get:e=>e.analysis.revisitRatio},
  {key:'decisionCount',label:'Decisions',unit:'log1p',get:e=>Math.log1p(e.steps.length)},
  {key:'globalRatio',label:'Unlogged choice',unit:'ratio',get:e=>e.analysis.unloggedChoices/e.steps.length},
  {key:'massMean',label:'Local prob. mass',unit:'0–1',get:e=>mean(e.steps.filter(s=>!s.audit.invalidScores).map(s=>s.audit.mass))}
 ];
 function vectors(episodes,withOutcomes=false){
  const features=withOutcomes?[...FEATURES,{key:'spl',label:'SPL',get:e=>e.metricValid?e.spl:null},{key:'ne',label:'log NE',get:e=>e.metricValid&&finite(e.nav_error)?Math.log1p(e.nav_error):null},{key:'ndtw',label:'nDTW',get:e=>e.metricValid?e.ndtw:null}]:FEATURES;
  const raw=episodes.map(e=>features.map(f=>f.get(e))),med=features.map((_,j)=>quantile(raw.map(r=>r[j]),.5)??0);
  const imputed=raw.map(r=>r.map((v,j)=>finite(v)?v:med[j]));const mu=med.map((_,j)=>mean(imputed.map(r=>r[j]))??0);
  const sd=mu.map((m,j)=>Math.sqrt(imputed.reduce((s,r)=>s+(r[j]-m)**2,0)/Math.max(1,imputed.length-1))||1);
  return {raw,z:imputed.map(r=>r.map((v,j)=>(v-mu[j])/sd[j])),features:features.map(({key,label,unit})=>({key,label,unit})),mu,sd,imputation:med};
 }
 const dist=(a,b)=>a.reduce((s,x,j)=>s+(x-b[j])**2,0);
 const center=rows=>rows[0]?.map((_,j)=>rows.reduce((s,r)=>s+r[j],0)/rows.length)||[];
 function kmeans(z,k=5,seed=0){
  if(!z.length)return {labels:[],centers:[],sse:0};k=Math.max(1,Math.min(k,z.length));const centers=[z[seed%z.length].slice()];
  while(centers.length<k){let bi=0,bd=-1;z.forEach((r,i)=>{const d=Math.min(...centers.map(c=>dist(r,c)));if(d>bd){bd=d;bi=i;}});if(bd<EPS)break;centers.push(z[bi].slice());}
  let labels=z.map(()=>-1);for(let t=0;t<80;t++){let changed=false;const next=z.map((r,i)=>{let best=0;centers.forEach((c,j)=>{if(dist(r,c)<dist(r,centers[best]))best=j;});if(best!==labels[i])changed=true;return best;});labels=next;
   centers.forEach((_,j)=>{const members=z.filter((_,i)=>labels[i]===j);if(members.length)centers[j]=center(members);});if(!changed)break;
  }return {labels,centers,sse:z.reduce((s,r,i)=>s+dist(r,centers[labels[i]]),0)};
 }
 function ari(a,b){if(a.length<2)return 1;const cells=new Map(),rows=new Map(),cols=new Map();a.forEach((v,i)=>{const k=v+','+b[i];cells.set(k,(cells.get(k)||0)+1);rows.set(v,(rows.get(v)||0)+1);cols.set(b[i],(cols.get(b[i])||0)+1);});const choose=n=>n*(n-1)/2,sum=m=>[...m.values()].reduce((s,n)=>s+choose(n),0),expected=sum(rows)*sum(cols)/choose(a.length),max=(sum(rows)+sum(cols))/2;return Math.abs(max-expected)<EPS?1:(sum(cells)-expected)/(max-expected);}
 function cluster(episodes,k=5,withOutcomes=false){
  const sorted=episodes.slice().sort((a,b)=>a.key.localeCompare(b.key)),v=vectors(sorted,withOutcomes);
  const result=kmeans(v.z,k,0),replicate=kmeans(v.z,k,Math.floor(v.z.length/3));
  const groups=result.centers.map((c,j)=>({original:j,indices:result.labels.flatMap((v,i)=>v===j?[i]:[]),center:c})).filter(g=>g.indices.length).sort((a,b)=>b.indices.length-a.indices.length);
  const byKey={};groups.forEach((g,j)=>g.indices.forEach(i=>byKey[sorted[i].key]=j));
  const zByKey={};sorted.forEach((e,i)=>zByKey[e.key]=v.z[i]);
  return {groups:groups.map(g=>({keys:g.indices.map(i=>sorted[i].key),center:g.center})),byKey,zByKey,features:v.features,mu:v.mu,sd:v.sd,imputation:v.imputation,sse:result.sse,seedARI:ari(result.labels,replicate.labels),k,withOutcomes};
 }
 function cases(eligible,model,cohort){
  if(!eligible.length||!model.groups[cohort])return{};const own=model.groups[cohort].center;
  const byScore=(pool,fn)=>pool.map(e=>({episode:e,score:fn(e)})).sort((a,b)=>a.score-b.score||a.episode.key.localeCompare(b.episode.key))[0]??null;
  const representative=byScore(eligible,e=>Math.sqrt(dist(model.zByKey[e.key],own)));
  const failures=eligible.filter(e=>e.metricValid&&e.success===false&&[e.nav_error,e.spl,e.ndtw].every(finite));
  const maxNE=model.maxNE||1;
  const severe=byScore(failures,e=>-(Math.min(1,Math.log1p(Math.max(0,e.nav_error))/Math.log1p(maxNE))+(1-clamp(e.spl))+(1-clamp(e.ndtw)))/3);
  const others=model.groups.filter((_,i)=>i!==cohort);
  const boundary=others.length?byScore(eligible,e=>Math.min(...others.map(g=>Math.sqrt(dist(model.zByKey[e.key],g.center))))-Math.sqrt(dist(model.zByKey[e.key],own))):null;
  return {representative,severe,boundary};
 }
 function audit(episodes){
  const steps=episodes.flatMap(e=>e.steps),valid=episodes.filter(e=>e.metricValid&&typeof e.success==='boolean');
  return {episodes:episodes.length,steps:steps.length,scans:new Set(episodes.map(e=>e.scan_id)).size,metricEpisodes:valid.length,successes:valid.filter(e=>e.success).length,
   successRate:mean(valid.map(e=>+e.success)),meanSPL:mean(valid.map(e=>e.spl)),meanNE:mean(valid.map(e=>e.nav_error)),meanNDTW:mean(valid.map(e=>e.ndtw)),
   partialSteps:steps.filter(s=>s.audit.partial).length,invalidScores:steps.filter(s=>s.audit.invalidScores).length,missingChosen:steps.filter(s=>s.audit.missingChosen).length,duplicateActions:steps.filter(s=>s.audit.duplicateActions).length,
   imageCandidates:steps.reduce((n,s)=>n+s.candidates.filter(c=>c.image).length,0),rollouts:episodes.reduce((n,e)=>n+(e.counterfactuals||[]).length+e.steps.reduce((v,s)=>v+(s.counterfactuals||[]).length,0),0),
   revisitingEpisodes:episodes.filter(e=>e.analysis.revisits>0).length,postStopEpisodes:episodes.filter(e=>e.analysis.postStopRoute).length,
   distanceMismatches:episodes.reduce((n,e)=>n+e.analysis.distanceMismatch,0),graphConflictEpisodes:episodes.filter(e=>e.analysis.conflicts>0).length,
   referenceConflictEpisodes:episodes.filter(e=>e.analysis.referenceConflicts>0).length,labels:episodes.reduce((a,e)=>(a[e.failure_type??'unknown']=(a[e.failure_type??'unknown']||0)+1,a),{})};
 }
 function prepare(episodes){
  const unique=new Map(),topo=new Map(),graphs=new Map();let duplicates=0;
  for(const e of episodes){if(!e.steps.length)continue;if(unique.has(e.key)){duplicates++;continue;}const sig=JSON.stringify(e.topology);if(!topo.has(sig)){topo.set(sig,e.topology);graphs.set(e.topology,graph(e.topology));}e.topology=topo.get(sig);analyzeEpisode(e,graphs.get(e.topology));unique.set(e.key,e);}
  const result=[...unique.values()];return {episodes:result,audit:audit(result),duplicates};
 }
 // Compact analysis identity; source-file SHA-256 is recorded separately for provenance.
 function fingerprint(episodes){return hash(episodes.map(e=>e.key+':'+hash(JSON.stringify([e.key,e.success,e.metricValid,e.spl,e.nav_error,e.ndtw,e.instruction,e.gt_path,e.goal_viewpoint,e.route,e.topology,e.steps]))).sort().join('\n'));}
 function wilson(success,total){if(!total)return [null,null];const z=1.96,p=success/total,den=1+z*z/total,mid=(p+z*z/(2*total))/den,half=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/den;return [mid-half,mid+half];}
 function neighborhood(g,base,hops){let keep=new Set(base.filter(v=>g.nodes.has(v))),front=new Set(keep);for(let i=0;i<hops;i++){const next=new Set();for(const v of front)for(const [u]of g.adj.get(v)||[])if(!keep.has(u))next.add(u);for(const u of next)keep.add(u);front=next;}return keep;}
 return {VERSION,finite,number,mean,quantile,clamp,id,key,hash,same,flatten,chosen,normalize,parse,graph,distances,pathLength,shortestPath,delta,reference,analyzeEpisode,FEATURES,vectors,dist,center,kmeans,ari,cluster,cases,audit,prepare,fingerprint,wilson,neighborhood};
});
