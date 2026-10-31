import {randomUUID} from 'node:crypto';
import {ApiError,db,eq,requireUser,input,send} from './db.mjs';
import {validateExam,SUBJECTS} from '../server/teacher-exams.mjs';
export async function exams(req,res,path){const u=await requireUser(req,['teacher','admin']);const method=req.method;
 if(path==='/teacher-exams'&&method==='GET'){const rows=await db('sc_teacher_exams','select=id,title,subject,grade,count,revision,created,updated&owner='+eq(u.id)+'&order=updated.desc&limit=100');return send(res,200,{user:u,subjects:SUBJECTS,total:rows.length,exams:rows})}
 const m=path.match(/^\/teacher-exams\/([0-9a-f-]{36})$/);let record;
 if(m){const rows=await db('sc_teacher_exams','select=*&id='+eq(m[1])+'&owner='+eq(u.id));record=rows[0];if(!record)throw new ApiError(404,'آزمون پیدا نشد.');if(method==='GET')return send(res,200,{id:record.id,revision:record.revision,exam:record.body,created:record.created,updated:record.updated});if(method==='DELETE'){await db('sc_teacher_exams','id='+eq(record.id)+'&owner='+eq(u.id),'DELETE');return send(res,200,{ok:true})}}
 if((!m&&path==='/teacher-exams'&&method==='POST')||(m&&method==='PUT')){
 const b=await input(req,110000),exam=validateExam(b.exam),now=Date.now();
 if(m){if(b.revision!==record.revision)throw new ApiError(409,'نسخه آزمون تغییر کرده است.');const updated=await db('sc_teacher_exams','id='+eq(record.id)+'&owner='+eq(u.id)+'&revision='+eq(b.revision),'PATCH',{title:exam.title,subject:exam.subject,grade:exam.grade,count:exam.count,body:exam,revision:b.revision+1,updated:now});if(!updated.length)throw new ApiError(409,'نسخه آزمون تغییر کرده است.');return send(res,200,{id:record.id,revision:b.revision+1})}
 const id=randomUUID();await db('sc_teacher_exams','', 'POST',{id,owner:u.id,title:exam.title,subject:exam.subject,grade:exam.grade,count:exam.count,body:exam,created:now,updated:now,revision:1});return send(res,201,{id,revision:1});
 }
 throw new ApiError(404,'آدرس آزمون‌ساز معتبر نیست.');
}
