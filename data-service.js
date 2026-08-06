(function(){
  class RpiaDataService{
    constructor(config){this.configure(config)}
    configure(config){this.config=config||window.RPIA_CONFIG;this.adapter=this.config.storageMode==='server'?new window.RpiaServerAdapter(this.config):new window.RpiaLocalAdapter(this.config);return this}
    get mode(){return this.adapter.kind}
    health(){return this.adapter.health()}
    read(k,f){return this.adapter.read(k,f)}
    write(k,v){return this.adapter.write(k,v)}
    remove(k){return this.adapter.remove(k)}
    async exportLocal(keys){return new window.RpiaLocalAdapter().exportAll(keys)}
    async migrateLocalToServer(keys){if(this.config.storageMode!=='server')throw new Error('Select Company Server first');const payload=await this.exportLocal(keys);return this.adapter.migrate(payload)}
  }
  window.RPIA_DATA=new RpiaDataService(window.RPIA_CONFIG);
})();
