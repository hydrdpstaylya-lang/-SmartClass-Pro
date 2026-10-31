import {digest,HttpError} from './security.mjs'

// All account and school routes resolve the same cookie on every request.
export function currentUser(db,req){
 const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sc_session='))?.slice(11)||''
 return db.prepare(`SELECT u.id,u.username,u.name,u.role FROM users u JOIN sessions s ON s.user=u.id WHERE s.token=? AND s.expires>? AND u.active=1`).get(digest(token),Date.now())||null
}
export function requireUser(db,req){const user=currentUser(db,req);if(!user)throw new HttpError(401,'ابتدا وارد حساب فعال خودت شو.');return user}
