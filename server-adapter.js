class RpiaServerAdapter{
  constructor(config){this.config=config;this.kind='server';this.base=String(config.apiBaseUrl||'').replace(/\/$/,'')}
  async request(path,options={}){
    if(!this.base)throw new Error('API address is not configured');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Number(this.config.requestTimeoutMs)||15000);
    try{
      const headers={'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
      const response=await fetch(this.base+path,{...options,headers,credentials:'include',signal:controller.signal});
      const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch(e){data={message:text}}
      if(!response.ok)throw new Error(data?.message||`Server returned ${response.status}`);
      return data;
    }finally{clearTimeout(timer)}
  }
  async health(){return this.request('/health')}
  async read(key,fallback=null){try{return await this.request('/storage/'+encodeURIComponent(key))}catch(e){if(this.config.allowLocalFallback)return fallback;throw e}}
  async write(key,value){return this.request('/storage/'+encodeURIComponent(key),{method:'PUT',body:JSON.stringify({value})})}
  async remove(key){return this.request('/storage/'+encodeURIComponent(key),{method:'DELETE'})}
  async migrate(payload){return this.request('/migration/import',{method:'POST',body:JSON.stringify(payload)})}
}
window.RpiaServerAdapter=RpiaServerAdapter;
