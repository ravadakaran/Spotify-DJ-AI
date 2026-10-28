import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

// Deliberately narrow signatures avoid dumping private data or flagging fixture passwords.
const signatures = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/],
  ['provider-key', /\b(?:sk-[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/],
  ['database-credentials', /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/],
];
const findings=[];
const check = (text, location) => { for(const [kind,pattern] of signatures) if(pattern.test(text)) findings.push({kind,location}); };
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
