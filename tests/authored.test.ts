import {describe,it,expect} from 'vitest'
import {authoredLessons} from '../src/data/authored'
import {lessons,questions} from '../src/data/curriculum'
describe('authored study library',()=>{
 it('keeps every study unit accessible with a valid answered quiz',()=>{
  expect(new Set(authoredLessons.map(l=>l.id)).size).toBe(authoredLessons.length)
  for(const l of authoredLessons){
   expect(lessons.find(x=>x.id===l.id)?.authored).toBe(true)
   expect(l.sections!.length).toBeGreaterThanOrEqual(3)
   expect(l.sections!.every(s=>s.title&&s.text.length>40)).toBe(true)
   expect(l.exercises!.length).toBeGreaterThanOrEqual(2)
   expect(l.exercises!.every(e=>e.prompt&&e.answer&&e.hint)).toBe(true)
   const q=questions.find(q=>q.id===`book-quiz-${l.id}`)!
   expect(q).toBeDefined();expect(q.options).toHaveLength(4)
   expect(q.answer).toBeGreaterThanOrEqual(0);expect(q.answer).toBeLessThan(4)
   expect(l.scopeNote).toBeTruthy();expect(l.sourceUrl).toMatch(/^https:\/\//)
  }
 })
})
