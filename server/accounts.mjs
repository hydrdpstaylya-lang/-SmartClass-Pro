import {scrypt as derive,randomBytes,timingSafeEqual,createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {currentUser} from './identity.mjs'
const scrypt=promisify(derive),hash=t=>createHash('sha256').update(t).digest('hex')
export function accounts(db,env={}){
 db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL,recovery TEXT);CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user INTEGER REFERENCES users(id),expires INTEGER);CREATE TABLE IF NOT EXISTS progress(user INTEGER PRIMARY KEY REFERENCES users(id),body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);`)
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='recovery'))db.exec('ALTER TABLE users ADD COLUMN recovery TEXT')
 if(!db.prepare('PRAGMA table_info(progress)').all().some(c=>c.name==='revision'))db.exec('ALTER TABLE progress ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='role'))db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='active'))db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
 let hashing=0
 async function derivePassword(password,salt){if(hashing>=4)throw Error('busy');hashing++;try{return Buffer.from(await scrypt(password,salt,64))}finally{hashing--}}
 const validProgress=b=>b&&b.version===2&&typeof b.name==='string'&&b.name.length<=40&&['attempts','completed','notes','quest','observations','saved'].every(k=>Array.isArray(b[k])&&b[k].length<=3000)&&b.rewards&&typeof b.rewards==='object'&&Object.keys(b.rewards).length<=5000&&b.settings&&typeof b.settings==='object'
 return async(req,res,path,readJSON,send,rate,ip)=>{
 if(!path.startsWith('/api/account/'))return false
 const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sc_session='))?.slice(11)||''
 const user=currentUser(db,req)
 const fail=(status,error)=>{send(res,status,{error});return true}
 const cookie=(v,age)=>res.setHeader('Set-Cookie',`sc_session=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${req.socket.encrypted||env.PUBLIC_ORIGIN?.startsWith('https:')?'; Secure':''}`)
 if(path==='/api/account/me'&&req.method==='GET'){send(res,200,{user:user||null});return true}
 if(['/api/account/register','/api/account/login','/api/account/recover'].includes(path)&&req.method==='POST'){
 rate.check('account:'+ip,10,60000);const b=await readJSON(req,10000)
 if(typeof b.username!=='string'||!/^[-a-zA-Z0-9_]{3,30}$/.test(b.username)||typeof b.password!=='string'||b.password.length<10||b.password.length>128)return fail(400,'نام کاربری انگلیسی ۳ تا ۳۰ نویسه و رمز حداقل ۱۰ نویسه لازم است.')
 const username=b.username.toLowerCase();let record=db.prepare('SELECT * FROM users WHERE username=?').get(username),recoveryCode
 if(path.endsWith('register')){
 if(record)return fail(409,'این نام کاربری قبلاً انتخاب شده است.')
 const salt=randomBytes(16).toString('hex'),password=(await derivePassword(b.password,salt)).toString('hex'),name=String(b.name||'کاوشگر').trim().slice(0,30)||'کاوشگر';recoveryCode=randomBytes(18).toString('base64url')
 try{db.prepare('INSERT INTO users(username,name,salt,password,recovery) VALUES(?,?,?,?,?)').run(username,name,salt,password,hash(recoveryCode))}catch(e){if(String(e.code).includes('CONSTRAINT'))return fail(409,'این نام کاربری قبلاً انتخاب شده است.');throw e}
 record=db.prepare('SELECT * FROM users WHERE username=?').get(username)
 }else if(path.endsWith('recover')){
 if(record&&!record.active)return fail(403,'این حساب غیرفعال است؛ با مدیر سایت هماهنگ کن.')
 const code=typeof b.recoveryCode==='string'?b.recoveryCode.trim():''
 if(!record?.recovery||code.length>100||!timingSafeEqual(Buffer.from(hash(code)),Buffer.from(record.recovery)))return fail(401,'نام کاربری یا کد بازیابی درست نیست.')
 const salt=randomBytes(16).toString('hex'),password=(await derivePassword(b.password,salt)).toString('hex');recoveryCode=randomBytes(18).toString('base64url');db.prepare('UPDATE users SET salt=?,password=?,recovery=? WHERE id=?').run(salt,password,hash(recoveryCode),record.id);db.prepare('DELETE FROM sessions WHERE user=?').run(record.id)
 }else{
 const computed=await derivePassword(b.password,record?.salt||'invalid-user-salt');if(!record||!record.active||!timingSafeEqual(computed,Buffer.from(record.password,'hex')))return fail(401,'نام کاربری یا رمز درست نیست یا حساب غیرفعال است.')
 }
 const raw=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(raw),record.id,Date.now()+7*86400000);cookie(raw,604800);send(res,200,{user:{id:record.id,username:record.username,name:record.name,role:record.role},...(recoveryCode?{recoveryCode}: {})});return true
 }
 if(path==='/api/account/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));cookie('',0);send(res,200,{ok:true});return true}
 if(!user)return fail(401,'ابتدا وارد حساب شو.')
 if(path==='/api/account/progress'&&req.method==='GET'){const row=db.prepare('SELECT body,revision FROM progress WHERE user=?').get(user.id);send(res,200,{progress:row?JSON.parse(row.body):null,revision:row?.revision||0});return true}
 if(path==='/api/account/progress'&&req.method==='PUT'){
 rate.check('progress:'+user.id,60);const request=await readJSON(req,500000),body=request.progress||request,revision=request.revision;const row=db.prepare('SELECT revision FROM progress WHERE user=?').get(user.id);if(!validProgress(body))return fail(400,'ساختار کارپوشه معتبر نیست.');if(!Number.isInteger(revision)||revision!==(row?.revision||0))return fail(409,'کارپوشه در دستگاه دیگری تغییر کرده است؛ نسخهٔ حساب را دوباره باز کن.')
 if(row){const update=db.prepare('UPDATE progress SET body=?,revision=revision+1 WHERE user=? AND revision=?').run(JSON.stringify(body),user.id,revision);if(!update.changes)return fail(409,'کارپوشه تغییر کرده است.')}else db.prepare('INSERT INTO progress(user,body,revision) VALUES(?,?,1)').run(user.id,JSON.stringify(body));send(res,200,{ok:true,revision:revision+1});return true
 }
 return fail(404,'مسیر حساب پیدا نشد.')
 }
}
