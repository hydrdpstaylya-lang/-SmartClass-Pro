import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,cpSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseEnv} from 'node:util'
import {PassThrough,Writable} from 'node:stream'
import {spawnSync} from 'node:child_process'
import {configureOpenRouterEnv,readSecret,chooseOpenRouterPort} from '../server/start-openrouter.mjs'
import {OPENROUTER_MODEL,OPENROUTER_MODE} from '../server/ai-provider.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const KEY=['sk','or','synthetic','sample','only','notreal'].join('-')

test('OpenRouter setup backs up settings, removes stale duplicates and preserves other credentials and classroom controls',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-router-env-'))
 try{
  const file=path.join(dir,'.env')
  const original='\uFEFF# تنظیمات قبلی\r\nAI_PROVIDER=groq\r\nexport AI_PROVIDER = ollama\r\nOPENROUTER_MODEL=old-model\r\nOPENROUTER_MODEL=duplicate-model\r\nGROQ_API_KEY=unrelated-key\r\nAI_ACCESS_CODE=keep-access-code\r\nTEACHER_PIN=keep-teacher-pin\r\n'
  writeFileSync(file,original)
  const result=configureOpenRouterEnv(file,{apiKey:KEY})
  assert.equal(result.changed,true);assert.equal(readFileSync(result.backup,'utf8'),original)
  const text=readFileSync(file,'utf8'),settings=parseEnv(text)
  assert.equal(settings.AI_PROVIDER,'openrouter');assert.equal(settings.OPENROUTER_MODEL,OPENROUTER_MODEL);assert.equal(settings.OPENROUTER_API_KEY,KEY)
  for(const value of ['# تنظیمات قبلی','GROQ_API_KEY=unrelated-key','AI_ACCESS_CODE=keep-access-code','TEACHER_PIN=keep-teacher-pin'])assert.ok(text.includes(value+'\r\n'))
  assert.equal(text.match(/^AI_PROVIDER=/gm).length,1);assert.equal(text.match(/^OPENROUTER_MODEL=/gm).length,1)
  const count=readdirSync(dir).length
  assert.deepEqual(configureOpenRouterEnv(file,{apiKey:KEY}),{changed:false,backup:null})
  assert.equal(readdirSync(dir).length,count)
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('new OpenRouter settings contain only the chosen provider, its own key and the free model',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-router-new-'))
 try{
  const file=path.join(dir,'.env')
  assert.equal(configureOpenRouterEnv(file,{apiKey:KEY}).backup,null)
  assert.deepEqual({...parseEnv(readFileSync(file,'utf8'))},{AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:KEY,OPENROUTER_MODEL:OPENROUTER_MODEL})
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('invalid keys, newline injection and paid models cannot change or back up existing settings',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-router-invalid-'))
 try{
  const file=path.join(dir,'.env'),original='AI_PROVIDER=ollama\nTEACHER_PIN=keep-original\n'
  writeFileSync(file,original)
  for(const settings of [{apiKey:''},{apiKey:'unrelated-provider-key'},{apiKey:KEY+'\nAI_ACCESS_CODE=bad'},{apiKey:KEY,model:'nvidia/paid-model'},{apiKey:KEY,model:'bad model:free'}]){
   assert.throws(()=>configureOpenRouterEnv(file,settings));assert.equal(readFileSync(file,'utf8'),original);assert.equal(readdirSync(dir).length,1)
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('the terminal key prompt returns the pasted key without echoing it or leaving raw mode enabled',async()=>{
 const input=new PassThrough();input.isTTY=true
 const raw=[];input.setRawMode=enabled=>raw.push(enabled)
 let printed=''
 const output=new Writable({write(chunk,_encoding,done){printed+=chunk.toString();done()}})
 const result=readSecret({input,output})
 input.write(KEY+'\r')
 assert.equal(await result,KEY)
 assert.equal(printed.includes(KEY),false);assert.ok(printed.includes('OpenRouter'));assert.equal(raw.at(-1),false)
})

test('cancelling a hidden key prompt restores terminal input without revealing a partial key',async()=>{
 const input=new PassThrough();input.isTTY=true
 const raw=[];input.setRawMode=enabled=>raw.push(enabled)
 let printed=''
 const output=new Writable({write(chunk,_encoding,done){printed+=chunk.toString();done()}})
 const result=readSecret({input,output})
 input.write(KEY+'\u0003')
 await assert.rejects(result,/متوقف/)
 assert.equal(printed.includes(KEY),false);assert.equal(raw.at(-1),false)
})

test('startup skips local models and stale OpenRouter configuration, reusing only the current site',async()=>{
 const revision='current-config'
 const old=async url=>{
  const port=Number(new URL(url).port)
  if(port===5200)return new Response(JSON.stringify({ok:true,ai:true,provider:'Ollama',model:OPENROUTER_MODEL}))
  if(port===5201)return new Response(JSON.stringify({ok:true,ai:true,provider:'OpenRouter',model:OPENROUTER_MODEL,aiMode:OPENROUTER_MODE,configRevision:'old-config'}))
  throw Error('unused')
 }
 assert.deepEqual(await chooseOpenRouterPort({revision,request:old,isFree:async p=>p===5202}),{port:5202,reuse:false})
 assert.deepEqual(await chooseOpenRouterPort({revision,request:async()=>new Response(JSON.stringify({ok:true,ai:true,provider:'OpenRouter',model:OPENROUTER_MODEL,aiMode:OPENROUTER_MODE,configRevision:revision})),isFree:async()=>{throw Error('must reuse')}}),{port:5200,reuse:true})
 await assert.rejects(chooseOpenRouterPort({revision,first:5200,last:5201,request:async()=>{throw Error('busy')},isFree:async()=>false}),/5200/)
})

test('OpenRouter cannot bypass network-facing server protection even when a key is missing',()=>{
 const result=spawnSync(process.execPath,['server/index.mjs','--dev','--host','0.0.0.0'],{cwd:root,encoding:'utf8',timeout:5000,env:{...process.env,AI_PROVIDER:'openrouter',OPENAI_API_KEY:'',GAPGPT_API_KEY:'',AVALAI_API_KEY:'',GROQ_API_KEY:'',OPENROUTER_API_KEY:'',TEACHER_PIN:'',PUBLIC_ORIGIN:'',AI_ACCESS_CODE:''}})
 assert.notEqual(result.status,0);assert.match(result.stderr,/For a network-facing server/)
})

test('a misplaced update stops before requesting a key or writing settings',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-router-no-dist-'))
 try{
  cpSync(path.join(root,'server'),path.join(dir,'server'),{recursive:true})
  const result=spawnSync(process.execPath,['server/start-openrouter.mjs'],{cwd:dir,encoding:'utf8',timeout:5000})
  assert.notEqual(result.status,0);assert.match(result.stderr,/dist/);assert.equal(existsSync(path.join(dir,'.env')),false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
