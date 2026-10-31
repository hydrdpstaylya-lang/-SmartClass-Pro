import {spawn} from 'node:child_process'
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,copyFileSync} from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {loadEnvFile} from 'node:process'
import {ollamaRuntime,FAST_OLLAMA_MODEL,OLLAMA_FAST_MODE,OLLAMA_STANDARD_MODE} from './ai-provider.mjs'

export const LOCAL_MODEL='qwen3:4b'
export const FAST_MODEL=FAST_OLLAMA_MODEL
const OLLAMA_URL='http://127.0.0.1:11434'
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const validModel=model=>{if(![LOCAL_MODEL,FAST_MODEL].includes(model))throw Error('Choose a supported local model: '+LOCAL_MODEL+' or '+FAST_MODEL)}

// Change only the two local-provider settings. Keep keys, classroom settings,
// accounts and the database in place; save the previous .env before any write.
export function configureLocalEnv(file,{model=LOCAL_MODEL}={}){
 validModel(model)
 const original=existsSync(file)?readFileSync(file,'utf8'):''
 const newline=original.includes('\r\n')?'\r\n':'\n'
 const settings={AI_PROVIDER:'ollama',OLLAMA_MODEL:model},seen=new Set()
 const lines=original.replace(/^\uFEFF/,'').split(/\r?\n/)
 if(lines.at(-1)==='')lines.pop()
 const next=[]
 for(const line of lines){
  const name=line.match(/^\s*(?:export\s+)?(AI_PROVIDER|OLLAMA_MODEL)\s*=/)?.[1]
  if(!name){next.push(line);continue}
  if(!seen.has(name)){next.push(name+'='+settings[name]);seen.add(name)}
 }
 for(const [name,value] of Object.entries(settings))if(!seen.has(name))next.push(name+'='+value)
 const content=next.join(newline)+newline
 if(content===original)return{changed:false,backup:null}
 const suffix=Date.now()+'-'+randomUUID(),backup=existsSync(file)?file+'.before-ollama-'+suffix:null,temp=file+'.tmp-'+suffix
 if(backup)copyFileSync(file,backup)
 try{writeFileSync(temp,content,{encoding:'utf8',mode:0o600});renameSync(temp,file)}
 finally{if(existsSync(temp))unlinkSync(temp)}
 return{changed:true,backup}
}

function executable(){
 if(process.platform==='win32'&&process.env.LOCALAPPDATA){
  const installed=path.join(process.env.LOCALAPPDATA,'Programs','Ollama','ollama.exe')
  if(existsSync(installed))return installed
 }
 return'ollama'
}
function startService(command){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,['serve'],{detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434'}})
  child.once('error',()=>reject(Error('Ollama was not found. Install it from https://ollama.com/download/windows, then reopen this launcher.')))
  child.once('spawn',()=>{child.unref();resolve()})
 })
}
function pullModel(command,model){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,['pull',model],{windowsHide:true,stdio:'inherit',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434'}})
  child.once('error',()=>reject(Error('Could not run Ollama. Reopen Windows Terminal after installing Ollama.')))
  child.once('exit',code=>code===0?resolve():reject(Error('Model download did not finish. Run: ollama pull '+model+', then reopen this launcher.')))
 })
}

export async function ensureLocalModel({model=LOCAL_MODEL,request=fetch,start=startService,pull=pullModel,wait=delay,command=executable(),log=console.log}={}){
 validModel(model)
 const tags=async()=>{
  try{
   const response=await request(OLLAMA_URL+'/api/tags',{signal:AbortSignal.timeout(1500),redirect:'error'})
   if(!response.ok)return null
   const data=await response.json()
   return Array.isArray(data.models)?data.models:null
  }catch{return null}
 }
 let models=await tags()
 if(!models){
  log('Starting local Ollama...')
  await start(command)
  for(let i=0;i<30&&!models;i++){await wait(500);models=await tags()}
  if(!models)throw Error('Ollama did not become available at http://127.0.0.1:11434. Open the Ollama application and try again.')
 }
 const installed=list=>list?.some(item=>item.name===model||item.model===model)
 if(!installed(models)){
  log('Downloading local model '+model+' (about '+(model===FAST_MODEL?'1.4':'2.5')+' GB; first run only)...')
  await pull(command,model)
  models=await tags()
  if(!installed(models))throw Error('The local model is not available yet. Finish: ollama pull '+model)
 }
 log('Local model ready: '+model)
}

export async function warmLocalModel({model=FAST_MODEL,request=fetch,log=console.log}={}){
 validModel(model)
 log('Loading '+model+' into memory before opening SmartClass. Please wait...')
 try{
  const response=await request(OLLAMA_URL+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,think:false,...ollamaRuntime(model)}),signal:AbortSignal.timeout(180000),redirect:'error'})
  if(!response.ok)throw Error('load failed')
  const result=await response.json()
  if(result.done!==true||result.error)throw Error('load incomplete')
 }catch{throw Error('Ollama could not finish loading the local model. Close unused heavy applications, then run ollama ps in Windows Terminal and send its output for diagnosis.')}
 log('Local model loaded. Opening SmartClass...')
}

async function available(port){
 return new Promise(resolve=>{
  const probe=net.createServer()
  probe.once('error',()=>resolve(false))
  probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)))
 })
}
export async function chooseSitePort({model=LOCAL_MODEL,mode,request=fetch,isFree=available,first=5190,last=5199}={}){
 validModel(model)
 for(let port=first;port<=last;port++){
  try{
   const response=await request('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(600),redirect:'error'})
   const data=await response.json()
   if(response.ok&&data.ok===true&&data.ai===true&&data.provider==='Ollama'&&data.model===model&&(!mode||data.localMode===mode)&&typeof data.classrooms==='boolean')return{port,reuse:true}
  }catch{}
  if(await isFree(port))return{port,reuse:false}
 }
 throw Error('Ports 5190 through 5199 are busy. Close an old SmartClass server window, then try again.')
}

async function main(){
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
 process.chdir(root)
 if(!existsSync(path.join(root,'dist','index.html')))throw Error('Extract this update into your existing SmartClass-AI-Studio folder. The built dist folder must already be there.')
 const fast=process.argv.includes('--fast'),model=fast?FAST_MODEL:LOCAL_MODEL
 console.log('SmartClass - Local Ollama '+(fast?'light mode':'standard mode'))
 await ensureLocalModel({model})
 if(fast)await warmLocalModel({model})
 const envFile=path.join(root,'.env'),saved=configureLocalEnv(envFile,{model})
 if(saved.changed)console.log('AI_PROVIDER=ollama and OLLAMA_MODEL='+model+' saved. Previous settings were backed up.')
 loadEnvFile(envFile)
 // Explicitly select the local provider even if an old terminal inherited
 // AI_PROVIDER=groq. Credentials for other providers are never forwarded.
 process.env.AI_PROVIDER='ollama';process.env.OLLAMA_MODEL=model
 const selected=await chooseSitePort({model,mode:fast?OLLAMA_FAST_MODE:OLLAMA_STANDARD_MODE}),url='http://127.0.0.1:'+selected.port+'/'
 if(selected.reuse){
  console.log('Local Ollama SmartClass is already running: '+url)
  if(process.platform==='win32'){
   const child=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'})
   child.on('error',()=>{});child.unref()
  }
  return
 }
 process.argv.push('--host','127.0.0.1','--port',String(selected.port),'--open')
 await import('./index.mjs')
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1})
