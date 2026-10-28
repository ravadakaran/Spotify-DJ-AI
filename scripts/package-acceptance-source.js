import {cp,mkdtemp,mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
const source=process.cwd(),stage=await mkdtemp(path.join(os.tmpdir(),"dj-acceptance-source-"));
const excluded=new Set(["node_modules","data",".git","evidence","test-results","playwright-report","coverage","dist"]);
await cp(source,stage,{recursive:true,filter:file=>{const relative=path.relative(source,file),parts=relative.split(path.sep);if(parts.some(part=>excluded.has(part)))return false;return !parts.at(-1).startsWith('.env') || parts.at(-1)==='.env.example';}});
await mkdir(path.join(stage,"evidence"),{recursive:true});
await cp("evidence/acceptance-sentiment-protocol.json",path.join(stage,"evidence/acceptance-sentiment-protocol.json"));
const files=(await readdir(stage,{recursive:true})).filter(name=>!excluded.has(name.split(path.sep)[0]));
const hashes={};
for(const file of files.sort()){
  try{const bytes=await readFile(path.join(stage,file));hashes[file.replaceAll('\\','/')]=createHash('sha256').update(bytes).digest('hex');}catch(error){if(error.code!=='EISDIR' && error.code!=='EPERM')throw error;}
}
if(Object.keys(hashes).some(file=>file.split('/').some(part=>part.startsWith('.env')&&part!=='.env.example')))throw new Error('Private environment file entered source bundle');
const output=path.join(source,"evidence/acceptance-source.zip");
execFileSync("powershell.exe",["-NoProfile","-Command","Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:ACCEPTANCE_SOURCE_DIR, $env:ACCEPTANCE_SOURCE_ZIP)"],{env:{...process.env,ACCEPTANCE_SOURCE_DIR:stage,ACCEPTANCE_SOURCE_ZIP:output},windowsHide:true});
const zip=await readFile(output);
const manifest={createdAt:new Date().toISOString(),stage,zip:"acceptance-source.zip",bytes:zip.length,zipSha256:createHash('sha256').update(zip).digest('hex'),excluded:[...excluded,"private .env files"],sourceHashes:hashes,limitations:"Reproducible source handoff; not an independent human reader attestation. Audio/model downloads are intentionally excluded."};
await writeFile("evidence/acceptance-source-manifest.json",JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({zip:output,bytes:zip.length,sha256:manifest.zipSha256,files:Object.keys(hashes).length}));
