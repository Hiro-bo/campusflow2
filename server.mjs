// 一个服务同时提供网页与 AI API。密钥只在这里读取，不会打包到浏览器。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer,loadEnv} from 'vite';
import {parseOnline, testDeepSeek} from './lib/ai.mjs';
import {validDate} from './lib/flow.mjs';
import {createCalendarService} from './lib/calendar-service.mjs';

const config={...loadEnv('development',process.cwd(),''),...process.env};
const port=Number(process.env.PORT||config.PORT||3000);
const host='0.0.0.0';
const origin=`http://localhost:${port}`;

const serverDeepSeekKey = config.CAMPUSFLOW_AI_KEY || config.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const defaultModel = config.DEEPSEEK_API_MODEL || (config.CAMPUSFLOW_AI_MODEL && config.CAMPUSFLOW_AI_MODEL !== 'deepseek-flash' ? config.CAMPUSFLOW_AI_MODEL : 'v4.1Flash');

function isAllowedOrigin(reqOrigin, reqHost) {
  if (!reqOrigin) return true;
  if (reqOrigin === origin || reqOrigin === `http://127.0.0.1:${port}`) return true;
  if (reqHost && (reqOrigin === `http://${reqHost}` || reqOrigin === `https://${reqHost}`)) return true;
  try {
    const u = new URL(reqOrigin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.run.app') || u.hostname.endsWith('.google.com')) return true;
  } catch {}
  return false;
}

const staticOrigins=[origin,`http://127.0.0.1:${port}`,...String(config.CAMPUSFLOW_CALENDAR_ORIGINS||'https://hiro-bo.github.io').split(',').map(s=>s.trim()).filter(Boolean)];
const calendarOrigins={
  includes(o) {
    if (!o) return false;
    if (staticOrigins.includes(o)) return true;
    try {
      const u = new URL(o);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.run.app') || u.hostname.endsWith('.google.com')) return true;
    } catch {}
    return false;
  }
};

const calendarService=createCalendarService({directory:config.CAMPUSFLOW_CALENDAR_DIR||'.campusflow-calendars',origins:calendarOrigins});

const isProd=process.env.NODE_ENV==='production';
let vite=null;
let distExists=false;
try {
  await fs.access('dist/index.html');
  distExists=true;
} catch {}

if (isProd && distExists) {
  // production mode with prebuilt dist
} else {
  vite=await createServer({server:{middlewareMode:true,allowedHosts:true},appType:'spa'});
}

const MIME={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.txt':'text/plain; charset=utf-8',
  '.ics':'text/calendar; charset=utf-8'
};

async function serveDist(req,res) {
  const url=new URL(req.url,'http://localhost');
  let filePath=path.join(process.cwd(),'dist',url.pathname==='/'?'index.html':url.pathname.replace(/^\//,''));
  try {
    let stat=await fs.stat(filePath);
    if(stat.isDirectory()) {
      filePath=path.join(filePath,'index.html');
      stat=await fs.stat(filePath);
    }
  } catch {
    filePath=path.join(process.cwd(),'dist','index.html');
  }
  try {
    const data=await fs.readFile(filePath);
    const ext=path.extname(filePath).toLowerCase();
    res.writeHead(200,{
      'Content-Type':MIME[ext]||'application/octet-stream',
      'Cache-Control':ext==='.html'?'no-cache':'public, max-age=31536000, immutable'
    });
    res.end(data);
  } catch {
    res.statusCode=404;
    res.end('Not found');
  }
}

const server=http.createServer(async(req,res)=>{
  if(await calendarService(req,res))return;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};

  // API 配置与状态查询接口
  if(req.url==='/api/config' || req.url==='/api/deepseek/status'){
    return reply(200,{
      aiConfigured: !!serverDeepSeekKey,
      provider: 'DeepSeek',
      model: defaultModel || 'deepseek-flash',
      supportedModels: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner']
    });
  }

  // DeepSeek 连接测试接口
  if(req.url==='/api/deepseek/test'){
    if(req.method!=='POST')return reply(405,{error:'请使用 POST'});
    try{
      let raw='';for await(const chunk of req)raw+=chunk;
      const {apiKey,model,baseUrl}=JSON.parse(raw||'{}');
      const effectiveKey=apiKey||req.headers.authorization?.replace(/^Bearer\s+/i,'')||serverDeepSeekKey;
      const effectiveModel=model||defaultModel||'deepseek-flash';
      const effectiveBaseUrl=baseUrl||config.DEEPSEEK_BASE_URL||process.env.DEEPSEEK_BASE_URL||'';
      const result=await testDeepSeek({key:effectiveKey,model:effectiveModel,baseUrl:effectiveBaseUrl});
      return reply(200,{success:true,message:'DeepSeek API 连接测试成功！',model:result.model});
    }catch(e){
      const isAuthError=e.message.includes('API_KEY_INVALID')||e.message.includes('401');
      return reply(400,{success:false,error:isAuthError?'DeepSeek API Key 无效或未授权，请检查密钥。':`连接失败: ${e.message}`});
    }
  }

  // AI 智能提取待办 API 接口 (支持 /api/parse 和 /api/deepseek/parse)
  if(req.url==='/api/parse' || req.url==='/api/deepseek/parse'){
    if(req.method!=='POST')return reply(405,{error:'请使用 POST'});
    if(req.headers.origin && !isAllowedOrigin(req.headers.origin, req.headers.host))return reply(403,{error:'仅接受合规源网页请求'});
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65000)return reply(413,{error:'请求过大'});}
      const {text,referenceDate,apiKey,model,baseUrl}=JSON.parse(raw);
      if(typeof text!=='string'||!text.trim()||text.length>12000||!validDate(referenceDate)||referenceDate.length!==10)return reply(400,{error:'通知或日期无效'});
      const effectiveKey=apiKey||req.headers.authorization?.replace(/^Bearer\s+/i,'')||serverDeepSeekKey;
      const effectiveModel=model||defaultModel||'deepseek-flash';
      const effectiveBaseUrl=baseUrl||config.DEEPSEEK_BASE_URL||process.env.DEEPSEEK_BASE_URL||'';
      if(!effectiveKey){
        return reply(503,{error:'尚未配置 DeepSeek API Key，请在界面设置中输入，或在服务端设置 DEEPSEEK_API_KEY。'});
      }
      const result=await parseOnline({text,referenceDate,key:effectiveKey,model:effectiveModel,baseUrl:effectiveBaseUrl});
      return reply(200,result);
    }catch(e){
      console.error('[DeepSeek API Error]:',e.message);
      const isMissing=e.message==='AI_NOT_CONFIGURED';
      const msg=isMissing
        ?'尚未配置 DeepSeek API，请在设置中输入 API 密钥或使用本地解析。'
        :e.message==='AI_RATE_LIMIT'
        ?'DeepSeek API 请求频率过高或账户余额不足，请稍后重试。'
        :e.message==='AI_TRUNCATED'
        ?'DeepSeek 返回被截断，请缩减通知长度。'
        :'DeepSeek API 请求或校验失败，未创建任务。'+(e.message?` (${e.message})`:'');
      return reply(isMissing?503:502,{error:msg});
    }
  }

  if(vite) {
    vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});
  } else {
    await serveDist(req,res);
  }
});

server.listen(port,host,()=>console.log(`CampusFlow: http://localhost:${port} (listening on ${host}:${port})`));
