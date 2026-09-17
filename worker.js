'use strict';
importScripts('core.js');
self.onmessage=async({data})=>{
 try{
  let episodes=[];const sourceFiles=[];
  for(const file of data.files){self.postMessage({type:'progress',message:`Reading ${file.name}…`});const buffer=await file.arrayBuffer();const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');sourceFiles.push({name:file.name,bytes:file.size,sha256});episodes.push(...EL.parse(new TextDecoder().decode(buffer),file.name.toLowerCase().endsWith('.jsonl')));}
  self.postMessage({type:'progress',message:'Checking probabilities, candidates, traversals, and graph distances...'});
  const result=EL.prepare(episodes);result.fingerprint=EL.fingerprint(result.episodes);
  self.postMessage({type:'ready',...result,sourceFiles});
 }catch(err){self.postMessage({type:'error',message:err.message});}
};
