import {HttpError} from './security.mjs'

// Qwen3 documents /no_think as a per-turn compatibility switch. Keep
// think:false too; older engines/templates may not honor that API option.
export function ollamaMessages(messages,model){
 if(!/^qwen3(?::|$)/i.test(model))return messages
 return messages.map((message,index)=>index===messages.length-1&&message.role==='user'
  ?{...message,content:message.content+'\n\nفقط جواب نهایی را به فارسی ساده بنویس.\n/no_think'}
  :message)
}

const traceError=()=>new HttpError(502,'مدل به‌جای جواب نهایی، متن آماده‌سازی پاسخ فرستاد. صفحه را تازه کن و سؤال را دوباره بپرس.')

export function ollamaAnswer(result){
 const content=result?.message?.content
 if(typeof content!=='string'||!content.trim())throw new HttpError(502,'پاسخ متنی دریافت نشد؛ مدل انتخابی یا بودجهٔ خروجی آن را بررسی کن.')
 let answer=content.trim()
 // Some older engines return the reasoning inside content, sometimes with
 // the opening <think> supplied by the template. Only retain the final part.
 const closing=[...answer.matchAll(/<\/think\s*>/gi)].at(-1)
 if(closing)answer=answer.slice(closing.index+closing[0].length).trim()
 if(!answer||/<think(?:\s[^>]*)?>/i.test(answer))throw traceError()

 // A narrow fallback for untagged English planning like the reported bug.
 // Never extract a quoted Persian draft and pretend it was the final answer.
 const latin=(answer.match(/[A-Za-z]/g)||[]).length
 const arabic=(answer.match(/\p{Script=Arabic}/gu)||[]).length
 const planning=/^(?:(?:okay|alright|first)[,.!\s]+)?(?:the user (?:asked|wants|is asking)|i (?:need|have) to (?:explain|respond|answer|translate|start|think)|i should (?:explain|respond|answer|translate|start|think)|let me (?:think|check|translate))\b/i
 if(latin>=80&&latin>arabic*2&&planning.test(answer))throw traceError()
 return answer
}
