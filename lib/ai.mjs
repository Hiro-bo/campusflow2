import { SYSTEM_PROMPT, PROMPT_VERSION, validateAI } from './flow.mjs';
export async function parseOnline({text,referenceDate,key,model},fetcher=fetch) {
  if(!key)throw new Error('AI_NOT_CONFIGURED');
  const response=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:model||'deepseek-flash',messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({referenceDate,timezone:'Asia/Shanghai',notice:text})}],response_format:{type:'json_object'},max_tokens:3500,temperature:0}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(response.status===429?'AI_RATE_LIMIT':'AI_PROVIDER_ERROR');
  const body=await response.json();const choice=body.choices?.[0];
  if(choice?.finish_reason==='length')throw new Error('AI_TRUNCATED');
  const validated=validateAI(JSON.parse(choice?.message?.content||''),text,referenceDate);
  return {...validated,model:model||'deepseek-flash',promptVersion:PROMPT_VERSION};
}
