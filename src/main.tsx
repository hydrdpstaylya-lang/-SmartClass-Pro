import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
import './lab/lab.css'
import {initializeAccount} from './state/account'
const root=createRoot(document.getElementById('root')!);
root.render(<div className="loading">در حال بازکردن فضای یادگیری…</div>);
initializeAccount().finally(()=>root.render(<StrictMode><App/></StrictMode>))
if(import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})})
