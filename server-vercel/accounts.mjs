import {randomBytes,timingSafeEqual} from 'node:crypto';
import {ApiError,hash,randomToken,passwordHash,db,eq,currentUser,requireUser,cookieSession,setSessionCookie,input,send} from './db.mjs';
const publicUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role});
const text=(v,max)=>String(v||'').trim().slice(0,max);
const recent=new Map();function accountLimit(req){const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'unknown',now=Date.now(),old=recent.get(ip),v=!old||old.until<now?{n:0,until:now+60000}:old;if(++v.n>8)throw new ApiError(429,'تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.');if(recent.size>1000)recent.delete(recent.keys().next().value);recent.set(ip,v)}
async function createSession(res,record){const raw=randomToken(32);await db('sc_sessions','', 'POST',{token_hash:hash(raw),user_id:record.id,expires:Date.now()+604800000});setSessionCookie(res,raw,604800)}
export async function account(req,res,path){const method=req.method;
 if(path==='/account/me'&&method==='GET')return send(res,200,{user:await currentUser(req)});
 if(['register','login','recover'].some(x=>path==='/account/'+x)&&method==='POST'){
  accountLimit(req);const b=await input(req,12000);
  if(!/^[-a-zA-Z0-9_]{3,30}$/.test(b?.username||'')||typeof b.password!=='string'||b.password.length<10||b.password.length>128)throw new ApiError(400,'نام کاربری باید ۳ تا ۳۰ نویسه و رمز حداقل ۱۰ نویسه داشته باشد.');
  const username=b.username.toLowerCase();const rows=await db('sc_users','select=*&username='+eq(username)+'&limit=1');let user=rows[0],recoveryCode;
  if(path==='/account/register'){
   if(user)throw new ApiError(409,'این نام کاربری قبلاً انتخاب شده است.');
   const salt=randomBytes(16).toString('hex');recoveryCode=randomToken(18);
   const created=await db('sc_users','', 'POST',{username,name:text(b.name,30)||'کاوشگر',salt,password_hash:await passwordHash(b.password,salt),recovery_hash:hash(recoveryCode),role:'student',active:true});user=created[0];
  }else if(path==='/account/login'){
   const attempt=await passwordHash(b.password,user?.salt||'invalid-user');const expected=Buffer.from(user?.password_hash||'00'.repeat(64),'hex');if(!user?.active||expected.length!==64||!timingSafeEqual(Buffer.from(attempt,'hex'),expected))throw new ApiError(401,'نام کاربری یا رمز درست نیست.');
  }else{
   const code=typeof b.recoveryCode==='string'?b.recoveryCode.trim():'';if(!user?.active||!code||code.length>200||hash(code)!==user.recovery_hash)throw new ApiError(401,'نام کاربری یا کد بازیابی درست نیست.');const salt=randomBytes(16).toString('hex');recoveryCode=randomToken(18);await db('sc_users','id='+eq(user.id),'PATCH',{salt,password_hash:await passwordHash(b.password,salt),recovery_hash:hash(recoveryCode)});await db('sc_sessions','user_id='+eq(user.id),'DELETE');
  }
  await createSession(res,user);return send(res,200,{user:publicUser(user),...(recoveryCode?{recoveryCode}:{})});
 }
 if(path==='/account/logout'&&method==='POST') {const raw=cookieSession(req);if(raw)await db('sc_sessions','token_hash='+eq(hash(raw)),'DELETE');setSessionCookie(res,'',0);return send(res,200,{ok:true})}
 const u=await requireUser(req);
 if(path==='/account/progress'&&method==='GET'){const rows=await db('sc_progress','select=progress,revision&user_id='+eq(u.id));return send(res,200,{progress:rows[0]?.progress||null,revision:rows[0]?.revision||0})}
 if(path==='/account/progress'&&method==='PUT'){
  const b=await input(req,500000);const p=b?.progress||b,rev=b?.revision;
  if(!p||p.version!==2||typeof p.name!=='string'||p.name.length>40||!['attempts','completed','notes','quest','observations','saved'].every(k=>Array.isArray(p[k])&&p[k].length<=3000)||!p.rewards||typeof p.rewards!=='object'||!p.settings||typeof p.settings!=='object')throw new ApiError(400,'ساختار کارپوشه معتبر نیست.');
  const old=await db('sc_progress','select=revision&user_id='+eq(u.id));if(!Number.isInteger(rev)||rev!==(old[0]?.revision||0))throw new ApiError(409,'کارپوشه از دستگاه دیگری تغییر کرده است.');
  let updated;if(old.length){updated=await db('sc_progress','user_id='+eq(u.id)+'&revision='+eq(rev),'PATCH',{progress:p,revision:rev+1});if(!updated.length)throw new ApiError(409,'نسخه کارپوشه تغییر کرده است.')}else{try{updated=await db('sc_progress','', 'POST',{user_id:u.id,progress:p,revision:1})}catch(e){if(e.status===409)throw new ApiError(409,'کارپوشه در دستگاه دیگری ثبت شده است.');throw e}}
  return send(res,200,{ok:true,revision:rev+1});
 }
 throw new ApiError(404,'مسیر حساب وجود ندارد.');
}
export async function schoolUsers(req,res,path){const u=await requireUser(req,['admin']);
 if(path==='/school/users'&&req.method==='GET') {const rows=await db('sc_users','select=id,username,name,role,active&order=id.desc&limit=200');return send(res,200,{users:rows,limit:200})}
 const m=path.match(/^\/school\/users\/(\d+)$/);if(!m||req.method!=='PATCH')throw new ApiError(404,'بخش مدیریت پیدا نشد.');const body=await input(req,4000);if(!['student','teacher','admin'].includes(body.role)||typeof body.active!=='boolean')throw new ApiError(400,'نقش یا وضعیت معتبر نیست.');if(Number(m[1])===u.id&&(body.role!=='admin'||!body.active))throw new ApiError(400,'مدیر نمی‌تواند دسترسی خودش را حذف کند.');const rows=await db('sc_users','id='+eq(m[1]),'PATCH',{role:body.role,active:body.active});if(!rows.length)throw new ApiError(404,'حساب یافت نشد.');if(!body.active)await db('sc_sessions','user_id='+eq(m[1]),'DELETE');return send(res,200,{ok:true});
}
