// Optional persistent subscription API for the Node service. GitHub Pages cannot run this file.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {toLocalCalendar} from './calendar.mjs';
import {validDate} from './flow.mjs';
const token=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const tokenRE=/^[A-Za-z0-9_-]{43}$/;
function validate(data){
 if(!Array.isArray(data.tasks)||data.tasks.length>1000||![0,5,10,30,60].includes(data.reminderMinutes??0))throw Error('日历数据或提醒设置无效');
 const ids=new Set();
 const tasks=data.tasks.map(t=>{
  if(!t||typeof t.id!=='string'||!/^[-\w]{1,80}$/.test(t.id)||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>120||!['todo','doing'].includes(t.status)||!['todo','deadline','event'].includes(t.kind)||!validDate(t.when)||(t.end&&(!validDate(t.end)||t.end.length!==t.when.length||t.end<=t.when))||typeof t.location!=='string'||t.location.length>100)throw Error('日历任务格式无效');
  ids.add(t.id);return {id:t.id,title:t.title,kind:t.kind,when:t.when,end:t.end||null,location:t.location,status:t.status};
 });
 return {tasks,reminderMinutes:data.reminderMinutes??0};
}
export function createCalendarService({directory,origins=[]}){
 const limits=new Map(),locks=new Map();
 return async function handle(req,res){
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/calendar')&&!url.pathname.startsWith('/calendar/'))return false;
  const origin=req.headers.origin;
  const allowed=origin&&origins.includes(origin);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
  const reply=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data);return true;};
  if(req.method==='OPTIONS'){
   if(!allowed)return reply(403,{error:'此网站未被允许连接订阅服务'});
   res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'});res.end();return true;
  }
  if(url.pathname==='/api/calendar/config'&&req.method==='GET')return reply(200,{subscriptions:true});
  const feed=url.pathname.match(/^\/calendar\/([A-Za-z0-9_-]{43})\.ics$/);
  if(feed&&['GET','HEAD'].includes(req.method)){
   try{const record=JSON.parse(await fs.readFile(path.join(directory,feed[1]+'.json'),'utf8'));const result=toLocalCalendar(record.tasks,{now:new Date(record.updatedAt),reminderMinutes:record.reminderMinutes});res.writeHead(200,{...headers,'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="CampusFlow.ics"'});res.end(req.method==='HEAD'?'':result.text);return true;}catch(e){return reply(e.code==='ENOENT'?404:500,'Calendar not available','text/plain; charset=utf-8');}
  }
  const item=url.pathname.match(/^\/api\/calendars\/([A-Za-z0-9_-]{43})$/);
  const create=url.pathname==='/api/calendars'&&req.method==='POST';
  if(!create&&!(item&&['PUT','DELETE'].includes(req.method)))return reply(404,{error:'日历接口不存在'});
  if(!allowed)return reply(403,{error:'此网站未被允许连接订阅服务'});
  const ip=req.socket.remoteAddress||'unknown',time=Date.now(),previous=limits.get(ip);
  if(limits.size>10000)for(const [key,v] of limits)if(time-v.start>60000)limits.delete(key);
  const limit=previous&&time-previous.start<60000?previous:{start:time,count:0};limits.set(ip,limit);
  if(++limit.count>60)return reply(429,{error:'请求过于频繁，请稍后重试'});
  let release,lock;
  if(item){const previous=locks.get(item[1])||Promise.resolve();lock=new Promise(resolve=>{release=resolve;});locks.set(item[1],lock);await previous;}
  try{
   let record,id=item?.[1];
   if(!create){
    try{record=JSON.parse(await fs.readFile(path.join(directory,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return reply(404,{error:'订阅不存在或已经撤销'});throw e;}
    const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
    if(!tokenRE.test(supplied)||!timingSafeEqual(Buffer.from(hash(supplied)),Buffer.from(record.writeHash)))return reply(403,{error:'没有此订阅的修改权限'});
    if(req.method==='DELETE'){await fs.unlink(path.join(directory,id+'.json'));return reply(200,{deleted:true});}
   }
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'请发送 JSON'});
   let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1e6)return reply(413,{error:'日历数据不得超过1MB'});chunks.push(chunk);}
   let value;try{value=validate(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){return reply(400,{error:e instanceof SyntaxError?'JSON 格式无效':e.message});}
   await fs.mkdir(directory,{recursive:true,mode:0o700});
   if(create&&(await fs.readdir(directory)).filter(n=>n.endsWith('.json')).length>=1000)return reply(503,{error:'订阅服务容量已满'});
   const writeToken=create?token():null;id=id||token();
   const updatedAt=new Date().toISOString();record={...value,updatedAt,writeHash:create?hash(writeToken):record.writeHash};
   const dest=path.join(directory,id+'.json'),tmp=dest+'.'+token()+'.tmp';
   try{await fs.writeFile(tmp,JSON.stringify(record),{mode:0o600});await fs.rename(tmp,dest);}finally{await fs.unlink(tmp).catch(()=>{});}
   return reply(create?201:200,{id,...(create?{writeToken}:{}),updatedAt,count:value.tasks.length});
  }catch{return reply(500,{error:'订阅服务暂时不可用，请稍后重试'});}finally{release?.();if(item&&locks.get(item[1])===lock)locks.delete(item[1]);}
 };
}
