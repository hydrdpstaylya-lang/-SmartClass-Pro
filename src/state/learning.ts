import {lessons,type Lesson} from '../data/curriculum'
import {getState,update,type Progress} from './store'
export function rememberReading(id:string){const p=getState();update({notes:[{id:'reading-position',title:'ادامهٔ مطالعه',text:id,type:'مسیر مطالعه',at:Date.now()},...p.notes.filter(n=>n.id!=='reading-position')].slice(0,150)})}
export function learningPlan(p:Progress,now=Date.now()){
 const active=lessons.filter(l=>l.authored),lastId=p.notes.find(n=>n.id==='reading-position')?.text
 const resume=active.find(l=>l.id===lastId)
 const due=active.map(l=>{const attempts=p.attempts.filter(a=>a.skill===l.id).sort((a,b)=>a.at-b.at),last=attempts.at(-1);const recent=attempts.slice(-3);const successes=recent.filter(a=>a.correct&&!a.hint).length;const days=successes>=3?7:successes>=2?3:1;return{lesson:l,last,due:last?last.at+days*86400000:Infinity}}).filter(x=>x.last&&(!x.last.correct||x.due<=now)).sort((a,b)=>a.due-b.due)
 const fresh=active.find(l=>!p.completed.includes(l.id)&&l.id!==resume?.id)
 return{resume,due:due.map(x=>x.lesson),fresh,active}
}
export const projects=[
 {id:'seed-diary',title:'دفتر رشد یک دانه',subject:'science',steps:['با کمک بزرگ‌تر یک دانه در ظرف مناسب بکار؛ تاریخ و شرایط را ثبت کن.','در سه روز جداگانه شکل یا اندازهٔ جوانه را مشاهده کن؛ آب و نور را یادداشت کن.','مشاهده‌ها را مقایسه کن و بنویس برای نتیجه‌گیری به چه شواهد بیشتری نیاز داری.']},
 {id:'home-map',title:'نقشهٔ یک خانهٔ خیالی',subject:'social',steps:['یک خانهٔ خیالی با چند اتاق روی کاغذ رسم کن؛ نشانی واقعی ننویس.','برای بخش‌های نقشه راهنما بساز و جای پنجره‌ها را مشخص کن.','یک مسیر را با جمله‌های روشن برای دوست خیالی‌ات توضیح بده.']},
 {id:'story-workshop',title:'کتاب کوچکِ داستان من',subject:'writing',steps:['یک شخصیت، یک مکان خیالی و یک مسئلهٔ ساده انتخاب کن.','داستانی با آغاز، میانه و پایان بنویس و یک تصویر برایش بکش.','جمله‌ها، فاصله‌ها و نشانه‌ها را بازبینی کن؛ نسخهٔ دوم را با نسخهٔ اول مقایسه کن.']},
 {id:'class-data',title:'پژوهش کوچکِ نمودارها',subject:'math',steps:['یک پرسش بی‌نام و غیرشخصی انتخاب کن؛ مثلاً رنگ دلخواه پنج شخصیت خیالی.','پاسخ‌ها را در جدول بشمار و نمودار ستونی روی کاغذ بکش.','دو مقایسه بنویس و بررسی کن جمع ستون‌ها با تعداد پاسخ‌ها برابر باشد.']}
] as const
export function projectEntry(p:Progress,id:string){const note=p.notes.find(n=>n.id==='project-'+id);try{const data=JSON.parse(note?.text||'{}');return{step:Math.max(0,Math.min(3,Number(data.step)||0)),draft:typeof data.draft==='string'?data.draft:''}}catch{return{step:0,draft:''}}}
export function saveProject(id:string,title:string,step:number,draft:string){const p=getState();update({notes:[{id:'project-'+id,title,text:JSON.stringify({step,draft:draft.slice(0,6000)}),type:'پروژهٔ چندروزه',at:Date.now()},...p.notes.filter(n=>n.id!=='project-'+id)].slice(0,150)})}
