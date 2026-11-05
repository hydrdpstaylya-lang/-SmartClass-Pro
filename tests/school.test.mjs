import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {createApp} from '../server/app.mjs'
import {bootstrapAdmin} from '../server/setup-admin.mjs'
import {importPrevious} from '../server/import-previous.mjs'

async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'smartclass-school-')),dbPath=join(dir,'data','smartclass.sqlite');let app,server,base
 const start=async()=>{app=createApp({dbPath,env:{}});server=http.createServer(app.handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`}
 const stop=async()=>{await new Promise(r=>server.close(r));app.close()}
 await start()
 const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 const register=async username=>{const r=await request('/api/account/register','POST',{username,name:username,password:'test-password-123',role:'admin'});assert.equal(r.status,200);return {...r.data,cookie:r.cookie}}
 const admin=await register('owner');const db=new DatabaseSync(dbPath);bootstrapAdmin(db,'owner');db.close()
 const teacher=await register('teacher'),otherTeacher=await register('other_teacher'),student=await register('student'),outsider=await register('outsider')
 const school=(user,path,method='GET',body)=>request('/api/school'+path,method,body,user.cookie)
 for(const u of [teacher,otherTeacher])assert.equal((await school(admin,'/users/'+u.user.id,'PATCH',{role:'teacher'})).status,200)
 return {dir,dbPath,admin,teacher,otherTeacher,student,outsider,register,request,school,restart:async()=>{await stop();await start()},close:async()=>{await stop();rmSync(dir,{recursive:true,force:true})}}
}
async function createClass(f,teacher=f.teacher){const r=await f.school(teacher,'/classes','POST',{title:'سوم الف'});assert.equal(r.status,201);const c=await f.school(teacher,'/classes/'+r.data.id);return c.data.class}
async function joinClass(f,c,student=f.student){const r=await f.school(student,'/join','POST',{code:c.code});assert.equal(r.status,200)}
async function createTask(f,c){const r=await f.school(f.teacher,`/classes/${c.id}/assignments`,'POST',{title:'مشاهدهٔ آب',instructions:'مشاهدهٔ خود را با دلیل توضیح بده.',subject:'علوم',due:Date.now()-1000});assert.equal(r.status,201);return r.data.id}

test('school roles are resolved on server; registration cannot choose a role; first admin setup is one-time',async()=>{
 const f=await fixture();try{
  assert.equal(f.student.user.role,'student')
  assert.equal((await f.request('/api/school')).status,401)
  assert.equal((await f.school(f.student,'/users')).status,403)
  assert.equal((await f.school(f.teacher,'/users')).status,403)
  assert.equal((await f.school(f.student,'/classes','POST',{title:'کلاس جعلی',role:'teacher'})).status,403)
  const users=await f.school(f.admin,'/users');assert.equal(users.status,200);assert.equal(users.data.users.some(u=>'password' in u||'recovery' in u||'salt' in u),false)
  const db=new DatabaseSync(f.dbPath);assert.throws(()=>bootstrapAdmin(db,'student'),/already exists/);db.close()
  assert.equal((await f.school(f.admin,`/users/${f.admin.user.id}`,'PATCH',{active:false})).status,409)
  assert.equal((await f.school(f.admin,`/users/${f.admin.user.id}`,'PATCH',{role:'student'})).status,409)
 }finally{await f.close()}
})
test('class membership survives login; teacher and student access stay isolated by class and account',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c);await joinClass(f,c)
  assert.equal((await f.school(f.otherTeacher,`/classes/${c.id}`)).status,403)
  assert.equal((await f.school(f.outsider,`/classes/${c.id}`)).status,403)
  assert.equal((await f.school(f.student,`/classes/${c.id}/students/${f.student.user.id}`)).status,403)
  const view=await f.school(f.student,`/classes/${c.id}`);assert.equal(view.data.roster,undefined);assert.equal(view.data.class.code,undefined);assert.equal(view.data.class.canManage,false)
  const overview=await f.school(f.student,'');assert.equal(overview.data.classes.length,1)
  const login=await f.request('/api/account/login','POST',{username:'student',password:'test-password-123'});assert.equal((await f.request('/api/school','GET',undefined,login.cookie)).data.classes[0].id,c.id)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}`)).data.roster.length,1)
 }finally{await f.close()}
})
test('teacher assigns; student submits; teacher reviews; only author sees feedback; revisions prevent overwrites',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c);await joinClass(f,c,f.outsider);const id=await createTask(f,c)
  assert.equal((await f.school(f.student,`/classes/${c.id}/assignments`,'POST',{title:'fake'})).status,403)
  assert.equal((await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'آب با گرم شدن تبخیر می‌شود.',revision:0})).status,200)
  assert.equal((await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'stale',revision:0})).status,409)
  assert.equal((await f.school(f.otherTeacher,`/assignments/${id}`)).status,403)
  assert.equal((await f.school(f.outsider,`/assignments/${id}`)).data.submissions.length,0)
  assert.equal((await f.school(f.teacher,`/assignments/${id}/reviews/${f.student.user.id}`,'PUT',{feedback:'خوب مشاهده کردی.',score:21,revision:1})).status,400)
  const review={feedback:'مشاهده‌ات روشن است؛ یک مثال دیگر بنویس.',score:18.5,revision:1}
  assert.equal((await f.school(f.teacher,`/assignments/${id}/reviews/${f.student.user.id}`,'PUT',review)).status,200)
  assert.equal((await f.school(f.teacher,`/assignments/${id}/reviews/${f.student.user.id}`,'PUT',review)).status,409)
  const answer=(await f.school(f.student,`/assignments/${id}`)).data.submissions[0];assert.equal(answer.score,18.5);assert.equal(answer.revision,2);assert.ok(answer.reviewed);assert.equal(answer.feedback,review.feedback)
  assert.equal((await f.school(f.outsider,`/classes/${c.id}`)).data.assignments[0].submission,null)
  assert.equal((await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'پاسخ تازه با مثال',revision:2})).status,200)
  const updated=(await f.school(f.student,`/assignments/${id}`)).data.submissions[0];assert.equal(updated.feedback,'');assert.equal(updated.score,null);assert.equal(updated.reviewed,null)
  assert.equal((await f.school(f.teacher,`/assignments/${id}`,'PATCH',{active:false})).status,200)
  assert.equal((await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'another',revision:3})).status,409)
 }finally{await f.close()}
})
test('teacher sees enrolled learner reports and projects, while private notes and secrets are excluded',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c)
  const p={version:2,name:'کاوشگر',attempts:[{skill:'science-water',correct:true,at:Date.now()}],completed:['science-water'],rewards:{},notes:[{title:'خصوصی',text:'PRIVATE_NOTE',type:'یادداشت',at:1},{title:'آزمایش آب',text:'آب تبخیر شد.',type:'آزمایش',at:2},{title:'رشد دانه',text:'پروژهٔ من',type:'پروژهٔ چندروزه',at:3}],quest:[],settings:{},observations:[],saved:[]}
  assert.equal((await f.request('/api/account/progress','PUT',{progress:p,revision:0},f.student.cookie)).status,200)
  const report=await f.school(f.teacher,`/classes/${c.id}/students/${f.student.user.id}`);assert.equal(report.status,200);assert.equal(report.data.summary.experiments,1);assert.equal(report.data.summary.correct,1);assert.equal(report.data.notes.length,2);assert.equal(JSON.stringify(report.data).includes('PRIVATE_NOTE'),false)
  assert.equal((await f.school(f.otherTeacher,`/classes/${c.id}/students/${f.student.user.id}`)).status,403)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}/students/${f.outsider.user.id}`)).status,403)
 }finally{await f.close()}
})
test('revoked membership and disabled accounts lose access immediately and cannot bypass by joining or recovering',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c);const id=await createTask(f,c)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}/members/${f.student.user.id}`,'PATCH',{active:false})).status,200)
  assert.equal((await f.school(f.student,`/classes/${c.id}`)).status,403)
  assert.equal((await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'test',revision:0})).status,403)
  assert.equal((await f.school(f.student,'/join','POST',{code:c.code})).status,403)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}/members/${f.student.user.id}`,'PATCH',{active:true})).status,200)
  assert.equal((await f.school(f.student,`/classes/${c.id}`)).status,200)
  await f.school(f.admin,`/users/${f.student.user.id}`,'PATCH',{active:false})
  assert.equal((await f.school(f.student,'')).status,401)
  assert.equal((await f.request('/api/account/progress','GET',undefined,f.student.cookie)).status,401)
  assert.equal((await f.request('/api/account/recover','POST',{username:'student',password:'new-password-456',recoveryCode:f.student.recoveryCode})).status,403)
  await f.school(f.admin,`/users/${f.student.user.id}`,'PATCH',{active:true})
  assert.equal((await f.school(f.student,'')).status,401)
 }finally{await f.close()}
})
test('admin transfers and archives classes; role changes take effect for existing sessions; invite rotation preserves members',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c)
  assert.equal((await f.school(f.admin,`/users/${f.teacher.user.id}`,'PATCH',{role:'student'})).status,409)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}`,'PATCH',{owner:f.otherTeacher.user.id})).status,403)
  assert.equal((await f.school(f.admin,`/classes/${c.id}`,'PATCH',{owner:f.otherTeacher.user.id,rotateCode:true})).status,200)
  assert.equal((await f.school(f.teacher,`/classes/${c.id}`)).status,403)
  assert.equal((await f.school(f.outsider,'/join','POST',{code:c.code})).status,404)
  assert.equal((await f.school(f.student,`/classes/${c.id}`)).status,200)
  await f.school(f.admin,`/users/${f.teacher.user.id}`,'PATCH',{role:'student'})
  assert.equal((await f.school(f.teacher,'/classes','POST',{title:'old role attempt'})).status,403)
  await f.school(f.otherTeacher,`/classes/${c.id}`,'PATCH',{active:false})
  assert.equal((await f.school(f.student,`/classes/${c.id}`)).status,200)
  assert.equal((await f.school(f.otherTeacher,`/classes/${c.id}/assignments`,'POST',{title:'new',instructions:'test',subject:'علوم'})).status,409)
 }finally{await f.close()}
})
test('classes, membership, homework and feedback persist after restarting the server',async()=>{
 const f=await fixture();try{
  const c=await createClass(f);await joinClass(f,c);const id=await createTask(f,c)
  await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'پاسخ ماندگار',revision:0})
  await f.school(f.teacher,`/assignments/${id}/reviews/${f.student.user.id}`,'PUT',{feedback:'بازخورد ماندگار',score:20,revision:1})
  await f.restart()
  const overview=await f.school(f.student,'');assert.equal(overview.status,200);assert.equal(overview.data.classes[0].id,c.id)
  const d=(await f.school(f.student,`/assignments/${id}`)).data;assert.equal(d.submissions[0].answer,'پاسخ ماندگار');assert.equal(d.submissions[0].feedback,'بازخورد ماندگار');assert.equal(d.submissions[0].score,20)
 }finally{await f.close()}
})
test('existing version 2 database gains roles without losing account or progress',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,recovery TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,user INTEGER,expires INTEGER);CREATE TABLE progress(user INTEGER PRIMARY KEY,body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);INSERT INTO users VALUES(1,'existing','کاوشگر','salt','hash','recovery');INSERT INTO progress VALUES(1,'{"version":2,"notes":["saved work"]}',7);`)
  bootstrapAdmin(db,'existing');const u=db.prepare('SELECT * FROM users WHERE id=1').get();assert.equal(u.role,'admin');assert.equal(u.active,1);assert.equal(u.password,'hash');assert.equal(db.prepare('SELECT revision FROM progress WHERE user=1').get().revision,7);assert.match(db.prepare('SELECT body FROM progress WHERE user=1').get().body,/saved work/)
 }finally{db.close()}
})
test('upgrade import keeps the old installation, copies committed WAL data, and refuses to overwrite a new account database',async()=>{
 const f=await fixture(),destination=mkdtempSync(join(tmpdir(),'smartclass-upgrade-'))
 try{
  const c=await createClass(f);await joinClass(f,c);const id=await createTask(f,c)
  await f.school(f.student,`/assignments/${id}/answer`,'PUT',{answer:'پاسخ برای انتقال',revision:0})
  const newRoot=join(destination,'new');await importPrevious(f.dir,newRoot)
  const db=new DatabaseSync(join(newRoot,'data/smartclass.sqlite'));assert.equal(db.prepare('SELECT answer FROM school_answers').get().answer,'پاسخ برای انتقال');assert.equal(db.prepare("SELECT username FROM users WHERE username='student'").get().username,'student');db.close()
  await assert.rejects(()=>importPrevious(f.dir,newRoot),/already has a database/)
  assert.equal((await f.school(f.student,`/assignments/${id}`)).data.submissions[0].answer,'پاسخ برای انتقال')
 }finally{await f.close();rmSync(destination,{recursive:true,force:true})}
})
