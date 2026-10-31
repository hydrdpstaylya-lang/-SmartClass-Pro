import {ApiError,send} from './db.mjs';
import {status,aiRoute} from './ai.mjs';
import {account,schoolUsers} from './accounts.mjs';
import {exams} from './exams.mjs';
export default async function handler(req,res){
 try{
  const u=new URL(req.url,'https://localhost'),route=u.searchParams.get('route');
  const path='/'+String(route||'').replace(/^\/+/, '');
  if(req.headers.origin){let orig;try{orig=new URL(req.headers.origin)}catch{throw new ApiError(403,'مبدأ درخواست نادرست است.')}const host=req.headers['x-forwarded-host']||req.headers.host;if(!host||orig.host!==host||orig.protocol!=='https:')throw new ApiError(403,'درخواست از سایت دیگری مجاز نیست.');}
  if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'درخواست از سایت دیگر پذیرفته نمی‌شود.');
  if(path==='/health'&&req.method==='GET')return send(res,200,{ok:true,...status()});
  if((path==='/ai'||path==='/teacher-exams/generate')&&req.method==='POST')return await aiRoute(req,res,path);
  if(path.startsWith('/account/'))return await account(req,res,path);
  if(path.startsWith('/school/users'))return await schoolUsers(req,res,path);
  if(path.startsWith('/teacher-exams'))return await exams(req,res,path);
  if(path.startsWith('/rooms')||path.startsWith('/school'))throw new ApiError(501,'کلاس زنده و مدیریت تکالیف هنوز به سرور دائمی منتقل نشده‌اند.');
  throw new ApiError(404,'این مسیر API موجود نیست.');
 }catch(e){if(!res.headersSent)send(res,e instanceof ApiError?e.status:e.status>=400&&e.status<=599?e.status:500,{error:e instanceof ApiError?e.message:e.status>=400&&e.status<=599?e.message:'سرور نتوانست درخواست را پردازش کند.'});}
}
