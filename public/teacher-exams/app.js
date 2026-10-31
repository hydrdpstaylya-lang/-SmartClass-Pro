import {printDocument,exportText} from './print.js';
const $=id=>document.getElementById(id),fa=n=>Number(n).toLocaleString('fa-IR');
const form=$('config'),grades=['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم'];
let user=null,draft=null,savedId=null,revision=0,dirty=false,editing=false,showAnswers=false,busy=false,pending=false,controller=null,exams=[];
const elem=(tag,options={})=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(options))if(key==='text')node.textContent=value;else if(key==='class')node.className=value;else node[key]=value;return node;};
function notify(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);$('message').hidden=!text;}
function lock(message){
 controller?.abort();draft=null;savedId=null;user=null;exams=[];dirty=false;$('document').replaceChildren();$('document').hidden=true;$('history').close();$('history-list').replaceChildren();$('identity').textContent='ورود به حساب آموزگار';$('workbench').hidden=true;$('history-open').disabled=true;
 const box=$('access');box.hidden=false;box.replaceChildren(elem('p',{text:message}),elem('a',{text:'ورود از بخش کلاس و معلم',href:'/#school',target:'_top'}));
}
async function api(route='',body,method=body===undefined?'GET':'POST',signal){
 const response=await fetch('/api/teacher-exams'+route,{method,signal:signal||AbortSignal.timeout(100000),credentials:'same-origin',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw Error('پاسخ سرور قابل خواندن نبود. سرور را با START-CLOUDFLARE.cmd اجرا کن.');}
 if(!response.ok){if(response.status===401||response.status===403)lock(data.error||'دسترسی آموزگار لازم است.');throw Error(data.error||'درخواست انجام نشد.');}return data;
}
function updateControls(){
 for(const id of ['edit','save','export','print-key','print-student'])$(id).disabled=busy||pending||!draft;
 $('new-exam').disabled=busy||pending||!draft;$('history-open').disabled=busy||pending||!user;$('generate').disabled=busy||pending||!user;
 $('edit').setAttribute('aria-pressed',String(editing));$('edit').textContent=editing?'پایان ویرایش':'ویرایش سؤال‌ها';
 $('document-status').textContent=draft?(dirty?'ویرایش ذخیره‌نشده':savedId?'ذخیره‌شده':'پیش‌نویس'):'پیش‌نمایش';
 $('save').textContent=savedId?(dirty?'ذخیرهٔ تغییرات':'ذخیره‌شده در حساب'):'ذخیره در حساب';
 $('save').disabled=busy||pending||!draft||(!!savedId&&!dirty);
 $('loading').hidden=!busy;$('cancel').hidden=!busy;$('generate-label').textContent=busy?'در حال ساخت آزمون…':'ساخت آزمون هوشمند';
 for(const input of form.querySelectorAll('input,select,textarea'))input.disabled=busy||pending;
 for(const input of document.querySelectorAll('.question-editor input,.question-editor textarea,.question-editor select,.title-editor,#history-list button'))input.disabled=busy||pending;
}
function changed(){dirty=true;updateControls();}
function field(label,value,onInput,{maxLength=600,rows=2}={}){
 const node=elem('label',{class:'field',text:label}),input=elem('textarea',{value,maxLength,rows});input.addEventListener('input',()=>{onInput(input.value);changed();});node.append(input);return node;
}
function render(){
 const doc=$('document');doc.replaceChildren();doc.hidden=!draft;$('empty').hidden=!!draft;if(!draft){updateControls();return;}
 const head=elem('header',{class:'paper-heading'});head.append(elem('span',{text:'آزمون کلاسی · پیش‌نویس آموزگار'}));
 if(editing){const title=elem('input',{class:'title-editor',value:draft.title,maxLength:120});title.setAttribute('aria-label','ویرایش عنوان آزمون');title.oninput=()=>{draft.title=title.value;changed();};head.append(title);}else head.append(elem('h2',{text:draft.title}));
 head.append(elem('p',{text:`${draft.subject} · پایهٔ ${grades[draft.grade-1]} · ${fa(draft.count)} سؤال`}));
 const student=elem('div',{class:'paper-student'});for(const text of ['نام و نام خانوادگی: ………………………','کلاس: …………','تاریخ: ……………'])student.append(elem('span',{text}));head.append(student);doc.append(head);
 const toggle=elem('label',{class:'answers-switch'}),check=elem('input',{type:'checkbox',checked:showAnswers});check.onchange=()=>{showAnswers=check.checked;render();};toggle.append(check,elem('span',{text:'نمایش پاسخ‌ها در پیش‌نمایش آموزگار'}));doc.append(toggle);
 draft.questions.forEach((question,index)=>{
  const row=elem('section',{class:'question'});row.append(elem('span',{class:'question-kind',text:`سؤال ${fa(index+1)} · ${question.type==='choice'?'چهارگزینه‌ای':'پاسخ کوتاه'}`}));
  if(editing){
   const editor=elem('div',{class:'question-editor'});editor.append(field('صورت سؤال',question.prompt,value=>question.prompt=value));
   if(question.type==='choice'){
    question.options.forEach((option,j)=>{const label=elem('label',{class:'option-editor',text:['الف','ب','پ','ت'][j]}),input=elem('input',{value:option,maxLength:220});input.setAttribute('aria-label',`گزینهٔ ${['الف','ب','پ','ت'][j]} سؤال ${fa(index+1)}`);input.oninput=()=>{question.options[j]=input.value;changed();};label.append(input);editor.append(label);});
    const label=elem('label',{class:'field',text:'گزینهٔ درست'}),select=elem('select');question.options.forEach((_option,j)=>select.append(elem('option',{value:String(j),text:['الف','ب','پ','ت'][j]})));select.value=String(question.correctIndex);select.onchange=()=>{question.correctIndex=Number(select.value);changed();};label.append(select);editor.append(label);
   }else editor.append(field('پاسخ نمونه',question.answer,value=>question.answer=value,{maxLength:1000}));
   editor.append(field('توضیح پاسخ (اختیاری)',question.explanation,value=>question.explanation=value));row.append(editor);
  }else{
   const heading=elem('div',{class:'question-top'});heading.append(elem('span',{class:'question-no',text:fa(index+1)+'.'}),elem('h3',{text:question.prompt}));row.append(heading);
   if(question.type==='choice'){const options=elem('ol',{class:'options'});question.options.forEach((option,j)=>{const item=elem('li');item.append(elem('span',{class:'option-letter',text:['الف','ب','پ','ت'][j]}),elem('span',{text:option}));options.append(item);});row.append(options);}else row.append(elem('div',{class:'answer-space'}));
   if(showAnswers){const answer=elem('div',{class:'teacher-answer',text:'پاسخ: '+(question.type==='choice'?`${['الف','ب','پ','ت'][question.correctIndex]}) ${question.options[question.correctIndex]}`:question.answer)});if(question.explanation)answer.append(elem('small',{text:question.explanation}));row.append(answer);}
  }
  doc.append(row);
 });
 $('output-note').textContent=draft.reference?'سؤال‌ها از متن مرجع درخواست شده‌اند؛ تطبیق نهایی با آموزگار است.':'پاسخ‌نامه جدا از برگهٔ دانش‌آموز چاپ می‌شود.';updateControls();
}
function spec(){const values=new FormData(form);return {title:values.get('title'),topic:values.get('topic'),subject:values.get('subject'),grade:Number(values.get('grade')),count:Number(values.get('count')),difficulty:values.get('difficulty'),kind:values.get('kind'),reference:values.get('reference')};}
function applySpec(exam){for(const name of ['title','topic','subject','grade','count','difficulty','reference'])form.elements.namedItem(name).value=String(exam[name]);form.querySelector(`input[name="kind"][value="${exam.kind}"]`).checked=true;$('source-count').textContent=fa(exam.reference.length)+' / ۶۰۰۰';}
function mayReplace(){return !dirty||!draft||confirm('آزمون فعلی تغییر ذخیره‌نشده دارد. بدون ذخیره ادامه می‌دهی؟');}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||pending||!form.reportValidity()||!mayReplace())return;
 const settings=spec();controller=new AbortController();const active=controller;const timeout=setTimeout(()=>active.abort(),100000);busy=true;notify('');updateControls();
 try{const result=await api('/generate',settings,'POST',active.signal);if(active.signal.aborted)return;draft=result.exam;savedId=null;revision=0;dirty=true;editing=false;showAnswers=false;render();notify('آزمون ساخته شد. سؤال‌ها و پاسخ‌ها را مرور کن؛ هر بخش قابل ویرایش است.');document.querySelector('.document-area')?.scrollIntoView({behavior:'smooth',block:'start'});}
 catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')notify('دریافت پاسخ متوقف شد. برگهٔ قبلی را حفظ کردیم؛ می‌توانی با تعداد سؤال کمتر دوباره امتحان کنی.',true);else notify(error.message,true);}
 finally{clearTimeout(timeout);busy=false;controller=null;updateControls();}
});
$('cancel').onclick=()=>controller?.abort();
$('edit').onclick=()=>{editing=!editing;render();};
$('new-exam').onclick=()=>{if(!mayReplace())return;draft=null;savedId=null;revision=0;dirty=false;editing=false;showAnswers=false;notify('');render();form.elements.namedItem('topic').focus();};
form.elements.namedItem('reference').addEventListener('input',event=>$('source-count').textContent=fa(event.target.value.length)+' / ۶۰۰۰');
async function refreshHistory(){const result=await api();if(user&&result.user.id!==user.id){lock('حساب کاربری عوض شده است؛ آزمون‌ساز را دوباره باز کن.');throw Error('حساب کاربری تغییر کرده است.');}user=result.user;exams=result.exams;$('saved-count').textContent=fa(result.total);return result;}
function historyMessage(text){let node=$('history-message');if(!node){node=elem('p',{id:'history-message',class:'message error'});$('history-list').before(node);}node.textContent=text;node.hidden=!text;}
function renderHistory(){
 const list=$('history-list');list.replaceChildren();
 if(!exams.length){list.append(elem('p',{class:'history-empty',text:'هنوز آزمونی ذخیره نکرده‌ای. پس از ساخت و بازبینی، «ذخیره در حساب» را بزن.'}));return;}
 for(const item of exams){
  const row=elem('div',{class:'history-item'}),open=elem('button',{class:'history-open',type:'button'});open.append(elem('b',{text:item.title}),elem('small',{text:`${item.subject} · پایهٔ ${grades[item.grade-1]} · ${fa(item.count)} سؤال · ${new Date(item.updated).toLocaleDateString('fa-IR')}`}));
  open.onclick=async()=>{if(pending||!mayReplace())return;pending=true;updateControls();try{const data=await api('/'+item.id);draft=data.exam;savedId=data.id;revision=data.revision;dirty=false;editing=false;showAnswers=false;applySpec(draft);render();$('history').close();notify('آزمون ذخیره‌شده باز شد.');}catch(error){historyMessage(error.message);}finally{pending=false;updateControls();}};
  const remove=elem('button',{class:'text-button',text:'حذف',type:'button'});remove.setAttribute('aria-label','حذف آزمون '+item.title);remove.onclick=async()=>{if(pending)return;if(!confirm(`آزمون «${item.title}» از حساب تو حذف شود؟`))return;pending=true;updateControls();try{await api('/'+item.id,undefined,'DELETE');if(savedId===item.id){savedId=null;revision=0;dirty=!!draft;updateControls();}await refreshHistory();renderHistory();}catch(error){historyMessage(error.message);}finally{pending=false;updateControls();}};
  row.append(open,remove);list.append(row);
 }
}
$('history-open').onclick=async()=>{if(pending||busy)return;pending=true;updateControls();try{await refreshHistory();renderHistory();historyMessage('');$('history').showModal();}catch(error){notify(error.message,true);}finally{pending=false;updateControls();}};
$('history-close').onclick=()=>$('history').close();
$('history').addEventListener('close',()=>$('history-open').focus());
$('save').onclick=async()=>{
 if(!draft||busy||pending)return;pending=true;updateControls();notify('');
 try{const data=await api(savedId?'/'+savedId:'',{exam:draft,revision},savedId?'PUT':'POST');savedId=data.id;revision=data.revision;dirty=false;await refreshHistory();notify('آزمون در حساب تو ذخیره شد.');}
 catch(error){notify(error.message,true);}finally{pending=false;updateControls();}
};
async function verifyAccount(){const response=await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});const data=await response.json();if(!data.user||data.user.id!==user?.id||!['teacher','admin'].includes(data.user.role)){lock('دسترسی حساب عوض شده است؛ دوباره با حساب آموزگار وارد شو.');throw Error('برای دریافت خروجی، حساب فعال آموزگار لازم است.');}}
async function print(answers){
 if(!draft||busy||pending)return;pending=true;updateControls();
 try{await verifyAccount();const markup=printDocument(draft,{answers});document.querySelector('.print-frame')?.remove();const frame=elem('iframe',{class:'print-frame',title:answers?'چاپ پاسخ‌نامه':'چاپ برگهٔ دانش‌آموز'});document.body.append(frame);frame.contentDocument.open();frame.contentDocument.write(markup);frame.contentDocument.close();await frame.contentDocument.fonts.ready;frame.contentWindow.focus();frame.contentWindow.print();}
 catch(error){notify(error.message,true);}finally{pending=false;updateControls();}
}
$('print-key').onclick=()=>void print(true);$('print-student').onclick=()=>void print(false);
$('export').onclick=async()=>{if(!draft||pending||busy)return;pending=true;updateControls();try{await verifyAccount();const blob=new Blob(['\uFEFF'+exportText(draft)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=elem('a',{href:url,download:'SmartClass-Exam.txt'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){notify(error.message,true);}finally{pending=false;updateControls();}};
window.addEventListener('smartclass:exam-lock',()=>lock('برای دیدن آزمون‌ها دوباره وارد حساب آموزگار شو.'));
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='smartclass:exam-lock')lock('برای دیدن آزمون‌ها دوباره وارد حساب آموزگار شو.');});
window.addEventListener('focus',()=>{if(user)void verifyAccount().catch(error=>notify(error.message,true));});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function init(){
 try{const data=await refreshHistory();for(const subject of data.subjects)form.elements.namedItem('subject').append(elem('option',{value:subject,text:subject}));grades.forEach((grade,i)=>form.elements.namedItem('grade').append(elem('option',{value:String(i+1),text:grade})));for(let i=2;i<=10;i++)form.elements.namedItem('count').append(elem('option',{value:String(i),text:fa(i)+' سؤال'}));form.elements.namedItem('grade').value='3';form.elements.namedItem('count').value='5';$('identity').textContent=user.name+' · '+(user.role==='admin'?'مدیر':'آموزگار');$('workbench').hidden=false;$('access').hidden=true;updateControls();}
 catch(error){if(!user)lock(error.message);else notify(error.message,true);}
}
void init();
