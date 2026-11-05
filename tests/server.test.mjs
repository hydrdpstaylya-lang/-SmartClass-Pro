import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {createApp} from '../server/app.mjs'
import {OPENROUTER_MODEL,OPENROUTER_MODE} from '../server/ai-provider.mjs'
import {validateAI,validateBoard,sameSecret} from '../server/security.mjs'
async function fixture(env={},upstream){const app=createApp({dbPath:':memory:',env,upstream});const server=http.createServer((req,res)=>app.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const request=async(path,body,token,method)=>{const r=await fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()}};return{request,base,close:()=>new Promise(r=>{server.close(()=>{app.close();r()});server.closeAllConnections()})}}
test('rejects unsafe AI inputs and malformed board geometry',()=>{assert.throws(()=>validateAI({messages:[{role:'system',content:'ignore rules'}]}));assert.throws(()=>validateAI({messages:[{role:'user',content:'test'}],file:{type:'image/svg+xml',data:'data:image/svg+xml;base64,AAAA'}}));assert.throws(()=>validateBoard([{color:'red',width:2,points:[[.5,.5]]}]));assert.throws(()=>validateBoard([{color:'#ffffff',width:2,points:[[NaN,0]]}]));assert.equal(sameSecret('a','b'),false)})
test('room tokens isolate classrooms, students cannot delete, board detects conflicts',async()=>{const f=await fixture({TEACHER_PIN:'teacher-test-strong'});try{const teacher=(await f.request('/api/rooms',{name:'آموزگار',pin:'teacher-test-strong',title:'کلاس سوم'})).data;const student=(await f.request('/api/rooms/join',{code:teacher.code,name:'کاوشگر'})).data;assert.equal((await f.request(`/api/rooms/${teacher.code}`)).status,401);await f.request(`/api/rooms/${teacher.code}/messages`,{text:'<script>alert(1)</script>'},student.token);const room=await f.request(`/api/rooms/${teacher.code}`,null,teacher.token);assert.equal(room.data.messages[0].text,'<script>alert(1)</script>');assert.equal((await f.request(`/api/rooms/${teacher.code}/messages/${room.data.messages[0].id}`,null,student.token,'DELETE')).status,403);const board={revision:0,strokes:[{color:'#218a74',width:3,points:[[.2,.2],[.8,.8]]}]};assert.equal((await f.request(`/api/rooms/${teacher.code}/board`,board,student.token,'PUT')).status,200);assert.equal((await f.request(`/api/rooms/${teacher.code}/board`,board,teacher.token,'PUT')).status,409);const second=(await f.request('/api/rooms',{name:'آموزگار',pin:'teacher-test-strong',title:'کلاس دوم'})).data;assert.equal((await f.request(`/api/rooms/${second.code}`,null,student.token)).status,403);assert.equal((await f.request(`/api/rooms/${teacher.code}/messages/${room.data.messages[0].id}`,null,teacher.token,'DELETE')).status,200)}finally{await f.close()}})
test('AI uses a server-only key, bounded output, no response storage, and daily quota',async()=>{let calls=0;const f=await fixture({OPENAI_API_KEY:'test-secret-never-return',AI_DAILY_LIMIT:'1'},async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.headers.Authorization,'Bearer test-secret-never-return');const body=JSON.parse(init.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,1800);assert.equal(body.input[0].role,'user');return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'جواب آزمایشی'}]}]}),{status:200,headers:{'Content-Type':'application/json'}})});try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'ضرب چیست؟'}]});assert.equal(r.status,200);assert.equal(r.data.text,'جواب آزمایشی');assert.equal(JSON.stringify(r).includes('test-secret'),false);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'باز هم'}]})).status,429);assert.equal(calls,1)}finally{await f.close()}})
test('requires AI access code and rejects cross-origin mutations',async()=>{const f=await fixture({OPENAI_API_KEY:'test',AI_ACCESS_CODE:'access-code-test'});try{assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'hi'}]})).status,401);const r=await fetch(f.base+'/api/rooms/join',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({code:'ABC',name:'x'})});assert.equal(r.status,403)}finally{await f.close()}})

test('GPT-6.1 Sol uses supported low reasoning and preserves the Responses output contract',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'openai',OPENAI_MODEL:'gpt-6.1-sol',OPENAI_API_KEY:'test-sol-secret'},async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.headers.Authorization,'Bearer test-sol-secret')
  const body=JSON.parse(init.body)
  assert.equal(body.model,'gpt-6.1-sol');assert.deepEqual(body.reasoning,{effort:'low'});assert.equal(body.store,false);assert.equal(body.max_output_tokens,1800)
  assert.deepEqual(body.input,[{role:'user',content:'سلام، ضرب را توضیح بده.'}]);assert.match(body.instructions,/grade 3/)
  return new Response(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'سه گروه چهارتایی می‌شود دوازده.'}]}]}))
 })
 try{
  const health=await f.request('/api/health');assert.equal(health.data.model,'gpt-6.1-sol');assert.equal(health.data.provider,'OpenAI')
  const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام، ضرب را توضیح بده.'}]})
  assert.equal(r.status,200);assert.equal(r.data.model,'gpt-6.1-sol');assert.equal(r.data.text,'سه گروه چهارتایی می‌شود دوازده.');assert.equal(JSON.stringify(r).includes('test-sol-secret'),false);assert.equal(calls,1)
 }finally{await f.close()}
})

test('GapGPT uses its own key, exact model, Chat Completions schema and response parser',async()=>{let called=0;const f=await fixture({AI_PROVIDER:'gapgpt',GAPGPT_API_KEY:'gap-test-secret',OPENAI_API_KEY:'unrelated-openai-key'},async(url,init)=>{called++;assert.equal(url,'https://api.gapgpt.app/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer gap-test-secret');const b=JSON.parse(init.body);assert.equal(b.model,'gapgpt-gemma-26b-a4b');assert.equal(b.messages[0].role,'system');assert.equal(b.messages[1].content,'hello');assert.equal(b.reasoning,undefined);assert.equal(b.input,undefined);return new Response(JSON.stringify({choices:[{message:{content:'سلام از گپ'}}]}))});try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'hello'}]});assert.equal(r.status,200);assert.equal(r.data.text,'سلام از گپ');assert.equal(r.data.provider,'GapGPT');assert.equal(called,1);const health=await f.request('/api/health');assert.equal(health.data.model,'gapgpt-gemma-26b-a4b')}finally{await f.close()}})
test('GapGPT rejects file input before transmitting and redacts raw provider error messages',async()=>{let called=0;const f=await fixture({AI_PROVIDER:'gapgpt',GAPGPT_API_KEY:'gap-secret'},async()=>{called++;return new Response(JSON.stringify({error:{code:'invalid_api_key',message:'secret gap-secret'}}),{status:401})});try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'hello'}]});assert.equal(r.status,503);assert.match(r.data.error,/invalid_api_key/);assert.equal(r.data.error.includes('gap-secret'),false);const pdf={type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')};const image=await f.request('/api/ai',{messages:[{role:'user',content:'scan'}],file:pdf});assert.equal(image.status,400);assert.equal(called,1)}finally{await f.close()}})

test('AvalAI routes to its own endpoint and key, supports text chat, and reports the actual provider',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'avalai',AVALAI_API_KEY:'aval-test-secret',AVALAI_MODEL:'selected-test-model',OPENAI_API_KEY:'unrelated-openai-key',GAPGPT_API_KEY:'unrelated-gap-key'},async(url,init)=>{
  calls++;assert.equal(url,'https://api.avalai.ir/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer aval-test-secret')
  const b=JSON.parse(init.body);assert.equal(b.model,'selected-test-model');assert.equal(b.max_completion_tokens,1800);assert.equal(b.max_tokens,undefined);assert.equal(b.stream,false);assert.equal(b.store,false);assert.equal(b.reasoning,undefined);assert.equal(b.reasoning_effort,undefined)
  assert.equal(b.messages[0].role,'system');assert.match(b.messages[0].content,/grade 3/);assert.deepEqual(b.messages.slice(1),[{role:'user',content:'سلام'},{role:'assistant',content:'سلام، چه چیزی یاد بگیریم؟'},{role:'user',content:'ضرب چیست؟'}])
  return new Response(JSON.stringify({choices:[{message:{content:'سه گروه چهارتایی می‌شود دوازده.'}}]}))
 })
 try{
  const health=await f.request('/api/health');assert.equal(health.data.provider,'AvalAI');assert.equal(health.data.ai,true);assert.equal(health.data.model,'selected-test-model');assert.equal(JSON.stringify(health).includes('aval-test-secret'),false)
  const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'},{role:'assistant',content:'سلام، چه چیزی یاد بگیریم؟'},{role:'user',content:'ضرب چیست؟'}]});assert.equal(r.status,200);assert.equal(r.data.provider,'AvalAI');assert.equal(r.data.text,'سه گروه چهارتایی می‌شود دوازده.');assert.equal(calls,1)
 }finally{await f.close()}
})
test('AvalAI requires its own key and an explicit model; placeholders never trigger a billable call',async()=>{
 const settings=[{OPENAI_API_KEY:'unrelated-key',AVALAI_MODEL:'selected-test-model'},{AVALAI_API_KEY:'aval-secret'},{AVALAI_API_KEY:'PASTE_YOUR_AVALAI_KEY_HERE',AVALAI_MODEL:'selected-test-model'},{AVALAI_API_KEY:'aval-secret',AVALAI_MODEL:'PUT_MODEL_ID_HERE'},{AVALAI_API_KEY:'aval-secret',AVALAI_MODEL:'sk-fake-misplaced-secret'}]
 for(const env of settings){let calls=0;const f=await fixture({AI_PROVIDER:'avalai',...env},async()=>{calls++;throw Error('must not send')});try{const health=await f.request('/api/health');assert.equal(health.data.provider,'AvalAI');assert.equal(health.data.ai,false);assert.equal(health.data.model,'');assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,503);assert.equal(calls,0)}finally{await f.close()}}
})
test('AvalAI supports an explicitly selected Responses route without forcing OpenAI reasoning parameters',async()=>{
 const f=await fixture({AI_PROVIDER:'avalai',AVALAI_API_KEY:'aval-response-secret',AVALAI_MODEL:'selected-response-model',AVALAI_API_STYLE:'responses',AVALAI_BASE_URL:'https://api.avalapis.ir/v1/'},async(url,init)=>{
  assert.equal(url,'https://api.avalapis.ir/v1/responses');const b=JSON.parse(init.body);assert.equal(b.model,'selected-response-model');assert.equal(b.reasoning,undefined);assert.equal(b.max_output_tokens,1800);assert.equal(b.store,false);assert.equal(b.input[0].content[0].type,'input_text');assert.equal(b.input[0].content[1].type,'input_file')
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'پاسخ آزمایشی Responses'}]}]}))
 })
 try{const pdf={type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')};const r=await f.request('/api/ai',{messages:[{role:'user',content:'خواندن فایل'}],file:pdf});assert.equal(r.status,200);assert.equal(r.data.text,'پاسخ آزمایشی Responses')}finally{await f.close()}
})
test('invalid providers, AvalAI routes and base URLs are rejected instead of falling back to OpenAI',async()=>{
 for(const env of [{AI_PROVIDER:'avalai',AVALAI_API_STYLE:'wrong'},{AI_PROVIDER:'avalai',AVALAI_BASE_URL:'https://untrusted.example/v1'},{AI_PROVIDER:'unknown'},{AI_PROVIDER:'__proto__'}]){
  let calls=0;const f=await fixture({AVALAI_API_KEY:'aval-secret',AVALAI_MODEL:'selected-test-model',OPENAI_API_KEY:'openai-secret',...env},async()=>{calls++;throw Error('must not send')})
  try{assert.equal((await f.request('/api/health')).data.ai,false);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,503);assert.equal(calls,0)}finally{await f.close()}
 }
})
test('AvalAI identifies exhausted credits without leaking provider messages or keys',async()=>{
 for(const status of [402,429]){
  const f=await fixture({AI_PROVIDER:'avalai',AVALAI_API_KEY:'aval-billing-secret',AVALAI_MODEL:'selected-test-model'},async()=>new Response(JSON.stringify({error:{code:'credit_balance_exhausted',message:'Do not leak aval-billing-secret'}}),{status}))
  try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,503);assert.match(r.data.error,/AvalAI/);assert.match(r.data.error,/credit_balance_exhausted/);assert.equal(JSON.stringify(r).includes('aval-billing-secret'),false)}finally{await f.close()}
 }
})
test('AvalAI text-only setup rejects file input before sending it to the provider',async()=>{
 let calls=0;const f=await fixture({AI_PROVIDER:'avalai',AVALAI_API_KEY:'aval-test',AVALAI_MODEL:'selected-test-model'},async()=>{calls++;throw Error('must not send')})
 try{const pdf={type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')};const r=await f.request('/api/ai',{messages:[{role:'user',content:'اسکن تکلیف'}],file:pdf});assert.equal(r.status,400);assert.match(r.data.error,/AvalAI/);assert.equal(calls,0)}finally{await f.close()}
})

test('Groq uses its own endpoint and key, preserves tutor context, and returns only the final answer',async()=>{
 let calls=0
 const messages=[{role:'user',content:'سلام'},{role:'assistant',content:'چه چیزی یاد بگیریم؟'},{role:'user',content:'ضرب چیست؟'}]
 const f=await fixture({AI_PROVIDER:'groq',GROQ_API_KEY:'test-groq-secret',OPENAI_API_KEY:'unrelated-openai-key',AVALAI_API_KEY:'unrelated-aval-key',AVALAI_MODEL:'old-model'},async(url,init)=>{
  calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer test-groq-secret')
  const b=JSON.parse(init.body);assert.equal(b.model,'openai/gpt-oss-20b');assert.equal(b.max_completion_tokens,1800);assert.equal(b.stream,false);assert.equal(b.reasoning_effort,'low');assert.equal(b.include_reasoning,false)
  for(const field of ['store','input','max_output_tokens','max_tokens','reasoning','reasoning_format','service_tier'])assert.equal(Object.hasOwn(b,field),false)
  assert.equal(b.messages[0].role,'system');assert.match(b.messages[0].content,/grade 3/);assert.match(b.messages[0].content,/Persian/);assert.deepEqual(b.messages.slice(1),messages)
  return new Response(JSON.stringify({choices:[{message:{content:'سه گروه چهارتایی می‌شود دوازده.',reasoning:'internal-test-reasoning'}}]}))
 })
 try{
  const health=await f.request('/api/health');assert.deepEqual({provider:health.data.provider,model:health.data.model,ai:health.data.ai},{provider:'Groq',model:'openai/gpt-oss-20b',ai:true});assert.equal(calls,0);assert.equal(JSON.stringify(health).includes('test-groq-secret'),false)
  const r=await f.request('/api/ai',{messages});assert.equal(r.status,200);assert.equal(r.data.text,'سه گروه چهارتایی می‌شود دوازده.');assert.equal(r.data.provider,'Groq');assert.equal(r.data.model,'openai/gpt-oss-20b');assert.equal(JSON.stringify(r).includes('internal-test-reasoning'),false);assert.equal(JSON.stringify(r).includes('test-groq-secret'),false);assert.equal(calls,1)
 }finally{await f.close()}
})
test('Groq honors an explicit model without imposing GPT-OSS-only options on other models',async()=>{
 const f=await fixture({AI_PROVIDER:'groq',GROQ_API_KEY:'test-groq-secret',GROQ_MODEL:'selected-test-model'},async(url,init)=>{
  const b=JSON.parse(init.body);assert.equal(b.model,'selected-test-model');assert.equal(Object.hasOwn(b,'reasoning_effort'),false);assert.equal(Object.hasOwn(b,'include_reasoning'),false);assert.equal(Object.hasOwn(b,'store'),false)
  return new Response(JSON.stringify({choices:[{message:{content:'پاسخ آزمایشی'}}]}))
 })
 try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,200);assert.equal(r.data.model,'selected-test-model')}finally{await f.close()}
})
test('Groq requires its own key and rejects placeholders or a key placed in the model field',async()=>{
 for(const settings of [{},{GROQ_API_KEY:'PASTE_YOUR_GROQ_KEY_HERE'},{GROQ_API_KEY:'test-groq-secret',GROQ_MODEL:'PUT_MODEL_ID_HERE'},{GROQ_API_KEY:'test-groq-secret',GROQ_MODEL:'gsk_fake_test'}]){
  let calls=0;const f=await fixture({AI_PROVIDER:'groq',OPENAI_API_KEY:'unrelated-openai-key',AVALAI_API_KEY:'unrelated-aval-key',...settings},async()=>{calls++;throw Error('must not send')})
  try{const health=await f.request('/api/health');assert.equal(health.data.ai,false);assert.equal(health.data.model,'');assert.equal(health.data.provider,'Groq');assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,503);assert.equal(calls,0)}finally{await f.close()}
 }
})
test('Groq rejects PDF and images before transmitting or using the daily AI quota',async()=>{
 let calls=0;const f=await fixture({AI_PROVIDER:'groq',GROQ_API_KEY:'test-groq-secret',AI_DAILY_LIMIT:'1'},async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'پاسخ متنی'}}]}))})
 try{
  const files=[{type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')},{type:'image/png',data:'data:image/png;base64,iVBORw0KGgo='}]
  for(const file of files){const r=await f.request('/api/ai',{messages:[{role:'user',content:'این را بخوان'}],file});assert.equal(r.status,400);assert.match(r.data.error,/Groq/)}
  assert.equal(calls,0);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,200);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'باز هم'}]})).status,429);assert.equal(calls,1)
 }finally{await f.close()}
})
test('Groq errors distinguish a rate limit from an invalid key without leaking credentials or retrying',async()=>{
 for(const [status,code] of [[401,'invalid_api_key'],[429,'rate_limit_exceeded'],[429,'test-groq-secret'],[429,'gsk_other_key']]){
  let calls=0;const f=await fixture({AI_PROVIDER:'groq',GROQ_API_KEY:'test-groq-secret'},async()=>{calls++;return new Response(JSON.stringify({error:{code,message:'raw detail test-groq-secret'}}),{status})})
  try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,503);assert.match(r.data.error,new RegExp('HTTP '+status));assert.equal(JSON.stringify(r).includes('test-groq-secret'),false);assert.equal(JSON.stringify(r).includes('gsk_other_key'),false);assert.equal(JSON.stringify(r).includes('raw detail'),false);if(status===429)assert.match(r.data.error,/Limits/);else assert.match(r.data.error,/کلید/);assert.equal(calls,1)}finally{await f.close()}
 }
})

test('Ollama sends the real tutor conversation only to the local API without credentials or cloud options',async()=>{
 let calls=0
 const messages=[{role:'user',content:'سلام'},{role:'assistant',content:'چه چیزی یاد بگیریم؟'},{role:'user',content:'ضرب ۳ در ۴ چیست؟'}]
 const f=await fixture({AI_PROVIDER:'ollama',GROQ_API_KEY:'old-groq-secret',OPENAI_API_KEY:'old-openai-secret',AVALAI_API_KEY:'old-aval-secret',GROQ_MODEL:'old-cloud-model'},async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:11434/api/chat');assert.deepEqual(init.headers,{'Content-Type':'application/json'});assert.equal(init.redirect,'error');assert.equal(init.signal.aborted,false)
  const body=JSON.parse(init.body)
  assert.equal(body.model,'qwen3:4b');assert.equal(body.stream,false);assert.equal(body.think,false);assert.equal(body.keep_alive,'5m');assert.deepEqual(body.options,{num_ctx:4096,num_predict:512})
  assert.equal(body.messages[0].role,'system');assert.match(body.messages[0].content,/پایهٔ سوم/);assert.match(body.messages[0].content,/فارسی/)
  assert.equal(body.messages.length,messages.length+1);assert.deepEqual(body.messages.slice(1,-1),messages.slice(0,-1));assert.equal(body.messages.at(-1).role,'user');assert.ok(body.messages.at(-1).content.startsWith(messages.at(-1).content+'\n'));assert.match(body.messages.at(-1).content,/\/no_think$/)
  for(const field of ['store','input','max_output_tokens','max_completion_tokens','reasoning_effort','service_tier'])assert.equal(Object.hasOwn(body,field),false)
  assert.equal(init.body.includes('old-groq-secret'),false);assert.equal(init.body.includes('old-openai-secret'),false)
  return new Response(JSON.stringify({model:'qwen3:4b',message:{role:'assistant',content:'سه گروه چهارتایی می‌شود دوازده.',thinking:'internal-test-trace'},done:true}))
 })
 try{
  const health=await f.request('/api/health');assert.equal(health.data.ai,true);assert.equal(health.data.provider,'Ollama');assert.equal(health.data.model,'qwen3:4b');assert.equal(calls,0)
  const r=await f.request('/api/ai',{messages});assert.equal(r.status,200);assert.deepEqual(r.data,{text:'سه گروه چهارتایی می‌شود دوازده.',model:'qwen3:4b',provider:'Ollama'});assert.equal(JSON.stringify(r).includes('internal-test-trace'),false);assert.equal(calls,1)
 }finally{await f.close()}
})
test('Ollama rejects cloud model names, credentials in the model field, and invalid configuration before any call',async()=>{
 for(const model of ['gemma4:cloud','gpt-oss:120b-cloud','qwen3:4b\nwrong','PUT_MODEL_ID_HERE','gsk_fake_test','qwen3:4b;whoami','https://example.com/model']){
  let calls=0;const f=await fixture({AI_PROVIDER:'ollama',OLLAMA_MODEL:model,GROQ_API_KEY:'unrelated-secret'},async()=>{calls++;throw Error('must not call')})
  try{const health=await f.request('/api/health');assert.equal(health.data.ai,false);assert.equal(health.data.model,'');assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,503);assert.equal(calls,0)}finally{await f.close()}
 }
})
test('Ollama rejects files before consuming quota and keeps the existing daily request limit',async()=>{
 let calls=0;const f=await fixture({AI_PROVIDER:'ollama',AI_DAILY_LIMIT:'1'},async()=>{calls++;return new Response(JSON.stringify({message:{content:'سلام'}}))})
 try{
  for(const file of [{type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')},{type:'image/png',data:'data:image/png;base64,iVBORw0KGgo='}]){
   const r=await f.request('/api/ai',{messages:[{role:'user',content:'بخوان'}],file});assert.equal(r.status,400);assert.match(r.data.error,/Ollama/)
  }
  assert.equal(calls,0);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,200);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'دوباره'}]})).status,429);assert.equal(calls,1)
 }finally{await f.close()}
})
test('Ollama connection, missing-model and memory errors are actionable without exposing upstream details or falling back',async()=>{
 for(const scenario of ['offline','missing','memory','forbidden']){
  let calls=0;const f=await fixture({AI_PROVIDER:'ollama',GROQ_API_KEY:'unused-secret'},async(url)=>{
   calls++;assert.equal(url,'http://127.0.0.1:11434/api/chat')
   if(scenario==='offline')throw new TypeError('private-machine-detail unused-secret')
   const status=scenario==='missing'?404:scenario==='memory'?500:403
   return new Response(JSON.stringify({error:scenario==='memory'?'model requires more system memory private-machine-detail unused-secret':'private-machine-detail unused-secret'}),{status})
  })
  try{
   const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,503);assert.equal(calls,1);assert.equal(JSON.stringify(r).includes('unused-secret'),false);assert.equal(JSON.stringify(r).includes('private-machine-detail'),false)
   assert.match(r.data.error,scenario==='offline'?/Ollama/:scenario==='missing'?/ollama pull qwen3:4b/:scenario==='memory'?/حافظه/:/HTTP 403/)
  }finally{await f.close()}
 }
})
test('Ollama allows only one generation at a time and releases the slot after completion',async()=>{
 let release,started;const waiting=new Promise(resolve=>{release=resolve}),ready=new Promise(resolve=>{started=resolve});let calls=0
 const f=await fixture({AI_PROVIDER:'ollama'},async()=>{calls++;started();await waiting;return new Response(JSON.stringify({message:{content:'پاسخ محلی'}}))})
 let first
 try{
  first=f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});await ready
  assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'دوم'}]})).status,429);assert.equal(calls,1)
  release();assert.equal((await first).status,200);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سوم'}]})).status,200);assert.equal(calls,2)
 }finally{release();await first;await f.close()}
})
test('Ollama still requires the configured AI access code and same-origin requests',async()=>{
 let calls=0;const f=await fixture({AI_PROVIDER:'ollama',AI_ACCESS_CODE:'local-ai-code-test'},async()=>{calls++;return new Response(JSON.stringify({message:{content:'سلام'}}))})
 try{
  assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,401)
  const forbidden=await fetch(f.base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example','X-AI-Code':'local-ai-code-test'},body:JSON.stringify({messages:[{role:'user',content:'سلام'}]})});assert.equal(forbidden.status,403);assert.equal(calls,0)
  const accepted=await fetch(f.base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Code':'local-ai-code-test'},body:JSON.stringify({messages:[{role:'user',content:'سلام'}]})});assert.equal(accepted.status,200);assert.equal(calls,1)
 }finally{await f.close()}
})
test('Ollama never treats an empty final answer or a reasoning trace as a successful tutor response',async()=>{
 const f=await fixture({AI_PROVIDER:'ollama'},async()=>new Response(JSON.stringify({message:{content:'',thinking:'not a final answer'}})))
 try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,502);assert.equal(JSON.stringify(r).includes('not a final answer'),false)}finally{await f.close()}
})

test('the light Ollama mode reduces context and output work and retains the model for later questions',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'ollama',OLLAMA_MODEL:'qwen3:1.7b',GROQ_API_KEY:'unused-groq-secret'},async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:11434/api/chat');assert.equal(init.headers.Authorization,undefined);assert.equal(init.redirect,'error')
  const body=JSON.parse(init.body)
  assert.equal(body.model,'qwen3:1.7b');assert.deepEqual(body.options,{num_ctx:2048,num_predict:192});assert.equal(body.keep_alive,'30m');assert.equal(body.think,false);assert.equal(body.stream,false)
  assert.match(body.messages[0].content,/پایهٔ سوم/);assert.match(body.messages[0].content,/سه جملهٔ کوتاه فارسی/)
  return new Response(JSON.stringify({message:{content:'سه گروه چهارتایی، دوازده تا می‌شود.'},done:true}))
 })
 try{const health=await f.request('/api/health');assert.equal(health.data.model,'qwen3:1.7b');assert.equal(health.data.localMode,'fast-fa-final-v3');assert.equal(calls,0);const r=await f.request('/api/ai',{messages:[{role:'user',content:'ضرب ۳ در ۴ چیست؟'}]});assert.equal(r.status,200);assert.equal(r.data.model,'qwen3:1.7b');assert.equal(calls,1)}finally{await f.close()}
})
test('a local abort returns a timeout and releases the generation slot for a later question',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'ollama',OLLAMA_MODEL:'qwen3:1.7b'},async()=>{calls++;if(calls===1){const error=new Error('private runtime details');error.name='AbortError';throw error}return new Response(JSON.stringify({message:{content:'پاسخ دوم'}}))})
 try{const failed=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(failed.status,504);assert.equal(JSON.stringify(failed).includes('private runtime details'),false);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'دوباره'}]})).status,200);assert.equal(calls,2)}finally{await f.close()}
})

test('both local models receive a Persian system instruction for English chat and content questions without extra generation calls',async()=>{
 for(const model of ['qwen3:4b','qwen3:1.7b'])for(const mode of ['tutor','content']){
  let calls=0
  const messages=[{role:'user',content:'Hello'},{role:'assistant',content:'Hello, how can I help?'},{role:'user',content:'Explain 3 times 4.'}]
  const f=await fixture({AI_PROVIDER:'ollama',OLLAMA_MODEL:model},async(url,init)=>{
   calls++;const body=JSON.parse(init.body),system=body.messages[0].content
   assert.equal(body.model,model);assert.match(system,/همیشه به فارسی ساده/);assert.match(system,/حتی اگر پرسش به انگلیسی بود/);assert.match(system,/سه گروه چهارتایی می‌شود دوازده/);assert.match(system,/عکس کودکان را درخواست نکن/)
   assert.doesNotMatch(system,/[A-Za-z]/);assert.match(system,/مستقیم با جواب نهایی شروع کن/);assert.deepEqual(body.messages.slice(1,-1),messages.slice(0,-1));assert.equal(body.messages.length,messages.length+1);assert.ok(body.messages.at(-1).content.startsWith(messages.at(-1).content+'\n'));assert.match(body.messages.at(-1).content,/\/no_think$/)
   assert.equal(system.includes('سه جملهٔ کوتاه فارسی'),model==='qwen3:1.7b'&&mode==='tutor')
   return new Response(JSON.stringify({message:{content:'سه گروه چهارتایی می‌شود دوازده.'},done:true}))
  })
  try{const r=await f.request('/api/ai',{messages,mode});assert.equal(r.status,200);assert.equal(r.data.text,'سه گروه چهارتایی می‌شود دوازده.');assert.equal(calls,1)}finally{await f.close()}
 }
})

test('Ollama returns only the final answer when an older engine puts thinking tags inside content',async()=>{
 const final='ضرب یعنی جمع چند گروه مساوی؛ سه گروه چهارتایی، دوازده تا می‌شود.'
 for(const content of ['<think>private planning</think>\n'+final,'private planning</think>\n'+final,'<think>first</think><think>private planning</think>'+final]){
  let calls=0
  const f=await fixture({AI_PROVIDER:'ollama'},async()=>{calls++;return new Response(JSON.stringify({message:{content,thinking:'private separate trace'},done:true}))})
  try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'ضرب چیست؟'}]});assert.equal(r.status,200);assert.equal(r.data.text,final);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(calls,1)}finally{await f.close()}
 }
})

test('unfinished or untagged English planning is rejected without displaying or translating a draft',async()=>{
 const planning=`Okay, the user asked "ضرب چیست" which means "What is multiplication?" in Persian. I need to explain multiplication in a way that's suitable for a third grader. Let me think.
First, I should start with a simple definition. Multiplication is like adding the same number multiple times.
But I need to phrase it in Persian. Let me translate the example. "ضرب یعنی جمع گروه‌های مساوی."`
 for(const content of ['<think>private unfinished planning','<think>private planning</think>','<think>first</think><think>unfinished',planning]){
  let calls=0
  const f=await fixture({AI_PROVIDER:'ollama'},async()=>{calls++;return new Response(JSON.stringify({message:{content},done:true,done_reason:'length'}))})
  try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'ضرب چیست؟'}]});assert.equal(r.status,502);assert.match(r.data.error,/جواب نهایی/);assert.equal(r.data.text,undefined);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(JSON.stringify(r).includes('the user asked'),false);assert.equal(JSON.stringify(r).includes('ضرب یعنی جمع گروه'),false);assert.equal(calls,1)}finally{await f.close()}
 }
})

test('the planning guard allows ordinary Persian explanations, maths, and English learning examples',async()=>{
 const answers=['ضرب یعنی جمع چند گروه مساوی. ابتدا تعداد گروه‌ها را می‌شماریم و بعد تعداد هر گروه را حساب می‌کنیم.','۳ × ۴ = ۱۲','کتاب به انگلیسی می‌شود book.','The word book means کتاب. You can say: I have a book. That sentence means من یک کتاب دارم.']
 let calls=0
 const f=await fixture({AI_PROVIDER:'ollama'},async()=>new Response(JSON.stringify({message:{content:answers[calls++]},done:true})))
 try{for(const answer of answers){const r=await f.request('/api/ai',{messages:[{role:'user',content:'با یک مثال توضیح بده.'}]});assert.equal(r.status,200);assert.equal(r.data.text,answer)}assert.equal(calls,answers.length)}finally{await f.close()}
})

test('a rejected local draft releases the generation slot and does not poison the next response',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'ollama'},async()=>{calls++;return new Response(JSON.stringify({message:{content:calls===1?'<think>unfinished':'سلام! چه چیزی یاد بگیریم؟'},done:true}))})
 try{assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,502);const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,200);assert.equal(r.data.text,'سلام! چه چیزی یاد بگیریم؟');assert.equal(calls,2)}finally{await f.close()}
})

test('the Qwen3 compatibility switch stays out of other local models and does not change stored input',async()=>{
 const messages=[{role:'user',content:'سلام'},{role:'assistant',content:'سلام!'},{role:'user',content:'ضرب چیست؟ /think'}]
 const before=structuredClone(messages)
 for(const model of ['qwen3:1.7b','qwen3:4b','qwen2.5:3b']){
  const f=await fixture({AI_PROVIDER:'ollama',OLLAMA_MODEL:model},async(url,init)=>{
   const sent=JSON.parse(init.body);assert.equal(sent.think,false)
   assert.deepEqual(sent.messages.slice(1,-1),before.slice(0,-1));assert.equal(sent.messages.length,before.length+1)
   if(model.startsWith('qwen3:')){assert.ok(sent.messages.at(-1).content.startsWith(before.at(-1).content));assert.match(sent.messages.at(-1).content,/\/no_think$/)}else assert.deepEqual(sent.messages.slice(1),before)
   return new Response(JSON.stringify({message:{content:'ضرب یعنی جمع چند گروه مساوی.'},done:true}))
  })
  try{assert.equal((await f.request('/api/ai',{messages})).status,200);assert.deepEqual(messages,before)}finally{await f.close()}
 }
})

test('OpenRouter receives real conversation and a Persian instruction, uses only its own key, and preserves UTF-8 output',async()=>{
 let calls=0
 const final='۳ ضربدر ۴ برابر ۱۲ می‌شود؛ سه گروه چهارتایی داریم.'
 const messages=[{role:'user',content:'سلام'},{role:'assistant',content:'سلام! چه چیزی یاد بگیریم؟'},{role:'user',content:'ضرب چیست؟'}]
 const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-test-secret',GROQ_API_KEY:'unused-groq-secret',OPENAI_API_KEY:'unused-openai-secret',SMARTCLASS_CONFIG_REVISION:'test-revision'},async(url,init)=>{
  calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer router-test-secret');assert.equal(init.redirect,'error')
  const body=JSON.parse(init.body)
  assert.equal(body.model,OPENROUTER_MODEL);assert.equal(body.max_tokens,2048);assert.deepEqual(body.reasoning,{exclude:true});assert.equal(body.stream,false)
  assert.match(body.messages[0].content,/همیشه به فارسی ساده/);assert.match(body.messages[0].content,/پایهٔ سوم/);assert.doesNotMatch(body.messages[0].content,/[A-Za-z]/)
  assert.deepEqual(body.messages.slice(1),messages)
  for(const field of ['store','models','max_completion_tokens','think','reasoning_effort'])assert.equal(Object.hasOwn(body,field),false)
  assert.equal(init.body.includes('unused-groq-secret'),false);assert.equal(init.body.includes('unused-openai-secret'),false)
  // A mislabeled response must still decode its JSON bytes as UTF-8.
  return new Response(Buffer.from(JSON.stringify({choices:[{message:{content:final,reasoning:'hidden-provider-trace'}}]}),'utf8'),{headers:{'Content-Type':'application/json; charset=iso-8859-1'}})
 })
 try{
  const health=await f.request('/api/health');assert.equal(health.data.provider,'OpenRouter');assert.equal(health.data.ai,true);assert.equal(health.data.aiMode,OPENROUTER_MODE);assert.equal(health.data.configRevision,'test-revision');assert.equal(calls,0);assert.equal(JSON.stringify(health).includes('router-test-secret'),false)
  const r=await f.request('/api/ai',{messages});assert.equal(r.status,200);assert.equal(r.data.text,final);assert.equal(r.data.model,OPENROUTER_MODEL);assert.equal(r.data.provider,'OpenRouter');assert.equal(JSON.stringify(r).includes('hidden-provider-trace'),false);assert.equal(calls,1)
 }finally{await f.close()}
})

test('OpenRouter rejects missing credentials, paid routes and malformed model names before any request',async()=>{
 for(const settings of [{},{OPENROUTER_API_KEY:'PASTE_YOUR_OPENROUTER_KEY'},{OPENROUTER_API_KEY:'router-test-key',OPENROUTER_MODEL:'nvidia/paid-model'},{OPENROUTER_API_KEY:'router-test-key',OPENROUTER_MODEL:'https://untrusted.example/model:free'}]){
  let calls=0
  const f=await fixture({AI_PROVIDER:'openrouter',GROQ_API_KEY:'must-not-fall-back',...settings},async()=>{calls++;throw Error('must not call')})
  try{assert.equal((await f.request('/api/health')).data.ai,false);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,503);assert.equal(calls,0)}finally{await f.close()}
 }
})

test('OpenRouter text-only mode rejects files before consuming quota',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-test-key',AI_DAILY_LIMIT:'1'},async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'پاسخ فارسی'}}]}))})
 try{
  const file={type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 test').toString('base64')}
  const r=await f.request('/api/ai',{messages:[{role:'user',content:'این را بخوان'}],file});assert.equal(r.status,400);assert.match(r.data.error,/OpenRouter/);assert.equal(calls,0)
  assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,200);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'دوباره'}]})).status,429);assert.equal(calls,1)
 }finally{await f.close()}
})

test('OpenRouter errors remain actionable without leaking raw messages, secrets or retrying paid routes',async()=>{
 for(const status of [401,402,403,404,429,503]){
  let calls=0
  const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-private-test-key'},async()=>{calls++;return new Response(JSON.stringify({error:{code:status,message:'private detail router-private-test-key'}}),{status})})
  try{
   const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.ok(r.status>=500);assert.match(r.data.error,new RegExp('HTTP '+status));assert.equal(JSON.stringify(r).includes('private detail'),false);assert.equal(JSON.stringify(r).includes('router-private-test-key'),false);assert.equal(calls,1)
   if(status===429)assert.match(r.data.error,/سهمیه/);if(status===402)assert.match(r.data.error,/رایگان/)
  }finally{await f.close()}
 }
})

test('OpenRouter transport and timeout failures release capacity for the next question',async()=>{
 for(const scenario of ['offline','timeout']){
  let calls=0
  const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-test-key'},async()=>{
   calls++;if(calls===1){const error=new Error('private network details');if(scenario==='timeout')error.name='AbortError';throw error}
   return new Response(JSON.stringify({choices:[{message:{content:'پاسخ بعدی فارسی است.'}}]}))
  })
  try{const first=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(first.status,scenario==='timeout'?504:503);assert.match(first.data.error,/OpenRouter/);assert.equal(JSON.stringify(first).includes('private network'),false);assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'دوباره'}]})).status,200);assert.equal(calls,2)}finally{await f.close()}
 }
})

test('OpenRouter does not treat hidden reasoning, an empty completion or an HTTP-200 error as the final answer',async()=>{
 for(const result of [{choices:[{message:{content:'',reasoning:'hidden-provider-trace'}}]},{error:{code:503,message:'private provider detail'},choices:[{message:{content:'not a successful answer'}}]}]){
  let calls=0
  const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-test-key'},async()=>{calls++;return new Response(JSON.stringify(result))})
  try{const r=await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]});assert.equal(r.status,502);assert.equal(r.data.text,undefined);assert.equal(JSON.stringify(r).includes('hidden-provider-trace'),false);assert.equal(JSON.stringify(r).includes('private provider'),false);assert.equal(calls,1)}finally{await f.close()}
 }
})

test('OpenRouter keeps AI access-code and origin checks in front of inference',async()=>{
 let calls=0
 const f=await fixture({AI_PROVIDER:'openrouter',OPENROUTER_API_KEY:'router-test-key',AI_ACCESS_CODE:'private-local-access-code'},async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'سلام!'}}]}))})
 try{
  assert.equal((await f.request('/api/ai',{messages:[{role:'user',content:'سلام'}]})).status,401)
  const blocked=await fetch(f.base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Code':'private-local-access-code',Origin:'https://other.example'},body:JSON.stringify({messages:[{role:'user',content:'سلام'}]})});assert.equal(blocked.status,403);assert.equal(calls,0)
  const accepted=await fetch(f.base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Code':'private-local-access-code'},body:JSON.stringify({messages:[{role:'user',content:'سلام'}]})});assert.equal(accepted.status,200);assert.equal(calls,1)
 }finally{await f.close()}
})
