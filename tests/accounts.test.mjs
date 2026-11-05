import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {createApp} from '../server/app.mjs'
const blank=()=>({version:2,name:'کاوشگر',attempts:[],completed:[],rewards:{},notes:[],quest:[],settings:{large:false,contrast:false,motion:false},observations:[],saved:[]})
test('student accounts isolate progress, reject stale writes, recover passwords and revoke old sessions',async()=>{
 const app=createApp({dbPath:':memory:',env:{}}),server=http.createServer(app.handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
 const request=(path,method='GET',body,cookie='')=>fetch(base+'/api/account/'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)})
 try{
 let r=await request('register','POST',{username:'student_one',name:'کاوشگر',password:'test-password-123'});assert.equal(r.status,200);const first=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);assert.ok(first.recoveryCode);assert.equal(first.user.password,undefined)
 assert.equal((await (await request('me','GET',undefined,cookie)).json()).user.username,'student_one')
 const progress=blank();progress.completed=['lesson-1'];r=await request('progress','PUT',{progress,revision:0},cookie);assert.equal(r.status,200);assert.equal((await r.json()).revision,1)
 assert.equal((await request('progress','PUT',{progress,revision:0},cookie)).status,409)
 r=await request('register','POST',{username:'student_two',password:'another-password-123'});assert.equal(r.status,200);const second=r.headers.get('set-cookie').split(';')[0]
 assert.equal((await (await request('progress','GET',undefined,second)).json()).progress,null)
 assert.deepEqual((await (await request('progress','GET',undefined,cookie)).json()).progress.completed,['lesson-1'])
 assert.equal((await request('progress')).status,401)
 assert.equal((await request('progress','PUT',{progress:{version:2},revision:0},second)).status,400)
 assert.equal((await request('login','POST',{username:'student_one',password:'wrong-password-123'})).status,401)
 r=await request('recover','POST',{username:'student_one',password:'recovered-password-456',recoveryCode:first.recoveryCode});assert.equal(r.status,200);const recovered=await r.json();assert.notEqual(recovered.recoveryCode,first.recoveryCode)
 assert.equal((await (await request('me','GET',undefined,cookie)).json()).user,null)
 assert.equal((await request('login','POST',{username:'student_one',password:'test-password-123'})).status,401)
 r=await request('login','POST',{username:'student_one',password:'recovered-password-456'});assert.equal(r.status,200);const fresh=r.headers.get('set-cookie').split(';')[0]
 await request('logout','POST',{},fresh);assert.equal((await (await request('me','GET',undefined,fresh)).json()).user,null)
 }finally{await new Promise(r=>server.close(r));app.close()}
})
