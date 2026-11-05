import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {configureLocalEnv,ensureLocalModel,chooseSitePort,warmLocalModel,LOCAL_MODEL,FAST_MODEL} from '../server/start-ollama.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('local setup replaces stale and duplicate provider settings while backing up all original settings',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-ollama-env-'))
 try{
  const file=path.join(dir,'.env'),original='\uFEFF# Keep these settings\r\nAI_PROVIDER=groq\r\nGROQ_API_KEY=synthetic-existing-key\r\nTEACHER_PIN=synthetic-pin\r\nAI_ACCESS_CODE=synthetic-access-code\r\nexport AI_PROVIDER = openai\r\nOLLAMA_MODEL=old-model\r\nOLLAMA_MODEL=another-old-model\r\n'
  writeFileSync(file,original)
  const changed=configureLocalEnv(file),content=readFileSync(file,'utf8')
  assert.equal(changed.changed,true);assert.equal(readFileSync(changed.backup,'utf8'),original)
  assert.match(content,/^AI_PROVIDER=ollama\r?$/m);assert.match(content,/^OLLAMA_MODEL=qwen3:4b\r?$/m)
  assert.equal(content.match(/^AI_PROVIDER=/gm).length,1);assert.equal(content.match(/^OLLAMA_MODEL=/gm).length,1)
  for(const line of ['# Keep these settings','GROQ_API_KEY=synthetic-existing-key','TEACHER_PIN=synthetic-pin','AI_ACCESS_CODE=synthetic-access-code'])assert.equal(content.includes(line+'\r\n'),true)
  const count=readdirSync(dir).length;assert.deepEqual(configureLocalEnv(file),{changed:false,backup:null});assert.equal(readdirSync(dir).length,count)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('local setup supports a missing env file without introducing a key or a cloud provider',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-ollama-new-'))
 try{const file=path.join(dir,'.env'),result=configureLocalEnv(file);assert.equal(result.backup,null);assert.equal(readFileSync(file,'utf8'),'AI_PROVIDER=ollama\nOLLAMA_MODEL=qwen3:4b\n')}finally{rmSync(dir,{recursive:true,force:true})}
})
test('an installed local model needs no download, generation, authentication or daemon restart',async()=>{
 let calls=0
 await ensureLocalModel({request:async(url,init)=>{calls++;assert.equal(url,'http://127.0.0.1:11434/api/tags');assert.equal(init.redirect,'error');assert.equal(init.headers,undefined);return new Response(JSON.stringify({models:[{name:LOCAL_MODEL}]}))},start:()=>{throw Error('must not start')},pull:()=>{throw Error('must not pull')},log:()=>{}})
 assert.equal(calls,1)
})
test('first local launch starts Ollama and downloads only the requested local model when absent',async()=>{
 let calls=0,starts=0,pulls=0
 await ensureLocalModel({command:'test-ollama',request:async(url)=>{
  calls++;assert.equal(url,'http://127.0.0.1:11434/api/tags')
  if(calls===1)throw Error('offline')
  return new Response(JSON.stringify({models:pulls?[{model:LOCAL_MODEL}]:[]}))
 },start:async command=>{assert.equal(command,'test-ollama');starts++},pull:async(command,model)=>{assert.equal(command,'test-ollama');assert.equal(model,'qwen3:4b');pulls++},wait:async()=>{},log:()=>{}})
 assert.equal(starts,1);assert.equal(pulls,1);assert.equal(calls,3)
})
test('an unavailable daemon or unfinished model download stops setup instead of using an online provider',async()=>{
 let pulls=0
 await assert.rejects(ensureLocalModel({request:async()=>{throw Error('private details')},start:async()=>{},pull:async()=>{pulls++},wait:async()=>{},log:()=>{}}),/Ollama did not become available/)
 assert.equal(pulls,0)
 await assert.rejects(ensureLocalModel({request:async()=>new Response(JSON.stringify({models:[]})),pull:async()=>{pulls++},log:()=>{}}),/local model is not available yet/)
 assert.equal(pulls,1)
})
test('startup skips an old Groq site and occupied ports, reusing only a matching Ollama site',async()=>{
 const request=async url=>{
  const port=new URL(url).port
  if(port==='5190')return new Response(JSON.stringify({ok:true,ai:true,provider:'Groq',model:'old-model',classrooms:false}))
  throw Error('no service')
 }
 assert.deepEqual(await chooseSitePort({request,isFree:async port=>port===5191}),{port:5191,reuse:false})
 assert.deepEqual(await chooseSitePort({request:async()=>new Response(JSON.stringify({ok:true,ai:true,provider:'Ollama',model:LOCAL_MODEL,classrooms:false})),isFree:async()=>{throw Error('must not probe an existing local site')}}),{port:5190,reuse:true})
 await assert.rejects(chooseSitePort({request:async()=>{throw Error('occupied')},isFree:async()=>false,first:5190,last:5191}),/Ports 5190 through 5199 are busy/)
})
test('keyless local inference does not bypass network-facing server protection in development',()=>{
 const result=spawnSync(process.execPath,['server/index.mjs','--dev','--host','0.0.0.0'],{cwd:root,encoding:'utf8',timeout:5000,env:{...process.env,AI_PROVIDER:'ollama',OPENAI_API_KEY:'',GAPGPT_API_KEY:'',AVALAI_API_KEY:'',GROQ_API_KEY:'',TEACHER_PIN:'',PUBLIC_ORIGIN:'',AI_ACCESS_CODE:''}})
 assert.notEqual(result.status,0);assert.match(result.stderr,/For a network-facing server/)
})

test('selecting light mode persists the smaller model and backs up the previous configuration',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'smartclass-light-env-'))
 try{
  const file=path.join(dir,'.env'),original='AI_PROVIDER=ollama\nOLLAMA_MODEL=qwen3:4b\nAI_ACCESS_CODE=keep-existing-access\n'
  writeFileSync(file,original)
  const saved=configureLocalEnv(file,{model:FAST_MODEL});assert.equal(readFileSync(saved.backup,'utf8'),original)
  assert.equal(readFileSync(file,'utf8'),'AI_PROVIDER=ollama\nOLLAMA_MODEL=qwen3:1.7b\nAI_ACCESS_CODE=keep-existing-access\n')
  assert.equal(configureLocalEnv(file,{model:FAST_MODEL}).changed,false)
  assert.throws(()=>configureLocalEnv(file,{model:'gemma4:cloud'}),/supported local model/)
  assert.match(readFileSync(file,'utf8'),/qwen3:1.7b/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('light setup pulls the smaller model even when the previous 4b model is installed',async()=>{
 let pulled=false
 await ensureLocalModel({model:FAST_MODEL,request:async url=>{assert.equal(url,'http://127.0.0.1:11434/api/tags');return new Response(JSON.stringify({models:[{name:LOCAL_MODEL},...(pulled?[{name:FAST_MODEL}]:[])]}))},pull:async(command,model)=>{assert.equal(model,FAST_MODEL);pulled=true},start:async()=>{throw Error('must not restart a ready daemon')},log:()=>{}})
 assert.equal(pulled,true)
})
test('light preload loads the same context as site requests without generating a question or sending a key',async()=>{
 let calls=0
 await warmLocalModel({request:async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:11434/api/generate');assert.deepEqual(init.headers,{'Content-Type':'application/json'});assert.equal(init.redirect,'error')
  const body=JSON.parse(init.body);assert.equal(body.model,FAST_MODEL);assert.deepEqual(body.options,{num_ctx:2048,num_predict:192});assert.equal(body.keep_alive,'30m');assert.equal(body.think,false);assert.equal(body.stream,false);assert.equal(Object.hasOwn(body,'prompt'),false);assert.equal(Object.hasOwn(body,'messages'),false)
  return new Response(JSON.stringify({model:FAST_MODEL,done:true,done_reason:'load'}))
 },log:()=>{}})
 assert.equal(calls,1)
})
test('failed or incomplete preload stops launch with a safe message instead of pretending the model is ready',async()=>{
 for(const result of ['offline','bad-status','not-done']){
  await assert.rejects(warmLocalModel({request:async()=>{if(result==='offline')throw Error('private runtime detail');return new Response(JSON.stringify({done:result!=='not-done',error:result==='bad-status'?'private runtime detail':undefined}),{status:result==='bad-status'?500:200})},log:()=>{}}),error=>{assert.match(error.message,/could not finish loading/);assert.equal(error.message.includes('private runtime detail'),false);return true})
 }
})
test('light launch skips the 4b site and both older language profiles of the same model',async()=>{
 const request=async url=>{
  const port=Number(new URL(url).port)
  if(port<=5192)return new Response(JSON.stringify({ok:true,ai:true,provider:'Ollama',model:port===5190?LOCAL_MODEL:FAST_MODEL,localMode:port===5191?'fast-v1':'fast-fa-v2',classrooms:false}))
  throw Error('unused port')
 }
 assert.deepEqual(await chooseSitePort({model:FAST_MODEL,mode:'fast-fa-final-v3',request,isFree:async port=>port===5193}),{port:5193,reuse:false})
 assert.deepEqual(await chooseSitePort({model:FAST_MODEL,mode:'fast-fa-final-v3',request:async()=>new Response(JSON.stringify({ok:true,ai:true,provider:'Ollama',model:FAST_MODEL,localMode:'fast-fa-final-v3',classrooms:false})),isFree:async()=>{throw Error('must reuse the current site')}}),{port:5190,reuse:true})
})
