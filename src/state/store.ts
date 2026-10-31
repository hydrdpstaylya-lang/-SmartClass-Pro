import {useSyncExternalStore} from 'react'
import {lessons,questions} from '../data/curriculum'
import {uid} from './id'
export type Attempt={id:string;question:string;skill:string;choice:number;correct:boolean;hint:boolean;at:number;seconds:number}
export type Artifact={id:string;title:string;text:string;at:number;type:string}
export type Progress={version:2;name:string;attempts:Attempt[];completed:string[];rewards:Record<string,number>;notes:Artifact[];quest:number[];settings:{large:boolean;contrast:boolean;motion:boolean};observations:{id:string;label:string;value:number;at:number}[];saved:string[]}
let key='smartclass.studio.v2'
const blank=():Progress=>({version:2,name:'دانش‌آموز',attempts:[],completed:[],rewards:{},notes:[],quest:[],settings:{large:false,contrast:false,motion:false},observations:[],saved:[]})
export function validate(raw:unknown):Progress {
 const p=raw as Progress;if(!p||p.version!==2)throw Error('نسخهٔ فایل پشتیبان معتبر نیست.')
 const out=blank();out.name=typeof p.name==='string'?p.name.slice(0,40):out.name
 out.attempts=Array.isArray(p.attempts)?p.attempts.filter(a=>a&&questions.some(q=>q.id===a.question&&q.skill===a.skill)&&typeof a.correct==='boolean'&&Number.isFinite(a.at)&&Number.isFinite(a.seconds)&&Number.isInteger(a.choice)&&a.choice>=0&&a.choice<4).slice(-2500).map(a=>({...a,correct:questions.find(q=>q.id===a.question)!.answer===a.choice,seconds:Math.max(0,Math.min(3600,a.seconds)),hint:!!a.hint})):[]
 out.completed=Array.isArray(p.completed)?[...new Set(p.completed.filter(x=>lessons.some(l=>l.id===x)))]:[]
 out.quest=Array.isArray(p.quest)?[...new Set(p.quest.filter(x=>Number.isInteger(x)&&x>=0&&x<7))]:[]
 if(p.rewards&&typeof p.rewards==='object')for(const [k,v]of Object.entries(p.rewards))if(/^(question-|quest-|lab-)/.test(k)&&Number.isFinite(v)&&v>=0&&v<=50)out.rewards[k]=v
 out.notes=Array.isArray(p.notes)?p.notes.filter(n=>n&&typeof n.title==='string'&&typeof n.text==='string'&&typeof n.id==='string'&&Number.isFinite(n.at)).slice(-150).map(n=>({...n,title:n.title.slice(0,100),text:n.text.slice(0,12000),type:String(n.type).slice(0,30)})):[]
 out.settings={large:!!p.settings?.large,contrast:!!p.settings?.contrast,motion:!!p.settings?.motion}
 out.observations=Array.isArray(p.observations)?p.observations.filter(o=>o&&typeof o.id==='string'&&typeof o.label==='string'&&Number.isFinite(o.value)&&Math.abs(o.value)<100000&&Number.isFinite(o.at)).slice(-100):[]
 out.saved=Array.isArray(p.saved)?p.saved.filter(s=>typeof s==='string').slice(0,100):[];return out
}
let state=blank();let storageIssue=false
try{const saved=localStorage.getItem(key);if(saved)state=validate(JSON.parse(saved))}catch{storageIssue=true}
const listeners=new Set<()=>void>()
const emit=()=>{try{localStorage.setItem(key,JSON.stringify(state));storageIssue=false}catch{storageIssue=true}listeners.forEach(f=>f())}
export const getState=()=>state
export const useProgress=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},getState,getState)
export const storageFailed=()=>storageIssue
export function update(p:Partial<Progress>){state={...state,...p};emit()}
export function record(question:string,choice:number,hint:boolean,seconds:number){
 const q=questions.find(x=>x.id===question);if(!q||choice<0||choice>=q.options.length)return
 const correct=choice===q.answer
 const a:Attempt={id:uid(),question,skill:q.skill,choice,correct,hint,at:Date.now(),seconds:Math.max(0,Math.round(seconds))}
 const rewards={...state.rewards};if(correct)rewards[`question-${question}`]=hint?5:10
 // First successful completion earns points once; later attempts remain useful evidence.
 if(state.rewards[`question-${question}`]!==undefined)rewards[`question-${question}`]=state.rewards[`question-${question}`]
 state={...state,attempts:[...state.attempts,a].slice(-2500),rewards,completed:correct?[...new Set([...state.completed,q.skill])]:state.completed};emit()
}
export function reward(id:string,points:number){if(state.rewards[id]!==undefined)return;update({rewards:{...state.rewards,[id]:points}})}
export function addNote(title:string,text:string,type='یادداشت'){update({notes:[{id:uid(),title:title.trim().slice(0,100)||'یادداشت من',text:text.slice(0,12000),type,at:Date.now()},...state.notes].slice(0,150)})}
export function mastery(skill:string,p=state){const a=p.attempts.filter(x=>x.skill===skill).slice(-12);return{count:a.length,score:a.length?Math.round(a.reduce((n,x)=>n+(x.correct?(x.hint?.65:1):0),0)/a.length*100):0}}
export function recommendation(p=state){return lessons.filter(l=>!l.legacy).sort((a,b)=>{const x=mastery(a.id,p),y=mastery(b.id,p);return (x.count?x.score:35)-(y.count?y.score:35)||x.count-y.count})[0]}
export function nextQuestion(skill:string,used:string[]=[],p=state){const done=new Set(used);const list=questions.filter(q=>q.skill===skill&&!done.has(q.id));const m=mastery(skill,p);return list.sort((a,b)=>{const seen=(id:string)=>p.attempts.filter(x=>x.question===id).length;return seen(a.id)-seen(b.id)||Math.abs(a.level-(m.score>70?2:1))-Math.abs(b.level-(m.score>70?2:1))})[0]}
export function importProgress(raw:unknown){state=validate(raw);emit()}
export function exportFile(name:string,data:unknown){const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:typeof data==='string'?'text/plain;charset=utf-8':'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}

export function switchAccount(id:string,name?:string){key="smartclass.account."+id;state=blank();try{const raw=localStorage.getItem(key);if(raw)state=validate(JSON.parse(raw))}catch{storageIssue=true}if(name)state.name=name;listeners.forEach(f=>f())}
export function onProgressChange(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn)}
