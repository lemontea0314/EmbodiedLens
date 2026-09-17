'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),EL=require('../core.js');
if(!process.argv[2]){console.error('Usage: node tools/verify-source.cjs /path/to/original_val_unseen.json');process.exit(1);}
const text=fs.readFileSync(process.argv[2],'utf8'),raw=JSON.parse(text),compactText=fs.readFileSync(path.join(__dirname,'../data/duet_r2r_val_unseen.compact.json'),'utf8'),compact=JSON.parse(compactText);
assert.equal(raw.episodes.length,compact.episodes.length);
compact.episodes.forEach((e,i)=>{const copy={...e,topology:compact.topologies[e.topology_id]};delete copy.topology_id;assert.deepEqual(copy,raw.episodes[i],`episode ${i} changed`);});
const a=EL.prepare(EL.parse(text)),b=EL.prepare(EL.parse(compactText));assert.deepEqual(a.audit,b.audit);assert.equal(EL.fingerprint(a.episodes),EL.fingerprint(b.episodes));
console.log(`PASS: ${raw.episodes.length} episodes losslessly reconstructed; raw/compact audit and analysis fingerprint identical.`);
