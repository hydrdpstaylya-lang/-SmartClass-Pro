import {DatabaseSync,backup} from 'node:sqlite'
import {existsSync,mkdirSync,copyFileSync,unlinkSync,constants} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline/promises'

// Import a consistent SQLite snapshot, including committed WAL data. Never replace
// an existing installation's database or its environment file.
export async function importPrevious(sourceRoot,destinationRoot){
 const source=path.resolve(sourceRoot),destination=path.resolve(destinationRoot)
 if(source===destination)throw Error('Choose the OLD application folder, different from this NEW folder.')
 const sourceDb=path.join(source,'data/smartclass.sqlite'),target=path.join(destination,'data/smartclass.sqlite')
 if(!existsSync(sourceDb))throw Error('No data/smartclass.sqlite found. Select the OLD SmartClass-AI-Studio folder, containing START-WINDOWS.cmd.')
 if(existsSync(target))throw Error('This NEW folder already has a database. Nothing was replaced. Use a fresh extraction before importing.')
 mkdirSync(path.dirname(target),{recursive:true});const temporary=target+'.import-'+Date.now();let db
 try{
  db=new DatabaseSync(sourceDb,{readOnly:true});db.exec('PRAGMA busy_timeout=4000')
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get())throw Error('The selected database is not a SmartClass account database.')
  await backup(db,temporary)
  if(existsSync(target))throw Error('A new database appeared. Import stopped without replacing it.')
  // COPYFILE_EXCL also protects against a concurrently started new server.
  copyFileSync(temporary,target,constants.COPYFILE_EXCL)
  const oldEnv=path.join(source,'.env'),newEnv=path.join(destination,'.env')
  if(existsSync(oldEnv)&&!existsSync(newEnv))copyFileSync(oldEnv,newEnv,constants.COPYFILE_EXCL)
 }finally{db?.close();if(existsSync(temporary))unlinkSync(temporary)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const destination=path.dirname(path.dirname(fileURLToPath(import.meta.url)));let rl
 try{
  let source=process.argv[2]
  if(!source){rl=createInterface({input:process.stdin,output:process.stdout});source=await rl.question('Paste the OLD SmartClass-AI-Studio folder path: ')}
  source=source.trim().replace(/^"|"$/g,'');await importPrevious(source,destination)
  console.log('Accounts and saved work imported successfully. The old installation was not changed. Now run START-WINDOWS.cmd in this NEW folder.')
 }catch(e){console.error(e.message);process.exitCode=1}finally{rl?.close()}
}
