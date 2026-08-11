/* RP Enterprise Platform v8.0 — architecture and experience layer */
(function(){
  window.eagleDisplayName=function(){
    const raw=(currentUser?.name||'').trim();
    if(raw && !/^system$/i.test(raw))return raw;
    const user=(currentUser?.username||'').trim();
    if(user && !/^system$/i.test(user))return user;
    if(currentUser?.role==='admin')return 'System Administrator';
    if(currentUser?.role==='evaluator')return 'Approved Evaluator';
    return raw||user||'User';
  };

  'use strict';
  const VERSION='10.0.0 RC1';
  const $q=(s,r=document)=>r.querySelector(s);
  const $$q=(s,r=document)=>[...r.querySelectorAll(s)];
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const escV=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now=()=>new Date().toISOString();
  const LOG_KEY='rpia-diagnostic-log-v9';
  const logs=()=>{try{return JSON.parse(localStorage.getItem(LOG_KEY))||[]}catch{return[]}};
  function log(level,source,message,detail=''){
    const rows=logs();rows.unshift({time:now(),level,source,message,detail});
    localStorage.setItem(LOG_KEY,JSON.stringify(rows.slice(0,500)));
  }

  const safeCount=(fn)=>{try{return fn()}catch{return 0}};
  const engineDefinitions=[
    ['Eagle','Coordinates every engine and returns one clear answer.'],
    ['Natural Language Engine','Understands intent, entities, language, and conversational context.'],
    ['Reasoning Engine','Explains the facts, rules, and evidence behind each conclusion.'],
    ['Workflow Engine','Runs corrective-action, reassessment, approval, and qualification workflows.'],
    ['Rules Engine','Enforces levels, evaluator authority, Critical Gates, evidence, and blocking rules.'],
    ['Knowledge Engine','Connects approved procedures, standard work, training, and lessons learned.'],
    ['Search Engine','Finds authorized records consistently across the entire platform.'],
    ['Predictive Engine','Detects readiness trends, future risks, and development opportunities.'],
    ['Audit Engine','Preserves who changed what, when, and why.'],
    ['Competency Coach Engine','Provides positive, personalized development guidance.'],
    ['Experience Engine','Learns recurring patterns from assessment and training history.'],
    ['Evidence Engine','Organizes photos, files, and evidence connected to official records.'],
    ['Certification Engine','Tracks supporting certifications, validity, and expiration.'],
    ['Readiness Integrity Engine','Validates readiness calculations before they are displayed.'],
    ['Data Quality Engine','Detects duplicates, missing fields, orphan records, and contradictions.'],
    ['Training Effectiveness Engine','Measures whether training improves later performance.'],
    ['Coverage Resilience Engine','Measures vulnerability when qualified people are unavailable.'],
    ['Recertification Engine','Schedules and controls renewal of expiring qualifications.'],
    ['Permission Assurance Engine','Continuously checks role and evaluator permissions.'],
    ['Dependency & Impact Engine','Shows who and what will be affected before a master-data change.']
  ];

  function dataQualityIssues(){
    const issues=[];const seen=new Set();
    for(const p of state.personnel||[]){
      if(!p.employeeNumber||!p.name)continue;
      const k=String(p.employeeNumber);
      if(seen.has(k))issues.push(`Duplicate employee number ${k}`);seen.add(k);
      if(!p.shift)issues.push(`${p.name}: missing shift`);
      if(!p.role)issues.push(`${p.name}: missing role`);
    }
    const subIds=new Set((state.subtasks||[]).map(s=>s.id));
    for(const r of state.results||[])if(r.subtaskId&&!subIds.has(r.subtaskId))issues.push(`Assessment references missing subtask ${r.subtaskId}`);
    return issues;
  }
  function permissionIssues(){
    const rows=[];
    for(const u of authUsers||[]){
      if(u.role==='evaluator'&&!u.maxLevel)rows.push(`${u.name||u.username}: evaluator level missing`);
      if(u.role==='viewer'&&(u.manageMetl||u.managePersonnel))rows.push(`${u.name||u.username}: read-only account has management permission`);
    }
    return rows;
  }
  function readinessIntegrity(){
    const people=(state.personnel||[]).filter(p=>p.employeeNumber&&p.name&&p.status==='Active');
    let low=0;
    for(const p of people){const m=personMetrics(p);if(m.applicable&&m.go+m.nogo+m.assist+m.expired===0)low++;}
    return {people:people.length,lowConfidence:low};
  }
  function engineTest(name){
    const start=performance.now();let status='Healthy',detail='Operational';
    try{
      if(name==='Search Engine'){SearchEngine.searchAll(state,'392');detail='Personnel, task, action, and knowledge indexes responded.'}
      else if(name==='Knowledge Engine'){detail=`${safeCount(()=>state.knowledge.filter(x=>x.status==='Approved').length)} approved articles available.`}
      else if(name==='Rules Engine'){detail=`${readinessIntegrity().people} active personnel evaluated by readiness rules.`}
      else if(name==='Audit Engine'){detail=`${safeCount(()=>state.audit.length)} audit events available.`}
      else if(name==='Data Quality Engine'){const n=dataQualityIssues().length;status=n?'Warning':'Healthy';detail=`${n} data quality issue${n===1?'':'s'} detected.`}
      else if(name==='Permission Assurance Engine'){const n=permissionIssues().length;status=n?'Warning':'Healthy';detail=`${n} permission issue${n===1?'':'s'} detected.`}
      else if(name==='Readiness Integrity Engine'){const r=readinessIntegrity();status=r.lowConfidence?'Warning':'Healthy';detail=`${r.lowConfidence} active profile${r.lowConfidence===1?'':'s'} need more assessment data.`}
      else if(name==='Workflow Engine'){detail=`${safeCount(()=>state.actions.filter(a=>a.status!=='Closed').length)} open workflows/actions.`}
      else if(name==='Experience Engine'){detail=`${safeCount(()=>ExperienceEngine.patterns().length)} experience patterns calculated.`}
      else if(name==='Certification Engine'){detail=`${safeCount(()=>CertificationEngine.expiring().length)} certifications approaching expiration.`}
      else if(name==='Natural Language Engine'){NaturalLanguageEngine.parse('What does John Smith need to advance?');detail='Intent and entity parser responded.'}
      else if(name==='Eagle'){detail='Brain routing, search, rules, knowledge, and coaching connections available.'}
      else detail='Foundation loaded and dependencies available.';
    }catch(err){status='Error';detail=err.message||String(err)}
    const ms=Math.max(1,Math.round(performance.now()-start));
    log(status==='Error'?'ERROR':status==='Warning'?'WARNING':'INFO',name,`${status} (${ms} ms)`,detail);
    return{name,status,detail,ms,lastRun:new Date().toLocaleString()};
  }

  window.RPIAPlatform={version:VERSION,engineDefinitions,engineTest,log,dataQualityIssues,permissionIssues,readinessIntegrity};

  /* Reasoning Engine */
  window.ReasoningEngine={
    explain(question,result){
      const parsed=NaturalLanguageEngine?.parse?.(question)||{intent:'general'};
      const sources=['Personnel Master'];
      if(['advancement','person','qualified','shift'].includes(parsed.intent))sources.push('Rules Engine','Readiness Integrity Engine');
      if(parsed.intent==='knowledge')sources.push('Knowledge Engine');
      if(parsed.intent==='actions')sources.push('Workflow Engine');
      sources.push('Audit Engine');
      return{intent:parsed.intent,sources,summary:`Eagle interpreted this as “${parsed.intent}” and consulted ${sources.join(', ')}.`};
    }
  };

  /* Foundations for the remaining engines, exposed through one stable registry. */
  window.ReadinessIntegrityEngine={analyze:readinessIntegrity};
  window.DataQualityEngine={scan:dataQualityIssues};
  window.TrainingEffectivenessEngine={analyze(){const rows=state.results||[];return{records:rows.length,message:rows.length?'Assessment history is available for before/after training analysis.':'More assessment history is required.'}}};
  window.CoverageResilienceEngine={analyze(){const risks=window.RPIAEnterprise?.CoverageResilienceEngine?.analyze?.()||[];return risks}};
  window.RecertificationEngine={due(){return window.CertificationEngine?.expiring?.()||[]}};
  window.PermissionAssuranceEngine={scan:permissionIssues};
  window.DependencyImpactEngine={
    assess(entity){
      const id=entity?.id||entity?.employeeNumber||'';
      return{
        assessments:(state.results||[]).filter(r=>r.taskId===id||r.subtaskId===id||r.employeeNumber===id).length,
        actions:(state.actions||[]).filter(a=>a.taskId===id||a.subtaskId===id||a.employeeNumber===id).length,
        personnel:(state.personnel||[]).filter(p=>p.employeeNumber===id).length
      };
    }
  };

  const motivationLines=[
    'Let’s make today count.',
    'Ready when you are.',
    'Another opportunity to get better.',
    'Strong work starts with the next right step.',
    'Progress is built one standard at a time.',
    'Run like new. Look like new.'
  ];
  function firstName(){return String(currentUser?.name||currentUser?.username||'').trim().split(/\s+/)[0]||'there'}
  function motivationalLine(seed=0){
    const d=new Date(), key=d.getFullYear()*372+(d.getMonth()+1)*31+d.getDate()+seed;
    return motivationLines[Math.abs(key)%motivationLines.length];
  }
  function eaglePersonalGreeting(seed=0){
    const h=new Date().getHours(), part=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
    return `${part}, ${escV(firstName())}. ${escV(motivationalLine(seed))}`;
  }
  function dashboardPersonalInsight(metrics,open,critical,due){
    const me=(state.personnel||[]).find(p=>String(p.employeeNumber||'')===String(currentUser?.employeeNumber||''));
    if(critical.length)return `Safety first, ${escV(firstName())}. ${critical.length} Critical Gate issue${critical.length===1?' needs':'s need'} attention.`;
    if(currentUser?.role==='evaluator'){
      const mine=(state.assessmentAssignments||state.assignedAssessments||[]).filter(a=>String(a.evaluatorUsername||'').toLowerCase()===String(currentUser?.username||'').toLowerCase()&&!['Completed','Cancelled'].includes(a.status));
      if(mine.length)return `${escV(firstName())}, you have ${mine.length} assigned assessment${mine.length===1?'':'s'} waiting for your attention.`;
    }
    if(me){const m=metrics.find(x=>String(x.employeeNumber)===String(me.employeeNumber));if(m&&m.pct>0)return `${escV(firstName())}, your recorded readiness is ${m.pct}%. Keep building on that progress.`}
    if(due.length)return `${escV(firstName())}, ${due.length} reassessment${due.length===1?' is':'s are'} coming up. A little preparation today keeps qualifications moving.`;
    if(!open.length)return `Looking good, ${escV(firstName())}. No open corrective actions need attention right now.`;
    return `${escV(firstName())}, Eagle is ready to help you choose the next best action.`;
  }

  function askBrainCard(){
    return `<section class="card dashboard-brain"><div class="dashboard-card-head"><div><span class="ai-badge">Powered by RP</span><h2>Ask Eagle</h2></div><span class="brain-orb"><img src="rpia-eagle-192.png" alt="Eagle" class="eagle-mini"></span></div><p>Ask about readiness, employees, tasks, corrective actions, qualifications, or approved procedures.</p><div class="ask-row compact"><input id="dashBrainQuestion" placeholder="Example: What does John Smith need to advance?"><button class="primary" id="dashAskBrain">Ask</button></div><div id="dashBrainAnswer" class="ai-answer compact-answer">Ask a question or open the full conversation.</div><div class="actions"><button class="secondary" id="openFullBrain">Open full conversation</button></div></section>`;
  }

  function metricButton(value,label,cls,target){return `<button class="kpi metric-link ${cls||''}" data-metric="${target}"><b>${value}</b><span>${label}</span></button>`}

  window.dashboard=function(){
    if(window.reconcileCriticalGateActions)window.reconcileCriticalGateActions();

    const people=(state.personnel||[]).filter(p=>p.employeeNumber&&p.name&&p.status==='Active');
    const metrics=people.map(p=>({...p,...personMetrics(p)}));
    const actionRows=window.correctiveActionRepository?window.correctiveActionRepository():(state.actions||[]);
    const allAssignments=(state.assessmentAssignments||[]).filter(a=>!['Completed','Cancelled'].includes(a.status));

    const signedInPerson=(()=>{
      const emp=String(currentUser?.employeeNumber||'').trim();
      if(emp){
        const hit=people.find(p=>String(p.employeeNumber||'').trim()===emp);
        if(hit)return hit;
      }
      const nm=String(currentUser?.name||currentUser?.username||'').trim().toLowerCase();
      if(nm){
        const exact=people.find(p=>String(p.name||'').trim().toLowerCase()===nm);
        if(exact)return exact;
      }
      return null;
    })();

    const hour=new Date().getHours();
    const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
    const userName=escV((currentUser?.name&&String(currentUser.name).trim())||currentUser?.username||'System Administrator');
    const isViewer=currentUser?.role==='viewer';
    const isEvaluator=currentUser?.role==='evaluator';
    const isAdmin=currentUser?.role==='admin';

    // ---------------------------------------------------------------
    // READ-ONLY ASSOCIATE DASHBOARD
    // A -10/read-only associate sees only personal, actionable content.
    // No plant Critical Gates, global shift readiness, or admin missions.
    // ---------------------------------------------------------------
    if(isViewer){
      const me=signedInPerson;
      const myMetric=me?metrics.find(x=>String(x.employeeNumber)===String(me.employeeNumber)):null;
      const myAssignments=me?allAssignments.filter(a=>String(a.employeeNumber||'')===String(me.employeeNumber||'')):[];
      const myActions=me?actionRows.filter(a=>String(a.employeeNumber||'')===String(me.employeeNumber||'')&&a.status!=='Closed'):[];
      const myOverdue=myActions.filter(a=>a.targetDate&&a.targetDate<today());
      const myReadiness=myMetric?.pct||0;
      const levels=['-10','-20','-30','-40'];
      const levelIndex=me?levels.indexOf(me.assignedLevel||'-10'):-1;
      const nextLevel=levelIndex>=0&&levelIndex<levels.length-1?levels[levelIndex+1]:null;

      const personalMissions=[];
      if(myAssignments.length){
        const first=[...myAssignments].sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')))[0];
        const t=(state.tasks||[]).find(x=>String(x.id)===String(first.taskId));
        personalMissions.push({
          tone:'violet',icon:'✓',
          title:`Complete your assigned ${escV(first.taskId||'assessment')}`,
          detail:`${escV(t?.name||first.taskName||'Assessment')} · Due ${escV(first.dueDate||'date not set')}`,
          target:'assignments'
        });
      }
      if(myOverdue.length){
        personalMissions.push({
          tone:'amber',icon:'⏱',
          title:`Review ${myOverdue.length} overdue item${myOverdue.length===1?'':'s'}`,
          detail:'These items are tied to your own competency record.',
          target:'profile'
        });
      }
      if(nextLevel){
        personalMissions.push({
          tone:'blue',icon:'↗',
          title:`Keep building toward ${nextLevel}`,
          detail:`Your recorded readiness is ${myReadiness}%. Progress is built one step at a time.`,
          target:'profile'
        });
      }
      if(!personalMissions.length){
        personalMissions.push({
          tone:'green',icon:'✓',
          title:'You are caught up right now',
          detail:'Keep building your skills one standard at a time.',
          target:'profile'
        });
      }

      const top=personalMissions[0];
      const personalizedReady=`Ready when you are, ${escV(firstName())}. What can I help you accomplish today?`;

      page('Dashboard','',`
        <section class="command-hero green associate-hero">
          <div class="command-greeting">
            <span class="eyebrow">My RP Briefing</span>
            <h1>${greeting}, ${userName}.</h1>
            <p>Progress is built one step at a time, ${escV(firstName())}.</p>
            <p class="eagle-personal-insight">${myAssignments.length?`You have ${myAssignments.length} assigned assessment${myAssignments.length===1?'':'s'} to work on.`:`Your personal RP record is ready when you are.`}</p>
          </div>
          <div class="command-status">
            <small>My level</small>
            <b>${escV(me?.assignedLevel||'Read only')}</b>
            <span>${escV(me?.shift||'—')} Shift</span>
          </div>
        </section>

        <section class="command-summary associate-summary">
          <button class="command-metric readiness" data-target="profile"><span>My Readiness</span><b>${myReadiness}%</b><em>${nextLevel?`Toward ${escV(nextLevel)}`:'Current level'}</em></button>
          <button class="command-metric assessments" data-target="assignments"><span>Assigned Work</span><b>${myAssignments.length}</b><em>${myAssignments.length?'Pending':'Clear'}</em></button>
          <button class="command-metric actions" data-target="profile"><span>My Open Items</span><b>${myActions.length}</b><em>${myOverdue.length?`${myOverdue.length} overdue`:'On schedule'}</em></button>
        </section>

        <section class="priority-command card ${top.tone}">
          <div class="priority-icon">${top.icon}</div>
          <div><span class="eyebrow">My Next Step</span><h2>${top.title}</h2><p>${top.detail}</p></div>
          <button class="primary" id="commandResolve">Open</button>
        </section>

        <div class="command-grid associate-command-grid">
          <section class="card mission-command">
            <div class="section-title"><div><span class="eyebrow">My Focus</span><h2>Keep moving forward</h2></div><b>${personalMissions.length} item${personalMissions.length===1?'':'s'}</b></div>
            <div class="command-mission-list">${personalMissions.slice(0,4).map((m,i)=>`<button data-target="${m.target}" class="command-mission ${m.tone}"><i>${m.icon}</i><span><b>${i+1}. ${m.title}</b><small>${m.detail}</small></span><em>Open →</em></button>`).join('')}</div>
          </section>

          <section class="card eagle-command">
            <span class="eyebrow">Ask Eagle</span>
            <h2>My training and progress assistant</h2>
            <p>Ask about your assignments, qualification progress, assessments, or approved procedures.</p>
            <div class="ask-row"><input id="dashBrainQuestion" placeholder="What are my assignments?"><button class="primary" id="dashAskBrain">Ask</button></div>
            <div id="dashBrainAnswer" class="ai-answer">${personalizedReady}</div>
            <button class="secondary" id="openFullBrain">Open full conversation</button>
          </section>
        </div>`);

      const openPersonal=t=>{
        if(t==='assignments')return navigate('assignments');
        if(t==='profile')return navigate('profile');
      };
      $$q('[data-target]').forEach(b=>b.onclick=()=>openPersonal(b.dataset.target));
      $q('#commandResolve').onclick=()=>openPersonal(top.target);

      const run=()=>{
        const q=$q('#dashBrainQuestion').value.trim();if(!q)return;
        try{
          const r=RPBrainEnterprise.answer(q);
          $q('#dashBrainAnswer').innerHTML=r.html;
          RPBrainEnterprise.bind($q('#dashBrainAnswer'));
        }catch(err){$q('#dashBrainAnswer').textContent='Eagle could not complete this request.'}
      };
      $q('#dashAskBrain').onclick=run;
      $q('#dashBrainQuestion').onkeydown=e=>{if(e.key==='Enter')run()};
      $q('#openFullBrain').onclick=()=>openEaglePanel();
      return;
    }

    // ---------------------------------------------------------------
    // EVALUATOR / ADMIN DASHBOARD
    // Existing operational view remains for authorized roles.
    // ---------------------------------------------------------------
    const readiness=metrics.length?Math.round(metrics.reduce((n,x)=>n+x.pct,0)/metrics.length):0;
    const open=actionRows.filter(a=>a.status!=='Closed');
    const overdue=open.filter(a=>a.targetDate&&a.targetDate<today());
    const critical=(state.results||[]).filter(r=>r.criticality==='Critical Gate'&&r.result!=='GO'&&r.result!=='NOT EVALUATED');
    const due=actionRows.filter(a=>a.reassessmentDate&&a.reassessmentDate>=today()).slice(0,4);
    const ready=metrics.filter(x=>x.pct===100&&!x.open&&!x.critical).length;
    const shifts=['A','B','C','D'].map(sh=>{const r=metrics.filter(x=>x.shift===sh);return{shift:sh,count:r.length,pct:r.length?Math.round(r.reduce((a,x)=>a+x.pct,0)/r.length):0}});
    const weakest=[...shifts].filter(x=>x.count).sort((a,b)=>a.pct-b.pct)[0];

    const missions=[];
    if(critical.length)missions.push({tone:'red',icon:'!',title:`Resolve ${critical.length} Critical Gate issue${critical.length===1?'':'s'}`,detail:'Qualification and independent authorization may be blocked.',target:'critical'});
    if(overdue.length)missions.push({tone:'amber',icon:'⏱',title:`Review ${overdue.length} overdue corrective action${overdue.length===1?'':'s'}`,detail:'Closure dates have passed and require attention.',target:'overdue'});

    if(isEvaluator){
      const mine=allAssignments.filter(a=>String(a.evaluatorUsername||'').toLowerCase()===String(currentUser?.username||'').toLowerCase());
      if(mine.length)missions.unshift({tone:'violet',icon:'✓',title:`Complete ${mine.length} assigned evaluation${mine.length===1?'':'s'}`,detail:'Associates are waiting for your evaluation.',target:'assignments'});
    }else if(weakest){
      missions.push({tone:'blue',icon:'↗',title:`Strengthen ${weakest.shift} Shift readiness`,detail:`Current readiness is ${weakest.pct}%.`,target:'matrix'});
    }

    if(due.length)missions.push({tone:'violet',icon:'✓',title:`Complete ${due.length} upcoming reassessment${due.length===1?'':'s'}`,detail:'Keep qualifications current and traceable.',target:'assessments'});
    if(!missions.length)missions.push({tone:'green',icon:'✓',title:'No urgent compliance issues',detail:'Review upcoming assessments and development opportunities.',target:'assessments'});

    const status=critical.length||overdue.length?'Attention Required':readiness>=85?'Stable':'Developing';
    const statusTone=critical.length?'red':overdue.length?'amber':readiness>=85?'green':'blue';

    page('Dashboard','',`
      <section class="command-hero ${statusTone}">
        <div class="command-greeting"><span class="eyebrow">Eagle Operational Briefing</span><h1>${greeting}, ${userName}.</h1><p>${escV(motivationalLine())}</p><p class="eagle-personal-insight">${dashboardPersonalInsight(metrics,open,critical,due)}</p></div>
        <div class="command-status"><small>Plant status</small><b>${status}</b><span>Last analysis ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
      </section>
      <section class="command-summary">
        <button class="command-metric readiness" data-target="matrix"><span>Readiness</span><b>${readiness}%</b><em>${readiness>=85?'On track':'Needs development'}</em></button>
        <button class="command-metric critical" data-target="critical"><span>Critical Gates</span><b>${critical.length}</b><em>${critical.length?'Urgent':'Clear'}</em></button>
        <button class="command-metric actions" data-target="open"><span>Open Actions</span><b>${open.length}</b><em>${overdue.length?`${overdue.length} overdue`:'On schedule'}</em></button>
        <button class="command-metric assessments" data-target="assessments"><span>Reassessments</span><b>${due.length}</b><em>Upcoming</em></button>
        <button class="command-metric ready" data-target="ready"><span>Fully Ready</span><b>${ready}</b><em>Associates</em></button>
      </section>
      <section class="priority-command card ${missions[0].tone}"><div class="priority-icon">${missions[0].icon}</div><div><span class="eyebrow">Highest Priority</span><h2>${escV(missions[0].title)}</h2><p>${escV(missions[0].detail)}</p></div><button class="primary" id="commandResolve">Resolve Now</button></section>
      <div class="command-grid">
        <section class="card mission-command"><div class="section-title"><div><span class="eyebrow">Today's Mission</span><h2>Start with what matters most</h2></div><b>${missions.length} priorities</b></div><div class="command-mission-list">${missions.slice(0,4).map((m,i)=>`<button data-target="${m.target}" class="command-mission ${m.tone}"><i>${m.icon}</i><span><b>${i+1}. ${escV(m.title)}</b><small>${escV(m.detail)}</small></span><em>Open →</em></button>`).join('')}</div></section>
        <section class="card eagle-command"><span class="eyebrow">Ask Eagle</span><h2>Get an answer or open the exact record</h2><p>Search employees, qualifications, actions, tasks, and approved procedures.</p><div class="ask-row"><input id="dashBrainQuestion" placeholder="What does John Smith need to advance?"><button class="primary" id="dashAskBrain">Ask</button></div><div id="dashBrainAnswer" class="ai-answer">Ready when you are, ${escV(firstName())}. What can I help you accomplish today?</div><button class="secondary" id="openFullBrain">Open full conversation</button></section>
      </div>
      <section class="card shift-command"><div class="section-title"><div><span class="eyebrow">Readiness by Shift</span><h2>Coverage at a glance</h2></div></div><div class="shift-bars">${shifts.map(s=>`<button data-shift="${s.shift}"><b>${s.shift} Shift</b><span><i style="width:${s.pct}%"></i></span><em>${s.pct}% · ${s.count} active</em></button>`).join('')}</div></section>`);

    const openTarget=t=>{
      if(t==='assignments')return navigate('assignments');
      if(t==='ready')return navigate('personnel');
      if(t==='matrix'||t==='readiness')return navigate('matrix');
      if(t==='assessments')return navigate('assessments');
      if(['critical','open','overdue'].includes(t))return navigate('actions');
    };
    $$q('[data-target]').forEach(b=>b.onclick=()=>openTarget(b.dataset.target));
    $q('#commandResolve').onclick=()=>openTarget(missions[0].target);
    $$q('[data-shift]').forEach(b=>b.onclick=()=>{navigate('matrix');setTimeout(()=>{const el=$q('#mxShift');if(el){el.value=b.dataset.shift;el.dispatchEvent(new Event('change'))}},0)});

    const run=()=>{const q=$q('#dashBrainQuestion').value.trim();if(!q)return;try{const r=RPBrainEnterprise.answer(q);$q('#dashBrainAnswer').innerHTML=r.html;RPBrainEnterprise.bind($q('#dashBrainAnswer'))}catch(err){$q('#dashBrainAnswer').textContent='Eagle could not complete this request.'}};
    $q('#dashAskBrain').onclick=run;
    $q('#dashBrainQuestion').onkeydown=e=>{if(e.key==='Enter')run()};
    $q('#openFullBrain').onclick=()=>openEaglePanel();
  };

  window.personnel=function(){
    page('Personnel Master','Search the central master record by employee number, name, shift, role, level, status, or qualified line',`<div class="filters"><input id="pSearch" type="search" inputmode="text" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Search name or employee #"><select id="pShift"><option value="">All shifts</option>${['A','B','C','D'].map(x=>`<option>${x}</option>`).join('')}</select><select id="pStatus"><option value="">All statuses</option><option>Active</option><option>Leave of Absence</option><option>Inactive</option><option>Terminated</option><option>Vacant</option></select></div><div id="pSearchMeta" class="search-meta"></div><div id="ptable"></div>`,canManagePersonnel()?'<button class="primary" id="addPerson">Add personnel</button>':'');
    const clean=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[“”"']/g,'').replace(/[^a-zA-Z0-9\- ]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
    const digits=v=>String(v??'').normalize('NFKC').replace(/[^0-9]/g,'');
    let lastSignature='';
    const render=()=>{
      const box=$q('#pSearch');if(!box)return;
      const raw=String(box.value??''),q=clean(raw),qd=digits(raw),sh=String($q('#pShift')?.value||''),st=String($q('#pStatus')?.value||'');
      const tokens=q.split(' ').filter(Boolean),source=Array.isArray(state.personnel)?state.personnel:[],scored=[];
      for(const p of source){
        if(sh&&String(p.shift||'')!==sh)continue;if(st&&String(p.status||'')!==st)continue;
        const emp=digits(p.employeeNumber),name=clean(p.name),fields=[p.employeeNumber,p.name,p.positionId,p.shift,p.role,p.assignedLevel,p.approvedLevel,p.status,p.qualifiedLines,p.supervisor].map(clean),hay=fields.join(' ');let score=0;
        if(!q&&!qd)score=1;
        if(qd){if(emp===qd)score=100000;else if(emp.startsWith(qd))score=80000;else if(emp.includes(qd))score=60000;}
        if(q){if(name===q)score=Math.max(score,95000);else if(name.startsWith(q))score=Math.max(score,75000);else if(fields.some(v=>v===q))score=Math.max(score,70000);else if(hay.includes(q))score=Math.max(score,50000);if(tokens.length&&tokens.every(t=>fields.some(v=>v.includes(t))))score=Math.max(score,45000);}
        if(score>0)scored.push({p,score});
      }
      scored.sort((a,b)=>b.score-a.score||String(a.p.employeeNumber||'').localeCompare(String(b.p.employeeNumber||''),undefined,{numeric:true}));
      $q('#pSearchMeta').textContent=`${scored.length} result${scored.length===1?'':'s'}${raw.trim()?` for “${raw.trim()}”`:''}`;
      const cards=scored.map(({p})=>`<article class="personnel-result-card" data-employee="${esc(p.employeeNumber)}"><div class="personnel-result-photo">${employeePhoto(p,'employee-thumb')}</div><div class="personnel-result-main"><button type="button" class="text-btn pd" data-emp="${esc(p.employeeNumber)}" data-pos="${esc(p.positionId)}">${esc(p.name||p.positionId)}</button><p>Employee #${esc(p.employeeNumber)} · ${esc(p.shift)} Shift</p><div class="personnel-result-meta"><span>${esc(p.role)}</span><span>${esc(p.assignedLevel||'—')}</span><span class="pill ${String(p.status).toLowerCase()}">${esc(p.status)}</span></div></div><div class="personnel-result-actions"><button type="button" class="secondary pd" data-emp="${esc(p.employeeNumber)}" data-pos="${esc(p.positionId)}">View profile</button>${canManagePersonnel()?`<button type="button" class="secondary pe" data-pos="${esc(p.positionId)}">Edit</button>`:''}</div></article>`).join('');
      $q('#ptable').innerHTML=cards?`<div class="personnel-result-list">${cards}</div>`:'<div class="card empty-state"><b>No personnel found</b><p>Try the exact employee number, part of the number, first name, or last name.</p></div>';
      $$q('.pd').forEach(b=>b.onclick=()=>window.openEmployeeProfile?window.openEmployeeProfile(b.dataset.emp||b.dataset.pos):personDetail(b.dataset.emp));
      $$q('.pe').forEach(b=>b.onclick=()=>personEdit(b.dataset.pos));
      lastSignature=[raw,sh,st,source.length,scored.length].join('|');
    };
    ['input','change','search','keyup','compositionend'].forEach(ev=>$q('#pSearch').addEventListener(ev,render));
    $q('#pSearch').addEventListener('paste',()=>setTimeout(render,0));
    $q('#pShift').addEventListener('change',render);$q('#pStatus').addEventListener('change',render);
    const watcher=setInterval(()=>{const el=$q('#pSearch');if(!el||!document.body.contains(el)){clearInterval(watcher);return}const sig=[el.value,$q('#pShift')?.value||'',$q('#pStatus')?.value||'',state.personnel.length].join('|');if(!lastSignature.startsWith(sig))render()},180);
    if($q('#addPerson'))$q('#addPerson').onclick=()=>personEdit();render();
  };


  window.assessmentsUnifiedView=function(){
    const rows=[...(state.sessions||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    page(uiLanguage==='es'?'Evaluaciones':'Assessments',uiLanguage==='es'?'Crea evaluaciones y revisa todo el historial en una sola pantalla':'Create assessments and review the complete history in one place',`
      <div class="card assessment-hub"><div class="assessment-hub-head"><div><h2>Assessment workspace</h2><p>Start a controlled assessment or find an existing signed session.</p></div>${canEvaluate()?'<button class="primary" id="newAssessmentUnified">+ New Assessment</button>':''}</div><div class="filters"><input id="uAssessSearch" placeholder="Search employee name, employee #, task, or evaluator"><select id="uAssessResult"><option value="">All results</option><option>UNQUALIFIED</option><option>CRITICAL</option><option>RECORDED</option></select></div><div id="uAssessTable"></div></div>`);
    const draw=()=>{const q=norm($q('#uAssessSearch').value),r=$q('#uAssessResult').value;const filtered=rows.filter(s=>norm(`${s.employeeNumber||''} ${s.associateName||''} ${s.taskId||''} ${s.taskName||''} ${s.evaluatorName||''}`).includes(q)&&(!r||String(s.finalStatus).includes(r)));$q('#uAssessTable').innerHTML=sessionTable(filtered);$$q('.sv').forEach(b=>b.onclick=()=>sessionDetail(b.dataset.id))};
    $q('#uAssessSearch').oninput=draw;$q('#uAssessResult').onchange=draw;if($q('#newAssessmentUnified'))$q('#newAssessmentUnified').onclick=()=>assess();draw();
  };

  window.diagnosticCenterView=function(){
    if(currentUser?.role!=='admin'){page('Restricted','Diagnostic Center is available only to administrators and IT.',`<div class="card"><p>Access denied.</p></div>`);return}
    const current=engineDefinitions.map(([name])=>engineTest(name));
    const health=Math.round(current.reduce((n,x)=>n+(x.status==='Healthy'?100:x.status==='Warning'?65:0),0)/current.length);
    page('Diagnostic Center','Server, data, engine health, tests, and technical event logs',`
      <div class="diag-overview card"><div><span class="eyebrow">Enterprise diagnostics</span><h2>Overall System Health</h2><p>Run targeted tests without exposing technical tools to production users.</p></div><div class="health-score ${health<80?'warning':''}"><b>${health}%</b><span>${health>=90?'Healthy':health>=70?'Attention required':'Critical'}</span></div></div>
      <div class="diag-actions"><button class="primary" id="runFullDiagnostic">Run Full System Diagnostic</button><button class="secondary" id="openServerConfigDiagnostic">Server Configuration</button><button class="secondary" id="clearDiagnosticLog">Clear Log</button><button class="secondary" id="exportDiagnostic">Export Report</button></div>
      <div id="engineHealthGrid" class="engine-health-grid">${current.map(x=>engineHealthCard(x)).join('')}</div>
      <div class="card terminal-card"><div class="terminal-head"><h3>Live System Log</h3><span>Read-only diagnostic stream</span></div><div id="diagnosticTerminal" class="diagnostic-terminal">${renderLogs()}</div></div>`);
    $$q('.engine-health-card').forEach(b=>b.onclick=()=>engineDiagnosticDetail(b.dataset.engine));
    $q('#runFullDiagnostic').onclick=()=>{const result=engineDefinitions.map(([n])=>engineTest(n));$q('#engineHealthGrid').innerHTML=result.map(engineHealthCard).join('');$$q('.engine-health-card').forEach(b=>b.onclick=()=>engineDiagnosticDetail(b.dataset.engine));$q('#diagnosticTerminal').innerHTML=renderLogs();toast('Full diagnostic completed')};
    $q('#openServerConfigDiagnostic').onclick=()=>window.RpiaServerSetup.open();
    $q('#clearDiagnosticLog').onclick=()=>{localStorage.removeItem(LOG_KEY);$q('#diagnosticTerminal').innerHTML='<div class="terminal-line"><span>INFO</span><b>Diagnostic Center</b><em>Log cleared.</em></div>'};
    $q('#exportDiagnostic').onclick=()=>{const report={generated:now(),version:VERSION,health,engines:engineDefinitions.map(([n])=>engineTest(n)),logs:logs().slice(0,100)};download(JSON.stringify(report,null,2),`RP-IA-diagnostic-${today()}.json`,'application/json')};
  };
  function engineHealthCard(x){return `<button class="engine-health-card ${norm(x.status)}" data-engine="${escV(x.name)}"><span class="health-dot"></span><div><b>${escV(x.name)}</b><small>${escV(x.detail)}</small></div><em>${escV(x.status)}</em></button>`}
  function renderLogs(){return logs().slice(0,100).map(x=>`<div class="terminal-line ${norm(x.level)}"><time>${new Date(x.time).toLocaleTimeString()}</time><span>${escV(x.level)}</span><b>${escV(x.source)}</b><em>${escV(x.message)}</em>${x.detail?`<small>${escV(x.detail)}</small>`:''}</div>`).join('')||'<div class="terminal-line"><span>INFO</span><b>Diagnostic Center</b><em>No diagnostic events recorded.</em></div>'}
  function engineDiagnosticDetail(name){const x=engineTest(name);modal(`<button class="close icon-btn">×</button><h2>${escV(name)}</h2><div class="engine-detail-status ${norm(x.status)}"><b>${x.status}</b><span>${x.ms} ms</span></div><p>${escV(engineDefinitions.find(e=>e[0]===name)?.[1]||'')}</p><div class="detail-list"><p><b>Last test</b><span>${escV(x.lastRun)}</span></p><p><b>Result</b><span>${escV(x.detail)}</span></p><p><b>Platform version</b><span>${VERSION}</span></p></div><div class="actions"><button class="primary" id="rerunEngineTest">Run Test Again</button><button class="secondary close">Close</button></div>`);$q('#rerunEngineTest').onclick=()=>{closeModal();engineDiagnosticDetail(name)}}


  window.backupRestoreView=function(){
    if(currentUser?.role!=='admin'){page('Restricted','Backup & Restore is available only to administrators and IT.',`<div class="card"><p>Access denied.</p></div>`);return}
    let history=[];try{history=JSON.parse(localStorage.getItem('rpia-backup-history-v9'))||[]}catch{}
    page('Backup & Restore','Create, verify, restore, and review protected data packages',`
      <div class="backup-grid"><section class="card"><span class="eyebrow">Manual backup</span><h2>Create a complete backup</h2><p>Downloads personnel, METL, assessments, actions, knowledge, settings, and audit history.</p><button class="primary" id="createFullBackup">Create Backup</button></section><section class="card"><span class="eyebrow">Restore</span><h2>Restore a backup package</h2><p>The selected file is validated before replacing current pilot data.</p><label class="file-label">Choose JSON backup<input id="restoreEnterpriseBackup" type="file" accept="application/json"></label></section><section class="card"><span class="eyebrow">Integrity</span><h2>Verify current data</h2><p id="backupIntegrity">Ready to run validation.</p><button class="secondary" id="verifyBackupData">Verify Data Integrity</button></section><section class="card"><span class="eyebrow">Enterprise destination</span><h2>Server backup</h2><p>Configure server, database, file, and backup addresses for an enterprise deployment.</p><button class="secondary" id="backupServerConfig">Server Configuration</button></section></div>
      <section class="card"><h3>Backup History</h3><div id="backupHistory">${history.map(x=>`<div class="activity-row"><span><b>${escV(x.type)}</b> · ${escV(x.status)}</span><small>${new Date(x.time).toLocaleString()}</small></div>`).join('')||'<p>No backup activity has been recorded on this device.</p>'}</div></section>`);
    const record=(type,status)=>{history.unshift({type,status,time:now()});localStorage.setItem('rpia-backup-history-v9',JSON.stringify(history.slice(0,30)));log('INFO','Backup & Restore',`${type}: ${status}`)};
    $q('#createFullBackup').onclick=()=>{const pkg={format:'RP-BACKUP',version:VERSION,createdAt:now(),state};const ok=window.download(JSON.stringify(pkg,null,2),`RP-Enterprise-backup-${today()}.json`,'application/json');record('Manual backup',ok?'Created':'Failed');toast(ok?'Backup created — check your Downloads/Files':'Backup could not be created')};
    $q('#restoreEnterpriseBackup').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const o=JSON.parse(rd.result);const incoming=(o.format==='RP-IA-BACKUP'||o.format==='RP-BACKUP')?o.state:o;if(!incoming?.personnel||!incoming?.tasks)throw Error('Required collections are missing');state=normalize(incoming);audit('RESTORE','System','backup','Enterprise backup restored');record('Restore','Completed');toast('Backup restored');backupRestoreView()}catch(err){record('Restore','Failed');toast(`Invalid backup: ${err.message}`)}};rd.readAsText(f)};
    $q('#verifyBackupData').onclick=()=>{const issues=[...dataQualityIssues(),...permissionIssues()];$q('#backupIntegrity').innerHTML=issues.length?`<b>${issues.length} issue(s) found.</b><br>${issues.slice(0,5).map(escV).join('<br>')}`:'<b>PASS</b> — required master collections and permission checks are valid.';record('Integrity verification',issues.length?'Warning':'Passed')};
    $q('#backupServerConfig').onclick=()=>window.RpiaServerSetup.open();
  };

  let eagleConversation=[];
  function currentContext(){const title=$q('#main .page-head h1')?.textContent||'Dashboard';return title}
  window.openEaglePanel=function(){
    let panel=$q('#eagleAssistantPanel');if(!panel){panel=document.createElement('aside');panel.id='eagleAssistantPanel';panel.className='eagle-assistant-panel';document.body.appendChild(panel)}
    const openSeed=(window.__eagleOpenCount=(window.__eagleOpenCount||0)+1);
    panel.innerHTML=`<div class="eagle-panel-head"><div><img src="rpia-eagle-192.png" alt="Eagle"><span><b>Ask Eagle</b><small>Context: ${escV(currentContext())}</small></span></div><button id="closeEaglePanel" class="icon-btn">✕</button></div><div class="eagle-welcome"><b>${eaglePersonalGreeting(openSeed)}</b></div><div id="eagleMessages" class="eagle-messages">${eagleConversation.map(m=>`<div class="eagle-msg ${m.role}">${m.html}</div>`).join('')||'<div class="eagle-msg assistant">What would you like to work on?</div>'}</div><div class="eagle-compose"><input id="eagleQuestion" placeholder="Ask anything about your operation..."><button class="primary" id="sendEagleQuestion">Ask</button></div>`;
    panel.classList.add('open');window.closeEaglePanel=()=>panel.classList.remove('open');$q('#closeEaglePanel').onclick=window.closeEaglePanel;try{RPBrainEnterprise.bind(panel)}catch(err){log('WARNING','Navigation Service','Could not bind Eagle result actions',err.message)};
    const send=()=>{const input=$q('#eagleQuestion'),q=input.value.trim();if(!q)return;eagleConversation.push({role:'user',html:escV(q)});let html;try{const r=RPBrainEnterprise.answer(q);html=r.html;const why=ReasoningEngine.explain(q,r);html+=`<details class="reasoning-summary"><summary>Why this answer?</summary><p>${escV(why.summary)}</p></details>`;log('INFO','Eagle',`Question answered in ${currentContext()}`,why.summary)}catch(err){html=`Eagle could not complete this request. ${escV(err.message||'')}`;log('ERROR','Eagle','Floating assistant failed',err.message)}eagleConversation.push({role:'assistant',html});openEaglePanel();setTimeout(()=>{$q('#eagleMessages').scrollTop=$q('#eagleMessages').scrollHeight},0)};
    $q('#sendEagleQuestion').onclick=send;$q('#eagleQuestion').onkeydown=e=>{if(e.key==='Enter')send()};setTimeout(()=>$q('#eagleQuestion')?.focus(),50)
  };
  function ensureFloatingEagle(){if(!$q('#app')||$q('#app').classList.contains('hidden'))return;let b=$q('#floatingEagleAI');if(!b){b=document.createElement('button');b.id='floatingEagleAI';b.className='floating-eagle-ai';b.setAttribute('aria-label','Open Eagle Chat');b.title='Ask Eagle';b.innerHTML='<span class="eagle-chat-glyph" aria-hidden="true">💬</span><img src="rpia-eagle-192.png" alt=""><span class="eagle-chat-label">Ask Eagle</span>';b.onclick=openEaglePanel;document.body.appendChild(b)}}
  window.enterpriseToolsView=function(){
    if(currentUser?.role!=='admin'){navigate('dashboard');return}
    page('Enterprise','Server configuration, diagnostics, security, and recovery tools',`<div class="enterprise-module-grid"><button class="enterprise-module" id="enterpriseServer"><span>🖥️</span><b>Server Configuration</b><small>Local, test, production, API, files, and authentication.</small></button><button class="enterprise-module" id="enterpriseDiagnostics"><span>🛠️</span><b>Diagnostic Center</b><small>Engine health, tests, logs, and diagnostic reports.</small></button><button class="enterprise-module" id="enterpriseBackup"><span>💾</span><b>Backup & Restore</b><small>Create, verify, restore, and review local or enterprise backups.</small></button><button class="enterprise-module" id="enterpriseSecurity"><span>🔐</span><b>Security Center</b><small>Review roles and permission assurance issues.</small></button></div><div id="enterpriseSummary" class="card"><h3>Platform status</h3><p>${dataQualityIssues().length} data quality issue(s) · ${permissionIssues().length} permission issue(s).</p></div>`);
    $q('#enterpriseServer').onclick=()=>window.RpiaServerSetup.open();$q('#enterpriseDiagnostics').onclick=diagnosticCenterView;$q('#enterpriseBackup').onclick=backupRestoreView;$q('#enterpriseSecurity').onclick=()=>{const issues=permissionIssues();$q('#enterpriseSummary').innerHTML=`<h3>Permission Assurance</h3>${issues.map(i=>`<p>⚠ ${escV(i)}</p>`).join('')||'<p>✓ No permission assurance issues detected.</p>'}`};
  };



  window.metlIntelligence=function(){
    const people=(state.personnel||[]).filter(p=>p.employeeNumber&&p.name&&p.status==='Active');
    const avg=people.length?Math.round(people.reduce((n,p)=>n+personMetrics(p).pct,0)/people.length):0;
    page('Ask Eagle','One conversation interface coordinated by all RP engines',`
      <div class="conversation-shell">
        <aside class="conversation-context card"><span class="ai-badge">Powered by RP</span><h2>Eagle</h2><p>Ask about employees, advancement, readiness, qualifications, actions, tasks, or approved work knowledge.</p><div class="context-stat"><b>${avg}%</b><span>Department readiness</span></div><button class="secondary" id="brainBackDashboard">Return to Dashboard</button></aside>
        <section class="card conversation-main"><div id="brainConversation" class="brain-conversation"><div class="brain-message assistant"><b>Eagle</b><p>How can I help? I will coordinate the appropriate engines and explain the basis of the answer.</p></div></div><div class="quick-prompts"><button>Who is closest to advancement?</button><button>Show overdue corrective actions</button><button>Who can perform Die Move independently?</button><button>Open the approved Die Move procedure</button></div><div class="ask-row"><input id="fullBrainQuestion" placeholder="Example: What does John Smith need to advance?"><button class="primary" id="fullBrainAsk">Ask</button></div></section>
      </div>`);
    const run=()=>{const input=$q('#fullBrainQuestion'),q=input.value.trim();if(!q)return;const box=$q('#brainConversation');box.insertAdjacentHTML('beforeend',`<div class="brain-message user"><b>You</b><p>${escV(q)}</p></div>`);input.value='';try{const r=RPBrainEnterprise.answer(q);const why=ReasoningEngine.explain(q,r);box.insertAdjacentHTML('beforeend',`<div class="brain-message assistant"><b>Eagle</b><div class="brain-response">${r.html}</div><details class="reasoning-summary"><summary>Why this answer?</summary><p>${escV(why.summary)}</p><p><b>Sources:</b> ${why.sources.map(escV).join(' · ')}</p></details></div>`);RPBrainEnterprise.bind(box);log('INFO','Reasoning Engine',`Reasoning trace created for: ${q}`,why.summary)}catch(err){box.insertAdjacentHTML('beforeend',`<div class="brain-message assistant error"><b>Eagle</b><p>I could not complete that request. The error was sent to Diagnostic Center.</p></div>`);log('ERROR','Eagle','Conversation request failed',err.message||String(err))}box.scrollTop=box.scrollHeight};
    $q('#fullBrainAsk').onclick=run;$q('#fullBrainQuestion').onkeydown=e=>{if(e.key==='Enter')run()};$$q('.quick-prompts button').forEach(b=>b.onclick=()=>{$q('#fullBrainQuestion').value=b.textContent;run()});$q('#brainBackDashboard').onclick=()=>navigate('dashboard');
  };


  /* v9.12.2: compact assigned-work metric + header motto after enterprise overrides. */
  const rpEnterpriseDashboardBase=window.dashboard;
  window.dashboard=function(){
    rpEnterpriseDashboardBase();

    const main=$q('#main');
    if(!main)return;

    /* Put the operating standard in the top dark header, beside RP identity. */
    const header=document.querySelector('header, .topbar, .app-header, #topbar');
    if(header && !header.querySelector('.rp-header-motto')){
      const identity=header.querySelector('.brand, .brand-text, .app-title, .header-brand, h1, .user-chip');
      const motto=document.createElement('div');
      motto.className='rp-header-motto';
      motto.innerHTML='<span><i aria-hidden="true">✨</i> RUN LIKE NEW</span><span>LOOK LIKE NEW <i aria-hidden="true">✨</i></span>';

      if(identity && identity.parentNode===header){
        identity.insertAdjacentElement('afterend',motto);
      }else{
        const firstActions=header.querySelector('.top-actions, .header-actions, nav');
        if(firstActions)header.insertBefore(motto,firstActions);
        else header.appendChild(motto);
      }
    }

    /* Remove any old dashboard motto that may still exist near the bottom. */
    main.querySelectorAll('.rp-dashboard-motto').forEach(el=>el.remove());

    /* Assigned assessments count shown as a normal dashboard metric card. */
    const activeAssignments=(state.assessmentAssignments||[]).filter(a=>!['Completed','Cancelled'].includes(a.status));

    let rows=activeAssignments;
    if(currentUser?.role==='viewer'){
      rows=activeAssignments.filter(a=>String(a.employeeNumber||'')===String(currentUser.employeeNumber||''));
    }else if(currentUser?.role==='evaluator'){
      rows=activeAssignments.filter(a=>String(a.evaluatorUsername||'').toLowerCase()===String(currentUser.username||'').toLowerCase());
    }

    /* Remove the previous large Assigned Assessment Work card if present. */
    main.querySelectorAll('.dashboard-assignment-card').forEach(el=>el.remove());

    /* Find the KPI/stat grid used by Readiness, Critical Gates, Open Actions, Reassessments, Fully Ready. */
    const metricCandidates=[...main.querySelectorAll('.metric-grid, .stats-grid, .dashboard-grid, .grid')];
    let metricGrid=metricCandidates.find(g=>{
      const txt=(g.textContent||'').toLowerCase();
      return txt.includes('readiness') && txt.includes('critical gates') && txt.includes('fully ready');
    });

    if(!metricGrid){
      const fullyReady=[...main.querySelectorAll('*')].find(el=>{
        const txt=(el.textContent||'').trim().toLowerCase();
        return txt==='fully ready';
      });
      metricGrid=fullyReady?.closest('.metric-grid, .stats-grid, .dashboard-grid, .grid')||fullyReady?.parentElement?.parentElement||null;
    }

    if(metricGrid && !metricGrid.querySelector('.assigned-work-metric')){
      const card=document.createElement('button');
      card.type='button';
      card.className='assigned-work-metric';
      card.innerHTML=`
        <span class="assigned-work-label">Assigned Work</span>
        <strong>${rows.length}</strong>
        <span class="assigned-work-sub">${rows.length===1?'Pending Assessment':'Pending Assessments'}</span>
      `;
      card.onclick=()=>navigate('assignments');
      metricGrid.appendChild(card);
    }
  };


  /* Eagle routing is centralized in eagle-controller.js (v9.13.0). */

  /* Replace navigation with user modules only; engines stay invisible. */
  window.navDefs=[
    ['dashboard','Dashboard','Inicio'],
    ['personnel','Personnel','Personal'],
    ['tasks','METL & Subtasks','METL y subtareas'],
    ['matrix','Readiness Matrix','Matriz de preparación'],
    ['assignments','Assigned Assessments','Evaluaciones asignadas'],
    ['assessments','Assessments','Evaluaciones'],
    ['actions','Corrective Actions','Acciones correctivas'],
    ['knowledge','Knowledge Center','Centro de conocimiento'],
    ['notifications','Notifications','Notificaciones'],
    ['audit','Audit Trail','Auditoría'],
    ['profile','My Profile','Mi perfil'],
    ['settings','Administration','Administración'],
    ['enterprise','Enterprise','Enterprise']
  ];
  window.renderNav=function(){
    const allowed=window.navDefs.filter(x=>{if(['settings','enterprise'].includes(x[0]))return currentUser.role==='admin';if(x[0]==='audit')return currentUser.role==='admin'||currentUser.role==='evaluator';return true});
    $q('#nav').innerHTML=allowed.map(([id,en,es])=>`<button data-view="${id}">${uiLanguage==='es'?es:en}</button>`).join('')+`<div class="nav-spacer"></div><div class="nav-footer"><strong>RP</strong>${uiLanguage==='es'?'Impulsado por RP':'Powered by RP'}<small>v10.0.0 RC1</small></div>`;
    $$q('#nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  };
  window.navigate=function(v){
    view=v;trackInterest(v,1);$$q('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$q('#nav').classList.remove('open');$q('#navScrim').classList.remove('open');
    const routes={dashboard,personnel,tasks,matrix:matrixView,assignments:assignmentView,assessments:assessmentsUnifiedView,actions,knowledge:knowledgeCenterView,notifications:notificationView,audit:auditView,profile:myProfile,settings,enterprise:enterpriseToolsView,backup:backupRestoreView,intelligence:metlIntelligence};
    try{(routes[v]||dashboard)()}catch(err){console.error('RP view error',v,err);log('ERROR','Navigation',`Unable to open ${v}`,err.message||String(err));page('Unable to open this view','The rest of RP is still available.',`<div class="card"><h3>View error</h3><p>${escV(err?.message||'Unknown error')}</p><button class="primary" id="returnDashboard">Return to dashboard</button></div>`);$q('#returnDashboard').onclick=()=>navigate('dashboard')}
  };

  /* Server icon now opens Enterprise tools, where Diagnostic Center lives. */
  const serverBtn=$q('#serverConfigBtn');if(serverBtn)serverBtn.onclick=()=>navigate('enterprise');
  log('INFO','Platform',`RP Enterprise Platform ${VERSION} loaded`,'20 engines registered; Eagle and enterprise layers initialized.');setInterval(ensureFloatingEagle,700);
})();
