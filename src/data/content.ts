export function buildCloze(text:string){
 const stop=new Set(['و','با','به','از','در','که','را','برای','یک','این','آن','است','می‌شود','می‌تواند','نیاز','دارند','شدن','شده'])
 return text.split(/[.؟!\n]+/).map(s=>s.trim()).filter(s=>s.length>10).slice(0,6).map(sentence=>{
  const words=sentence.split(/\s+/),candidates=words.map((word,index)=>({word,index})).filter(x=>x.word.length>=2&&!stop.has(x.word))
  const index=candidates[Math.floor(candidates.length/2)]?.index??Math.floor(words.length/2)
  return{front:words.map((word,i)=>i===index?'…':word).join(' '),back:words[index]}
 })
}
