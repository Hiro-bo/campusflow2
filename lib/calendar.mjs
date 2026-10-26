import {validDate} from './flow.mjs';

const esc=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const prop=(key,date)=>date.length===10?`${key};VALUE=DATE:${date.replace(/-/g,'')}`:`${key}:${stamp(new Date(date+':00+08:00'))}`;
function nextDay(value){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function fold(line){const rows=[];let row='',bytes=0;for(const c of line){const n=new TextEncoder().encode(c).length;if(bytes+n>75){rows.push(row);row=' ';bytes=1;}row+=c;bytes+=n;}rows.push(row);return rows.join('\r\n');}

/** Only the fields needed for a calendar leave this browser. Never include source/evidence/logs. */
export function calendarTasks(tasks){return tasks.filter(t=>t.status!=='done'&&t.when&&validDate(t.when)).map(t=>({id:t.id,title:t.title,kind:t.kind,when:t.when,end:t.end||null,location:t.location||'',status:t.status}));}

/** Calendar-compatible events: deadlines are point-in-time events, never invented work blocks. */
export function toLocalCalendar(tasks,{now=new Date(),reminderMinutes=0}={}){
 const items=calendarTasks(tasks), rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CampusFlow//Local Calendar 1.0//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:知行 CampusFlow','X-WR-TIMEZONE:Asia/Shanghai','REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
 for(const t of items){
  const deadline=t.kind==='deadline';
  rows.push('BEGIN:VEVENT','UID:'+esc(t.id)+'@campusflow.local','DTSTAMP:'+stamp(now),'LAST-MODIFIED:'+stamp(now),'SUMMARY:'+esc((deadline?'【截止】':'')+t.title),prop('DTSTART',t.when));
  if(t.kind==='event'&&t.end&&validDate(t.end)&&t.end.length===t.when.length&&t.end>t.when)rows.push(prop('DTEND',t.end));
  else if(t.when.length===10)rows.push(prop('DTEND',nextDay(t.when)));
  rows.push('TRANSP:'+(t.kind==='event'?'OPAQUE':'TRANSPARENT'),'LOCATION:'+esc(t.location),'DESCRIPTION:'+esc(deadline?'此事件标记截止时间，不代表占用时段；请以原通知为准。':'来自知行 CampusFlow；请以原通知为准。'));
  if([5,10,30,60].includes(reminderMinutes)&&t.when.length===16)rows.push('BEGIN:VALARM','ACTION:DISPLAY',`TRIGGER:-PT${reminderMinutes}M`,'DESCRIPTION:'+esc(t.title),'END:VALARM');
  rows.push('END:VEVENT');
 }
 rows.push('END:VCALENDAR');return {text:rows.map(fold).join('\r\n')+'\r\n',exported:items.length,skipped:tasks.length-items.length};
}

export function serviceBase(value){
 const url=new URL(value);
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('服务地址请填写 HTTPS 网站根地址，本机可用 http://localhost:5173。');
 return url.origin;
}
export function subscriptionLinks(base,id){
 if(!/^[A-Za-z0-9_-]{32,64}$/.test(id))throw Error('订阅标识无效');
 const https=serviceBase(base)+'/calendar/'+id+'.ics';
 return {https,webcal:https.replace(/^https?:/, 'webcal:')};
}
