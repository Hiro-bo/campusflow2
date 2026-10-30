const keys=['cf-deepseek-key','cf-deepseek-remember','cf-deepseek-model','cf-deepseek-url'];
export function readAIConfig(storage){
 const value=storage.getItem(keys[0])||'';
 const remember=storage.getItem(keys[1])==='true';
 return {key:remember?value:'',remember,legacy:!!value&&!remember};
}
export function clearAIConfig(storage){return keys.map(k=>storage.removeItem(k)).every(Boolean);}
export function loadLegacyKey(storage){const value=storage.getItem(keys[0])||'';storage.removeItem(keys[0]);storage.removeItem(keys[1]);return value;}
export function saveAIConfig(storage,{key,model,url,remember}){
 const ok=remember&&key.trim()?storage.setItem(keys[0],key.trim()):storage.removeItem(keys[0]);
 const flag=remember&&key.trim()?storage.setItem(keys[1],'true'):storage.removeItem(keys[1]);
 const modelOK=storage.setItem(keys[2],model);
 const urlOK=storage.setItem(keys[3],url.trim()||'https://api.deepseek.com');
 return ok&&flag&&modelOK&&urlOK;
}
