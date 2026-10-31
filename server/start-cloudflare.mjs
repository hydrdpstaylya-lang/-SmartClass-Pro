import {existsSync,readFileSync,writeFileSync,copyFileSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import {readHidden,checkConnection,MODEL} from './cloudflare-check.mjs';
import {aiProvider,CLOUDFLARE_MODE} from './ai-provider.mjs';

export function configureCloudflareEnv(file,{accountId,apiToken}){
 const wanted={AI_PROVIDER:'cloudflare',CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:apiToken,CLOUDFLARE_MODEL:MODEL};
 const ai=aiProvider(wanted);
 if(!ai.configured)throw Error(ai.error);
 const original=existsSync(file)?readFileSync(file,'utf8'):'';
 const newline=original.includes('\r\n')?'\r\n':'\n',seen=new Set(),lines=original.replace(/^\uFEFF/,'').split(/\r?\n/);
 if(lines.at(-1)==='')lines.pop();
 const result=[];
 for(const line of lines){
  const name=line.match(/^\s*(?:export\s+)?(AI_PROVIDER|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CLOUDFLARE_MODEL)\s*=/)?.[1];
  if(!name){result.push(line);continue;}
  if(!seen.has(name)){result.push(name+'='+JSON.stringify(wanted[name]));seen.add(name);}
 }
 for(const [name,value] of Object.entries(wanted))if(!seen.has(name))result.push(name+'='+JSON.stringify(value));
 const content=result.join(newline)+newline;
 if(content===original)return false;
 const temp=file+'.cloudflare-'+randomUUID()+'.tmp';
 try{
  if(existsSync(file))copyFileSync(file,file+'.before-cloudflare-'+Date.now());
  writeFileSync(temp,content,{mode:0o600,flag:'wx'});renameSync(temp,file);
 }finally{if(existsSync(temp))unlinkSync(temp);}
 return true;
}

async function isAvailable(port){
 return new Promise(resolve=>{
  const server=net.createServer();server.once('error',()=>resolve(false));
  server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));
 });
}
export async function chooseCloudflarePort({revision,request=fetch,isFree=isAvailable,first=5200,last=5219}={}){
 for(let port=first;port<=last;port++){
  try{
   const response=await request('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(500),redirect:'error'});
   const data=await response.json();
   if(response.ok&&data.ok===true&&data.ai===true&&data.provider==='Cloudflare'&&data.model===MODEL&&data.aiMode===CLOUDFLARE_MODE&&data.configRevision===revision)return {port,reuse:true};
  }catch{}
  if(await isFree(port))return {port,reuse:false};
 }
 throw Error('Close old SmartClass server windows: ports 5200-5219 are busy.');
}

async function main(){
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 process.chdir(root);
 if(!existsSync(path.join(root,'dist','index.html')))throw Error('Run this file inside the existing SmartClass-AI-Studio project.');
 const file=path.join(root,'.env');
 const previous=existsSync(file)?parseEnv(readFileSync(file,'utf8').replace(/^\uFEFF/,'')):{};
 let accountId=previous.CLOUDFLARE_ACCOUNT_ID||'',apiToken=previous.CLOUDFLARE_API_TOKEN||'';
 const configured=aiProvider({AI_PROVIDER:'cloudflare',CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:apiToken});
 if(process.argv.includes('--reset-key')||!configured.configured){
  accountId=await readHidden('1) Paste Account ID, then Enter (hidden): ');
  if(!/^[a-fA-F0-9]{32}$/.test(accountId))throw Error('INVALID_ACCOUNT_ID: Copy the 32-character Account ID.');
  apiToken=await readHidden('2) Paste Workers AI API Token, then Enter (hidden): ');
  console.log('Checking Cloudflare before saving...');
  const check=await checkConnection({accountId,apiToken});
  if(!check.ok)throw Error(`Cloudflare HTTP ${check.http??'NONE'}: ${check.kind}: ${check.detail}`);
  console.log('CLOUDFLARE_OK');
 }
 configureCloudflareEnv(file,{accountId,apiToken});
 loadEnvFile(file);
 Object.assign(process.env,{AI_PROVIDER:'cloudflare',CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:apiToken,CLOUDFLARE_MODEL:MODEL});
 const revision=createHash('sha256').update(root).update(readFileSync(file)).update(readFileSync(path.join(root,'server','app.mjs'))).digest('hex').slice(0,24);
 process.env.SMARTCLASS_CONFIG_REVISION=revision;
 const info=await chooseCloudflarePort({revision});
 if(info.reuse){
  const url='http://127.0.0.1:'+info.port+'/';console.log('Local: '+url);
  if(process.platform==='win32'){const child=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
  return;
 }
 process.argv=[process.execPath,path.join(root,'server','index.mjs'),'--host','127.0.0.1','--port',String(info.port),'--open'];
 await import('./index.mjs');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
