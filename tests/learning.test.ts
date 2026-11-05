import {expect,it,vi} from 'vitest'
vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}})
const {learningPlan,rememberReading,projectEntry,saveProject}=await import('../src/state/learning')
const {getState,importProgress}=await import('../src/state/store')
it('schedules reviews from actual attempts and restores saved projects',()=>{
 const p=JSON.parse(JSON.stringify(getState()));const now=Date.now();p.attempts=[{id:'a',question:'q-1',skill:'lesson-1',choice:2,correct:true,hint:false,at:now-2*86400000,seconds:8}]
 expect(learningPlan(p,now).due.some(l=>l.id==='lesson-1')).toBe(true)
 p.attempts[0].at=now;expect(learningPlan(p,now).due.some(l=>l.id==='lesson-1')).toBe(false)
 p.attempts[0].correct=false;expect(learningPlan(p,now).due.some(l=>l.id==='lesson-1')).toBe(true)
 rememberReading('lesson-3');expect(learningPlan(getState(),now).resume?.id).toBe('lesson-3')
 saveProject('seed-diary','دانه',2,'مشاهدهٔ روز دوم');const backup=JSON.parse(JSON.stringify(getState()));importProgress(backup)
 expect(projectEntry(getState(),'seed-diary')).toEqual({step:2,draft:'مشاهدهٔ روز دوم'})
})
