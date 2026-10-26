// Deploy this optional standalone service behind HTTPS with a persistent disk.
import http from 'node:http';
import path from 'node:path';
import {createCalendarService} from './lib/calendar-service.mjs';
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
const directory=path.resolve(process.env.CAMPUSFLOW_CALENDAR_DIR||'.campusflow-calendars');
const origins=(process.env.CAMPUSFLOW_CALENDAR_ORIGINS||'https://hiro-bo.github.io').split(',').map(s=>s.trim()).filter(Boolean);
const handle=createCalendarService({directory,origins});
http.createServer(async(req,res)=>{
 if(await handle(req,res))return;
 res.writeHead(req.url==='/'?200:404,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
 res.end(req.url==='/'?'CampusFlow 日历订阅服务。请在 CampusFlow 网页的“持续订阅”中连接本服务。':'Not found');
}).listen(port,host,()=>console.log(`CampusFlow calendar service listening on ${host}:${port}`));
