import math from './books/math.json'
import science from './books/science.json'
import farsi from './books/farsi.json'
import writing from './books/writing.json'
import social from './books/social.json'
import quran from './books/quran.json'
import hedie from './books/hedie.json'
import type {AuthoredContent} from './book-types'
import type {Lesson,Subject} from './curriculum'
const colors:Record<Subject,string>={math:'#efaa50',science:'#5fd5b3',farsi:'#7eb3f3',writing:'#f49da2',social:'#c5a2e9',quran:'#9dcc82',hedie:'#f2d179'}
type Raw=AuthoredContent&{id:string;subject:Subject;title:string;chapter:string;intro:string}
const scienceIds=[9,10,12,11,13,14,15,16,17,18,19,20,21,22]
export const authoredLessons:Lesson[]=([math,science,farsi,writing,social,quran,hedie].flat() as Raw[]).map(raw=>{
 const id=raw.subject==='math'?`lesson-${raw.number}`:raw.subject==='science'?`lesson-${scienceIds[raw.number-1]}`:raw.subject==='farsi'?`core-farsi-${raw.number}`:raw.subject==='social'?`core-social-${raw.number}`:raw.subject==='writing'?`writing-practice-${raw.number}`:raw.id
 return {...raw,id,subject:raw.subject,title:raw.title,chapter:raw.chapter||`درس ${raw.number}`,minutes:12,intro:raw.intro,example:raw.workedExample.question,tip:raw.commonMistakes[0]||'مفهوم را با یک مثال توضیح بده.',color:colors[raw.subject],authored:true,legacy:false}
})
