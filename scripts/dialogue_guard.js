// Guard: dialogue bank coherence + engine wiring (dialogue & reply_pick use only bank, adjacent pairs).
const fs=require('fs'),vm=require('vm');
const path=require('path');const R=process.argv[2]?`/workspace/${process.argv[2]}-learn`:path.resolve(__dirname,'..');const app=path.basename(R);let fail=0;const bad=(m)=>{fail++;console.log('FAIL',m);};
const ctx={window:{},console};ctx.window.window=ctx.window;vm.createContext(ctx);
const load=(f)=>vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
load(`${R}/data/dialogues.js`);
const B=ctx.window.RL_DIALOGUES, LV=['A1','A2','B1','B2','C1','C2'];
const ids=new Set(),lineOwner={};
const shared={}; // very short courtesy lines (Спасибо!, Ορίστε., شكرا.) may recur across scenarios
for(const d of B){
  if(!/^[a-z0-9-]+$/.test(d.id))bad('bad id '+d.id); if(ids.has(d.id))bad('dup id '+d.id); ids.add(d.id);
  if(!LV.includes(d.lv))bad('bad lv '+d.id); if(!d.theme)bad('no theme '+d.id);
  if(d.turns.length<4||d.turns.length>8)bad('turn count '+d.id);
  d.turns.forEach((t,i)=>{ if(!t.ru||!t.he)bad(`empty turn ${d.id}#${i}`);
    if(lineOwner[t.ru]&&lineOwner[t.ru]!==d.id){ shared[t.ru]=1; if(t.ru.split(/\s+/).length>4)bad(`content line shared between scenarios ${lineOwner[t.ru]} / ${d.id}: ${t.ru}`);} lineOwner[t.ru]=d.id; });
  for(let i=1;i<d.turns.length;i++) if(d.turns[i].ru===d.turns[i-1].ru)bad('repeat '+d.id);
}
// engine wiring
ctx.window.document={};ctx.window.RLSpeech={};ctx.window.RLProgress={get:()=>({level:'A1'})};
load(`${R}/js/engine.js`);
const E=ctx.window.RLEngine._dlg, byId=Object.fromEntries(B.map(d=>[d.id,d]));
const fake=[{type:'read_choice'},{type:'dialogue',turns:[{speaker:'npc',ru:'Сколько стоит сыр?'},{speaker:'user',ru:'Без сахара, пожалуйста.'}],distractors:['x']},{type:'dialogue',turns:[]}];
let nd=0,nr=0;
for(const lv of LV) for(let u=1;u<=40;u++){
  const lesson={id:`${lv.toLowerCase()}-u${String(u).padStart(2,'0')}-l01`,level:lv,titleHe:['בבית הקפה','בחנות','משפחה','בעבודה','בריאות','נסיעה',''][u%7]};
  const out=E.applyDialogueBank(lesson,fake);
  out.filter(e=>e.type==='dialogue').forEach(e=>{ nd++;
    const d=byId[e._bank]; if(!d)return bad('dialogue not from bank '+lesson.id);
    if(e.turns.length!==d.turns.length||e.turns.some((t,i)=>t.ru!==d.turns[i].ru))bad('turns differ from scenario '+d.id);
    e.turns.forEach((t,i)=>{ if(t.speaker!==(i%2?'user':'npc'))bad('speaker alternation '+d.id);
      (t.distractors||[]).forEach(x=>{ if(d.turns.some(y=>y.ru===x))bad(`distractor is own line ${d.id}: ${x}`); if(shared[x])bad('shared courtesy line used as distractor: '+x);});
      if(t.speaker==='user'&&(t.distractors||[]).length<2)bad('too few distractors '+d.id); });
    if(Math.abs(LV.indexOf(d.lv)-LV.indexOf(lv))>1)bad(`level drift ${lesson.id}→${d.id}`);
  });
  for(let k=0;k<5;k++){ const r=E.dlgReplyPick(lesson); if(!r){bad('reply_pick null '+lesson.id);continue;} nr++;
    const d=byId[r._bank]; if(!d){bad('reply_pick not from bank');continue;}
    if(d.turns[r._pair].ru!==r.ru||d.turns[r._pair+1].ru!==r.answer)bad(`reply_pick not adjacent ${d.id}#${r._pair}`);
    if(!r.options.includes(r.answer)||r.options.length<3)bad('options');
    r.options.filter(o=>o!==r.answer).forEach(o=>{ if(shared[o])bad('shared line as reply_pick distractor '+o); if(d.turns.some(t=>t.ru===o))bad(`reply_pick distractor from same dialogue ${d.id}: ${o}`); });
  }
}
console.log(`${app}: bank=${B.length} dialogues checked=${nd} reply_pick checked=${nr} → ${fail?'FAIL '+fail:'PASS'}`);
process.exit(fail?1:0);
