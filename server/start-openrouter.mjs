import {spawn} from 'node:child_process'
import {existsSync,readFileSync,writeFileSync,copyFileSync,renameSync,unlinkSync,statSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {loadEnvFile} from 'node:process'
import {parseEnv} from 'node:util'
import {Writable} from 'node:stream'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import net from 'node:net'
import path from 'node:path'
import {aiProvider,OPENROUTER_MODEL,OPENROUTER_MODE} from './ai-provider.mjs'

export const validOpenRouterKey=key=>typeof key==='string'&&/^sk-or-[a-zA-Z0-9_-]{14,480}$/.test(key)

export function configureOpenRouterEnv(file,{apiKey,model=OPENROUTER_MODEL}={}){
 if(!validOpenRouterKey(apiKey))throw Error('کلید OpenRouter معتبر به نظر نمی‌رسد؛ کلید همان سرویس را کامل کپی کن.')
 const selected=aiProvider({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:apiKey,OPENROUTER_MODEL:model})
 if(!selected.configured)throw Error(selected.error)
 const original=existsSync(file)?readFileSync(file,'utf8'):''
 const newline=original.includes('\r\n')?'\r\n':'\n'
 const wanted={AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:apiKey,OPENROUTER_MODEL:model}
 const seen=new Set(),next=[]
 const lines=original.replace(/^\uFEFF/,'').split(/\r?\n/)
 if(lines.at(-1)==='')lines.pop()
 for(const line of lines){
  const name=line.match(/^\s*(?:export\s+)?(AI_PROVIDER|OPENROUTER_API_KEY|OPENROUTER_MODEL)\s*=/)?.[1]
  if(!name){next.push(line);continue}
  if(!seen.has(name)){next.push(name+'='+(name==='OPENROUTER_API_KEY'?JSON.stringify(wanted[name]):wanted[name]));seen.add(name)}
 }
 for(const [name,value]of Object.entries(wanted))if(!seen.has(name))next.push(name+'='+(name==='OPENROUTER_API_KEY'?JSON.stringify(value):value))
 const content=next.join(newline)+newline
 if(content===original)return{changed:false,backup:null}
 const backup=existsSync(file)?file+'.before-openrouter-'+Date.now()+'-'+randomUUID():null
 const temporary=file+'.openrouter-'+randomUUID()+'.tmp'
 try{
  if(backup)copyFileSync(file,backup)
  writeFileSync(temporary,content,{mode:0o600,flag:'wx'})
  renameSync(temporary,file)
 }finally{if(existsSync(temporary))unlinkSync(temporary)}
 return{changed:true,backup}
}

export function readSecret({input=process.stdin,output=process.stdout}={}){
 if(!input.isTTY)return Promise.reject(Error('فایل START-SMARTCLASS.cmd را در یک پنجرهٔ معمولی ترمینال اجرا کن.'))
 return new Promise((resolve,reject)=>{
  let muted=false,finished=false
  const sink=new Writable({write(chunk,_encoding,done){if(!muted)output.write(chunk);done()}})
  const rl=createInterface({input,output:sink,terminal:true,historySize:0})
  const stop=()=>{if(finished)return;finished=true;muted=false;rl.close();output.write('\n');reject(Error('ورود کلید متوقف شد.'))}
  rl.on('SIGINT',stop)
  rl.on('close',()=>{if(!finished){finished=true;reject(Error('کلیدی دریافت نشد.'))}})
  rl.question('کلید OpenRouter را بچسبان و Enter بزن (کلید نمایش داده نمی‌شود): ',value=>{
   if(finished)return
   finished=true;muted=false;rl.close();output.write('\n');resolve(value.trim())
  })
  muted=true
 })
}

async function isAvailable(port){
 return new Promise(resolve=>{
  const probe=net.createServer()
  probe.once('error',()=>resolve(false))
  probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)))
 })
}

export async function chooseOpenRouterPort({revision,model=OPENROUTER_MODEL,request=fetch,isFree=isAvailable,first=5200,last=5219}={}){
 for(let port=first;port<=last;port++){
  try{
   const response=await request('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(700),redirect:'error'})
   const data=await response.json()
   if(response.ok&&data.ok===true&&data.ai===true&&data.provider==='OpenRouter'&&data.model===model&&data.aiMode===OPENROUTER_MODE&&data.configRevision===revision)return{port,reuse:true}
  }catch{}
  if(await isFree(port))return{port,reuse:false}
 }
 throw Error('پنجره‌های قدیمی سرور SmartClass را ببند و دوباره فایل اجرا را باز کن؛ پورت‌های 5200 تا 5219 اشغال‌اند.')
}

function openBrowser(url){
 if(process.platform!=='win32')return
 const child=spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'})
 child.on('error',()=>{});child.unref()
}

async function main(){
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
 process.chdir(root)
 if(!existsSync(path.join(root,'dist','index.html')))throw Error('این به‌روزرسانی را داخل پوشهٔ سایت قبلی استخراج کن؛ پوشهٔ dist باید کنار فایل اجرا باشد.')
 const envFile=path.join(root,'.env')
 const previous=existsSync(envFile)?parseEnv(readFileSync(envFile,'utf8').replace(/^\uFEFF/,'')):{}
 let apiKey=previous.OPENROUTER_API_KEY||''
 if(process.argv.includes('--reset-key')||!validOpenRouterKey(apiKey))apiKey=await readSecret()
 const model=OPENROUTER_MODEL
 const saved=configureOpenRouterEnv(envFile,{apiKey,model})
 if(saved.changed)console.log('تنظیمات OpenRouter ذخیره شد؛ از تنظیمات قبلی پشتیبان گرفته شد.')
 loadEnvFile(envFile)
 process.env.AI_PROVIDER='openrouter'
 process.env.OPENROUTER_API_KEY=apiKey
 process.env.OPENROUTER_MODEL=model
 const info=statSync(envFile),revision=createHash('sha256').update(root).digest('hex').slice(0,16)+':'+String(info.mtimeMs)+'-'+String(info.size)
 process.env.SMARTCLASS_CONFIG_REVISION=revision
 const selected=await chooseOpenRouterPort({revision,model})
 const url='http://127.0.0.1:'+selected.port+'/'
 if(selected.reuse){console.log('Local: '+url);openBrowser(url);return}
 process.argv=[process.execPath,path.join(root,'server','index.mjs'),'--host','127.0.0.1','--port',String(selected.port),'--open']
 await import('./index.mjs')
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1})
