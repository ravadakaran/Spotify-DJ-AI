import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { passwordOptions } from '../server/src/auth.js';
const samples = [];
for (let n=0; n<12; n++) { const value=randomBytes(24).toString('hex'); const start=performance.now(); const digest=await argon2.hash(value,passwordOptions); await argon2.verify(digest,value); if(n>1) samples.push(Math.round(performance.now()-start)); }
samples.sort((a,b)=>a-b);
const report={node:process.version,platform:process.platform,parameters:{memoryKiB:passwordOptions.memoryCost,iterations:passwordOptions.timeCost,parallelism:passwordOptions.parallelism},operation:'hash plus verify',samplesMs:samples,p95Ms:samples[Math.ceil(samples.length*.95)-1],targetMs:500};
await mkdir('evidence',{recursive:true}); await writeFile('evidence/password-calibration.json',JSON.stringify(report,null,2)); console.log(report);
if(report.p95Ms>report.targetMs) process.exitCode=1;
