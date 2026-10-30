import {useEffect,useRef,useState} from 'react';
import {X,Download,Copy,ExternalLink,RefreshCw,CalendarDays,Link,ShieldCheck} from 'lucide-react';
import {calendarTasks,toLocalCalendar,serviceBase,subscriptionLinks} from '../lib/calendar.mjs';
import {safeStorage,safeTimeoutSignal,safeOrigin} from '../lib/compat.mjs';
const CONNECTION_KEY='campusflow-calendar-connection-v1';
const STATIC_SITE=import.meta.env.VITE_STATIC_SITE==='true';
function savedConnection(){try{const raw=safeStorage.getItem(CONNECTION_KEY);if(!raw)return null;const c=JSON.parse(raw);if(c&&/^[A-Za-z0-9_-]{43}$/.test(c.id)&&/^[A-Za-z0-9_-]{43}$/.test(c.writeToken))return {...c,base:serviceBase(c.base)};}catch{}return null;}
async function request(base,route,{method='GET',body,token}={}){
 const signal=safeTimeoutSignal(15000);
 const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),...(signal?{signal}:{})});
 let data;try{data=await r.json();}catch{throw Error('这个地址没有可用的日历订阅接口。');}
 if(!r.ok)throw Error(data.error||'订阅服务请求失败');return data;
}
function download(text){const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='CampusFlow-calendar.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

export default function CalendarConnect({tasks,ready,onLog}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState('import'),[reminder,setReminder]=useState(()=>savedConnection()?.reminderMinutes||0),[device,setDevice]=useState('iphone'),[feedback,setFeedback]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [connection,setConnection]=useState(null),[baseInput,setBaseInput]=useState(STATIC_SITE?'':safeOrigin()),[sync,setSync]=useState(''),[syncedAt,setSyncedAt]=useState('');
 const dialog=useRef(null),trigger=useRef(null),active=useRef(connection),queue=useRef(Promise.resolve());
 const latest=useRef(null);latest.current={tasks:calendarTasks(tasks),reminderMinutes:reminder};
 const snapshot=JSON.stringify(latest.current);
 const result=toLocalCalendar(tasks,{reminderMinutes:reminder});
 useEffect(()=>{active.current=connection;},[connection]);
 useEffect(()=>{if(connection){const ok=safeStorage.setItem(CONNECTION_KEY,JSON.stringify({...connection,reminderMinutes:reminder}));if(!ok)setFeedback('无法保存提醒设置，请先导出日历并检查浏览器存储。');}},[connection,reminder]);
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement;dialog.current?.querySelector('button')?.focus();
  function key(e){if(e.key==='Escape'){setOpen(false);return;}if(e.key!=='Tab')return;const controls=[...dialog.current.querySelectorAll('button:not(:disabled),a[href],input,select')].filter(x=>x.offsetParent!==null);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[open]);
 function enqueue(c,payload){
  setSync('正在更新订阅…');
  const job=queue.current.catch(()=>{}).then(async()=>{
   if(active.current?.id!==c.id)return;
   const d=await request(c.base,'/api/calendars/'+c.id,{method:'PUT',token:c.writeToken,body:payload});
   if(active.current?.id===c.id){setSync('已更新，等待日历客户端刷新');setSyncedAt(d.updatedAt);}
  });queue.current=job;
  return job.catch(()=>{if(active.current?.id===c.id)setSync('更新失败，请检查服务连接后点击“立即更新”重试。');});
 }
 useEffect(()=>{if(!connection||!ready)return;setSync('有更改，准备更新…');const timer=setTimeout(()=>enqueue(connection,JSON.parse(snapshot)),1200);return()=>clearTimeout(timer);},[connection,snapshot,ready]);
 async function connect(){
  if(!consent)return setFeedback('请先确认同步范围和订阅链接的访问权限。');
  let base;try{base=serviceBase(baseInput);}catch(e){return setFeedback(e.message);}
  setBusy(true);setFeedback('');let c;
  try{
   const config=await request(base,'/api/calendar/config');if(!config.subscriptions)throw Error('这个服务暂不支持日历订阅。');
   const d=await request(base,'/api/calendars',{method:'POST',body:latest.current});
   c={base,id:d.id,writeToken:d.writeToken};subscriptionLinks(base,c.id);
   const ok=safeStorage.setItem(CONNECTION_KEY,JSON.stringify(c));if(!ok){await request(base,'/api/calendars/'+c.id,{method:'DELETE',token:c.writeToken});throw Error('浏览器无法保存订阅管理信息，已撤销新订阅。');}
   active.current=c;setConnection(c);setSyncedAt(d.updatedAt);setFeedback('订阅地址已创建，请添加到你的日历。');onLog('创建日历订阅',`${latest.current.tasks.length} 项；仅同步日历字段`);
  }catch(e){setFeedback('连接失败：'+(e.name==='TimeoutError'?'服务响应超时，请重试。':e.message));}finally{setBusy(false);}
 }
 async function revoke(){
  if(!connection)return;const c=connection;setBusy(true);active.current=null;setFeedback('');
  try{await queue.current.catch(()=>{});await request(c.base,'/api/calendars/'+c.id,{method:'DELETE',token:c.writeToken});safeStorage.removeItem(CONNECTION_KEY);setConnection(null);setSync('');setSyncedAt('');setConsent(false);setFeedback('已撤销订阅地址。请在日历 App 中移除旧订阅；已下载的副本不会被远程删除。');onLog('撤销日历订阅','远程地址已失效');}
  catch(e){active.current=c;setFeedback('撤销失败，订阅仍然有效：'+e.message);}finally{setBusy(false);}
 }
 async function copy(){try{await navigator.clipboard.writeText(subscriptionLinks(connection.base,connection.id).https);setFeedback('订阅地址已复制。请勿公开分享这个地址。');}catch{setFeedback('无法自动复制，请长按或选中下面的订阅地址复制。');}}
 function exportFile(){if(!result.exported)return setFeedback('先保存至少一项有明确日期的未完成任务。');download(result.text);setFeedback(`已下载 ${result.exported} 项，跳过 ${result.skipped} 项。请在日历软件导入后核对日期和数量。`);onLog('导入本地日历文件',`${result.exported} 个兼容日历事件；提醒 ${reminder||'关闭'}`);}
 async function shareFile(){
  const file=new File([result.text],'CampusFlow-calendar.ics',{type:'text/calendar'});
  if(!result.exported)return setFeedback('先保存至少一项有明确日期的未完成任务。');
  if(!navigator.canShare?.({files:[file]}))return exportFile();
  try{await navigator.share({files:[file],title:'CampusFlow 日历'});setFeedback('文件已交给系统分享面板，请完成导入并核对。');onLog('分享日历文件',`${result.exported} 个日历事件`);}catch(e){if(e.name!=='AbortError')setFeedback('系统分享未完成，可使用“下载日历文件”。');}
 }
 const links=connection?subscriptionLinks(connection.base,connection.id):null;
 return <><button ref={trigger} className="button secondary" onClick={()=>{setOpen(true);setFeedback('');}}><CalendarDays size={16}/>导入本地日历</button>{open&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}><section ref={dialog} className="modal calendar-connect" role="dialog" aria-modal="true" aria-labelledby="calendarConnectTitle"><div className="modal-heading"><div><h2 id="calendarConnectTitle">把安排带到你的日历</h2><p className="muted small">在 Windows、iPhone 上查看课程与截止日期</p></div><button className="icon-button" aria-label="关闭日历连接" onClick={()=>setOpen(false)}><X/></button></div><div className="calendar-connect-body"><div className="tabs" aria-label="连接方式"><button aria-pressed={tab==='import'} className={tab==='import'?'selected':''} onClick={()=>setTab('import')}>导入本机日历</button><button hidden aria-pressed={tab==='subscribe'} className={tab==='subscribe'?'selected':''} onClick={()=>setTab('subscribe')}>持续订阅</button></div>
 <div className="calendar-summary"><span><b>{result.exported}</b> 项可同步</span><span>{result.skipped} 项跳过 · 时间待定或已完成</span></div><label className="calendar-setting">提前提醒<select value={reminder} onChange={e=>setReminder(Number(e.target.value))}>{[[0,'不设置提醒'],[5,'提前 5 分钟'],[10,'提前 10 分钟'],[30,'提前 30 分钟'],[60,'提前 1 小时']].map(([v,s])=><option key={v} value={v}>{s}</option>)}</select><small>仅明确时刻的事项写入提醒；能否通知取决于日历软件和系统权限。</small></label>
 {tab==='import'?<><div className="calendar-callout"><ShieldCheck size={18}/><p>一次性导入，文件在此浏览器生成。截止任务显示为“【截止】”事件，不占用整段时间；无时刻的日期显示为全天。</p></div><div className="calendar-buttons"><button className="button primary" disabled={!ready||!result.exported} onClick={exportFile}><Download size={16}/>下载日历文件</button><button className="button secondary" disabled={!ready||!result.exported} onClick={shareFile}><ExternalLink size={16}/>交给系统打开 / 分享</button></div><label className="calendar-setting">查看设备步骤<select value={device} onChange={e=>setDevice(e.target.value)}><option value="iphone">iPhone / iPad</option><option value="windows">Windows / Outlook</option></select></label>{device==='iphone'?<ol className="calendar-steps"><li>用 Safari 打开本站，下载或分享 .ics 文件。</li><li>如果没有“添加到日历”入口，把 .ics 作为邮件附件发给自己，在 iPhone 的“邮件”App 打开附件并添加。</li><li>选择目标日历，核对日期、北京时间和数量后完成导入。不同 iOS 版本入口可能不同。</li></ol>:<ol className="calendar-steps"><li>下载 CampusFlow-calendar.ics，尝试双击并使用已安装的日历程序打开。</li><li>也可在 Outlook 日历中选择“添加日历 → 从文件上传”，选择文件和目标日历。</li><li>核对导入的日期和数量；网站修改后需重新导入，建议使用单独的 CampusFlow 日历避免重复。</li></ol>}<p className="muted small">导入是当前快照，后续更改不会自动更新。导出包含全部符合条件的已保存任务，与搜索和月份无关。已导入副本由你的日历管理。</p></>:<>
 {connection?<><div className="calendar-callout"><Link size={18}/><p>{sync||'订阅已连接'}{syncedAt&&<small>最近上传：{new Date(syncedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</small>}</p></div><label className="calendar-setting">只读订阅地址<input readOnly value={links.https} aria-label="只读订阅地址" onFocus={e=>e.target.select()}/></label><div className="calendar-buttons"><a className="button primary" href={links.webcal} rel="noreferrer"><ExternalLink size={16}/>在日历 App 中订阅</a><button className="button secondary" onClick={copy}><Copy size={16}/>复制订阅地址</button><button className="button secondary" disabled={busy} onClick={()=>enqueue(connection,latest.current)}><RefreshCw size={16}/>立即更新</button></div><p className="small muted">iPhone：日历 → 日历 → 添加日历 → 添加订阅日历，粘贴地址。Outlook：添加日历 → 从 Web 订阅。系统刷新可能延迟，无法保证即时推送。</p><button className="text-button calendar-danger" disabled={busy} onClick={revoke}>{busy?'处理中…':'撤销此订阅地址'}</button></>:<><div className="calendar-callout"><Link size={18}/><p>{STATIC_SITE?'GitHub Pages 仅提供网页，无法独立生成持续更新的个人订阅。下载文件可直接使用；持续订阅需要连接你部署的 CampusFlow 订阅服务。':'本机服务支持日历订阅。当前电脑可使用本机地址；iPhone 和其他设备需要能访问的 HTTPS 订阅服务。'}</p></div><label className="calendar-setting">订阅服务地址<input type="url" value={baseInput} onChange={e=>setBaseInput(e.target.value)} placeholder="https://你的订阅服务域名"/><small>填写 CampusFlow Node 订阅服务的根地址。不要填写 GitHub 网页地址或无关网站。</small></label><label className="confirm-label calendar-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我同意将任务名称、日期、地点和提醒设置同步到此服务；持有订阅链接的人可读取这些日历内容。通知原文、依据和操作记录不会同步。</label><button className="button primary" disabled={busy||!ready||!result.exported||!consent} onClick={connect}>{busy?'连接中…':'连接并创建订阅'}</button></>}
 <p className="muted small">连接后，在本浏览器打开网站时，保存、修改、完成或删除任务会更新远程日历快照。日历端为只读，不能反向修改网站任务。清理网站数据会丢失管理权限；请先撤销订阅，JSON 备份不包含订阅管理密钥。</p><div className="calendar-doc-links"><a href="https://support.apple.com/zh-cn/guide/iphone/iph3d1110d4/ios" target="_blank" rel="noreferrer">Apple 日历帮助 ↗</a><a href="https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c" target="_blank" rel="noreferrer">Outlook 导入与订阅帮助 ↗</a></div>
 </>}{feedback&&<p className="calendar-feedback" role="status">{feedback}</p>}</div></section></div>}</>;
}

