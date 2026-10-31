import {DatabaseSync} from 'node:sqlite'
import {existsSync,mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {createInterface} from 'node:readline/promises'
import {accounts} from './accounts.mjs'

export function bootstrapAdmin(db,username){
 accounts(db)
 if(db.prepare("SELECT id FROM users WHERE role='admin' AND active=1").get())throw Error('An administrator already exists. Use the administrator panel to grant roles.')
 const user=db.prepare('SELECT id FROM users WHERE username=? AND active=1').get(String(username).trim().toLowerCase())
 if(!user)throw Error('Username not found. Create your account in SmartClass first, then try again.')
 db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id)
 return user.id
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dbPath=path.join(root,'data/smartclass.sqlite')
 let db,rl
 try{
  if(!existsSync(dbPath))throw Error('Start SmartClass and create your account before running this setup.')
  console.log('SmartClass - First administrator setup\nThis runs locally on the site owner computer. No password or API key is required.')
  rl=createInterface({input:process.stdin,output:process.stdout});const username=await rl.question('Your existing SmartClass username: ')
  db=new DatabaseSync(dbPath);db.exec('PRAGMA busy_timeout=4000');mkdirSync(path.join(root,'data/backups'),{recursive:true})
  db.prepare('VACUUM INTO ?').run(path.join(root,`data/backups/before-admin-${Date.now()}.sqlite`))
  bootstrapAdmin(db,username);console.log('Administrator enabled. Sign out and sign in again, then open the School panel. A database backup was saved in data/backups.')
 }catch(e){console.error(e.message);process.exitCode=1}finally{rl?.close();db?.close()}
}
