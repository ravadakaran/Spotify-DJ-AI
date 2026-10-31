import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { secretKinds } from './secret-signatures.js';

const findings=[];
const check = (text, location) => { for(const kind of secretKinds(text)) findings.push({kind,location}); };
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files) {
  if(!/\.(?:js|jsx|json|md|ya?ml|html|css|env|example|service|txt)$/.test(file) || file==='package-lock.json') continue;
  check(await readFile(file,'utf8'),file);
}
let current='history';
const history=spawn('git',['log','--all','--format=commit %h','--patch','--no-ext-diff','--','*.js','*.jsx','*.json','*.md','*.yml','*.env','*.example']);
const lines=createInterface({input:history.stdout});
for await (const line of lines) {
  if(line.startsWith('commit ')) current=line;
  if(line.startsWith('+++ b/'))current += ' '+line.slice(6);
  if(line.startsWith('+') && !line.startsWith('+++'))check(line,current);
}
const code=await new Promise(resolve=>history.exitCode!==null?resolve(history.exitCode):history.once('exit',resolve));
if(code!==0)throw new Error('Git history scan failed');
const report={date:new Date().toISOString(),files:files.length,scope:'Tracked and nonignored text files plus all reachable Git history additions; signature scan only, not entropy or remote secret validation',findings};
await writeFile('evidence/phase-six-secret-scan.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({files:files.length,findings:findings.length}));
if(findings.length)process.exitCode=1;
