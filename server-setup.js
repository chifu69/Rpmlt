(function(){
 const $=s=>document.querySelector(s); const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 function formHtml(){const c=window.RPIA_CONFIG;return `<div class="setup-grid">
 <label>Environment<select id="cfgEnvironment"><option value="local">Local / Pilot</option><option value="test">Test</option><option value="production">Production</option></select></label>
 <label>Storage mode<select id="cfgStorage"><option value="local">Local device</option><option value="server">Company server</option></select></label>
 <label>API address<input id="cfgApi" type="url" placeholder="https://server.company.com/rpia/api" value="${esc(c.apiBaseUrl)}"></label>
 <label>Authentication<select id="cfgAuth"><option value="local">Local accounts</option><option value="entra">Microsoft Entra ID / SSO</option><option value="company">Company authentication</option></select></label>
 <label>File storage address<input id="cfgFiles" type="url" placeholder="https://server.company.com/rpia/files" value="${esc(c.fileStorageUrl)}"></label>
 <label>Backup address<input id="cfgBackup" type="url" placeholder="https://server.company.com/rpia/backups" value="${esc(c.backupUrl)}"></label>
 <label>Microsoft tenant ID<input id="cfgTenant" value="${esc(c.tenantId)}"></label>
 <label>Application / client ID<input id="cfgClient" value="${esc(c.clientId)}"></label>
 </div><div class="setup-actions"><button class="secondary" id="cfgTest">Test connection</button><button class="primary" id="cfgSave">Save configuration</button><button class="secondary" id="cfgMigrate">Migrate local pilot data</button></div><div id="cfgResult" class="connection-result">Not tested</div>
 <details><summary>Required server endpoints</summary><pre>GET  /health
GET  /storage/{key}
PUT  /storage/{key}
DELETE /storage/{key}
POST /migration/import</pre></details>`}
 function values(){return {...window.RPIA_CONFIG,environment:$('#cfgEnvironment').value,storageMode:$('#cfgStorage').value,apiBaseUrl:$('#cfgApi').value.trim(),authenticationMode:$('#cfgAuth').value,fileStorageUrl:$('#cfgFiles').value.trim(),backupUrl:$('#cfgBackup').value.trim(),tenantId:$('#cfgTenant').value.trim(),clientId:$('#cfgClient').value.trim()}}
 function mount(target){target.innerHTML=formHtml();const c=window.RPIA_CONFIG;$('#cfgEnvironment').value=c.environment;$('#cfgStorage').value=c.storageMode;$('#cfgAuth').value=c.authenticationMode;
 $('#cfgSave').onclick=()=>{const c=window.saveRpiaConfig(values());window.RPIA_DATA.configure(c);$('#cfgResult').className='connection-result ok';$('#cfgResult').textContent='Configuration saved. Reload RP IA to apply it everywhere.'};
 $('#cfgTest').onclick=async()=>{const btn=$('#cfgTest'),r=$('#cfgResult');btn.disabled=true;r.className='connection-result';r.textContent='Testing connection…';try{const temp=values(),svc=new (window.RPIA_DATA.constructor)(temp),result=await svc.health();r.className='connection-result ok';r.textContent=`Connected: ${result.message||result.status||result.mode||'Server is ready'}`}catch(e){r.className='connection-result bad';r.textContent='Connection failed: '+e.message}finally{btn.disabled=false}};
 $('#cfgMigrate').onclick=async()=>{if(!confirm('Send the current local pilot records to the configured company server?'))return;const c=window.saveRpiaConfig(values());window.RPIA_DATA.configure(c);const r=$('#cfgResult');r.textContent='Migrating local data…';try{await window.RPIA_DATA.migrateLocalToServer(['k1-metl-v30-data','k1-metl-v30-auth','rpia-language-v1']);r.className='connection-result ok';r.textContent='Migration completed successfully.'}catch(e){r.className='connection-result bad';r.textContent='Migration failed: '+e.message}};
 }
 window.RpiaServerSetup={mount,open(){let m=document.getElementById('serverSetupModal');if(!m){m=document.createElement('div');m.id='serverSetupModal';m.className='modal';m.innerHTML='<div class="modal-card setup-card"><div class="setup-title"><div><h2>RP IA Server Configuration</h2><p>Connect the pilot to company infrastructure without changing application code.</p></div><button class="icon-btn" id="closeServerSetup">✕</button></div><div id="serverSetupBody"></div></div>';document.body.appendChild(m);$('#closeServerSetup').onclick=()=>m.remove()}mount($('#serverSetupBody'))}}
})();
