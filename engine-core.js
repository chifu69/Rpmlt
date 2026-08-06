/* RP IA Engine Core v6.0 — local-first, server-ready */
(function(){
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const now=()=>new Date().toISOString();

  window.RPIAEngines={version:'6.0.0'};

  window.SearchEngine={
    normalize:norm,
    personHaystack:p=>norm([p.employeeNumber,p.name,p.shift,p.role,p.assignedLevel,p.approvedLevel,p.status,p.qualifiedLines].join(' ')),
    matchPerson:(p,query)=>!norm(query)||window.SearchEngine.personHaystack(p).includes(norm(query)),
    searchAll:(s,query)=>{
      const q=norm(query); if(!q)return[];
      const out=[];
      (s.personnel||[]).forEach(x=>{if(window.SearchEngine.personHaystack(x).includes(q))out.push({type:'person',id:x.employeeNumber,title:x.name,meta:`#${x.employeeNumber} · ${x.shift} · ${x.role}`})});
      (s.tasks||[]).forEach(x=>{if(norm(`${x.id} ${x.name} ${x.description} ${x.domain}`).includes(q))out.push({type:'task',id:x.id,title:`${x.id} — ${x.name}`,meta:x.domain||'METL Task'})});
      (s.subtasks||[]).forEach(x=>{if(norm(`${x.id} ${x.name} ${x.standard} ${x.taskId}`).includes(q))out.push({type:'subtask',id:x.id,title:`${x.id} — ${x.name}`,meta:`Parent ${x.taskId} · ${x.requiredLevel||''}`})});
      (s.actions||[]).forEach(x=>{if(norm(`${x.id} ${x.employee} ${x.employeeNumber} ${x.taskId} ${x.subtaskId} ${x.status}`).includes(q))out.push({type:'action',id:x.id,title:`Corrective action — ${x.employee||x.employeeNumber}`,meta:`${x.taskId}/${x.subtaskId} · ${x.status}`})});
      (s.knowledge||[]).forEach(x=>{if(norm(`${x.title} ${x.summary} ${(x.tags||[]).join(' ')} ${x.content}`).includes(q))out.push({type:'knowledge',id:x.id,title:x.title,meta:x.category||'Knowledge'})});
      return out.slice(0,100);
    }
  };

  window.AuditEngine={
    ensure:s=>{s.audit=s.audit||[];return s.audit},
    record:(s,user,action,entity,id,detail,before=null,after=null)=>{
      const rec={time:now(),user:user?.name||user?.username||'System',action,entity,id:String(id||''),detail,before,after};
      window.AuditEngine.ensure(s).unshift(rec); return rec;
    },
    history:(s,entity,id)=>window.AuditEngine.ensure(s).filter(x=>(!entity||x.entity===entity)&&(!id||String(x.id)===String(id)))
  };

  window.RulesEngine={
    levelRank:{'-10':10,'-20':20,'-30':30,'-40':40},
    evaluatorCan:(user,level)=>user?.role==='admin'||(user?.role==='evaluator'&&(window.RulesEngine.levelRank[user.maxLevel||'-10']||0)>=(window.RulesEngine.levelRank[level||'-10']||0)),
    canManageMETL:user=>user?.role==='admin'||!!user?.manageMetl,
    canManagePersonnel:user=>user?.role==='admin'||!!user?.managePersonnel,
    canLogin:person=>!person||person.status==='Active',
    qualificationDecision:({result,criticalGate,evidencePresent,srLeadRequired,srLeadVerified})=>{
      const blockers=[];
      if(result!=='GO')blockers.push('Assessment result is not GO');
      if(criticalGate&&result!=='GO')blockers.push('Critical Gate failed');
      if(!evidencePresent)blockers.push('Required evidence is missing');
      if(srLeadRequired&&!srLeadVerified)blockers.push('Sr. Lead verification is required');
      return{qualified:blockers.length===0,blockers};
    },
    validateState:s=>{
      const issues=[]; const seen=new Set();
      (s.personnel||[]).filter(p=>p.employeeNumber).forEach(p=>{const n=String(p.employeeNumber);if(seen.has(n))issues.push({severity:'high',type:'duplicate_employee',message:`Duplicate employee number ${n}`});seen.add(n)});
      const taskIds=new Set((s.tasks||[]).map(x=>x.id));
      (s.subtasks||[]).forEach(x=>{if(!taskIds.has(x.taskId))issues.push({severity:'high',type:'orphan_subtask',message:`${x.id} has no valid parent task`});if(!x.standard)issues.push({severity:'medium',type:'missing_standard',message:`${x.id} has no performance standard`})});
      return issues;
    }
  };

  window.WorkflowEngine={
    ensure:s=>{s.workflows=s.workflows||[];return s.workflows},
    create:(s,type,payload,user)=>{const w={id:`WF-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,type,status:'Open',createdAt:now(),createdBy:user?.name||'System',steps:[],payload};window.WorkflowEngine.ensure(s).unshift(w);return w},
    fromAssessment:(s,assessment,user,settings={})=>{
      if(!assessment||!['NO-GO','REQUIRES ASSISTANCE'].includes(assessment.result))return null;
      const days=Number(settings.defaultCorrectiveActionDays||14); const d=new Date();d.setDate(d.getDate()+days);
      const action={id:`CA-${Date.now()}`,employeeNumber:assessment.employeeNumber,employee:assessment.employee||assessment.employeeName||'',shift:assessment.shift||'',taskId:assessment.taskId||'',subtaskId:assessment.subtaskId||'',status:'Open',targetDate:d.toISOString().slice(0,10),reason:assessment.result,createdAt:now(),sourceAssessmentId:assessment.id||''};
      s.actions=s.actions||[];s.actions.unshift(action);
      return window.WorkflowEngine.create(s,'Corrective Action & Reassessment',{actionId:action.id,assessmentId:assessment.id||'',employeeNumber:assessment.employeeNumber},user);
    },
    advance:(s,id,step,user)=>{const w=window.WorkflowEngine.ensure(s).find(x=>x.id===id);if(!w)return null;w.steps.push({time:now(),step,user:user?.name||'System'});return w}
  };

  window.KnowledgeEngine={
    ensure:s=>{s.knowledge=s.knowledge||[];return s.knowledge},
    add:(s,article,user)=>{const a={id:article.id||`KB-${Date.now()}`,title:article.title||'Untitled',category:article.category||'Procedure',summary:article.summary||'',content:article.content||'',tags:article.tags||[],taskIds:article.taskIds||[],subtaskIds:article.subtaskIds||[],status:article.status||'Draft',version:article.version||'1.0',owner:article.owner||user?.name||'',reviewDate:article.reviewDate||'',updatedAt:now()};window.KnowledgeEngine.ensure(s).unshift(a);return a},
    search:(s,q)=>window.SearchEngine.searchAll(s,q).filter(x=>x.type==='knowledge'),
    answer:(s,q)=>{const hits=window.KnowledgeEngine.search(s,q);if(!hits.length)return{found:false,text:'No approved knowledge article matches this question. Use the official procedure or ask an authorized Sr. Lead.'};const a=(s.knowledge||[]).find(x=>x.id===hits[0].id);if(a.status!=='Approved')return{found:false,text:`A related article exists (${a.title}), but it is not approved for operational use.`};return{found:true,article:a,text:a.summary||a.content.slice(0,500)}}
  };

  window.PredictiveEngine={
    readinessRisk:(s,metricsFn)=>{
      const rows=(s.personnel||[]).filter(p=>p.employeeNumber&&p.status==='Active').map(p=>{const m=metricsFn(p);let score=0;score+=(100-(m.pct||0))*.45;score+=(m.open||0)*8;score+=(m.critical||0)*20;return{employeeNumber:p.employeeNumber,name:p.name,shift:p.shift,risk:Math.min(100,Math.round(score)),readiness:m.pct||0,open:m.open||0,critical:m.critical||0}});return rows.sort((a,b)=>b.risk-a.risk)
    },
    shiftTrend:(s,metricsFn)=>['A','B','C','D'].map(shift=>{const p=(s.personnel||[]).filter(x=>x.status==='Active'&&x.employeeNumber&&x.shift===shift);const avg=p.length?Math.round(p.reduce((a,x)=>a+(metricsFn(x).pct||0),0)/p.length):0;return{shift,readiness:avg,count:p.length}}),
    confidence:s=>{const evaluated=new Set((s.results||[]).map(x=>`${x.employeeNumber}|${x.subtaskId}`)).size;const possible=Math.max(1,(s.personnel||[]).filter(x=>x.status==='Active'&&x.employeeNumber).length*Math.max(1,(s.subtasks||[]).filter(x=>x.status==='Active').length));return Math.min(100,Math.round(evaluated/possible*100))}
  };

  window.RPBrainEngine={
    recommend:(s,user,metricsFn)=>{const risks=window.PredictiveEngine.readinessRisk(s,metricsFn).slice(0,5);const issues=window.RulesEngine.validateState(s);const overdue=(s.actions||[]).filter(a=>a.status!=='Closed'&&a.targetDate&&a.targetDate<new Date().toISOString().slice(0,10));return{headline:overdue.length?`${overdue.length} overdue corrective action${overdue.length===1?'':'s'} require attention`:risks[0]?`${risks[0].name} has the highest current development priority`:'No urgent development risk detected',priorities:risks,systemIssues:issues.slice(0,5),overdue:overdue.slice(0,5),generatedAt:now(),user:user?.name||''}},
    ask:(s,q,metricsFn)=>{const k=window.KnowledgeEngine.answer(s,q);if(k.found)return{type:'knowledge',text:k.text,article:k.article};const hits=window.SearchEngine.searchAll(s,q);if(hits.length)return{type:'search',text:`I found ${hits.length} matching record${hits.length===1?'':'s'}.`,results:hits.slice(0,10)};const r=window.RPBrainEngine.recommend(s,null,metricsFn);return{type:'recommendation',text:r.headline,results:r.priorities}}
  };
})();

/* RP IA Engine Core v6.1 — compliance expansion */
(function(){
  const norm=window.SearchEngine.normalize;
  const rank=window.RulesEngine.levelRank;
  const now=()=>new Date().toISOString();
  const latestResults=(s,employeeNumber)=>{
    const m=new Map();
    (s.results||[]).filter(r=>!employeeNumber||String(r.employeeNumber)===String(employeeNumber))
      .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')))
      .forEach(r=>m.set(`${r.employeeNumber}|${r.subtaskId}`,r));
    return m;
  };

  window.RPIAEngines.version='6.1.0';

  window.PersonnelMaster={
    get:(s,id)=>(s.personnel||[]).find(p=>String(p.employeeNumber)===String(id)),
    active:s=>(s.personnel||[]).filter(p=>p.employeeNumber&&p.status==='Active'),
    snapshot:p=>p?{employeeNumber:String(p.employeeNumber||''),name:p.name||'',shift:p.shift||'',role:p.role||'',assignedLevel:p.assignedLevel||'-10',status:p.status||''}:null,
    resolveRecord:(s,record)=>{
      const p=window.PersonnelMaster.get(s,record?.employeeNumber);
      return p?{...record,associateName:p.name,employee:p.name,shift:p.shift,role:p.role,assignedLevel:p.assignedLevel}:record;
    }
  };

  const oldSearchAll=window.SearchEngine.searchAll;
  window.SearchEngine.searchAll=(s,query)=>{
    const q=norm(query); if(!q)return[];
    const out=oldSearchAll(s,query);
    (s.sessions||[]).forEach(x=>{const p=window.PersonnelMaster.get(s,x.employeeNumber);if(norm(`${x.id} ${x.employeeNumber} ${p?.name||x.associateName} ${p?.shift||x.shift} ${p?.role||x.role} ${x.taskId} ${x.taskName} ${x.evaluatorName} ${x.finalStatus}`).includes(q))out.push({type:'assessment',id:x.id,title:`Assessment — ${p?.name||x.associateName||x.employeeNumber}`,meta:`#${x.employeeNumber} · ${x.taskId} · ${x.finalStatus||x.status}`})});
    (s.results||[]).forEach(x=>{const p=window.PersonnelMaster.get(s,x.employeeNumber);if(norm(`${x.employeeNumber} ${p?.name||x.associateName} ${x.taskId} ${x.subtaskId} ${x.result} ${x.evaluatorName}`).includes(q))out.push({type:'result',id:`${x.sessionId}|${x.subtaskId}`,title:`${x.subtaskId} — ${x.result}`,meta:`${p?.name||x.associateName||x.employeeNumber} · ${x.taskId}`})});
    const seen=new Set();return out.filter(x=>{const k=`${x.type}|${x.id}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,150);
  };

  window.RulesEngine.requirementsForPerson=(s,p)=>(s.subtasks||[]).filter(x=>x.status==='Active'&&(rank[x.requiredLevel]||10)<=(rank[p?.assignedLevel||'-10']||10));
  window.RulesEngine.qualificationSummary=(s,p)=>{
    const req=window.RulesEngine.requirementsForPerson(s,p), latest=latestResults(s,p.employeeNumber);
    const levels=['-10','-20','-30','-40'];
    const levelState={};
    for(const level of levels){
      const applicable=req.filter(x=>(rank[x.requiredLevel]||10)<=rank[level] && (rank[x.requiredLevel]||10)<=rank[p.assignedLevel||'-10']);
      const rows=applicable.map(x=>({subtask:x,result:latest.get(`${p.employeeNumber}|${x.id}`)}));
      const blockers=rows.filter(x=>x.result?.result!=='GO'||(x.subtask.srLeadVerification&&!String(x.result?.srLeadVerification||'').trim()));
      const critical=rows.filter(x=>x.subtask.criticality==='Critical Gate'&&x.result?.result!=='GO');
      levelState[level]={required:rows.length,go:rows.filter(x=>x.result?.result==='GO').length,qualified:rows.length>0&&blockers.length===0,blockers:blockers.length,critical:critical.length};
    }
    let highest='None';for(const l of levels)if(levelState[l].qualified)highest=l;
    const assigned=levelState[p.assignedLevel]||{required:0,go:0,qualified:false,blockers:0,critical:0};
    return{assignedLevel:p.assignedLevel,highestFullyQualified:highest,assignedQualified:assigned.qualified,required:assigned.required,go:assigned.go,pct:assigned.required?Math.round(assigned.go/assigned.required*100):0,blockers:assigned.blockers,critical:assigned.critical,levels:levelState};
  };

  window.RulesEngine.validateAssessment=({user,person,task,rows})=>{
    const errors=[],warnings=[];
    if(!person)errors.push('Select a valid associate from the Personnel Master.');
    if(!task)errors.push('Select a valid active METL Task.');
    if(task&&!window.RulesEngine.evaluatorCan(user,task.requiredLevel))errors.push(`Evaluator authority does not permit ${task.requiredLevel} work.`);
    for(const row of rows||[]){
      if(!window.RulesEngine.evaluatorCan(user,row.requiredLevel))errors.push(`${row.subtaskId}: evaluator authority is below ${row.requiredLevel}.`);
      if(row.result==='GO'&&row.evidenceRequired&&!String(row.evidenceReference||'').trim())errors.push(`${row.subtaskId}: evidence is required before GO can be recorded.`);
      if(row.result==='GO'&&row.srLeadRequired&&!String(row.srLeadVerification||'').trim())errors.push(`${row.subtaskId}: Sr. Lead verification is required.`);
      if(row.criticality==='Critical Gate'&&row.result!=='GO'&&row.result!=='NOT EVALUATED')warnings.push(`${row.subtaskId}: Critical Gate failure blocks qualification and independent authorization.`);
    }
    if((rows||[]).every(r=>r.result==='NOT EVALUATED'))errors.push('Evaluate at least one subtask.');
    return{valid:errors.length===0,errors,warnings};
  };

  window.RulesEngine.canCloseCorrectiveAction=(user,action,reassessmentResult,verification)=>{
    const errors=[];
    if(reassessmentResult!=='GO')errors.push('A GO reassessment is required before closure.');
    const subLevel=action.requiredLevel||'-10';
    if(!window.RulesEngine.evaluatorCan(user,subLevel))errors.push(`Closure authority does not cover ${subLevel}.`);
    if(action.criticality==='Critical Gate'&&!String(verification||'').trim())errors.push('Critical Gate closure requires authorized verification.');
    return{valid:errors.length===0,errors};
  };

  const oldRecord=window.AuditEngine.record;
  window.AuditEngine.record=(s,user,action,entity,id,detail,before=null,after=null)=>{
    const rec=oldRecord(s,user,action,entity,id,detail,before,after);
    rec.sequence=(s.audit||[]).length;
    rec.device={platform:navigator?.platform||'',userAgent:String(navigator?.userAgent||'').slice(0,180)};
    rec.recordedAt=now();
    return rec;
  };
})();
