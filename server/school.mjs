import {randomBytes} from 'node:crypto'
import {requireUser} from './identity.mjs'
import {HttpError,text} from './security.mjs'

export function school(db){
 db.exec(`
 CREATE TABLE IF NOT EXISTS school_classes(id INTEGER PRIMARY KEY,owner INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,code TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS school_enrollments(class INTEGER NOT NULL REFERENCES school_classes(id),student INTEGER NOT NULL REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1,joined INTEGER NOT NULL,PRIMARY KEY(class,student));
 CREATE TABLE IF NOT EXISTS school_assignments(id INTEGER PRIMARY KEY,class INTEGER NOT NULL REFERENCES school_classes(id),title TEXT NOT NULL,instructions TEXT NOT NULL,subject TEXT NOT NULL,due INTEGER,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS school_answers(assignment INTEGER NOT NULL REFERENCES school_assignments(id),student INTEGER NOT NULL REFERENCES users(id),answer TEXT NOT NULL,submitted INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,feedback TEXT NOT NULL DEFAULT '',score REAL,reviewed INTEGER,reviewer INTEGER REFERENCES users(id),PRIMARY KEY(assignment,student));
 CREATE TABLE IF NOT EXISTS school_audit(id INTEGER PRIMARY KEY,actor INTEGER REFERENCES users(id),action TEXT NOT NULL,target INTEGER,at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS school_assignment_class ON school_assignments(class);
 CREATE INDEX IF NOT EXISTS school_student ON school_enrollments(student);
 `)
 const audit=(actor,action,target)=>db.prepare('INSERT INTO school_audit(actor,action,target,at) VALUES(?,?,?,?)').run(actor,action,target,Date.now())
 const fail=(status,message)=>{throw new HttpError(status,message)}
 const number=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail(400,'شناسه معتبر نیست.');return n}
 const summary=student=>{
  const row=db.prepare('SELECT body,revision FROM progress WHERE user=?').get(student)
  let p={};try{p=JSON.parse(row?.body||'{}')}catch{}
  const attempts=Array.isArray(p.attempts)?p.attempts.filter(a=>a&&typeof a.correct==='boolean'):[]
  const notes=Array.isArray(p.notes)?p.notes.filter(n=>n&&typeof n.title==='string'&&typeof n.text==='string'):[]
  return {attempts:attempts.length,correct:attempts.filter(a=>a.correct).length,completed:Array.isArray(p.completed)?p.completed.length:0,notes:notes.length,experiments:notes.filter(n=>n.type==='آزمایش').length,lastActivity:Math.max(0,...attempts.map(a=>Number(a.at)||0),...notes.map(n=>Number(n.at)||0)),hasProgress:!!row}
 }
 return async(req,res,path,readJSON,send,rate)=>{
  if(!path.startsWith('/api/school'))return false
  const user=requireUser(db,req),method=req.method
  const admin=user.role==='admin',educator=admin||user.role==='teacher'
  const done=(data,status=200)=>{send(res,status,data);return true}
  const requireEducator=()=>{if(!educator)fail(403,'این کار به دسترسی آموزگار نیاز دارد.')}
  const classroom=id=>{const c=db.prepare('SELECT c.*,u.name AS teacher FROM school_classes c JOIN users u ON u.id=c.owner WHERE c.id=?').get(number(id));if(!c)fail(404,'کلاس پیدا نشد.');return c}
  const manages=c=>admin||(user.role==='teacher'&&c.owner===user.id)
  const enrolled=(c,student=user.id)=>db.prepare('SELECT active FROM school_enrollments WHERE class=? AND student=?').get(c.id,student)?.active===1
  const access=c=>{if(!manages(c)&&!enrolled(c))fail(403,'به این کلاس دسترسی نداری.')}
  const manage=c=>{if(!manages(c))fail(403,'فقط آموزگار همین کلاس یا مدیر دسترسی دارد.')}
  const assignment=id=>{const a=db.prepare('SELECT * FROM school_assignments WHERE id=?').get(number(id));if(!a)fail(404,'تکلیف پیدا نشد.');return a}
  const body=async()=>{rate.check('school-write:'+user.id,60);const b=await readJSON(req,50000);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'ساختار درخواست معتبر نیست.');return b}
  const bool=v=>{if(typeof v!=='boolean')fail(400,'وضعیت معتبر نیست.');return v?1:0}
  const publicClass=c=>({...c,code:manages(c)?c.code:undefined,canManage:manages(c)})
  if(path==='/api/school'&&method==='GET'){
   const classes=admin?db.prepare('SELECT c.*,u.name AS teacher FROM school_classes c JOIN users u ON u.id=c.owner ORDER BY c.id DESC').all():db.prepare(`SELECT c.*,u.name AS teacher FROM school_classes c JOIN users u ON u.id=c.owner WHERE c.owner=? AND ?='teacher' OR EXISTS(SELECT 1 FROM school_enrollments e WHERE e.class=c.id AND e.student=? AND e.active=1) ORDER BY c.id DESC`).all(user.id,user.role,user.id)
   return done({user,classes:classes.map(c=>({...publicClass(c),students:db.prepare('SELECT count(*) AS n FROM school_enrollments WHERE class=? AND active=1').get(c.id).n})),stats:admin?{users:db.prepare('SELECT count(*) AS n FROM users').get().n,teachers:db.prepare("SELECT count(*) AS n FROM users WHERE role='teacher' AND active=1").get().n,classes:classes.length}:undefined})
  }
  if(path==='/api/school/users'&&method==='GET'){
   if(!admin)fail(403,'این بخش مخصوص مدیر سایت است.')
   return done({users:db.prepare('SELECT id,username,name,role,active FROM users ORDER BY id DESC LIMIT 2000').all(),limit:2000})
  }
  let m=path.match(/^\/api\/school\/users\/(\d+)$/)
  if(m&&method==='PATCH'){
   if(!admin)fail(403,'این بخش مخصوص مدیر سایت است.');const id=number(m[1]),b=await body()
   const target=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(id);if(!target)fail(404,'کاربر پیدا نشد.')
   const role=b.role??target.role,active=b.active===undefined?target.active:bool(b.active)
   if(!['student','teacher','admin'].includes(role))fail(400,'نقش معتبر نیست.')
   if(id===user.id&&(role!=='admin'||!active))fail(409,'نمی‌توانی دسترسی مدیریت حساب خودت را حذف کنی.')
   if((!active||role==='student')&&db.prepare('SELECT count(*) AS n FROM school_classes WHERE owner=? AND active=1').get(id).n)fail(409,'ابتدا مالک کلاس‌های فعال این آموزگار را تغییر بده یا کلاس‌ها را بایگانی کن.')
   db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(role,active,id)
   if(!active)db.prepare('DELETE FROM sessions WHERE user=?').run(id)
   audit(user.id,'user:'+role+':'+active,id);return done({ok:true})
  }
  if(path==='/api/school/classes'&&method==='POST'){
   requireEducator();const b=await body(),title=text(b.title,2,80,'نام کلاس')
   if(db.prepare('SELECT count(*) AS n FROM school_classes WHERE owner=? AND active=1').get(user.id).n>=30)fail(409,'ظرفیت ۳۰ کلاس فعال پر شده است.')
   const r=db.prepare('INSERT INTO school_classes(owner,title,code,created) VALUES(?,?,?,?)').run(user.id,title,randomBytes(6).toString('hex').toUpperCase(),Date.now());audit(user.id,'class:create',Number(r.lastInsertRowid));return done({id:Number(r.lastInsertRowid)},201)
  }
  if(path==='/api/school/join'&&method==='POST'){
   if(user.role!=='student')fail(403,'برای عضویت دانش‌آموزی با حساب دانش‌آموز وارد شو.')
   rate.check('school-join:'+user.id,12);const b=await body(),code=text(b.code,1,24,'کد کلاس').toUpperCase()
   const c=db.prepare('SELECT * FROM school_classes WHERE code=? AND active=1').get(code);if(!c)fail(404,'کد کلاس درست نیست یا کلاس بایگانی شده است.')
   const e=db.prepare('SELECT active FROM school_enrollments WHERE class=? AND student=?').get(c.id,user.id)
   if(e?.active===0)fail(403,'عضویت تو متوقف شده است؛ آموزگار باید آن را فعال کند.')
   if(!e&&db.prepare('SELECT count(*) AS n FROM school_enrollments WHERE class=? AND active=1').get(c.id).n>=60)fail(409,'ظرفیت ۶۰ دانش‌آموز کلاس پر شده است.')
   db.prepare('INSERT OR IGNORE INTO school_enrollments(class,student,joined) VALUES(?,?,?)').run(c.id,user.id,Date.now());return done({id:c.id})
  }
  m=path.match(/^\/api\/school\/classes\/(\d+)$/)
  if(m){const c=classroom(m[1]);access(c)
   if(method==='GET'){
    const tasks=db.prepare('SELECT * FROM school_assignments WHERE class=? ORDER BY id DESC').all(c.id).map(a=>{
     if(manages(c))return {...a,submitted:db.prepare('SELECT count(*) AS n FROM school_answers s JOIN school_enrollments e ON e.student=s.student AND e.class=? AND e.active=1 JOIN users u ON u.id=s.student AND u.active=1 WHERE s.assignment=?').get(c.id,a.id).n,reviewed:db.prepare('SELECT count(*) AS n FROM school_answers s JOIN school_enrollments e ON e.student=s.student AND e.class=? AND e.active=1 JOIN users u ON u.id=s.student AND u.active=1 WHERE s.assignment=? AND s.reviewed IS NOT NULL').get(c.id,a.id).n}
     return {...a,submission:db.prepare('SELECT answer,submitted,revision,feedback,score,reviewed FROM school_answers WHERE assignment=? AND student=?').get(a.id,user.id)||null}
    })
    const roster=manages(c)?db.prepare('SELECT u.id,u.username,u.name,u.active AS accountActive,e.active FROM school_enrollments e JOIN users u ON u.id=e.student WHERE e.class=? ORDER BY e.active DESC,u.name').all(c.id).map(u=>({...u,progress:summary(u.id)})):undefined
    return done({class:publicClass(c),assignments:tasks,roster})
   }
   if(method==='PATCH'){
    manage(c);const b=await body(),title=b.title===undefined?c.title:text(b.title,2,80,'نام کلاس'),active=b.active===undefined?c.active:bool(b.active);let owner=c.owner
    if(b.owner!==undefined){if(!admin)fail(403,'تغییر مالک کلاس مخصوص مدیر است.');owner=number(b.owner);if(!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role IN('teacher','admin')").get(owner))fail(400,'مالک باید آموزگار یا مدیر فعال باشد.')}
    db.prepare('UPDATE school_classes SET title=?,active=?,owner=?,code=? WHERE id=?').run(title,active,owner,b.rotateCode===true?randomBytes(6).toString('hex').toUpperCase():c.code,c.id);audit(user.id,'class:update',c.id);return done({ok:true})
   }
  }
  m=path.match(/^\/api\/school\/classes\/(\d+)\/members\/(\d+)$/)
  if(m&&method==='PATCH'){
   const c=classroom(m[1]);manage(c);const id=number(m[2]),b=await body(),active=bool(b.active)
   const existing=db.prepare('SELECT active FROM school_enrollments WHERE class=? AND student=?').get(c.id,id);if(!existing)fail(404,'عضو کلاس پیدا نشد.')
   if(active&&!existing.active&&db.prepare('SELECT count(*) AS n FROM school_enrollments WHERE class=? AND active=1').get(c.id).n>=60)fail(409,'ظرفیت کلاس پر است.')
   db.prepare('UPDATE school_enrollments SET active=? WHERE class=? AND student=?').run(active,c.id,id);audit(user.id,'enrollment:'+c.id+':'+active,id);return done({ok:true})
  }
  m=path.match(/^\/api\/school\/classes\/(\d+)\/students\/(\d+)$/)
  if(m&&method==='GET'){
   const c=classroom(m[1]);manage(c);const id=number(m[2]);if(!enrolled(c,id))fail(403,'دانش‌آموز عضو فعال کلاس نیست.')
   const student=db.prepare('SELECT id,username,name FROM users WHERE id=? AND active=1').get(id);if(!student)fail(404,'حساب فعال پیدا نشد.')
   const row=db.prepare('SELECT body FROM progress WHERE user=?').get(id);let p={};try{p=JSON.parse(row?.body||'{}')}catch{}
   return done({student,summary:summary(id),attempts:(Array.isArray(p.attempts)?p.attempts:[]).filter(a=>a&&typeof a.skill==='string'&&Number.isFinite(a.at)).slice(-100).map(a=>({skill:a.skill,correct:!!a.correct,hint:!!a.hint,at:a.at})),notes:(Array.isArray(p.notes)?p.notes:[]).filter(n=>n&&['آزمایش','پروژهٔ چندروزه'].includes(n.type)).slice(0,50).map(n=>({title:String(n.title).slice(0,100),text:String(n.text).slice(0,12000),type:n.type,at:n.at}))})
  }
  m=path.match(/^\/api\/school\/classes\/(\d+)\/assignments$/)
  if(m&&method==='POST'){
   const c=classroom(m[1]);manage(c);if(!c.active)fail(409,'کلاس بایگانی شده است.');const b=await body(),title=text(b.title,2,120,'عنوان تکلیف'),instructions=text(b.instructions,2,6000,'توضیح تکلیف'),subject=text(b.subject,1,40,'درس'),due=b.due??null
   if(due!==null&&(!Number.isSafeInteger(due)||due<0||due>8640000000000000))fail(400,'مهلت معتبر نیست.')
   if(db.prepare('SELECT count(*) AS n FROM school_assignments WHERE class=?').get(c.id).n>=500)fail(409,'ظرفیت تکلیف‌های این کلاس پر است.')
   const r=db.prepare('INSERT INTO school_assignments(class,title,instructions,subject,due,created) VALUES(?,?,?,?,?,?)').run(c.id,title,instructions,subject,due,Date.now());return done({id:Number(r.lastInsertRowid)},201)
  }
  m=path.match(/^\/api\/school\/assignments\/(\d+)$/)
  if(m){const a=assignment(m[1]),c=classroom(a.class);access(c)
   if(method==='GET'){
    const submissions=manages(c)?db.prepare('SELECT s.*,u.name,u.username,e.active AS enrolled FROM school_answers s JOIN users u ON u.id=s.student JOIN school_enrollments e ON e.class=? AND e.student=s.student WHERE s.assignment=? ORDER BY s.submitted DESC').all(c.id,a.id):db.prepare('SELECT * FROM school_answers WHERE assignment=? AND student=?').all(a.id,user.id)
    return done({assignment:a,submissions})
   }
   if(method==='PATCH'){manage(c);const b=await body();db.prepare('UPDATE school_assignments SET active=? WHERE id=?').run(bool(b.active),a.id);return done({ok:true})}
  }
  m=path.match(/^\/api\/school\/assignments\/(\d+)\/answer$/)
  if(m&&method==='PUT'){
   const a=assignment(m[1]),c=classroom(a.class);if(user.role!=='student'||!enrolled(c))fail(403,'فقط دانش‌آموز عضو کلاس می‌تواند پاسخ بدهد.');if(!c.active||!a.active)fail(409,'زمان دریافت پاسخ این تکلیف بسته شده است.')
   const b=await body(),answer=text(b.answer,1,12000,'پاسخ'),old=db.prepare('SELECT revision FROM school_answers WHERE assignment=? AND student=?').get(a.id,user.id)
   if(!Number.isInteger(b.revision)||b.revision!==(old?.revision||0))fail(409,'پاسخ در جای دیگری تغییر کرده است؛ تکلیف را دوباره باز کن.')
   if(old){const r=db.prepare("UPDATE school_answers SET answer=?,submitted=?,revision=revision+1,feedback='',score=NULL,reviewed=NULL,reviewer=NULL WHERE assignment=? AND student=? AND revision=?").run(answer,Date.now(),a.id,user.id,b.revision);if(!r.changes)fail(409,'پاسخ تغییر کرده است؛ دوباره باز کن.')}
   else db.prepare('INSERT INTO school_answers(assignment,student,answer,submitted) VALUES(?,?,?,?)').run(a.id,user.id,answer,Date.now())
   return done({ok:true,revision:b.revision+1})
  }
  m=path.match(/^\/api\/school\/assignments\/(\d+)\/reviews\/(\d+)$/)
  if(m&&method==='PUT'){
   const a=assignment(m[1]),c=classroom(a.class);manage(c);const id=number(m[2]);if(!enrolled(c,id))fail(403,'عضویت این دانش‌آموز فعال نیست.');const b=await body(),feedback=text(b.feedback,1,4000,'بازخورد'),score=b.score??null
   if(score!==null&&(typeof score!=='number'||!Number.isFinite(score)||score<0||score>20))fail(400,'نمره باید بین صفر تا ۲۰ باشد.')
   if(!Number.isInteger(b.revision)||b.revision<1)fail(400,'نسخهٔ پاسخ معتبر نیست.')
   const r=db.prepare('UPDATE school_answers SET feedback=?,score=?,reviewed=?,reviewer=?,revision=revision+1 WHERE assignment=? AND student=? AND revision=?').run(feedback,score,Date.now(),user.id,a.id,id,b.revision)
   if(!r.changes)fail(409,'پاسخ تغییر کرده یا هنوز ارسال نشده است؛ فهرست را تازه کن.');return done({ok:true})
  }
  fail(404,'بخش مدرسه پیدا نشد.')
 }
}
