const $=id=>document.getElementById(id),roles={student:'دانش‌آموز',teacher:'آموزگار',admin:'مدیر'},fa=n=>Number(n).toLocaleString('fa-IR');
let users=[],self=null,page=0,busy=false,selected=null,sequence=0;
const node=(tag,props={})=>{const el=document.createElement(tag);for(const [key,value]of Object.entries(props))if(key==='text')el.textContent=value;else if(key==='class')el.className=value;else el[key]=value;return el;};
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'success';$('message').hidden=!text;}
function lock(text){sequence++;users=[];self=null;$('rows').replaceChildren();$('workspace').hidden=true;$('confirm').close();$('access').hidden=false;$('access').replaceChildren(node('p',{text}),node('a',{href:'/#school',target:'_top',text:'ورود با حساب مدیر از بخش کلاس و معلم ←'}));}
async function api(url,body){const response=await fetch(url,{method:body?'PATCH':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});let data;try{data=await response.json();}catch{throw Error('پاسخ سرور خوانا نیست؛ سایت را با START-CLOUDFLARE.cmd اجرا کن.');}if(!response.ok){if(response.status===401||response.status===403)lock(data.error||'ورود با حساب مدیر لازم است.');throw Error(data.error||'درخواست انجام نشد.');}return data;}
function render(){
 const query=$('search').value.trim().toLocaleLowerCase(),role=$('role-filter').value,status=$('status-filter').value;
 const filtered=users.filter(u=>(u.name+' '+u.username).toLocaleLowerCase().includes(query)&&(role==='all'||u.role===role)&&(status==='all'||String(u.active)===status));
 const pages=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(page,pages-1);$('results').textContent=fa(filtered.length)+' حساب';$('page').textContent=fa(page+1)+' / '+fa(pages);$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
 const list=$('rows');list.replaceChildren();if(!filtered.length){list.append(node('p',{class:'empty',text:'کاربری با این مشخصات پیدا نشد.'}));return;}
 for(const user of filtered.slice(page*25,page*25+25)){
  const row=node('article',{class:'user-row'}),avatar=node('span',{class:'avatar',text:user.name?.slice(0,1)||'ک'}),identity=node('div',{class:'user-identity'});identity.append(node('b',{text:user.name}),node('small',{text:'@'+user.username,dir:'ltr'}));if(user.id===self.id)identity.append(node('span',{class:'self',text:'حساب خودت'}));
  const roleLabel=node('label',{text:'نقش'}),select=node('select');for(const [value,title]of Object.entries(roles))select.append(node('option',{value,text:title}));select.value=user.role;select.disabled=user.id===self.id||busy;roleLabel.append(select);
  const activeLabel=node('label',{class:'check'}),active=node('input',{type:'checkbox',checked:!!user.active,disabled:user.id===self.id||busy});activeLabel.append(active,node('span',{text:'حساب فعال'}));
  const badge=node('span',{class:'badge '+(user.active?'':'off'),text:user.active?'فعال':'غیرفعال'}),button=node('button',{class:'button primary small',text:'ذخیرهٔ تغییر',disabled:true});
  const update=()=>button.disabled=busy||user.id===self.id||(select.value===user.role&&active.checked===!!user.active);select.onchange=update;active.onchange=update;
  button.onclick=()=>{selected={id:user.id,role:select.value,active:active.checked};$('confirm-text').textContent=`حساب «${user.name}» با نام کاربری @${user.username} به نقش «${roles[selected.role]}» و وضعیت «${selected.active?'فعال':'غیرفعال'}» تغییر کند؟`;$('confirm-error').hidden=true;$('confirm').showModal();};
  row.append(avatar,identity,badge,roleLabel,activeLabel,button);list.append(row);
 }
}
async function load(){
 const ticket=++sequence;$('refresh').disabled=true;
 try{const me=await api('/api/account/me');if(ticket!==sequence)return;if(!me.user||me.user.role!=='admin'){lock('این بخش مخصوص مدیر سایت است. با حساب مدیر وارد شو.');return;}if(self&&self.id!==me.user.id){lock('حساب عوض شده است؛ صفحه را دوباره باز کن.');return;}self=me.user;const data=await api('/api/school/users');if(ticket!==sequence)return;users=data.users;$('workspace').hidden=false;$('access').hidden=true;$('total').textContent=fa(users.length);$('active').textContent=fa(users.filter(u=>u.active).length);$('teachers').textContent=fa(users.filter(u=>u.role==='teacher').length);$('admins').textContent=fa(users.filter(u=>u.role==='admin').length);$('limit-note').hidden=users.length<data.limit;render();}
 catch(error){if(self)message(error.message,true);else lock(error.message);}finally{$('refresh').disabled=false;}
}
for(const id of ['search','role-filter','status-filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;render();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('refresh').onclick=()=>{message('');void load();};$('cancel').onclick=()=>$('confirm').close();
$('apply').onclick=async()=>{if(!selected||busy)return;busy=true;$('apply').disabled=true;$('cancel').disabled=true;try{await api('/api/school/users/'+selected.id,{role:selected.role,active:selected.active});$('confirm').close();message('تغییر حساب ذخیره شد.');await load();}catch(error){$('confirm-error').textContent=error.message;$('confirm-error').hidden=false;}finally{busy=false;$('apply').disabled=false;$('cancel').disabled=false;if(self)render();}};
window.addEventListener('focus',()=>{if(!busy)void load();});window.addEventListener('smartclass:users-lock',()=>lock('برای مدیریت کاربران دوباره با حساب مدیر وارد شو.'));void load();
