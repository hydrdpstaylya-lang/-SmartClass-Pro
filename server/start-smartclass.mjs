import {spawn} from 'node:child_process';

const originalFetch=globalThis.fetch;
const key=process.env.GROQ_API_KEY||"";
const clean=value=>{
  let text=String(value??"");
  if(key)text=text.split(key).join("[HIDDEN]");
  return text.replace(/(?:gsk_|sk-)[A-Za-z0-9_-]+/gi,"[HIDDEN]").replace(/\s+/g," ").slice(0,700);
};

globalThis.fetch=async(...args)=>{
  const response=await originalFetch(...args);
  if(String(args[0]).startsWith("https://api.groq.com/")&&!response.ok){
    try{
      const raw=await response.clone().text();let data;
      try{data=JSON.parse(raw);}catch{}
      const message=typeof data?.error==="string"?data.error:data?.error?.message??data?.message??raw.replace(/<[^>]*>/g," ");
      console.log("GROQ_DETAIL:",response.status,clean(message));
    }catch{console.log("GROQ_DETAIL:",response.status,"Could not read error details.");}
  }
  return response;
};

const url="http://127.0.0.1:5188";
let running=false;
try{
  const r=await originalFetch(url+"/api/health",{signal:AbortSignal.timeout(1500)});
  const status=await r.json();
  running=r.ok&&status.ok===true&&typeof status.ai==="boolean"&&typeof status.classrooms==="boolean"&&typeof status.provider==="string";
}catch{}

if(running){
  console.log("SmartClass is already running: "+url);
  if(process.platform==="win32"){
    const child=spawn("cmd.exe",["/c","start","",url],{windowsHide:true,stdio:"ignore"});
    child.on("error",()=>{});child.unref();
  }
}else{
  process.argv.push("--host","127.0.0.1","--port","5188","--open");
  await import("./index.mjs");
}
