class RpiaLocalAdapter{
  constructor(options={}){this.options=options;this.kind='local'}
  async health(){return {ok:true,mode:'local',message:'Local pilot storage is ready',time:new Date().toISOString()}}
  async read(key,fallback=null){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}catch(e){return fallback}}
  async write(key,value){localStorage.setItem(key,JSON.stringify(value));return {ok:true}}
  async remove(key){localStorage.removeItem(key);return {ok:true}}
  async exportAll(keys){const out={exportedAt:new Date().toISOString(),mode:'local',records:{}};for(const k of keys)out.records[k]=await this.read(k,null);return out}
}
window.RpiaLocalAdapter=RpiaLocalAdapter;
