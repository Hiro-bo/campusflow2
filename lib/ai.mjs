import { SYSTEM_PROMPT, PROMPT_VERSION, validateAI } from './flow.mjs';
import { safeTimeoutSignal } from './compat.mjs';

export function normalizeModel(m) {
  if (!m) return 'deepseek-flash';
  const lower = String(m).toLowerCase().trim();
  if (lower === 'v4.1flash' || lower === 'v4.1-flash' || lower === 'v4.1_flash' || lower === 'flash' || lower === 'deepseek-flash') {
    return 'deepseek-flash';
  }
  if (lower === 'v4-pro' || lower === 'v4pro' || lower === 'v4_pro' || lower === 'deepseek-v4-pro' || lower === 'pro') {
    return 'deepseek-v4-pro';
  }
  if (lower === 'chat' || lower === 'deepseek-chat') {
    return 'deepseek-chat';
  }
  if (lower === 'reasoner' || lower === 'r1' || lower === 'deepseek-reasoner') {
    return 'deepseek-reasoner';
  }
  return m;
}

export async function parseOnline({text,referenceDate,key,model,baseUrl},fetcher=fetch) {
  if(!key)throw new Error('AI_NOT_CONFIGURED');
  const targetModel = normalizeModel(model);
  const base = (baseUrl ? String(baseUrl).replace(/\/+$/, '') : 'https://api.deepseek.com');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const response=await fetcher(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.trim()}`},
    body:JSON.stringify({
      model:targetModel,
      messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify({referenceDate,timezone:'Asia/Shanghai',notice:text})}],
      response_format:{type:'json_object'},
      max_tokens:3500,
      temperature:0
    }),
    signal:safeTimeoutSignal(25000)
  });
  if(!response.ok)throw new Error(response.status===429?'AI_RATE_LIMIT':'AI_PROVIDER_ERROR');
  const body=await response.json();
  const choice=body.choices?.[0];
  if(choice?.finish_reason==='length')throw new Error('AI_TRUNCATED');
  const validated=validateAI(JSON.parse(choice?.message?.content||''),text,referenceDate);
  return {...validated,model:targetModel,promptVersion:PROMPT_VERSION};
}

export async function testDeepSeek({key,model,baseUrl},fetcher=fetch) {
  if(!key)throw new Error('AI_NOT_CONFIGURED');
  const targetModel = normalizeModel(model);
  const base = (baseUrl ? String(baseUrl).replace(/\/+$/, '') : 'https://api.deepseek.com');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const response=await fetcher(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.trim()}`},
    body:JSON.stringify({
      model:targetModel,
      messages:[{role:'user',content:'ping'}],
      max_tokens:5
    }),
    signal:safeTimeoutSignal(12000)
  });
  if(!response.ok) {
    const errorText = await response.text().catch(()=>'');
    throw new Error(response.status === 401 ? 'API_KEY_INVALID' : `DEEPSEEK_ERROR_${response.status}: ${errorText}`);
  }
  return {ok:true,model:targetModel};
}

