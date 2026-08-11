/* RP Enterprise Competency Platform v7.0 */
(function(){
  const E=window.RPIAEnterprise={version:'7.0.0'};
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rank={'-10':10,'-20':20,'-30':30,'-40':40};
  const todayISO=()=>new Date().toISOString().slice(0,10);
  const userKey=()=>window.currentUser?.username||'anonymous';
  const getCtx=()=>{try{return JSON.parse(sessionStorage.getItem('rpia-nle-'+userKey()))||{}}catch{return{}}};
  const setCtx=c=>sessionStorage.setItem('rpia-nle-'+userKey(),JSON.stringify(c));
  const activePeople=()=>state.personnel.filter(p=>p.employeeNumber&&p.name&&p.status==='Active');
  const personByText=q=>{
    const nq=norm(q), exactNum=activePeople().find(p=>nq.split(/\s+/).includes(norm(p.employeeNumber)));
    if(exactNum)return exactNum;
    const candidates=activePeople().map(p=>({p,score:(nq.includes(norm(p.name))?100:0)+(nq.includes(norm(p.name.split(' ')[0]))?50:0)+(nq.includes(norm(p.name.split(' ').slice(-1)[0]))?35:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    return candidates[0]?.p||null;
  };
  const latestFor=emp=>latestResults(emp);
  const nextLevel=lv=>({'-10':'-20','-20':'-30','-30':'-40','-40':null}[lv]||'-10');

  window.NaturalLanguageEngine={
    parse(q){
      const text=norm(q),ctx=getCtx();
      const person=personByText(q)||(ctx.employeeNumber?state.personnel.find(p=>p.employeeNumber===ctx.employeeNumber):null);
      const shift=(text.match(/(?:shift|turno)\s*([abcd])\b/)||[])[1]?.toUpperCase()||ctx.shift||'';
      let intent='general';
      if(/how|como|procedure|procedimiento|instruction|instruccion|die move|startup|shutdown|screen pack|knowledge|article|wiki/.test(text))intent='knowledge';
      if(/advance|promotion|promocion|next level|siguiente nivel|need|falta|gap|brecha/.test(text)&&person)intent='advancement';
      else if(/overdue|vencid|open action|corrective action|accion correctiva/.test(text))intent='actions';
      else if(/critical gate|falla critica|critical failure/.test(text))intent='critical';
      else if(/who can|quien puede|qualified|calificado|independent/.test(text))intent='qualified';
      else if(/compare|comparar|weakest|strongest|mas fuerte|mas debil|readiness|preparacion/.test(text))intent='shift';
      else if(person)intent='person';
      return{intent,text,person,shift,ctx};
    }
  };

  window.CompetencyCoachEngine={
    profile(person){
      const m=window.RulesEngine.qualificationSummary(state,person),target=nextLevel(person.assignedLevel),latest=latestFor(person.employeeNumber);
      const targetRank=target?rank[target]:rank[person.assignedLevel];
      const required=state.subtasks.filter(s=>s.status==='Active'&&rank[s.requiredLevel]<=targetRank);
      const gaps=required.filter(s=>latest.get(person.employeeNumber+'|'+s.id)?.result!=='GO');
      const actions=state.actions.filter(a=>a.employeeNumber===person.employeeNumber&&a.status!=='Closed');
      const positive=m.pct>=80?'Excellent progress—keep the momentum going.':m.pct>=40?'Steady progress. Focused practice can move this forward quickly.':'A strong training plan can build momentum from here.';
      return{person,metrics:m,target,gaps,actions,message:positive,recommended:gaps.slice(0,5)};
    }
  };

  window.ExperienceEngine={
    patterns(){
      const stats={};
      for(const r of state.results||[]){const k=r.subtaskId||r.taskId||'Unknown';stats[k]=stats[k]||{id:k,total:0,nogo:0,assist:0,go:0};stats[k].total++;if(r.result==='GO')stats[k].go++;else if(r.result==='NO-GO')stats[k].nogo++;else if(r.result==='REQUIRES ASSISTANCE')stats[k].assist++;}
      return Object.values(stats).map(x=>({...x,challengeRate:x.total?Math.round((x.nogo+x.assist)/x.total*100):0})).filter(x=>x.total>0).sort((a,b)=>b.challengeRate-a.challengeRate||b.total-a.total);
    },
    summary(){const p=this.patterns()[0];return p?`${p.id} currently has the highest observed challenge rate (${p.challengeRate}% across ${p.total} recorded result${p.total===1?'':'s'}).`:'More assessment history is needed before reliable experience patterns can be identified.'}
  };

  window.EvidenceEngine={
    ensure(){state.evidence=state.evidence||[];return state.evidence},
    add(record){const x={id:'EV-'+Date.now(),createdAt:new Date().toISOString(),createdBy:currentUser?.name||'System',...record};this.ensure().unshift(x);AuditEngine.record(state,currentUser,'CREATE','Evidence',x.id,'Evidence attached',null,x);return x},
    forEntity(type,id){return this.ensure().filter(x=>x.entityType===type&&x.entityId===id)}
  };

  window.CertificationEngine={
    ensure(){state.certifications=state.certifications||[];return state.certifications},
    status(){const now=todayISO();return this.ensure().map(c=>({...c,computedStatus:c.expirationDate&&c.expirationDate<now?'Expired':c.status||'Valid'}))},
    expiring(days=45){const cutoff=new Date(Date.now()+days*86400000).toISOString().slice(0,10);return this.status().filter(c=>c.computedStatus!=='Expired'&&c.expirationDate&&c.expirationDate<=cutoff)}
  };

  function knowledgeHits(q){
    const terms=norm(q).split(/\s+/).filter(x=>x.length>2&&!['how','what','does','need','como','hacer','para','the','una','this'].includes(x));
    return (state.knowledge||[]).map(a=>{const hay=norm(`${a.title} ${a.summary} ${a.content} ${(a.tags||[]).join(' ')}`);const score=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0)+(hay.includes(norm(q))?5:0);return{a,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  }
  const oldKnowledgeSearch=KnowledgeEngine.search;
  KnowledgeEngine.search=(s,q)=>knowledgeHits(q).map(x=>({type:'knowledge',id:x.a.id,title:x.a.title,meta:`${x.a.status} · ${x.a.category||'Article'}`}));
  KnowledgeEngine.answer=(s,q)=>{
    const hits=knowledgeHits(q);if(!hits.length)return{found:false,text:'I could not find a matching approved company knowledge article. Try a task name, equipment name, or article keyword.'};
    const approved=hits.find(x=>x.a.status==='Approved');
    if(!approved)return{found:false,text:`I found “${hits[0].a.title},” but it is ${hits[0].a.status||'not approved'} and cannot be used as an operational instruction.`};
    const a=approved.a;return{found:true,article:a,text:a.summary||a.content||'Open the full approved article for details.'};
  };

  function advancementAnswer(person){
    const c=CompetencyCoachEngine.profile(person),target=c.target;
    const lines=[`<h3>${escHtml(person.name)}</h3>`,`<p><b>Current assigned level:</b> ${escHtml(person.assignedLevel)} · <b>Highest fully qualified:</b> ${escHtml(c.metrics.highestFullyQualified)}</p>`];
    if(!target){lines.push('<p>This associate is already assigned to the highest level. Focus on maintaining qualifications, cross-training, and leadership development.</p>');return lines.join('')}
    lines.push(`<p><b>Path to ${target}:</b> ${c.gaps.length} requirement${c.gaps.length===1?'':'s'} remain based on current records.</p>`);
    if(c.actions.length)lines.push(`<p class="callout-warn"><b>${c.actions.length} open corrective action${c.actions.length===1?'':'s'}</b> should be addressed before advancement review.</p>`);
    lines.push(`<p>${escHtml(c.message)}</p><ol>${c.recommended.map(x=>`<li><b>${escHtml(x.id)}</b> — ${escHtml(x.name)}</li>`).join('')||'<li>Maintain current qualifications and request formal advancement review.</li>'}</ol>`);
    lines.push(`<button class="secondary rp-open-person" data-emp="${escHtml(person.employeeNumber)}">Open employee profile</button>`);return lines.join('');
  }

  window.RPBrainEnterprise={
    answer(q){
      const p=NaturalLanguageEngine.parse(q),ctx=p.ctx;let html='';
      if(p.person){ctx.employeeNumber=p.person.employeeNumber}if(p.shift)ctx.shift=p.shift;ctx.lastIntent=p.intent;setCtx(ctx);
      if(p.intent==='advancement')html=advancementAnswer(p.person);
      else if(p.intent==='knowledge'){
        const k=KnowledgeEngine.answer(state,q);html=k.found?`<h3>${escHtml(k.article.title)}</h3><p>${escHtml(k.text)}</p><p><small>Approved company knowledge · Version ${escHtml(k.article.version||'1.0')}</small></p><button class="secondary rp-open-knowledge" data-id="${escHtml(k.article.id)}">Open full article</button>`:`<p>${escHtml(k.text)}</p><button class="secondary" onclick="navigate('knowledge')">Search Knowledge Center</button>`;
      }else if(p.intent==='actions'){
        const list=state.actions.filter(a=>a.status!=='Closed'&&(!/overdue|vencid/.test(p.text)||a.targetDate&&a.targetDate<todayISO()));html=`<h3>${list.length} matching corrective action${list.length===1?'':'s'}</h3>${list.slice(0,8).map(a=>`<button class="list-link rp-open-action" data-id="${escHtml(a.id)}"><span><b>${escHtml(a.employee||a.employeeNumber)}</b><small>${escHtml(a.taskId)} / ${escHtml(a.subtaskId)} · Due ${escHtml(a.targetDate||'not set')}</small></span><span class="pill warn">${escHtml(a.status)}</span></button>`).join('')||'<p>No matching open actions.</p>'}`;
      }else if(p.intent==='critical'){
        const rows=(state.results||[]).filter(r=>r.criticality==='Critical Gate'&&r.result!=='GO'&&r.result!=='NOT EVALUATED');html=`<h3>${rows.length} Critical Gate issue${rows.length===1?'':'s'}</h3>${rows.slice(0,10).map(r=>`<p><b>${escHtml(r.associateName||r.employeeNumber)}</b> — ${escHtml(r.subtaskId)} · ${escHtml(r.result)}</p>`).join('')||'<p>No Critical Gate failures are currently recorded.</p>'}`;
      }else if(p.intent==='qualified'){
        const terms=p.text.replace(/who can|quien puede|qualified|calificado|independently|independent/g,'').trim();const sub=state.subtasks.find(s=>norm(`${s.id} ${s.name}`).includes(terms))||state.subtasks.find(s=>terms.split(/\s+/).some(t=>t.length>3&&norm(s.name).includes(t)));if(!sub)html='<p>Specify a task or subtask, for example: “Who can perform Die Move independently?”</p>';else{const people=activePeople().filter(person=>latestFor(person.employeeNumber).get(person.employeeNumber+'|'+sub.id)?.result==='GO');html=`<h3>${escHtml(sub.name)}</h3><p>${people.length} associate${people.length===1?' is':'s are'} currently recorded as GO.</p>${people.map(x=>`<button class="list-link rp-open-person" data-emp="${x.employeeNumber}"><span><b>${escHtml(x.name)}</b><small>${x.shift} Shift · ${x.assignedLevel}</small></span></button>`).join('')}`}
      }else if(p.intent==='shift'){
        const shifts=['A','B','C','D'].map(sh=>{const ps=activePeople().filter(x=>x.shift===sh),avg=ps.length?Math.round(ps.reduce((n,x)=>n+personMetrics(x).pct,0)/ps.length):0;return{sh,avg,count:ps.length}});html='<h3>Shift readiness</h3>'+shifts.map(x=>`<p><b>${x.sh} Shift:</b> ${x.avg}% across ${x.count} active associates</p>`).join('');
      }else if(p.person){const c=CompetencyCoachEngine.profile(p.person);html=`<h3>${escHtml(p.person.name)}</h3><p>Readiness ${c.metrics.pct}% · Highest fully qualified ${escHtml(c.metrics.highestFullyQualified)} · ${c.actions.length} open actions.</p><p>${escHtml(c.message)}</p><button class="secondary rp-open-person" data-emp="${p.person.employeeNumber}">Open employee profile</button>`}
      else{const k=KnowledgeEngine.answer(state,q);if(k.found)html=`<h3>${escHtml(k.article.title)}</h3><p>${escHtml(k.text)}</p>`;else{const hits=SearchEngine.searchAll(state,q);html=hits.length?`<h3>${hits.length} matching records</h3>${hits.slice(0,8).map(x=>`<p><b>${escHtml(x.title)}</b><br><small>${escHtml(x.meta||x.type)}</small></p>`).join('')}`:`<p>I did not find a confident match. Try an employee name or number, task, subtask, corrective action, or Knowledge Center article.</p>`}}
      return{html,intent:p.intent};
    },
    bind(container=document){const leaveAssistant=()=>{if(window.closeEaglePanel)window.closeEaglePanel()};container.querySelectorAll('.rp-open-person').forEach(b=>b.onclick=()=>{const emp=String(b.dataset.emp||'').trim();leaveAssistant();setTimeout(()=>{if(window.openEmployeeProfile)window.openEmployeeProfile(emp);else personDetail(emp)},40)});container.querySelectorAll('.rp-open-action').forEach(b=>b.onclick=()=>{leaveAssistant();setTimeout(()=>actionDetail(b.dataset.id),0)});container.querySelectorAll('.rp-open-knowledge').forEach(b=>b.onclick=()=>{leaveAssistant();setTimeout(()=>knowledgeArticleDetail(b.dataset.id),0)});}
  };

  window.answerMetl=function(q){const r=RPBrainEnterprise.answer(q);const temp=document.createElement('div');temp.innerHTML=r.html;return temp.textContent.trim()};

  window.knowledgeArticleDetail=function(id){const a=(state.knowledge||[]).find(x=>x.id===id);if(!a)return toast('Knowledge article not found');modal(`<h2>${escHtml(a.title)}</h2><p><span class="pill ${a.status==='Approved'?'go':'warn'}">${escHtml(a.status||'Draft')}</span> · Version ${escHtml(a.version||'1.0')}</p><div class="knowledge-body">${escHtml(a.content||a.summary||'').replace(/\n/g,'<br>')}</div><p><small>Owner: ${escHtml(a.owner||'Not assigned')} · Review: ${escHtml(a.reviewDate||'Not set')}</small></p><div class="actions">${canManageMetl()?'<button class="secondary" id="editKnowledgeArticle">Edit article</button>':''}<button class="secondary close">Close</button></div>`);if($('#editKnowledgeArticle'))$('#editKnowledgeArticle').onclick=()=>editKnowledgeArticle(id)};
  window.editKnowledgeArticle=function(id){const a=(state.knowledge||[]).find(x=>x.id===id)||{id:'KB-'+Date.now(),title:'',category:'Procedure',summary:'',content:'',tags:[],status:'Draft',version:'1.0',owner:currentUser.name,reviewDate:''};const isNew=!state.knowledge?.some(x=>x.id===id);modal(`<h2>${isNew?'New':'Edit'} Knowledge Article</h2><div class="form-grid"><label class="full">Title<input id="kbTitle" value="${escHtml(a.title)}"></label><label>Category<select id="kbCategory">${['Procedure','Standard Work','Troubleshooting','Training','Lesson Learned','Equipment'].map(x=>`<option ${a.category===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Status<select id="kbStatus">${['Draft','Approved','Inactive'].map(x=>`<option ${a.status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Version<input id="kbVersion" value="${escHtml(a.version||'1.0')}"></label><label>Review date<input id="kbReview" type="date" value="${escHtml(a.reviewDate||'')}"></label><label class="full">Summary<textarea id="kbSummary" rows="3">${escHtml(a.summary||'')}</textarea></label><label class="full">Full instructions / content<textarea id="kbContent" rows="10">${escHtml(a.content||'')}</textarea></label><label class="full">Search tags (comma separated)<input id="kbTags" value="${escHtml((a.tags||[]).join(', '))}"></label></div><div class="actions"><button class="primary" id="saveKnowledgeArticle">Save article</button><button class="secondary close">Cancel</button></div>`);$('#saveKnowledgeArticle').onclick=()=>{const title=$('#kbTitle').value.trim();if(!title)return toast('Title is required');const before=isNew?null:clone(a);Object.assign(a,{title,category:$('#kbCategory').value,status:$('#kbStatus').value,version:$('#kbVersion').value||'1.0',reviewDate:$('#kbReview').value,summary:$('#kbSummary').value,content:$('#kbContent').value,tags:$('#kbTags').value.split(',').map(x=>x.trim()).filter(Boolean),owner:a.owner||currentUser.name,updatedAt:new Date().toISOString()});state.knowledge=state.knowledge||[];if(isNew)state.knowledge.unshift(a);AuditEngine.record(state,currentUser,isNew?'CREATE':'UPDATE','Knowledge Article',a.id,isNew?'Article created':'Article updated',before,a);closeModal();knowledgeCenterView()}};

  window.knowledgeCenterView=function(){state.knowledge=state.knowledge||[];page('Knowledge Center','Approved company procedures, standard work, training, troubleshooting, and lessons learned',`<div class="card"><div class="search-toolbar"><input id="knowledgeSearch" placeholder="Search articles, procedures, equipment, or keywords"><select id="knowledgeStatus"><option value="">All statuses</option><option>Approved</option><option>Draft</option><option>Inactive</option></select>${canManageMetl()?'<button class="primary" id="newKnowledgeArticle">New Article</button>':''}</div><div id="knowledgeList"></div></div>`);const draw=()=>{const q=norm($('#knowledgeSearch').value),st=$('#knowledgeStatus').value;const rows=state.knowledge.filter(a=>(!st||a.status===st)&&(!q||norm(`${a.title} ${a.summary} ${a.content} ${(a.tags||[]).join(' ')}`).includes(q)));$('#knowledgeList').innerHTML=rows.map(a=>`<button class="list-link knowledge-row" data-id="${escHtml(a.id)}"><span><b>${escHtml(a.title)}</b><small>${escHtml(a.category||'Article')} · Version ${escHtml(a.version||'1.0')} · ${escHtml(a.summary||'No summary')}</small></span><span class="pill ${a.status==='Approved'?'go':a.status==='Inactive'?'ne':'warn'}">${escHtml(a.status||'Draft')}</span></button>`).join('')||'<p>No matching knowledge articles.</p>';$$('.knowledge-row').forEach(b=>b.onclick=()=>knowledgeArticleDetail(b.dataset.id))};$('#knowledgeSearch').oninput=draw;$('#knowledgeStatus').onchange=draw;if($('#newKnowledgeArticle'))$('#newKnowledgeArticle').onclick=()=>editKnowledgeArticle('KB-'+Date.now());draw()};

  window.plantIntelligenceView=function(){const people=activePeople(),metrics=people.map(p=>({...p,...personMetrics(p)})),open=state.actions.filter(a=>a.status!=='Closed'),overdue=open.filter(a=>a.targetDate&&a.targetDate<todayISO()),critical=(state.results||[]).filter(r=>r.criticality==='Critical Gate'&&r.result!=='GO'&&r.result!=='NOT EVALUATED'),exp=CertificationEngine.expiring(),patterns=ExperienceEngine.patterns().slice(0,5);const shiftRows=['A','B','C','D'].map(sh=>{const rows=metrics.filter(x=>x.shift===sh);return{sh,pct:rows.length?Math.round(rows.reduce((n,x)=>n+x.pct,0)/rows.length):0,count:rows.length}});page('Plant Intelligence Dashboard','A decision-support view combining readiness, workflows, risk, experience, and development',`<div class="kpis clickable-kpis"><button class="kpi metric-link" data-target="active"><b>${people.length}</b><span>Active associates</span></button><button class="kpi warn metric-link" data-target="open"><b>${open.length}</b><span>Open actions</span></button><button class="kpi bad metric-link" data-target="overdue"><b>${overdue.length}</b><span>Overdue actions</span></button><button class="kpi bad metric-link" data-target="critical"><b>${critical.length}</b><span>Critical Gate issues</span></button><button class="kpi warn"><b>${exp.length}</b><span>Expiring certifications</span></button></div><div class="grid"><div class="card"><h3>Shift readiness</h3>${shiftRows.map(x=>`<div class="progress-row"><span>${x.sh} Shift</span><div class="progress"><i style="width:${x.pct}%"></i></div><b>${x.pct}%</b></div>`).join('')}</div><div class="card"><h3>Eagle recommendation</h3><p>${escHtml(ExperienceEngine.summary())}</p><p>${overdue.length?`Resolve ${overdue.length} overdue action${overdue.length===1?'':'s'} first to protect qualification readiness.`:'No overdue corrective actions are currently recorded.'}</p><button class="secondary" id="openBrainFromPlant">Ask Eagle</button></div><div class="card full"><h3>Experience patterns</h3>${patterns.map(x=>`<div class="pattern-row"><b>${escHtml(x.id)}</b><span>${x.challengeRate}% challenge rate</span><small>${x.total} recorded results</small></div>`).join('')||'<p>More assessment history is needed.</p>'}</div></div>`);$$('.metric-link').forEach(b=>b.onclick=()=>{const t=b.dataset.target;if(t==='active')personnel();else{navigate('actions');setTimeout(()=>{const f=$('#actionStatus');if(f){f.value=t==='open'?'Open':'';f.dispatchEvent(new Event('change'))}},0)}});$('#openBrainFromPlant').onclick=()=>navigate('intelligence')};

  const oldDashboard=window.dashboard;
  window.dashboard=function(){oldDashboard();setTimeout(()=>{document.querySelectorAll('.kpi').forEach(k=>k.setAttribute('role','button'));const cards=[...document.querySelectorAll('.kpi')];cards.forEach(k=>{const label=norm(k.textContent);if(label.includes('active associates'))k.onclick=()=>personnel();if(label.includes('open actions'))k.onclick=()=>{if(state.actions.filter(a=>a.status!=='Closed').length===1)actionDetail(state.actions.find(a=>a.status!=='Closed').id);else navigate('actions')};if(label.includes('critical failures'))k.onclick=()=>navigate('plant')})},0)};

  window.metlIntelligence=function(){const all=activePeople(),avg=all.length?Math.round(all.reduce((n,p)=>n+personMetrics(p).pct,0)/all.length):0;page('Eagle','Powered by RP',`<div class="ai-hero"><div><span class="ai-badge">Powered by RP</span><h2>Readiness advisor</h2><p>Ask about employees, advancement, tasks, corrective actions, shifts, qualifications, or approved company knowledge.</p></div><div class="ai-score"><b>${avg}%</b><span>department readiness</span></div></div><div class="card full brain-ask-first"><h3>Ask Eagle</h3><div class="ask-row"><input id="aiQuestion" placeholder="Example: What does John Smith need to advance?"><button id="askAi" class="primary">Analyze</button></div><div class="quick-prompts"><button>What does John Smith need to advance?</button><button>Show overdue corrective actions</button><button>Who can perform Die Move independently?</button><button>How do I perform a die move?</button></div><div id="aiAnswer" class="ai-answer">Ask in natural language. Eagle keeps the current conversation context.</div></div><div class="grid"><div class="card"><h3>Competency Coach</h3><p>Positive, role-aware development guidance for each employee.</p><button class="secondary" id="openPersonnelCoach">Open personnel</button></div><div class="card"><h3>Knowledge Center</h3><p>${(state.knowledge||[]).filter(a=>a.status==='Approved').length} approved article${(state.knowledge||[]).filter(a=>a.status==='Approved').length===1?'':'s'} available to Eagle.</p><button class="secondary" id="openKnowledgeFromBrain">Open Knowledge Center</button></div><div class="card full"><h3>Experience Engine</h3><p>${escHtml(ExperienceEngine.summary())}</p></div></div>`);const run=()=>{const q=$('#aiQuestion').value.trim();if(!q)return;const r=RPBrainEnterprise.answer(q);$('#aiAnswer').innerHTML=r.html;RPBrainEnterprise.bind($('#aiAnswer'));trackInterest(r.intent,3)};$('#askAi').onclick=run;$('#aiQuestion').onkeydown=e=>{if(e.key==='Enter')run()};$$('.quick-prompts button').forEach(b=>b.onclick=()=>{$('#aiQuestion').value=b.textContent;run()});$('#openPersonnelCoach').onclick=()=>navigate('personnel');$('#openKnowledgeFromBrain').onclick=()=>navigate('knowledge')};

  const oldEngineCenter=window.engineCenterView;
  window.engineCenterView=function(){page('Engine Center','Status and responsibilities of the RP enterprise competency platform',`<div class="engine-grid">${[
    ['Eagle','Analyzes, converses, explains, and recommends'],['Natural Language Engine','Understands intent, entities, and conversational context'],['Workflow Engine','Executes corrective-action, reassessment, and approval processes'],['Rules Engine','Applies levels, authority, Critical Gates, evidence, and blocking rules'],['Knowledge Engine','Connects approved procedures, training, and lessons learned'],['Predictive Engine','Detects readiness trends and future coverage risks'],['Search Engine','Finds personnel, tasks, records, actions, and knowledge'],['Audit Engine','Preserves complete change traceability'],['Competency Coach Engine','Motivates employees and recommends next development steps'],['Experience Engine','Learns recurring patterns from plant assessment history'],['Evidence Engine','Organizes assessment and qualification evidence'],['Certification Engine','Tracks supporting certifications and expirations']
  ].map(([n,d])=>`<div class="card engine-card"><span class="engine-dot"></span><h3>${n}</h3><p>${d}</p><small>Operational foundation · v7.0</small></div>`).join('')}</div><div class="card"><h3>Enterprise search</h3><div class="ask-row"><input id="engineSearch" placeholder="Search any employee number, name, task, action, or article"><button class="primary" id="runEngineSearch">Search</button></div><div id="engineResults"></div></div>`);const run=()=>{const hits=SearchEngine.searchAll(state,$('#engineSearch').value);$('#engineResults').innerHTML=hits.slice(0,20).map(x=>`<p><b>${escHtml(x.title)}</b><br><small>${escHtml(x.meta||x.type)}</small></p>`).join('')||'<p>No matching records.</p>'};$('#runEngineSearch').onclick=run;$('#engineSearch').onkeydown=e=>{if(e.key==='Enter')run()}};
})();
