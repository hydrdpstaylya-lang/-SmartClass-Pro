import {describe,it,expect} from 'vitest'
import {stations,initialExperiment,experimentAction} from '../src/lab/catalogue'
import {lessons} from '../src/data/curriculum'
describe('grade three laboratory models',()=>{
 it('maps exactly one usable station to every science chapter',()=>{expect(stations.map(s=>s.chapter)).toEqual(Array.from({length:14},(_,i)=>i+1));for(const s of stations){expect(s.tools.length).toBeGreaterThan(0);expect(new Set(s.tools).size).toBe(s.tools.length);expect(s.choices[s.answer]).toBeTruthy()}})
 it('measures liquid in bounded 100 mL steps',()=>{let s=initialExperiment();for(let n=0;n<20;n++)s=experimentAction('measure',s,0);expect(s.value).toBe(1000);for(let n=0;n<20;n++)s=experimentAction('measure',s,1);expect(s.value).toBe(0)})
 it('requires water before plant growth and bounds model days',()=>{let s=experimentAction('plant',initialExperiment(),1);expect(s.value).toBe(0);s=experimentAction('plant',s,0);for(let n=0;n<10;n++)s=experimentAction('plant',s,1);expect(s.value).toBe(5)})
 it('keeps animal classification and food preservation within the right scope',()=>{expect(stations[11].tools.join(' ')).toContain('ماهی');expect(stations[13].objective).toContain('خوراکی');expect(JSON.stringify(lessons.find(l=>l.id==='lesson-22')?.sections)).toContain('خوراکی');expect(lessons.find(l=>l.id==='lesson-8')?.title).toBe('ضرب عددها')})
 it('makes every station action produce a traceable observation',()=>{for(const station of stations)for(let a=0;a<station.actions.length;a++){const before=initialExperiment(),after=experimentAction(station.id,before,a);expect(after.actions).toBe(1);expect(after.observations.at(-1)?.length).toBeGreaterThan(10);expect(before.observations).toEqual([])}})
})
