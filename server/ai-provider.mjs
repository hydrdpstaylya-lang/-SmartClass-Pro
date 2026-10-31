// Provider credentials never fall back to another service's key.
export const FAST_OLLAMA_MODEL='qwen3:1.7b'
export const OLLAMA_FAST_MODE='fast-fa-final-v3'
export const OLLAMA_STANDARD_MODE='standard-fa-final-v3'
export const OPENROUTER_MODEL='nvidia/nemotron-3-ultra-550b-a55b:free'
export const CLOUDFLARE_MODEL='@cf/qwen/qwen3-30b-a3b-fp8'
export const CLOUDFLARE_MODE='cloudflare-fa-v1'
export const OPENROUTER_MODE='openrouter-fa-v1'
export function ollamaRuntime(model){
 return model===FAST_OLLAMA_MODEL?{options:{num_ctx:2048,num_predict:192},keep_alive:'30m'}:{options:{num_ctx:4096,num_predict:512},keep_alive:'5m'}
}
export function aiProvider(env={}){
 const id=String(env.AI_PROVIDER||'openai').trim().toLowerCase()
 const providers={cloudflare:{label:'Cloudflare',key:'CLOUDFLARE_API_TOKEN',model:'CLOUDFLARE_MODEL',fallback:CLOUDFLARE_MODEL},openai:{label:'OpenAI',key:'OPENAI_API_KEY',model:'OPENAI_MODEL',fallback:'gpt-5-mini'},gapgpt:{label:'GapGPT',key:'GAPGPT_API_KEY',model:'GAPGPT_MODEL',fallback:'gapgpt-gemma-26b-a4b'},avalai:{label:'AvalAI',key:'AVALAI_API_KEY',model:'AVALAI_MODEL',fallback:''},groq:{label:'Groq',key:'GROQ_API_KEY',model:'GROQ_MODEL',fallback:'openai/gpt-oss-20b'},ollama:{label:'Ollama',key:null,model:'OLLAMA_MODEL',fallback:'qwen3:4b'},openrouter:{label:'OpenRouter',key:'OPENROUTER_API_KEY',model:'OPENROUTER_MODEL',fallback:OPENROUTER_MODEL}}
 const p=Object.hasOwn(providers,id)?providers[id]:null
 if(!p)return{id,label:'Unknown',configured:false,error:'AI_PROVIDER باید openai، gapgpt، avalai، groq، ollama، openrouter یا cloudflare باشد.'}
 const apiKey=p.key?String(env[p.key]||'').trim():'',model=String(env[p.model]||p.fallback).trim()
 let error=''
 const placeholder=v=>/^(YOUR_|PASTE_|PUT_|CHOOSE_|MODEL_ID_HERE$)/i.test(v)
 if(p.key&&(!apiKey||placeholder(apiKey)))error=`کلید ${p.label} را فقط در ${p.key} داخل فایل .env قرار بده.`
 else if(!model||placeholder(model))error=`شناسهٔ دقیق مدل انتخاب‌شده در پنل ${p.label} را در ${p.model} فایل .env بنویس. مدل خودکار انتخاب نشده است.`
 else if(/^(sk-|gsk_)/i.test(model))error='شناسهٔ مدل باید نام مدل باشد؛ کلید را فقط در متغیر API_KEY سرویس قرار بده.'
 else if(model.length>200||/[\r\n\x00-\x1f]/.test(model))error='شناسهٔ مدل معتبر نیست.'
 let style=id==='gapgpt'?'chat':'responses',endpoint=id==='gapgpt'?'https://api.gapgpt.app/v1/chat/completions':'https://api.openai.com/v1/responses'
 if(id==='cloudflare'){
  style='cloudflare'
  const accountId=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim()
  if(!/^[a-fA-F0-9]{32}$/.test(accountId))error='شناسهٔ حساب Cloudflare باید Account ID با ۳۲ نویسه باشد.'
  else if(!/^[!-~]{20,4096}$/.test(apiKey))error='توکن Workers AI را کامل وارد کن.'
  else if(model!==CLOUDFLARE_MODEL)error='این اتصال برای مدل آزمایش‌شدهٔ Qwen در Cloudflare تنظیم شده است.'
  endpoint=`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`
 }
 if(id==='groq'){style='chat';endpoint='https://api.groq.com/openai/v1/chat/completions'}
 if(id==='openrouter'){
  style='chat';endpoint='https://openrouter.ai/api/v1/chat/completions'
  if(!error&&(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(model)||(!model.endsWith(':free')&&model!=='openrouter/free')))error='این اتصال برای مدل رایگان OpenRouter است؛ شناسهٔ مدل باید به :free ختم شود.'
 }
 if(id==='ollama'){
  style='ollama';endpoint='http://127.0.0.1:11434/api/chat'
  if(!error&&!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(model))error='شناسهٔ مدل محلی Ollama معتبر نیست.'
  if(!error&&/(?:^|[-:/])cloud(?:$|[-:/])/i.test(model))error='این اتصال برای مدل نصب‌شده روی لپ‌تاپ است؛ یک مدل محلی مانند qwen3:4b انتخاب کن.'
 }
 if(id==='avalai'){
  style=String(env.AVALAI_API_STYLE||'chat').trim().toLowerCase()
  const base=String(env.AVALAI_BASE_URL||'https://api.avalai.ir/v1').trim().replace(/\/+$/,'')
  if(!['chat','responses'].includes(style))error='AVALAI_API_STYLE باید chat یا responses باشد.'
  if(!['https://api.avalai.ir/v1','https://api.avalapis.ir/v1'].includes(base))error='AVALAI_BASE_URL باید یکی از نشانی‌های رسمی AvalAI باشد: https://api.avalai.ir/v1 یا https://api.avalapis.ir/v1'
  endpoint=base+(style==='responses'?'/responses':'/chat/completions')
 }
 return{id,label:p.label,apiKey,model,style,endpoint,error,configured:!error}
}
