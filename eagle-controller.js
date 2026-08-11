/* RP Eagle Natural Language Max v9.25.2
   Deterministic local NLU, no LLM.
   Pipeline:
   normalize -> dictionary expansion -> dialogue control -> identity/context
   -> action/object/entity/semantic-role parsing -> scored intent router
   -> permission gate -> engine plan -> grounded answer/workflow.
*/
(function(){
  'use strict';
  const VERSION='9.25.2';

  const $one=(s,r=document)=>r.querySelector(s);
  const $all=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rawNorm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").toLowerCase().trim();
  const clean=v=>rawNorm(v).replace(/[^a-z0-9#\-]+/g,' ').replace(/\s+/g,' ').trim();

  const defaultLexicon={
    assessment:['assessment','assessments','evaluation','evaluations','checkoff','check off','skills check','competency check','training check'],
    assignment:['assignment','assignments','assigned work','assigned assessment','training assignment','scheduled assessment'],
    task:['task','tasks','metl task','metl tasks','competency task'],
    subtask:['subtask','subtasks','step','steps','task step'],
    employee:['employee','employees','associate','associates','operator','operators','personnel','worker','workers','team member'],
    evaluator:['evaluator','evaluators','trainer','trainers','assessor','assessors'],
    readiness:['readiness','ready','prepared','preparation','qualified readiness'],
    advancement:['advance','advancement','next level','move up','promotion','promotion readiness','level up'],
    corrective:['corrective action','corrective actions','reassessment','reassessments','retraining action'],
    critical:['critical gate','critical gates','safety gate','critical failure'],
    knowledge:['knowledge','procedure','procedures','sop','sops','work instruction','work instructions','approved procedure','standard work'],
    backup:['backup','back up','restore','recovery','data integrity'],
    cancel:['cancel','stop','never mind','nevermind','forget it','go back','abort'],
    self:['who am i','what is my name','what is my role','what level am i','what shift am i on','my identity'],
    list:['list','show all','what are','which are','available','browse'],
    create:['create','add','new','make','build'],
    assign:['assign','schedule','give','delegate','set up','setup'],
    start:['start','begin','conduct','perform','launch','do'],
    open:['open','show','view','display','go to','take me to','see'],
    edit:['edit','change','update','modify','revise','correct'],
    find:['find','search','locate','look for','who','which']
  };

  function lexicon(){
    const custom=state?.settings?.eagleLexicon||{};
    const merged={};
    for(const [k,v] of Object.entries(defaultLexicon)){
      merged[k]=Array.from(new Set([...(v||[]),...(Array.isArray(custom[k])?custom[k]:[])].map(rawNorm)));
    }
    for(const [k,v] of Object.entries(custom)){
      if(!merged[k]&&Array.isArray(v))merged[k]=Array.from(new Set(v.map(rawNorm)));
    }
    return merged;
  }

  function fuzzyWord(w){
    const fixes={
      assesment:'assessment',assestment:'assessment',assesment:'assessment',
      evalution:'evaluation',evalutaion:'evaluation',
      employe:'employee',employes:'employees',
      qualifed:'qualified',qualifyed:'qualified',
      rediness:'readiness',readyness:'readiness',
      procedue:'procedure',procedur:'procedure',
      assing:'assign',asign:'assign',assingment:'assignment',
      subtsk:'subtask',tas:'task'
    };
    return fixes[w]||w;
  }

  function normalizeText(input){
    let s=clean(input);
    s=s.split(' ').map(fuzzyWord).join(' ');
    return s;
  }

  function containsPhrase(text,phrase){
    const p=clean(phrase);
    return p && (` ${text} `).includes(` ${p} `);
  }
  function hasConcept(text,key){
    return (lexicon()[key]||[]).some(p=>containsPhrase(text,p));
  }

  function activePeople(){return Array.isArray(state?.personnel)?state.personnel.filter(p=>p&&p.name&&p.employeeNumber&&p.status==='Active'):[]}
  function activeTasks(){return Array.isArray(state?.tasks)?state.tasks.filter(t=>t&&t.status==='Active'):[]}
  function activeSubtasks(){return Array.isArray(state?.subtasks)?state.subtasks.filter(s=>s&&s.status==='Active'):[]}
  function currentPerson(){
    const people=activePeople();
    const emp=String(currentUser?.employeeNumber||'').trim();
    if(emp){
      const byNumber=people.find(p=>String(p.employeeNumber||'').trim()===emp);
      if(byNumber)return byNumber;
    }
    const signedName=normalizeText(currentUser?.name||currentUser?.username||'');
    if(signedName){
      const exact=people.find(p=>normalizeText(p.name)===signedName);
      if(exact)return exact;
      const userToken=normalizeText(currentUser?.username||'');
      if(userToken){
        const byUser=people.find(p=>normalizeText(p.name).split(' ').includes(userToken));
        if(byUser)return byUser;
      }
    }
    return null;
  }
  function isAdmin(){return currentUser?.role==='admin'}
  function mayEvaluate(){return typeof canEvaluate==='function'&&canEvaluate()}
  function mayManageMetl(){return typeof canManageMetl==='function'&&canManageMetl()}
  function mayManagePersonnel(){return typeof canManagePersonnel==='function'&&canManagePersonnel()}

  const ctxKey=()=>`rp-eagle-v924-${currentUser?.username||'anonymous'}`;
  function getCtx(){try{return JSON.parse(sessionStorage.getItem(ctxKey()))||{}}catch{return{}}}
  function setCtx(c){try{sessionStorage.setItem(ctxKey(),JSON.stringify(c||{}))}catch{}}
  function resetCtx(){
    const c=getCtx();
    delete c.employeeNumber; delete c.taskId; delete c.subtaskId; delete c.evaluatorUsername; delete c.pendingIntent;
    setCtx(c);
  }

  function scoreName(name,text){
    const n=normalizeText(name);
    if(!n)return 0;
    if(text.includes(n))return 300+n.length;
    let score=0;
    for(const part of n.split(' ').filter(x=>x.length>2)){
      if((` ${text} `).includes(` ${part} `))score+=55;
    }
    return score;
  }
  function peopleHits(text){
    return activePeople().map(p=>({row:p,score:scoreName(p.name,text),pos:text.indexOf(normalizeText(p.name))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  }
  function evaluatorHits(text){
    return (authUsers||[]).filter(u=>u&&!u.disabled&&(u.role==='admin'||u.role==='evaluator'))
      .map(u=>({row:u,score:scoreName(u.name||u.username,text),pos:text.indexOf(normalizeText(u.name||u.username))}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  }
  function taskHits(text){
    const out=[];
    for(const t of activeTasks()){
      const id=normalizeText(t.id),name=normalizeText(t.name);let score=0;
      if((` ${text} `).includes(` ${id} `))score+=320;
      if(name&&text.includes(name))score+=230;
      for(const part of name.split(' ').filter(x=>x.length>5))if(text.includes(part))score+=12;
      if(score)out.push({row:t,score});
    }
    return out.sort((a,b)=>b.score-a.score);
  }
  function subtaskHits(text){
    const out=[];
    for(const s of activeSubtasks()){
      const id=normalizeText(s.id),name=normalizeText(s.name);let score=0;
      if((` ${text} `).includes(` ${id} `))score+=340;
      if(name&&text.includes(name))score+=240;
      if(score)out.push({row:s,score});
    }
    return out.sort((a,b)=>b.score-a.score);
  }

  function semanticRoles(text,people,evaluators,tasks,subtasks){
    const personEntries=people.map(x=>({...x,pos:x.pos>=0?x.pos:text.indexOf(normalizeText(x.row.name))})).sort((a,b)=>a.pos-b.pos);
    const evalEntries=evaluators.map(x=>({...x,pos:x.pos>=0?x.pos:text.indexOf(normalizeText(x.row.name||x.row.username))})).sort((a,b)=>a.pos-b.pos);

    let recipient=null,evaluator=null;
    const forPos=text.indexOf(' for '),toPos=text.indexOf(' to '),byPos=text.indexOf(' by ');
    const afterRel=personEntries.filter(x=>(forPos>=0&&x.pos>forPos)||(toPos>=0&&x.pos>toPos));
    if(afterRel.length)recipient=afterRel[0].row;
    if(!recipient&&hasConcept(text,'assign')&&personEntries.length)recipient=personEntries[0].row;

    const afterBy=evalEntries.filter(x=>byPos>=0&&x.pos>byPos);
    if(afterBy.length)evaluator=afterBy[0].row;

    if(!evaluator&&/\b(evaluate|evaluates|assess|assesses)\b/.test(text)&&evalEntries.length){
      const vp=Math.max(text.indexOf(' evaluate '),text.indexOf(' assess '));
      const before=evalEntries.filter(x=>vp>=0&&x.pos<vp);
      if(before.length)evaluator=before[before.length-1].row;
    }
    if(hasConcept(text,'assign')&&personEntries.length&&evalEntries.length){
      if(!recipient)recipient=personEntries[0].row;
      const later=evalEntries.find(x=>x.pos>personEntries[0].pos&&normalizeText(x.row.name||x.row.username)!==normalizeText(recipient.name));
      if(later&&!evaluator)evaluator=later.row;
    }

    let subtask=subtasks[0]?.row||null;
    let task=tasks[0]?.row||null;
    if(subtask&&!task)task=activeTasks().find(t=>String(t.id)===String(subtask.taskId))||null;

    const relationship=!!recipient && (
      hasConcept(text,'assign') ||
      (hasConcept(text,'create')&&(forPos>=0||toPos>=0)) ||
      (hasConcept(text,'assessment')&&(forPos>=0||toPos>=0))
    );
    return{actor:currentUser||null,recipient,evaluator,task,subtask,assignmentRelationship:relationship};
  }

  function parseDate(text){
    const m=text.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if(m)return`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    const d=new Date();
    if(text.includes('today'))return d.toISOString().slice(0,10);
    if(text.includes('tomorrow')){d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
    return'';
  }

  function parse(input){
    const text=normalizeText(input);
    const people=peopleHits(text),evaluators=evaluatorHits(text),tasks=taskHits(text),subtasks=subtaskHits(text);
    const roles=semanticRoles(text,people,evaluators,tasks,subtasks);

    return{
      raw:String(input||''),text,roles,
      person:roles.recipient||people[0]?.row||null,
      evaluator:roles.evaluator||null,
      task:roles.task||null,
      subtask:roles.subtask||null,
      self:hasConcept(text,'self')||/\b(my|mine|me|myself)\b/.test(text),
      cancel:hasConcept(text,'cancel'),
      list:hasConcept(text,'list'),
      create:hasConcept(text,'create'),
      assign:hasConcept(text,'assign'),
      start:hasConcept(text,'start'),
      open:hasConcept(text,'open'),
      edit:hasConcept(text,'edit'),
      find:hasConcept(text,'find'),
      assignment:hasConcept(text,'assignment'),
      assessment:hasConcept(text,'assessment'),
      taskConcept:hasConcept(text,'task'),
      subtaskConcept:hasConcept(text,'subtask'),
      employeeConcept:hasConcept(text,'employee'),
      evaluatorConcept:hasConcept(text,'evaluator'),
      readiness:hasConcept(text,'readiness'),
      advancement:hasConcept(text,'advancement'),
      corrective:hasConcept(text,'corrective'),
      critical:hasConcept(text,'critical'),
      knowledge:hasConcept(text,'knowledge'),
      backup:hasConcept(text,'backup'),
      dueDate:parseDate(text),
      shift:(text.match(/\b([abcd]) shift\b/)||[])[1]?.toUpperCase()||'',
      overdue:/\b(overdue|late|past due)\b/.test(text),
      history:/\b(history|past|previous|completed)\b/.test(text),
      globalWhoReady:/\bwho (is|are) ready\b/.test(text)||/\bwho can move\b/.test(text)||/\bready for next level\b/.test(text),
      knowledgeBrowse:(hasConcept(text,'knowledge')&&hasConcept(text,'list'))||/\bapproved procedures\b/.test(text)||/\bavailable procedures\b/.test(text),
      identity:/\bwho am i\b/.test(text)||/\bwhat is my (name|role)\b/.test(text)||/\bwhat level am i\b/.test(text)||/\bwhat shift am i\b/.test(text)
    };
  }

  const INTENTS=[
    {id:'dialog.cancel',family:'dialog',score:p=>p.cancel?1000:0},
    {id:'identity.self',family:'identity',score:p=>p.identity?950:0},
    {id:'knowledge.list',family:'knowledge',score:p=>p.knowledgeBrowse?900:0},
    {id:'readiness.readyCandidates',family:'readiness',score:p=>p.globalWhoReady?880:0},
    {id:'module.assessments',family:'system',score:p=>p.assessment&&!p.assign&&!p.create&&!p.start&&!p.history&&!p.self&&!p.overdue?860:0},
    {id:'module.assignments',family:'system',score:p=>p.assignment&&!p.assign&&!p.create&&!p.self&&!p.overdue?850:0},
    {id:'module.personnel',family:'system',score:p=>p.employeeConcept&&!p.create&&!p.edit&&/^((personnel|employee|employees|associate|associates|operators?|workers?|team member)(s)?)$/.test(p.text)?840:0},
    {id:'module.metl',family:'system',score:p=>/^((metl|metl tasks?|tasks?|subtasks?|metl and subtasks?|metl subtasks?))$/.test(p.text)?835:0},
    {id:'module.corrective',family:'system',score:p=>/^((corrective action|corrective actions|reassessment|reassessments))$/.test(p.text)?830:0},
    {id:'module.matrix',family:'system',score:p=>/^((readiness matrix|matrix))$/.test(p.text)?825:0},
    {id:'module.notifications',family:'system',score:p=>/^((notification|notifications|alerts?))$/.test(p.text)?820:0},
    {id:'module.audit',family:'system',score:p=>/^((audit|audit trail))$/.test(p.text)?815:0},
    {id:'module.backup',family:'system',score:p=>/^((backup|back up|backup and restore|restore))$/.test(p.text)?810:0},

    {id:'assignment.create',family:'assignment',score:p=>{
      let s=0;
      if(p.assign)s+=320;
      if(p.assignment)s+=240;
      if(p.assessment&&(p.assign||p.create))s+=320;
      if(p.roles.assignmentRelationship)s+=420;
      if((p.taskConcept||p.task||p.subtaskConcept||p.subtask)&&p.roles.recipient)s+=200;
      if(p.assessment&&p.person)s+=260;
      if(p.assignment&&p.person)s+=200;
      if(p.person)s+=80;
      if(p.evaluator)s+=40;
      if(p.task||p.subtask)s+=70;

      // Crucial: "Add/Create assessment to/for Luis" is an assignment, not a person lookup.
      if((p.create||p.assign)&&p.assessment&&p.person)s+=450;

      // Pure METL authoring remains METL only when no recipient exists.
      if(p.create&&p.taskConcept&&!p.roles.recipient&&!p.assign&&!p.assessment)s-=420;
      if(p.create&&p.subtaskConcept&&!p.roles.recipient&&!p.assign&&!p.assessment)s-=440;
      return s;
    }},
    {id:'metl.subtask.create',family:'metl',score:p=>p.create&&p.subtaskConcept&&!p.roles.recipient?520:0},
    {id:'metl.task.create',family:'metl',score:p=>p.create&&p.taskConcept&&!p.roles.recipient?500:0},
    {id:'metl.subtask.edit',family:'metl',score:p=>p.edit&&p.subtaskConcept?480:0},
    {id:'metl.task.edit',family:'metl',score:p=>p.edit&&p.taskConcept?460:0},
    {id:'metl.subtask.open',family:'metl',score:p=>p.open&&p.subtaskConcept?430:0},
    {id:'metl.task.open',family:'metl',score:p=>p.open&&p.taskConcept?420:0},

    {id:'assessment.start',family:'assessment',score:p=>p.start&&p.assessment?500:0},
    {id:'assessment.history',family:'assessment',score:p=>p.assessment&&p.history?420:0},
    {id:'assignment.evaluator',family:'assignment',score:p=>/\b(need to evaluate|assigned to me|waiting for me|my evaluations)\b/.test(p.text)?470:0},
    {id:'assignment.overdue',family:'assignment',score:p=>(p.assignment||p.assessment)&&p.overdue?430:0},
    {id:'assignment.mine',family:'assignment',score:p=>((p.assignment||p.assessment)&&p.self?520:0)+(/\b(my assignments|my assigned work|what is assigned to me|what do i have assigned|my training)\b/.test(p.text)?260:0)},
    {id:'assignment.list',family:'assignment',score:p=>p.assignment?300:0},

    {id:'development.advancement',family:'advancement',score:p=>p.advancement?500:0},
    {id:'readiness.group',family:'readiness',score:p=>p.readiness&&(p.shift||/\b(plant|overall|all shifts|department)\b/.test(p.text))?440:0},
    {id:'readiness.person',family:'readiness',score:p=>p.readiness?330:0},
    {id:'corrective.list',family:'corrective',score:p=>p.corrective?440:0},
    {id:'critical.list',family:'corrective',score:p=>p.critical?450:0},
    {id:'evaluator.authority',family:'qualification',score:p=>p.evaluatorConcept&&/\b(who|which|authorized|can)\b/.test(p.text)?460:0},
    {id:'qualification.people',family:'qualification',score:p=>/\b(who can|who is qualified|qualified for|independently)\b/.test(p.text)?420:0},

    {id:'knowledge.answer',family:'knowledge',score:p=>p.knowledge?330:0},
    {id:'metl.subtask.info',family:'metl',score:p=>p.subtaskConcept?260:0},
    {id:'metl.task.info',family:'metl',score:p=>p.taskConcept?240:0},
    {id:'person.create',family:'personnel',score:p=>p.create&&p.employeeConcept?430:0},
    {id:'person.edit',family:'personnel',score:p=>p.edit&&p.employeeConcept?420:0},
    {id:'person.summary',family:'personnel',score:p=>p.person&&!p.assessment&&!p.assignment&&!p.create&&!p.assign?200:0},

    {id:'system.backup',family:'system',score:p=>p.backup?400:0},
    {id:'system.notifications',family:'system',score:p=>/\b(notification|notifications|alerts)\b/.test(p.text)?340:0},
    {id:'system.audit',family:'system',score:p=>/\b(audit|audit trail)\b/.test(p.text)?340:0},
    {id:'admin.departments',family:'admin',score:p=>/\b(department|departments)\b/.test(p.text)?320:0},
    {id:'admin.users',family:'admin',score:p=>/\b(user|users|account|accounts|permissions|roles)\b/.test(p.text)?320:0},
    {id:'system.profile',family:'system',score:p=>/\b(profile|my profile)\b/.test(p.text)?310:0},
    {id:'system.dashboard',family:'system',score:p=>/\b(dashboard|home)\b/.test(p.text)?300:0},
    {id:'system.matrix',family:'system',score:p=>/\b(matrix|readiness matrix)\b/.test(p.text)?310:0},
    {id:'system.enterprise',family:'system',score:p=>/\b(engine|engines|diagnostic|enterprise)\b/.test(p.text)?300:0},
    {id:'system.personnel',family:'system',score:p=>p.employeeConcept?180:0}
  ];

  function classify(p){
    const ranked=INTENTS.map(x=>({id:x.id,family:x.family,score:Number(x.score(p)||0)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    return ranked[0]?{...ranked[0],ranked}:{id:'general.search',family:'search',score:0,ranked:[]};
  }

  function applyContext(p,intent){
    const c=getCtx();

    // Explicit self/identity questions NEVER inherit an old employee subject.
    if(intent.id==='identity.self'||p.identity){
      return p;
    }

    // Global questions NEVER inherit an old person subject.
    if(intent.id==='readiness.readyCandidates'||p.globalWhoReady||intent.id==='knowledge.list'){
      return p;
    }

    // "my assignments / my assessments" always means the signed-in associate,
    // never the employee from a previous Eagle question.
    if(intent.id==='assignment.mine'){
      p.person=currentPerson();
      return p;
    }

    // Follow-up context only if current utterance doesn't provide an entity.
    if(!p.person&&c.employeeNumber){
      p.person=activePeople().find(x=>String(x.employeeNumber)===String(c.employeeNumber))||null;
    }
    if(!p.task&&c.taskId)p.task=activeTasks().find(x=>String(x.id)===String(c.taskId))||null;
    if(!p.subtask&&c.subtaskId)p.subtask=activeSubtasks().find(x=>String(x.id)===String(c.subtaskId))||null;
    if(!p.evaluator&&c.evaluatorUsername)p.evaluator=(authUsers||[]).find(x=>String(x.username)===String(c.evaluatorUsername))||null;

    if(p.self&&['development.advancement','readiness.person','assessment.history'].includes(intent.id)){
      p.person=currentPerson();
    }

    if(p.person)c.employeeNumber=p.person.employeeNumber;
    if(p.task)c.taskId=p.task.id;
    if(p.subtask)c.subtaskId=p.subtask.id;
    if(p.evaluator)c.evaluatorUsername=p.evaluator.username;
    c.lastIntent=intent.id;
    setCtx(c);
    return p;
  }

  function identityAnswer(){
    const person=currentPerson();
    const userName=currentUser?.name||currentUser?.username||'Current user';
    let html=`<h3>${esc(userName)}</h3><p><b>Signed-in role:</b> ${esc(currentUser?.role==='admin'?'Administrator':currentUser?.role==='evaluator'?'Approved Evaluator':'Read only')}</p>`;
    if(person){
      html+=`<p><b>Employee #:</b> ${esc(person.employeeNumber)} · <b>Shift:</b> ${esc(person.shift||'—')} · <b>Assigned level:</b> ${esc(person.assignedLevel||'—')} · <b>Department:</b> ${esc(typeof departmentName==='function'?departmentName(person.departmentId):'Extrusion')}</p>`;
    }else{
      html+=`<p>This login is not linked to an employee competency record, so I will not assume you are another associate.</p>`;
    }
    html+=`<p>I will use this identity and your permissions when answering questions or opening workflows.</p>`;
    return html;
  }

  function approvedProceduresAnswer(){
    const rows=(state.knowledge||[]).filter(a=>a&&a.status==='Approved');
    if(!rows.length)return `<h3>Approved Procedures</h3><p>There are currently no approved Knowledge Center procedures available.</p><button class="secondary eagle-btn" data-action="nav" data-view="knowledge">Open Knowledge Center</button>`;
    const byCat={};
    for(const a of rows){const k=a.category||'Procedure';(byCat[k]||(byCat[k]=[])).push(a)}
    return `<h3>Approved Procedures</h3><p>I found <b>${rows.length}</b> approved knowledge article${rows.length===1?'':'s'}.</p>
      ${Object.entries(byCat).slice(0,6).map(([cat,items])=>`<div class="eagle-result-card"><b>${esc(cat)}</b><small>${items.length} approved</small>${items.slice(0,4).map(a=>`<button class="list-link eagle-btn" data-action="knowledge" data-id="${esc(a.id)}">${esc(a.title)}</button>`).join('')}</div>`).join('')}
      <button class="secondary eagle-btn" data-action="nav" data-view="knowledge">View all approved procedures</button>`;
  }

  function readyCandidatesAnswer(){
    const candidates=[];
    const levels=['-10','-20','-30','-40'];
    for(const p of activePeople()){
      const idx=levels.indexOf(p.assignedLevel||'-10');
      if(idx<0||idx===levels.length-1)continue;
      const next=levels[idx+1];
      const latest=latestResults(p.employeeNumber);
      const req=activeSubtasks().filter(s=>levelRank[s.requiredLevel]<=levelRank[next]);
      const gaps=req.filter(s=>latest.get(`${p.employeeNumber}|${s.id}`)?.result!=='GO');
      const criticalGaps=gaps.filter(s=>s.criticality==='Critical Gate');
      const pct=req.length?Math.round(((req.length-gaps.length)/req.length)*100):0;
      candidates.push({p,next,pct,gaps:gaps.length,critical:criticalGaps.length});
    }
    candidates.sort((a,b)=>a.gaps-b.gaps||b.pct-a.pct);
    const ready=candidates.filter(x=>x.gaps===0&&x.critical===0);
    const close=candidates.filter(x=>x.gaps>0).slice(0,5);
    return `<h3>Next-Level Readiness</h3>
      <p><b>${ready.length}</b> associate${ready.length===1?' is':'s are'} currently showing all required GO records for the next assigned level.</p>
      ${ready.slice(0,8).map(x=>`<button class="list-link eagle-btn" data-action="person" data-emp="${esc(x.p.employeeNumber)}"><span><b>${esc(x.p.name)} → ${esc(x.next)}</b><small>${x.pct}% · ${x.gaps} gaps</small></span></button>`).join('')||'<p>No associate is fully ready for the next level based on current records.</p>'}
      ${close.length?`<h4>Closest to ready</h4>${close.map(x=>`<button class="list-link eagle-btn" data-action="person" data-emp="${esc(x.p.employeeNumber)}"><span><b>${esc(x.p.name)} → ${esc(x.next)}</b><small>${x.pct}% · ${x.gaps} gaps · ${x.critical} Critical Gates</small></span></button>`).join('')}`:''}`;
  }

  function advancementAnswer(person){
    if(!person)return `<p>I need an associate name or employee number for that question. I will not reuse a previous employee unless your current message clearly refers to them.</p>`;
    const levels=['-10','-20','-30','-40'],idx=levels.indexOf(person.assignedLevel||'-10');
    const next=idx>=0&&idx<levels.length-1?levels[idx+1]:null;
    if(!next)return `<h3>${esc(person.name)}</h3><p>${esc(person.name)} is already assigned to the highest level (${esc(person.assignedLevel)}).</p>`;
    const latest=latestResults(person.employeeNumber);
    const req=activeSubtasks().filter(s=>levelRank[s.requiredLevel]<=levelRank[next]);
    const gaps=req.filter(s=>latest.get(`${person.employeeNumber}|${s.id}`)?.result!=='GO');
    const critical=gaps.filter(s=>s.criticality==='Critical Gate');
    const priorities=[...critical,...gaps.filter(s=>s.criticality!=='Critical Gate')].slice(0,5);
    const pct=req.length?Math.round(((req.length-gaps.length)/req.length)*100):0;
    return `<h3>${esc(person.name)} → ${esc(next)}</h3>
      <p><b>Readiness:</b> ${pct}% · <b>${gaps.length}</b> remaining requirements · <b>${critical.length}</b> Critical Gate gaps.</p>
      ${priorities.length?`<h4>Next priorities</h4><div class="eagle-mini-list">${priorities.map(s=>`<div><b>${esc(s.id)}${s.criticality==='Critical Gate'?' · Critical Gate':''}</b><span>${esc(s.name)}</span></div>`).join('')}</div>`:'<p>No missing GO requirements are visible for the next level.</p>'}
      ${gaps.length>priorities.length?`<p>${gaps.length-priorities.length} additional requirements remain. Open the employee profile for the full record.</p>`:''}
      <button class="secondary eagle-btn" data-action="person" data-emp="${esc(person.employeeNumber)}">Open employee profile</button>`;
  }

  function assignmentStatus(a){
    if(typeof window.assignmentStatus==='function')return window.assignmentStatus(a);
    if(a.status==='Completed'||a.status==='Cancelled')return a.status;
    if(a.dueDate&&a.dueDate<new Date().toISOString().slice(0,10))return'Overdue';
    return a.status||'Assigned';
  }
  function visibleAssignments(){
    const all=(state.assessmentAssignments||[]).filter(Boolean);
    if(currentUser?.role==='viewer'){
      const me=currentPerson();
      if(!me)return[];
      return all.filter(a=>String(a.employeeNumber||'')===String(me.employeeNumber||''));
    }
    if(currentUser?.role==='evaluator'){
      return all.filter(a=>String(a.evaluatorUsername||'').toLowerCase()===String(currentUser.username||'').toLowerCase());
    }
    return all;
  }

  function assignmentsAnswer(p,intent){
    let rows=visibleAssignments();
    if(intent.id==='assignment.overdue')rows=rows.filter(a=>assignmentStatus(a)==='Overdue');
    if(p.person)rows=rows.filter(a=>String(a.employeeNumber)===String(p.person.employeeNumber));
    if(p.task)rows=rows.filter(a=>String(a.taskId)===String(p.task.id));
    return `<h3>${rows.length} assigned assessment${rows.length===1?'':'s'}</h3>
      ${rows.slice(0,10).map(a=>{
        const emp=activePeople().find(x=>String(x.employeeNumber)===String(a.employeeNumber));
        const task=activeTasks().find(x=>String(x.id)===String(a.taskId));
        return `<div class="eagle-result-card"><b>${esc(emp?.name||a.employeeName||a.employeeNumber)} — ${esc(task?.id||a.taskId)}</b><small>${esc(task?.name||a.taskName||'')} · ${esc(a.evaluatorName||'No evaluator')} · ${esc(assignmentStatus(a))}</small></div>`;
      }).join('')||'<p>No matching assigned assessments.</p>'}
      <button class="secondary eagle-btn" data-action="nav" data-view="assignments">Open Assigned Assessments</button>`;
  }

  function render(p,intent){
    switch(intent.id){
      case'dialog.cancel':
        resetCtx();
        return `<h3>Cancelled.</h3><p>I cleared the current Eagle conversation subject/workflow context. No RP record was changed.</p>`;
      case'identity.self': return identityAnswer();
      case'knowledge.list': return approvedProceduresAnswer();
      case'readiness.readyCandidates': return readyCandidatesAnswer();

      case'assignment.create':
        if(!isAdmin())return `<p>You do not have permission to create assessment assignments.</p>`;
        return `<h3>Assign Assessment</h3><p>${p.person?`Associate: <b>${esc(p.person.name)}</b> · `:''}${p.task?`Task: <b>${esc(p.task.id)} — ${esc(p.task.name)}</b> · `:''}${p.evaluator?`Evaluator: <b>${esc(p.evaluator.name||p.evaluator.username)}</b> · `:''}${p.dueDate?`Due: <b>${esc(p.dueDate)}</b>`:''}</p><button class="primary eagle-btn" data-action="assignment-create">Open assignment form</button>`;

      case'assignment.evaluator': case'assignment.overdue': case'assignment.mine': case'assignment.list':
        return assignmentsAnswer(p,intent);

      case'assessment.start':
        return mayEvaluate()?`<h3>Start Assessment</h3><p>${p.person?`Associate: <b>${esc(p.person.name)}</b> · `:''}${p.task?`Task: <b>${esc(p.task.id)} — ${esc(p.task.name)}</b>`:''}</p><button class="primary eagle-btn" data-action="assessment-start">Open Assessment Session</button>`:`<p>Your account cannot conduct assessments.</p>`;

      case'assessment.history':{
        const person=p.person||(p.self?currentPerson():null);
        if(!person)return `<p>Tell me which associate's assessment history you want to see.</p>`;
        const rows=(state.sessions||[]).filter(s=>String(s.employeeNumber)===String(person.employeeNumber)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
        return `<h3>${esc(person.name)} — Assessment History</h3>${rows.slice(0,10).map(s=>`<div class="eagle-result-card"><b>${esc(s.taskId)} · ${esc(s.date||'')}</b><small>${esc(s.finalStatus||s.status||'')} · ${esc(s.evaluatorName||'')}</small></div>`).join('')||'<p>No assessment sessions are recorded.</p>'}`;
      }

      case'development.advancement':
        return advancementAnswer(p.person||(p.self?currentPerson():null));

      case'readiness.person':{
        const person=p.person||(p.self?currentPerson():null);
        if(!person)return `<p>Tell me which associate you want to review.</p>`;
        const m=RulesEngine.qualificationSummary(state,person);
        return `<h3>${esc(person.name)}</h3><p><b>Readiness:</b> ${m.pct}% · <b>Assigned level:</b> ${esc(person.assignedLevel)} · <b>Highest fully qualified:</b> ${esc(m.highestFullyQualified)}</p><button class="secondary eagle-btn" data-action="person" data-emp="${esc(person.employeeNumber)}">Open employee profile</button>`;
      }

      case'readiness.group':{
        const shifts=p.shift?[p.shift]:['A','B','C','D'];
        return `<h3>Readiness by Shift</h3>${shifts.map(sh=>{
          const ps=activePeople().filter(x=>x.shift===sh);
          const pct=ps.length?Math.round(ps.reduce((n,x)=>n+RulesEngine.qualificationSummary(state,x).pct,0)/ps.length):0;
          return `<div class="eagle-result-card"><b>${sh} Shift — ${pct}%</b><small>${ps.length} active associates</small></div>`;
        }).join('')}`;
      }

      case'corrective.list':{
        let rows=typeof correctiveActionRepository==='function'?correctiveActionRepository():[...(state.actions||[])];
        rows=rows.filter(a=>a.status!=='Closed');
        if(p.person)rows=rows.filter(a=>String(a.employeeNumber)===String(p.person.employeeNumber));
        if(p.overdue)rows=rows.filter(a=>String(a.targetDate||a.reassessmentDate||'')<new Date().toISOString().slice(0,10));
        return `<h3>${rows.length} open corrective/reassessment record${rows.length===1?'':'s'}</h3><button class="secondary eagle-btn" data-action="nav" data-view="actions">Open Corrective Actions</button>`;
      }

      case'critical.list':{
        let rows=(state.results||[]).filter(r=>r.criticality==='Critical Gate'&&r.result!=='GO'&&r.result!=='NOT EVALUATED');
        if(p.person)rows=rows.filter(r=>String(r.employeeNumber)===String(p.person.employeeNumber));
        return `<h3>${rows.length} Critical Gate issue${rows.length===1?'':'s'}</h3><button class="secondary eagle-btn" data-action="nav" data-view="actions">Open Corrective Actions</button>`;
      }

      case'evaluator.authority':{
        if(!p.task)return `<p>Tell me which METL task you need an evaluator for.</p>`;
        const rows=typeof authorizedEvaluatorUsers==='function'?authorizedEvaluatorUsers(p.task.id):(authUsers||[]).filter(u=>u.role==='admin'||u.role==='evaluator');
        return `<h3>Authorized evaluators for ${esc(p.task.id)}</h3>${rows.map(u=>`<div class="eagle-result-card"><b>${esc(u.name||u.username)}</b><small>${esc(u.role)}</small></div>`).join('')||'<p>No authorized evaluator is configured.</p>'}`;
      }

      case'knowledge.answer':{
        const k=KnowledgeEngine.answer(state,p.raw);
        return k.found?`<h3>${esc(k.article.title)}</h3><p>${esc(k.text)}</p><button class="secondary eagle-btn" data-action="knowledge" data-id="${esc(k.article.id)}">Open approved article</button>`:`<p>${esc(k.text)}</p><button class="secondary eagle-btn" data-action="nav" data-view="knowledge">Search Knowledge Center</button>`;
      }

      case'metl.task.create': return mayManageMetl()?`<p>I will open the METL editor for a new task.</p><button class="primary eagle-btn" data-action="task-create">Create METL task</button>`:`<p>You do not have permission to create METL tasks.</p>`;
      case'metl.subtask.create': return mayManageMetl()?`<p>I will open the subtask editor${p.task?` under <b>${esc(p.task.id)}</b>`:''}.</p><button class="primary eagle-btn" data-action="subtask-create">Create subtask</button>`:`<p>You do not have permission to create subtasks.</p>`;
      case'metl.task.edit': return mayManageMetl()?`<button class="primary eagle-btn" data-action="task-edit">Edit METL task</button>`:`<p>You do not have permission to edit METL tasks.</p>`;
      case'metl.subtask.edit': return mayManageMetl()?`<button class="primary eagle-btn" data-action="subtask-edit">Edit subtask</button>`:`<p>You do not have permission to edit subtasks.</p>`;
      case'metl.task.open': case'metl.task.info':
        return p.task?`<h3>${esc(p.task.id)} — ${esc(p.task.name)}</h3><button class="secondary eagle-btn" data-action="task-detail" data-id="${esc(p.task.id)}">Open task</button>`:`<button class="secondary eagle-btn" data-action="nav" data-view="tasks">Open METL Library</button>`;
      case'metl.subtask.open': case'metl.subtask.info':
        return p.subtask?`<h3>${esc(p.subtask.id)} — ${esc(p.subtask.name)}</h3><p>${esc(p.subtask.standard||'')}</p><button class="secondary eagle-btn" data-action="nav" data-view="tasks">Open Subtask Library</button>`:`<button class="secondary eagle-btn" data-action="nav" data-view="tasks">Open Subtask Library</button>`;

      case'person.create': return mayManagePersonnel()?`<button class="primary eagle-btn" data-action="person-create">Add personnel</button>`:`<p>You do not have permission to add personnel.</p>`;
      case'person.edit': return mayManagePersonnel()?`<button class="primary eagle-btn" data-action="person-edit">Edit personnel</button>`:`<p>You do not have permission to edit personnel.</p>`;
      case'person.summary':
        if(!p.person)return `<p>Tell me an employee name or number.</p>`;
        return `<h3>${esc(p.person.name)}</h3><p>Employee #${esc(p.person.employeeNumber)} · ${esc(p.person.shift)} Shift · ${esc(p.person.assignedLevel)}</p><button class="secondary eagle-btn" data-action="person" data-emp="${esc(p.person.employeeNumber)}">Open employee profile</button>`;

      case'module.assessments':
        return `<h3>Assessments</h3><p>Open assessment sessions, history, and evaluation workflows.</p><button class="primary eagle-btn" data-action="nav" data-view="assessments">Open Assessments</button>`;
      case'module.assignments':
        return `<h3>Assigned Assessments</h3><p>Review planned training and assessment work.</p><button class="primary eagle-btn" data-action="nav" data-view="assignments">Open Assigned Assessments</button>`;
      case'module.personnel':
        return `<h3>Personnel</h3><p>Open the Personnel Master and associate records.</p><button class="primary eagle-btn" data-action="nav" data-view="personnel">Open Personnel</button>`;
      case'module.metl':
        return `<h3>METL & Subtasks</h3><p>Open the competency task and subtask library.</p><button class="primary eagle-btn" data-action="nav" data-view="tasks">Open METL & Subtasks</button>`;
      case'module.corrective':
        return `<h3>Corrective Actions</h3><p>Open corrective actions, retraining, and reassessments.</p><button class="primary eagle-btn" data-action="nav" data-view="actions">Open Corrective Actions</button>`;
      case'module.matrix':
        return `<h3>Readiness Matrix</h3><p>Open readiness and qualification coverage.</p><button class="primary eagle-btn" data-action="nav" data-view="matrix">Open Readiness Matrix</button>`;
      case'module.notifications':
        return `<h3>Notifications</h3><p>Open current RP notifications and alerts.</p><button class="primary eagle-btn" data-action="nav" data-view="notifications">Open Notifications</button>`;
      case'module.audit':
        return (isAdmin()||currentUser?.role==='evaluator')?`<h3>Audit Trail</h3><p>Open the traceable activity history.</p><button class="primary eagle-btn" data-action="nav" data-view="audit">Open Audit Trail</button>`:`<p>You are not authorized to view the Audit Trail.</p>`;
      case'module.backup':
        return isAdmin()?`<h3>Backup & Restore</h3><p>Open protected backup, restore, and integrity tools.</p><button class="primary eagle-btn" data-action="nav" data-view="backup">Open Backup & Restore</button>`:`<p>Backup & Restore is restricted to administrators.</p>`;

      case'system.backup': return isAdmin()?`<button class="primary eagle-btn" data-action="nav" data-view="backup">Open Backup & Restore</button>`:`<p>Backup & Restore is restricted to administrators.</p>`;
      case'system.notifications': return `<button class="primary eagle-btn" data-action="nav" data-view="notifications">Open Notifications</button>`;
      case'system.audit': return (isAdmin()||currentUser?.role==='evaluator')?`<button class="primary eagle-btn" data-action="nav" data-view="audit">Open Audit Trail</button>`:`<p>You are not authorized to view the Audit Trail.</p>`;
      case'admin.departments': return isAdmin()?`<button class="primary eagle-btn" data-action="nav" data-view="settings">Open Administration</button>`:`<p>Department management is restricted to administrators.</p>`;
      case'admin.users': return isAdmin()?`<button class="primary eagle-btn" data-action="nav" data-view="settings">Open Administration</button>`:`<p>User management is restricted to administrators.</p>`;
      case'system.profile': return `<button class="primary eagle-btn" data-action="nav" data-view="profile">Open My Profile</button>`;
      case'system.dashboard': return `<button class="primary eagle-btn" data-action="nav" data-view="dashboard">Open Dashboard</button>`;
      case'system.matrix': return `<button class="primary eagle-btn" data-action="nav" data-view="matrix">Open Readiness Matrix</button>`;
      case'system.enterprise': return isAdmin()?`<button class="primary eagle-btn" data-action="nav" data-view="enterprise">Open Enterprise Tools</button>`:`<p>Enterprise tools are restricted to administrators.</p>`;
      case'system.personnel': return `<button class="primary eagle-btn" data-action="nav" data-view="personnel">Open Personnel</button>`;

      default:{
        const hits=SearchEngine.searchAll(state,p.raw);
        if(hits.length)return `<h3>${hits.length} matching record${hits.length===1?'':'s'}</h3>${hits.slice(0,8).map(x=>`<div class="eagle-result-card"><b>${esc(x.title)}</b><small>${esc(x.meta||x.type)}</small></div>`).join('')}<p>Tell me what you want to do with one of these records.</p>`;
        return `<p>I do not have a confident RP meaning for that request yet. Try an employee, task, assessment, procedure, readiness, corrective action, or system area.</p>`;
      }
    }
  }

  function prefillAssignment(p){
    if(!isAdmin())return toast('Only an administrator can create assessment assignments');
    createAssessmentAssignment();
    setTimeout(()=>{
      if(p.person){const q=$one('#assignPersonSearch');if(q){q.value=p.person.name;q.dispatchEvent(new Event('input',{bubbles:true}))}const s=$one('#assignPerson');if(s)s.value=String(p.person.employeeNumber)}
      if(p.task){const t=$one('#assignTask');if(t){t.value=String(p.task.id);t.dispatchEvent(new Event('change',{bubbles:true}))}}
      if(p.evaluator){const e=$one('#assignEvaluator');if(e)e.value=String(p.evaluator.username)}
      if(p.dueDate){const d=$one('#assignDueDate');if(d)d.value=p.dueDate}
    },100);
  }

  function prefillAssessment(p){
    if(!mayEvaluate())return toast('You are not authorized to conduct assessments');
    assess();
    setTimeout(()=>{
      if(p.person){const q=$one('#aPersonSearch');if(q){q.value=p.person.name;q.dispatchEvent(new Event('input',{bubbles:true}))}const s=$one('#aPerson');if(s){s.value=String(p.person.employeeNumber);s.dispatchEvent(new Event('change',{bubbles:true}))}}
      if(p.task){const t=$one('#aTask');if(t){t.value=String(p.task.id);t.dispatchEvent(new Event('change',{bubbles:true}))}}
    },100);
  }

  function bind(root=document,p=null){
    $all('.eagle-btn',root).forEach(btn=>btn.onclick=()=>{
      const a=btn.dataset.action;
      try{window.closeEaglePanel?.()}catch{}
      setTimeout(()=>{
        switch(a){
          case'nav':navigate(btn.dataset.view);break;
          case'person':personDetail(btn.dataset.emp);break;
          case'knowledge':knowledgeArticleDetail(btn.dataset.id);break;
          case'assignment-create':prefillAssignment(p||window.__eagleParsed||{});break;
          case'assessment-start':prefillAssessment(p||window.__eagleParsed||{});break;
          case'task-create':taskEdit();break;
          case'task-edit':taskEdit((p||window.__eagleParsed||{}).task?.id);break;
          case'task-detail':taskDetail(btn.dataset.id);break;
          case'subtask-create':subtaskEdit((p||window.__eagleParsed||{}).task?.id||'');break;
          case'subtask-edit':{const x=p||window.__eagleParsed||{};subtaskEdit(x.subtask?.taskId||x.task?.id||'',x.subtask?.id||'');break}
          case'person-create':personEdit();break;
          case'person-edit':personEdit((p||window.__eagleParsed||{}).person?.positionId);break;
        }
      },35);
    });
  }

  const ENGINE_PLAN={
    dialog:['Natural Language Engine','Workflow Engine'],
    identity:['Natural Language Engine','Permission Assurance Engine'],
    assignment:['Natural Language Engine','Workflow Engine','Permission Assurance Engine','Rules Engine','Audit Engine'],
    assessment:['Natural Language Engine','Workflow Engine','Rules Engine','Permission Assurance Engine','Evidence Engine'],
    readiness:['Natural Language Engine','Readiness Integrity Engine','Rules Engine','Predictive Engine'],
    advancement:['Natural Language Engine','Competency Coach Engine','Rules Engine','Readiness Integrity Engine'],
    corrective:['Natural Language Engine','Workflow Engine','Rules Engine','Audit Engine'],
    qualification:['Natural Language Engine','Search Engine','Rules Engine','Permission Assurance Engine'],
    knowledge:['Natural Language Engine','Knowledge Engine','Search Engine'],
    metl:['Natural Language Engine','Search Engine','Knowledge Engine','Rules Engine','Permission Assurance Engine'],
    personnel:['Natural Language Engine','Search Engine','Permission Assurance Engine'],
    admin:['Natural Language Engine','Permission Assurance Engine','Audit Engine'],
    system:['Natural Language Engine','Workflow Engine','Data Quality Engine'],
    search:['Natural Language Engine','Search Engine']
  };

  function answer(input){
    let p=parse(input);
    let intent=classify(p);
    p=applyContext(p,intent);
    intent=classify(p);

    const ranked=intent.ranked||[];
    const second=ranked[1];
    const ambiguous=second&&second.family!==intent.family&&intent.score-second.score<45&&intent.score<700;

    let html;
    if(ambiguous){
      html=`<h3>I want to make sure I do the right thing.</h3><p>Your wording could mean <b>${esc(intent.id)}</b> or <b>${esc(second.id)}</b>. Please give me the action and subject, for example “assign M03 to Luis” or “create a new METL task.”</p>`;
    }else{
      html=render(p,intent);
    }

    const result={html,intent:intent.id,family:intent.family,confidence:intent.score,ambiguous,engines:ENGINE_PLAN[intent.family]||ENGINE_PLAN.search,parsed:p,ranked:ranked.slice(0,5)};
    window.__eagleParsed=p;
    window.__eagleResult=result;
    return result;
  }

  window.RPBrainLegacy=window.RPBrainEnterprise;
  window.RPBrainEnterprise={answer,bind(root=document){bind(root,window.__eagleParsed||null)}};

  const priorReasoning=window.ReasoningEngine;
  window.ReasoningEngine={...(priorReasoning||{}),explain(question,result){
    const r=result?.intent?result:(window.__eagleResult||answer(question));
    return{intent:r.intent,sources:r.engines,summary:`Eagle interpreted this as “${r.intent}” and routed it through ${r.engines.join(', ')}.`};
  }};

  const TESTS=[
    ['Assessments','module.assessments'],
    ['Evaluations','module.assessments'],
    ['Assignments','module.assignments'],
    ['Assigned work','module.assignments'],
    ['Personnel','module.personnel'],
    ['Employees','module.personnel'],
    ['METL','module.metl'],
    ['Tasks','module.metl'],
    ['Corrective Actions','module.corrective'],
    ['Readiness Matrix','module.matrix'],
    ['Notifications','module.notifications'],
    ['Audit Trail','module.audit'],
    ['Backup','module.backup'],
    ['Add assessment to Luis','assignment.create'],
    ['Add assessment for Luis','assignment.create'],
    ['Create assessment for Luis','assignment.create'],
    ['Create an assessment to Luis','assignment.create'],
    ['Add evaluation to Luis','assignment.create'],
    ['Schedule evaluation for Luis','assignment.create'],
    ['Who am I','identity.self'],
    ['What is my role','identity.self'],
    ['What level am I','identity.self'],
    ['Approved procedures','knowledge.list'],
    ['Show all approved procedures','knowledge.list'],
    ['What procedures are available','knowledge.list'],
    ['Who is ready for next level','readiness.readyCandidates'],
    ['Who can move to the next level','readiness.readyCandidates'],
    ['Cancel assignment','dialog.cancel'],
    ['Never mind','dialog.cancel'],
    ['Create new task','metl.task.create'],
    ['Create new task for Luis','assignment.create'],
    ['Assign task to Jose Esquivel','assignment.create'],
    ['Assign Luis M03 to Amy','assignment.create'],
    ['Create new subtask','metl.subtask.create'],
    ['Start assessment for Luis','assessment.start'],
    ['What do I need to advance','development.advancement'],
    ['Show C Shift readiness','readiness.group'],
    ['Show overdue corrective actions','corrective.list'],
    ['Who can evaluate M03','evaluator.authority'],
    ['Open backup','system.backup'],
    ['Add new employee','person.create']
  ];
  function runSelfTest(){
    const details=TESTS.map(([text,expected])=>{const actual=classify(parse(text)).id;return{text,expected,actual,pass:actual===expected}});
    return{version:VERSION,total:details.length,passed:details.filter(x=>x.pass).length,failed:details.filter(x=>!x.pass),details};
  }

  window.EagleOrchestrator={
    version:VERSION,normalizeText,lexicon,parse,classifyText:t=>classify(parse(t)),runSelfTest,
    intentCatalog:INTENTS.map(x=>({id:x.id,family:x.family}))
  };

  console.info(`RP Eagle Natural Language Max ${VERSION} loaded`);
})();
