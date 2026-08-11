(function(){
  const defaults={
    version:'10.0.1-rc1',
    environment:'local',
    storageMode:'local',
    apiBaseUrl:'',
    authenticationMode:'local',
    fileStorageUrl:'',
    backupUrl:'',
    requestTimeoutMs:15000,
    tenantId:'',
    clientId:'',
    allowLocalFallback:true
  };
  let saved={};
  try{saved=JSON.parse(localStorage.getItem('rpia-enterprise-config-v1')||'{}')}catch(e){}
  window.RPIA_CONFIG=Object.freeze({...defaults,...saved});
  window.RPIA_CONFIG_DEFAULTS=defaults;
  window.saveRpiaConfig=function(next){
    const clean={...defaults,...next};
    localStorage.setItem('rpia-enterprise-config-v1',JSON.stringify(clean));
    window.RPIA_CONFIG=Object.freeze(clean);
    return clean;
  };
})();
