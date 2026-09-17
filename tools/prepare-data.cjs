'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline'),EL=require('../core.js');
const input=process.argv[2],allSplits=process.argv[3];
if(!input){console.error('Usage: node tools/prepare-data.cjs val_unseen.json [all_splits.jsonl]');process.exit(1);}
const base=path.resolve(__dirname,'..'),dataDir=path.join(base,'data');fs.mkdirSync(dataDir,{recursive:true});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function run(){
 const bytes=fs.readFileSync(input),raw=JSON.parse(bytes),topologies={},topologyLookup=new Map();
 const compact={schema_version:'3.0-compatible',source_name:path.basename(input),topologies,episodes:raw.episodes.map(e=>{
  const signature=JSON.stringify(e.topology);if(!topologyLookup.has(signature)){const name='topology_'+topologyLookup.size;topologyLookup.set(signature,name);topologies[name]=e.topology;}
  const copy={...e,topology_id:topologyLookup.get(signature)};delete copy.topology;return copy;
 })};
 const output=JSON.stringify(compact);fs.writeFileSync(path.join(dataDir,'duet_r2r_val_unseen.compact.json'),output);
 const start=performance.now(),prepared=EL.prepare(EL.parse(bytes.toString('utf8'))),prepareMS=performance.now()-start;
 const analysis={version:EL.VERSION,generatedAt:new Date().toISOString(),source:{name:path.basename(input),bytes:bytes.length,sha256:sha(bytes)},compact:{bytes:Buffer.byteLength(output),sha256:sha(output),topologies:Object.keys(topologies).length},fingerprint:EL.fingerprint(prepared.episodes),runtime:{prepareMS},audit:prepared.audit,cohorts:[],sensitivity:[],cases:[]};
 const t=performance.now(),model=EL.cluster(prepared.episodes,5);model.maxNE=Math.max(...prepared.episodes.map(e=>e.nav_error));analysis.runtime.clusterMS=performance.now()-t;
 analysis.seedARI=model.seedARI;
 model.groups.forEach((g,i)=>{const es=prepared.episodes.filter(e=>model.byKey[e.key]===i);analysis.cohorts.push({cohort:i+1,...EL.audit(es)});const c=EL.cases(es,model,i);analysis.cases.push({cohort:i+1,...Object.fromEntries(Object.entries(c).map(([k,v])=>[k,v?{id:v.episode.episode_id,score:k==='severe'?-v.score:v.score,step:v.episode.defaultStep,metrics:{success:v.episode.success,spl:v.episode.spl,ne:v.episode.nav_error,ndtw:v.episode.ndtw},analysis:v.episode.analysis}:null]))});});
 for(const k of [3,4,5,6,7,8]){const m=EL.cluster(prepared.episodes,k);analysis.sensitivity.push({k,seedARI:m.seedARI,sse:m.sse,sizes:m.groups.map(g=>g.keys.length)});}
 const examples=['4837_2','3411_1','3766_2','1744_2','1310_1'];analysis.examples=prepared.episodes.filter(e=>examples.includes(e.episode_id)).map(e=>({id:e.episode_id,success:e.success,nav_error:e.nav_error,spl:e.spl,ndtw:e.ndtw,analysis:e.analysis,defaultStep:e.defaultStep,globalSteps:e.steps.flatMap((s,i)=>s.audit.missingChosen?[i]:[]),step0:e.steps[0].diagnostic}));
 if(allSplits){
  const groups=new Map(),stream=fs.createReadStream(allSplits),digest=crypto.createHash('sha256');stream.on('data',chunk=>digest.update(chunk));const rl=readline.createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of rl){if(!line.trim())continue;for(const e of EL.parse(line)){if(!groups.has(e.split))groups.set(e.split,[]);groups.get(e.split).push(e);}}
  analysis.allSplitsSource={name:path.basename(allSplits),bytes:fs.statSync(allSplits).size,sha256:digest.digest('hex')};
  analysis.allSplits=[];for(const [split,episodes]of groups){const p=EL.prepare(episodes);analysis.allSplits.push({split,...p.audit});}
 }
 fs.writeFileSync(path.join(dataDir,'analysis-summary.json'),JSON.stringify(analysis,null,2));console.log(JSON.stringify({source:analysis.source,compact:analysis.compact,runtime:analysis.runtime,audit:analysis.audit,sensitivity:analysis.sensitivity,allSplits:analysis.allSplits},null,2));
}
run().catch(err=>{console.error(err);process.exitCode=1;});
