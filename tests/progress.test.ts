import {beforeEach,describe,it,expect,vi} from 'vitest'
import {buildCloze} from '../src/data/content'
const memory=new Map<string,string>()
vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v)})
const {questions}=await import('../src/data/curriculum')
const {importProgress,record,getState,mastery,nextQuestion,validate}=await import('../src/state/store')
const blank=()=>({version:2,name:'آزمایش',attempts:[],completed:[],rewards:{},notes:[],quest:[],settings:{large:false,contrast:false,motion:false},observations:[],saved:[]})
describe('learning evidence and backup integrity',()=>{
 beforeEach(()=>importProgress(blank()))
 it('records repeat attempts but awards each question only once',()=>{record('q-4',2,false,14);record('q-4',2,false,12);expect(getState().attempts).toHaveLength(2);expect(Object.values(getState().rewards).reduce((s,n)=>s+n,0)).toBe(10);expect(getState().completed).toEqual(['lesson-4'])})
 it('does not complete a lesson for an incorrect answer',()=>{record('q-4',0,false,4);expect(getState().completed).toEqual([]);expect(mastery('lesson-4').score).toBe(0);record('q-4',2,true,10);expect(mastery('lesson-4').score).toBe(33)})
 it('prefers unseen questions and respects exhausted session pools',()=>{const first=nextQuestion('lesson-4')!;record(first.id,first.answer,false,8);const next=nextQuestion('lesson-4');expect(next?.id).not.toBe(first.id);expect(nextQuestion('lesson-1',questions.filter(q=>q.skill==='lesson-1').map(q=>q.id))).toBeUndefined()})
 it('rejects unsupported backups and recalculates imported answer correctness',()=>{expect(()=>validate({version:9})).toThrow();record('q-4',0,false,10);const raw=JSON.parse(JSON.stringify(getState()));raw.attempts[0].correct=true;raw.completed=['unknown'];raw.rewards={evil:999999};importProgress(raw);expect(getState().attempts[0].correct).toBe(false);expect(getState().completed).toEqual([]);expect(getState().rewards).toEqual({})})
})
it('keeps sentence order when making a cloze card and avoids stopwords',()=>{for(const sentence of ['آب با گرم شدن تبخیر می‌شود','گیاهان برای رشد به آب و نور مناسب نیاز دارند']){const card=buildCloze(sentence)[0];expect(card.front.replace('…',card.back)).toBe(sentence);expect(['و','برای','به','با','شدن']).not.toContain(card.back)}})
