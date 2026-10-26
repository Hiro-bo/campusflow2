// 一个服务同时提供网页与 AI API。密钥只在这里读取，不会打包到浏览器。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer,loadEnv} from 'vite';
import {parseOnline} from './lib/ai.mjs';
import {validDate} from './lib/flow.mjs';
import {createCalendarService} from './lib/calendar-service.mjs';

const config={...loadEnv('development',process.cwd(),''),...process.env};
const port=Number(process.env.PORT||config.PORT||3000);
const host='0.0.0.0';
const origin=`http://localhost:${port}`;

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
  if(req.url==='/api/config')return reply(200,{aiConfigured:!!config.CAMPUSFLOW_AI_KEY});
  if(req.url==='/api/parse'){
    if(req.method!=='POST')return reply(405,{error:'请使用POST'});
    if(req.headers.origin && !isAllowedOrigin(req.headers.origin, req.headers.host))return reply(403,{error:'仅接受本机网页请求'});
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65000)return reply(413,{error:'请求过大'});}
      const {text,referenceDate}=JSON.parse(raw);
      if(typeof text!=='string'||!text.trim()||text.length>12000||!validDate(referenceDate)||referenceDate.length!==10)return reply(400,{error:'通知或日期无效'});
      const result=await parseOnline({text,referenceDate,key:config.CAMPUSFLOW_AI_KEY,model:config.CAMPUSFLOW_AI_MODEL});return reply(200,result);
    }catch(e){return reply(e.message==='AI_NOT_CONFIGURED'?503:502,{error:e.message==='AI_NOT_CONFIGURED'?'尚未配置在线 AI，请使用本地解析。':'AI请求或结果核验失败，未创建任务。'});}
  }
  if(vite) {
    vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});
  } else {
    await serveDist(req,res);
  }
});

server.listen(port,host,()=>console.log(`CampusFlow: http://localhost:${port} (listening on ${host}:${port})`));
