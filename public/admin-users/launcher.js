(()=>{'use strict';
if(document.getElementById('sc-admin-panel'))return;
const css=document.createElement('link');css.rel='stylesheet';css.href='/admin-users/launcher.css?v=1';document.head.append(css);
const dialog=document.createElement('dialog');dialog.id='sc-admin-panel';dialog.setAttribute('aria-label','مدیریت کاربران');
const bar=document.createElement('header'),label=document.createElement('b');label.textContent='مدیریت کاربران';const full=document.createElement('a');full.textContent='نمایش کامل ↗';full.href='/admin-users/';const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','بستن مدیریت کاربران');const frame=document.createElement('iframe');frame.title='مدیریت کاربران';bar.append(label,full,close);dialog.append(bar,frame);document.body.append(dialog);
let returnFocus=null,identity=null,root=null,heading='',pending=false,sequence=0;
function open(event){returnFocus=event.currentTarget;if(!frame.src||frame.src==='about:blank')frame.src='/admin-users/';dialog.showModal();}
function clear(){document.getElementById('sc-admin-top')?.remove();document.getElementById('sc-admin-nav')?.remove();document.getElementById('sc-admin-card')?.remove();if(dialog.open)dialog.close();frame.contentWindow?.dispatchEvent(new Event('smartclass:users-lock'));if(frame.hasAttribute('src'))frame.src='about:blank';identity=null;}
close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>returnFocus?.isConnected&&returnFocus.focus());
function mount(){
 if(!document.getElementById('sc-admin-top')){const button=document.createElement('button');button.id='sc-admin-top';button.type='button';button.textContent='مدیریت کاربران';button.setAttribute('aria-haspopup','dialog');button.onclick=open;const top=document.querySelector('.top-actions');if(top)top.prepend(button);else{button.className='sc-admin-fixed';document.body.append(button);}}
 const nav=document.querySelector('nav[aria-label="منوی اصلی"]');
 if(nav&&!document.getElementById('sc-admin-nav')){const button=document.createElement('button');button.id='sc-admin-nav';button.className='nav-link';button.type='button';button.setAttribute('aria-haspopup','dialog');const icon=document.createElement('span');icon.className='sc-admin-nav-icon';icon.textContent='✦';const text=document.createElement('span');text.textContent='مدیریت کاربران';const sub=document.createElement('small');sub.textContent='USER MANAGEMENT';text.append(sub);button.append(icon,text);button.onclick=open;nav.append(button);}
 const school=document.querySelector('.school');
 if(school&&!document.getElementById('sc-admin-card')){const card=document.createElement('section');card.id='sc-admin-card';const icon=document.createElement('span');icon.className='sc-admin-card-icon';icon.textContent='✦';const text=document.createElement('div');const h=document.createElement('h2');h.textContent='مدیریت حساب‌های مدرسه';const p=document.createElement('p');p.textContent='فهرست کاربران، جست‌وجو، نقش‌ها و وضعیت حساب‌ها.';text.append(h,p);const button=document.createElement('button');button.type='button';button.textContent='مدیریت کاربران ←';button.setAttribute('aria-haspopup','dialog');button.onclick=open;card.append(icon,text,button);const welcome=school.querySelector('.welcome-row');if(welcome)welcome.after(card);else school.prepend(card);}
}
async function check(){
 const request=++sequence;
 try{const response=await fetch('/api/account/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(7000)});const data=await response.json();if(request!==sequence)return;if(!response.ok||!data.user||data.user.role!=='admin'){clear();return;}if(identity&&identity!==data.user.id)clear();identity=data.user.id;mount();}catch{if(request===sequence)clear();}
}
const observe=()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;const current=document.querySelector('.school'),title=current?.querySelector('h1')?.textContent||'';if(current!==root||title!==heading){root=current;heading=title;void check();}else if(identity)mount();});};
new MutationObserver(observe).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>void check());window.addEventListener('focus',()=>void check());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});void check();observe();
})();
