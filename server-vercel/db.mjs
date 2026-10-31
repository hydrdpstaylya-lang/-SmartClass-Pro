import {randomBytes,createHash,scrypt as callbackScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(callbackScrypt);
export class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export function secretMatch(a,b){return !!b && timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)))}
export async function passwordHash(password,salt){return (await scrypt(password,salt,64)).toString('hex')}
export const randomToken=(len=24)=>randomBytes(len).toString('base64url');
export const ready=()=>!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
export async function db(table,params='',method='GET',body=undefined,prefer='return=representation'){
 if(!ready())throw new ApiError(503,'پایگاه داده هنوز متصل نشده است. SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY را در تنظیمات Vercel قرار بده.');
 const base=String(process.env.SUPABASE_URL).replace(/\/+$/,'');
 if(!/^https:\/\/[a-zA-Z0-9.-]+\.supabase\.co$/.test(base))throw new ApiError(503,'نشانی Supabase معتبر نیست.');
 const url=base+'/rest/v1/'+table+(params?'?'+params:'');
 let response;try{response=await fetch(url,{method,headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),cache:'no-store'})}catch{throw new ApiError(503,'پایگاه داده پاسخ نداد.');}
 if(!response.ok){const info=await response.json().catch(()=>({}));if(info.code==='23505')throw new ApiError(409,'این نام کاربری یا شناسه تکراری است.');if(info.code==='42P01')throw new ApiError(503,'جدول‌های Supabase ساخته نشده‌اند. ابتدا database/setup.sql را اجرا کن.');throw new ApiError(503,'خطای ارتباط با پایگاه داده ('+response.status+').')}
 if(response.status===204||prefer==='return=minimal')return [];
 return await response.json().catch(()=>[]);
}
export const eq=value=>'eq.'+encodeURIComponent(String(value));
export function cookieSession(req){const raw=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sc_session='));return raw?.slice('sc_session='.length)||''}
export async function currentUser(req){const raw=cookieSession(req);if(!raw||raw.length>200)return null;const sessions=await db('sc_sessions','select=user_id,expires&token_hash='+eq(hash(raw))+'&limit=1');if(!sessions[0]||sessions[0].expires<Date.now())return null;const users=await db('sc_users','select=id,username,name,role,active&id='+eq(sessions[0].user_id)+'&limit=1');return users[0]?.active?{id:users[0].id,username:users[0].username,name:users[0].name,role:users[0].role}:null}
export async function requireUser(req,roles){const u=await currentUser(req);if(!u)throw new ApiError(401,'ابتدا وارد حساب کاربری شو.');if(roles&&!roles.includes(u.role))throw new ApiError(403,'دسترسی کافی نداری.');return u}
export function setSessionCookie(res,raw,age){res.setHeader('Set-Cookie',`sc_session=${raw}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`)}
export async function input(req,limit=100000){const length=Number(req.headers['content-length']||0);if(length>limit)throw new ApiError(413,'اندازه درخواست بیش از حد است.');if(req.body&&typeof req.body==='object')return req.body;let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ApiError(413,'اندازه درخواست بیش از حد است.');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ApiError(400,'درخواست JSON معتبر نیست.')}}
export function send(res,status,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))}
