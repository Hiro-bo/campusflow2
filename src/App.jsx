'use client';
import {useState,useEffect,useRef} from 'react';
import {ArrowUpRight,ArrowRight,Check,ChevronLeft,ChevronRight,Inbox,LayoutGrid,CalendarDays,BookOpen,History,Plus,Download,Upload,Search,FileText,Zap,ShieldCheck,AlertTriangle,X,CheckCircle2,Trash2,Pencil,ExternalLink,Copy,Tv,Clock,Settings,Sparkles,Key,Eye,EyeOff} from 'lucide-react';
import {VERSION,CATEGORIES,chinaToday,parseRules,validateAI,SYSTEM_PROMPT,blankTask,validDate,duplicateKey,taskIssues,toICS,validateBackup} from '../lib/flow.mjs';
import {parseOnline,testDeepSeek} from '../lib/ai.mjs';
import {samples} from '../lib/samples.mjs';
import CalendarConnect from './CalendarConnect.jsx';
const STATIC_SITE=import.meta.env.VITE_STATIC_SITE === 'true';
const KEY='campusflow-v1';
const statusLabels={todo:'待开始',doing:'进行中',done:'已完成'};
const engineLabels={rules:'本地规则',ai:'DeepSeek 在线 AI',manual:'手动添加','ai-import':'外部 AI 导入',backup:'备份恢复'};
const kindLabels={todo:'待办事项',deadline:'截止任务',event:'定时活动 / 课程'};
// randomUUID 在非 HTTPS 预览中可能不可用；ID 仅用于任务标识，不承担鉴权。
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():'cf-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(3)),n=>n.toString(36)).join('-');
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}

export default function Home(){
 const [view,setView]=useState('inbox'),[text,setText]=useState(''),[sourceLabel,setSourceLabel]=useState('粘贴的通知'),[referenceDate,setReferenceDate]=useState('2026-10-20');
 const [tasks,setTasks]=useState([]),[logs,setLogs]=useState([]),[ready,setReady]=useState(false),[drafts,setDrafts]=useState([]),[draftSource,setDraftSource]=useState(''),[engine,setEngine]=useState('rules'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState('');
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[modal,setModal]=useState(null),[confirmed,setConfirmed]=useState(false),[quote,setQuote]=useState(''),[aiReady,setAiReady]=useState(false),[consent,setConsent]=useState(true),[jsonText,setJsonText]=useState(''),[importOpen,setImportOpen]=useState(false),[month,setMonth]=useState('2026-10'),[undo,setUndo]=useState(null);
 
 // DeepSeek API 状态
 const [deepseekKey,setDeepseekKey]=useState(()=>(typeof window!=='undefined'?localStorage.getItem('cf-deepseek-key')||'':''));
 const [deepseekModel,setDeepseekModel]=useState(()=>(typeof window!=='undefined'?(localStorage.getItem('cf-deepseek-model')==='v4.1Flash'?'deepseek-flash':localStorage.getItem('cf-deepseek-model'))||'deepseek-flash':'deepseek-flash'));
 const [deepseekBaseUrl,setDeepseekBaseUrl]=useState(()=>(typeof window!=='undefined'?localStorage.getItem('cf-deepseek-url')||'https://api.deepseek.com':'https://api.deepseek.com'));
 const [apiModalOpen,setApiModalOpen]=useState(false);
 const [apiTesting,setApiTesting]=useState(false);
 const [apiTestResult,setApiTestResult]=useState(null);
 const [showKey,setShowKey]=useState(false);

 const txtInput=useRef(null),backupInput=useRef(null);
 useEffect(()=>{
   const date=chinaToday();
   setReferenceDate(date);
   setMonth(date.slice(0,7));
   try{
     const raw=localStorage.getItem(KEY);
     if(raw){
       const data=JSON.parse(raw);
       setTasks(validateBackup(data));
       setLogs(Array.isArray(data.logs)?data.logs.slice(-200):[]);
     }
   }catch{
     setStorageError('本地数据无法读取。当前内容不会覆盖旧数据；请先导出诊断备份或恢复有效备份。');
   }
   setReady(true);
   if(!STATIC_SITE){
     fetch('/api/config')
       .then(r=>r.json())
       .then(d=>{
         if(d.aiConfigured||localStorage.getItem('cf-deepseek-key'))setAiReady(true);
       })
       .catch(()=>{});
   }else{
     if(localStorage.getItem('cf-deepseek-key'))setAiReady(true);
   }
 },[]);

 useEffect(()=>{
   if(ready&&!storageError)try{localStorage.setItem(KEY,JSON.stringify({version:1,tasks,logs}));}catch{setStorageError('浏览器存储已满或不可用。修改仍在当前页面，请立即导出备份。');}
 },[tasks,logs,ready,storageError]);

 useEffect(()=>{
   if(!modal&&!apiModalOpen)return;
   function key(e){if(e.key==='Escape'){setModal(null);setApiModalOpen(false);}}
   document.addEventListener('keydown',key);
   return()=>document.removeEventListener('keydown',key);
 },[modal,apiModalOpen]);

 function log(action,detail){setLogs(old=>[...old,{id:uid(),time:new Date().toISOString(),action,detail}].slice(-200));}
 function msg(s){setNotice(s);}
 function openEditor(t,index=null){setNotice('');setConfirmed(false);setQuote('');setModal({type:'editor',task:{...t,evidence:{...t.evidence},manual:[...(t.manual||[])]},index});}

 async function handleTestDeepSeek(){
   setApiTesting(true);
   setApiTestResult(null);
   try{
     if(!STATIC_SITE){
       const res=await fetch('/api/deepseek/test',{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({
           apiKey:deepseekKey.trim(),
           model:deepseekModel,
           baseUrl:deepseekBaseUrl.trim()
         })
       });
       const data=await res.json();
       if(!res.ok)throw new Error(data.error||'连接测试失败');
       setApiTestResult({success:true,message:data.message||`连接成功！模型：${data.model}`});
     }else{
       await testDeepSeek({key:deepseekKey.trim(),model:deepseekModel,baseUrl:deepseekBaseUrl.trim()});
       setApiTestResult({success:true,message:`连接成功！模型：${deepseekModel}`});
     }
     setAiReady(true);
   }catch(err){
     setApiTestResult({success:false,message:err.message});
   }finally{
     setApiTesting(false);
   }
 }

 function handleSaveDeepSeek(){
   try{
     if(deepseekKey.trim()){
       localStorage.setItem('cf-deepseek-key',deepseekKey.trim());
       setAiReady(true);
     }else{
       localStorage.removeItem('cf-deepseek-key');
     }
     localStorage.setItem('cf-deepseek-model',deepseekModel);
     localStorage.setItem('cf-deepseek-url',deepseekBaseUrl.trim()||'https://api.deepseek.com');
     msg('DeepSeek API 配置已保存！');
     setApiModalOpen(false);
   }catch{
     msg('配置保存失败，请检查浏览器本地存储。');
   }
 }

 async function parse(mode){
   if(!text.trim())return msg('先粘贴一条通知，或选择下方快捷样例。');
   if(mode==='ai'){
     if(!consent)return msg('在线 AI 会把通知正文发送给模型服务，请勾选确认。');
     if(!deepseekKey.trim()&&!aiReady){
       setApiModalOpen(true);
       return msg('请先配置 DeepSeek API Key 即可一键调用 AI 提取。');
     }
   }
   setBusy(true);
   setNotice('');
   try{
     let result;
     if(mode==='rules'){
       result=parseRules(text,referenceDate);
     }else{
       const effectiveKey=deepseekKey.trim()||undefined;
       if(STATIC_SITE){
         if(!effectiveKey){
           setApiModalOpen(true);
           throw Error('请先点击设置按钮配置你的 DeepSeek API Key。');
         }
         result=await parseOnline({
           text,
           referenceDate,
           key:effectiveKey,
           model:deepseekModel,
           baseUrl:deepseekBaseUrl.trim()||undefined
         });
       }else{
         const r=await fetch('/api/deepseek/parse',{
           method:'POST',
           headers:{
             'Content-Type':'application/json',
             ...(effectiveKey?{'Authorization':`Bearer ${effectiveKey}`}:{})
           },
           body:JSON.stringify({
             text,
             referenceDate,
             apiKey:effectiveKey,
             model:deepseekModel,
             baseUrl:deepseekBaseUrl.trim()||undefined
           })
         });
         result=await r.json();
         if(!r.ok){
           if(r.status===503||(result.error&&(result.error.includes('API Key')||result.error.includes('尚未配置')))){
             setApiModalOpen(true);
           }
           throw Error(result.error);
         }
       }
     }
     setDrafts(result.tasks.map(t=>({...t,id:uid(),status:'todo',source:text,engine:mode})));
     setDraftSource(text);
     setEngine(mode);
     log('解析通知',`${engineLabels[mode]}；${result.tasks.length} 个候选；通知日期 ${referenceDate}${result.model?'；模型 '+result.model:''}`);
     msg((result.tasks.length?`得到 ${result.tasks.length} 个候选任务。核对后逐项加入任务清单。`:'没有生成候选任务。')+(result.warnings?.slice(1).join(' ')||''));
   }catch(e){
     msg(e.message);
     log('解析失败',mode==='ai'?'在线 AI 请求或校验失败，未创建任务':e.message);
   }finally{
     setBusy(false);
   }
 }

 function importAI(){
   try{
     if(!text.trim())throw Error('先填写对应的通知原文。');
     const result=validateAI(JSON.parse(jsonText),text,referenceDate);
     setDrafts(result.tasks.map(t=>({...t,id:uid(),status:'todo',source:text,engine:'ai-import'})));
     setDraftSource(text);
     setEngine('ai-import');
     setImportOpen(false);
     log('导入 AI JSON',`${result.tasks.length} 个候选；外部生成，模型身份未验证`);
     msg('已核验 JSON，请逐项核对原文。');
   }catch(e){
     msg('导入失败：'+e.message);
   }
 }

 function patch(field,value){setModal(m=>({...m,task:{...m.task,[field]:value,manual:[...new Set([...(m.task.manual||[]),field])]}}));}
 function saveTask(){
   const t=modal.task;
   if(!t.title.trim())return msg('请填写任务名称。');
   if(!confirmed)return msg('请先勾选“我已核对原文和修改内容”。');
   if(t.when&&!validDate(t.when))return msg('时间格式无效，请重新填写。');
   if(t.end&&(!t.when||t.end<=t.when||t.end.length!==t.when.length))return msg('结束时间必须晚于开始时间，且时间精度应一致。');
   if(tasks.some(x=>x.id!==t.id&&duplicateKey(x)===duplicateKey(t)))return msg('相同任务已经存在，已阻止重复添加。');
   const saved={...t,title:t.title.trim(),confirmedAt:new Date().toISOString()};
   setTasks(old=>old.some(x=>x.id===saved.id)?old.map(x=>x.id===saved.id?saved:x):[...old,saved]);
   if(modal.index!==null)setDrafts(old=>old.filter(x=>x.id!==saved.id));
   log('人工确认保存',`${saved.title}；手动字段：${saved.manual?.join('、')||'无'}；${engineLabels[saved.engine]||saved.engine}`);
   setModal(null);
   msg('已保存。可在“我的任务”查看和修改。');
 }

 function removeTask(t){setTasks(old=>old.filter(x=>x.id!==t.id));setUndo(t);log('删除任务',t.title);msg('任务已删除，可点击右侧撤销。');}
 function exportCalendar(){
   const result=toICS(tasks);
   if(!result.exported)return msg('没有可导出的任务。请先确认时间；已完成和时间待定项会跳过。');
   download('CampusFlow.ics',result.text,'text/calendar;charset=utf-8');
   msg(`已导出 ${result.exported} 项，跳过 ${result.skipped} 项。截止任务使用 VTODO，日历软件支持情况不同。`);
   log('导出日历',`${result.exported} 项，跳过 ${result.skipped} 项`);
 }

 function backup(){download('CampusFlow-backup.json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),tasks,logs},null,2),'application/json');msg('已导出备份，包含任务原文和操作记录，请妥善保管。');}
 async function readText(e){const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>50000)return msg('文本文件请小于50KB。');try{const value=await f.text();if(value.length>12000)throw Error('正文超过12000字');setText(value);setSourceLabel(f.name);}catch(err){msg(err.message);}}
 async function restore(e){const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>8e6)return msg('备份不得超过8MB。');try{const data=JSON.parse(await f.text());const restored=validateBackup(data);let added=0;const merged=[...tasks];for(const t of restored)if(!merged.some(x=>x.id===t.id||duplicateKey(x)===duplicateKey(t))){merged.push(t);added++;}setTasks(merged);setStorageError('');log('恢复备份',`合并 ${added} 个任务，重复项跳过；备份中的历史日志未作为本次操作导入`);msg(`恢复成功：新增 ${added} 个任务。`);}catch(err){msg('恢复失败：'+err.message);}}

 const pending=tasks.filter(t=>t.status!=='done');
 const uncertain=pending.filter(t=>!t.when).length;
 const conflicts=pending.filter(t=>taskIssues(t,pending).some(s=>s.startsWith('时间冲突'))).length;
 const visible=tasks.filter(t=>(filter==='all'||t.status===filter||(filter==='uncertain'&&!t.when))&&(t.title+t.category+t.location).includes(search));
 const nav=[['inbox',Inbox,'通知工作台'],['tasks',LayoutGrid,'我的任务'],['calendar',CalendarDays,'时间安排'],['records',History,'使用记录'],['guide',BookOpen,'使用说明']];
 const monthStart=new Date(month+'-01T00:00:00+08:00');
 const [year,mon]=month.split('-').map(Number);
 const offset=(new Date(Date.UTC(year,mon-1,1)).getUTCDay()+6)%7;
 const days=new Date(Date.UTC(year,mon,0)).getUTCDate();
 function moveMonth(n){const date=new Date(Date.UTC(year,mon-1+n,1));setMonth(date.toISOString().slice(0,7));}

 function taskCard(t,compact=false){
   const issues=taskIssues(t,pending);
   return <article key={t.id} className={'task-card '+(t.status==='done'?'done':'')}><div className="task-card-top"><span className={'tag category-'+CATEGORIES.indexOf(t.category)}>{t.category}</span><button className="icon-button" aria-label={'编辑 '+t.title} onClick={()=>openEditor(t)}><Pencil size={15}/></button></div><h3>{t.title}</h3><p className="task-time"><Clock size={14}/>{t.when?t.when.replace('T',' '):'时间待确认'}{t.end?' — '+t.end.slice(11):''}</p>{t.location&&<p className="muted small">地点：{t.location}</p>}{issues.length>0&&t.status!=='done'&&<div className="issues">{issues.map((s,i)=><p key={i}>{s}</p>)}</div>}<div className="task-bottom"><select aria-label={'状态 '+t.title} value={t.status} onChange={e=>{const status=e.target.value;setTasks(old=>old.map(x=>x.id===t.id?{...x,status}:x));log('更新状态',t.title+'：'+statusLabels[status]);}}>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button className="icon-button" aria-label={'删除 '+t.title} onClick={()=>removeTask(t)}><Trash2 size={15}/></button></div></article>;
 }

 return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setView('inbox');}}><span className="brandmark"><Tv size={20}/></span><span>知行<span className="brand-en">CampusFlow</span></span></a><div className="workspace-label">校园日程管家</div><nav>{nav.map(([id,Icon,label])=><button key={id} className={view===id?'nav-item active':'nav-item'} onClick={()=>setView(id)}><Icon size={18}/>{label}{id==='tasks'&&<span className="nav-count">{pending.length}</span>}</button>)}</nav><div className="sidebar-note"><span className="mini-dot"/> 让通知变清晰<p>识别关键时间，核对后再保存。<br/>让学习和生活更有条理。</p></div><div className="profile"><div className="avatar">学</div><div>同学的日程空间<small>本地存储 · 清爽安全</small></div></div></aside>
 <main><header className="topbar"><span>校园日程 <span className="slash">/</span> {nav.find(x=>x[0]===view)?.[2]}</span><div><span className="local-dot"/> 数据保存在此浏览器 <button className="icon-button" aria-label="查看使用说明" onClick={()=>setView('guide')}><BookOpen size={16}/></button></div></header><div className="page">
 {storageError&&<div role="alert" className="error-banner">{storageError}<button onClick={backup}>导出当前备份</button><button onClick={()=>{download('CampusFlow-recovery.txt',localStorage.getItem(KEY)||'','text/plain');}}>导出旧数据</button></div>}
 <div className="calendar-connect-entry" style={{display:view==='tasks'||view==='calendar'?'flex':'none'}}><CalendarConnect tasks={tasks} ready={ready&&!storageError} onLog={log}/></div><div className="page-heading"><div><span className="bili-badge">{view==='inbox'?'智能整理':view==='tasks'?'任务日程':view==='calendar'?'月度视图':view==='records'?'操作日志':'帮助中心'}</span><h1>{view==='inbox'?'通知整理工作台':view==='tasks'?'我的待办与日程':view==='calendar'?'时间安排日历':view==='records'?'本地操作记录':'CampusFlow 使用说明'}</h1><p className="subtitle">{view==='inbox'?'粘贴群消息、邮件或教务公告，自动提取关键时间与待办，核对后存入日程':view==='tasks'?'集中管理全部课程、作业与活动，支持按状态筛选与日历同步':view==='calendar'?'全月安排一目了然，智能排查时间重叠冲突':view==='records'?'浏览器本地的解析与修改流水，公开透明随时可溯':'快速了解通知提取、任务管理与手机日历无缝衔接技巧'}</p></div><button className="button primary" onClick={()=>openEditor({...blankTask(),id:uid(),status:'todo',engine:'manual',source:''})}><Plus size={16}/>新建任务</button></div>
 {notice&&<div className="notice" role="status"><span>{notice}</span>{undo&&<button onClick={()=>{if(!tasks.some(t=>t.id===undo.id)){setTasks(old=>[...old,undo]);log('撤销删除',undo.title);}setUndo(null);msg('已撤销删除。');}}>撤销删除</button>}<button className="icon-button" aria-label="关闭提示" onClick={()=>setNotice('')}><X size={15}/></button></div>}
 {view==='inbox'&&<><div className="stats-strip"><div><span className="stat-number">{pending.length.toString().padStart(2,'0')}</span><span>待办事项</span></div><div><span className="stat-number amber">{uncertain.toString().padStart(2,'0')}</span><span>时间待确认</span></div><div><span className="stat-number">{conflicts.toString().padStart(2,'0')}</span><span>存在时间冲突</span></div><div className="stats-last"><ShieldCheck size={24}/><span>原文字句核对<small>每个候选均保留原文出处</small></span></div></div>
 <div className="workbench"><section className="input-panel panel"><div className="section-heading"><span className="step-icon"><FileText size={18}/></span><div><h2>输入通知正文</h2><p>班级群消息、邮件公告或复制的文档文字</p></div><FileText className="heading-icon" size={20}/></div><label className="text-label" htmlFor="noticeText">通知正文 <span>{text.length} / 12000</span></label><textarea id="noticeText" className="notice-input" value={text} onChange={e=>setText(e.target.value)} maxLength={12000} placeholder={'把通知粘贴在这里…\n\n例如：请于2026年10月23日17:00前提交电路实验报告。'}/><div className="input-meta"><button className="text-button" onClick={()=>txtInput.current.click()}><Upload size={14}/>导入 TXT</button><span title={sourceLabel}>{sourceLabel}</span></div><input ref={txtInput} type="file" accept=".txt,text/plain" hidden onChange={readText}/><div className="date-field"><label htmlFor="noticeDate">通知发布日期</label><input id="noticeDate" type="date" value={referenceDate} onChange={e=>setReferenceDate(e.target.value)}/><small>用于补全年份，含糊日期仍需确认</small></div>
 
 <div className="parse-buttons">
   <button className="button primary" disabled={busy||!ready} onClick={()=>parse('rules')} title="使用本地离线规则提取待办">
     <Zap size={15}/><span>{busy&&engine==='rules'?'提取中…':'快速提取'}</span><ArrowRight size={14}/>
   </button>
   <button className="button bili-ai-btn" disabled={busy} onClick={()=>parse('ai')} title="调用 DeepSeek 在线大模型智能提取">
     <Sparkles size={15}/><span>{busy&&engine==='ai'?'提取中…':'DeepSeek AI'}</span>
   </button>
   <button className="icon-button api-config-btn" title="DeepSeek API 接口配置" aria-label="DeepSeek API 接口配置" onClick={()=>{setNotice('');setApiModalOpen(true);}}>
     <Settings size={18}/>
     {(deepseekKey||aiReady)&&<span className="api-active-dot" title="DeepSeek API 已配置"/>}
   </button>
 </div>
 
 <p className="mode-caption">
   <span className="mini-dot"/> {`当前快捷提取使用本地离线规则 · DeepSeek 在线 AI ${(deepseekKey||aiReady)?'已就绪':'待配置 (点击齿轮填入 Key)'}`}
 </p>
 <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>在线 AI 模式下，同意将此通知正文发送给模型服务；已移除个人敏感信息。</label>
 
 <div className="sample-box"><span>💡 快捷样例试用：</span><div>{samples.map((s,i)=><button key={s.label} onClick={()=>{setText(s.text);setSourceLabel(s.source);setReferenceDate(s.referenceDate);msg(s.source);}}>{s.label}<ArrowUpRight size={12}/></button>)}</div></div>
 
 {/* 用户请求：把图中做成按钮调大 (▶ 已有 AI 提取结果？导入 JSON) */}
 <div className="big-import-box">
   <button
     type="button"
     className={`big-import-btn ${importOpen?'open':''}`}
     onClick={()=>setImportOpen(!importOpen)}
     aria-expanded={importOpen}
   >
     <div className="big-import-btn-left">
       <span className="big-import-arrow">{importOpen?'▼':'▶'}</span>
       <span className="big-import-title">已有 AI 提取结果？导入 JSON</span>
     </div>
     <span className="big-import-badge">{importOpen?'收起面板 ▲':'点击展开 ▼'}</span>
   </button>
   {importOpen&&(
     <div className="big-import-drawer">
       <p className="import-desc">可复制标准提取提示词到你已有的 AI 工具（如 DeepSeek、ChatGPT 等），生成后将返回的 JSON 粘贴在此处核验导入。</p>
       <div className="big-import-actions">
         <button className="text-button copy-prompt-btn" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(SYSTEM_PROMPT+'\n通知发布日期：'+referenceDate+'\n通知正文：\n'+text);msg('提示词与正文已复制到剪贴板！');}catch{msg('剪贴板不可用，请从源码 lib/flow.mjs 复制 SYSTEM_PROMPT。');}}}>
           <Copy size={15}/>复制 AI 提取提示词
         </button>
       </div>
       <textarea
         aria-label="AI JSON"
         className="big-import-textarea"
         value={jsonText}
         onChange={e=>setJsonText(e.target.value)}
         placeholder='{"tasks": [{"title": "电路实验报告", "kind": "deadline", "when": "2026-10-23T17:00", "location": "工训中心", ...}]}'
         rows={5}
       />
       <div className="big-import-footer">
         <button className="button primary big-import-submit" type="button" onClick={importAI} disabled={!jsonText.trim()}>
           <Upload size={16}/>核验并导入
         </button>
         <button className="button secondary" type="button" onClick={()=>setImportOpen(false)}>
           收起
         </button>
       </div>
     </div>
   )}
 </div>
 
 </section>
 <section className="review-panel panel"><div className="section-heading"><span className="step-icon step-blue"><CheckCircle2 size={18}/></span><div><h2>候选待办核对</h2><p>日期、地点、行动内容，以原通知为准</p></div><span className="count-pill">{drafts.length} 项待核对</span></div>{drafts.length===0?<div className="empty-review"><div className="bili-empty-tv"><Tv size={38} strokeWidth={1.8}/><div className="bili-tv-eyes">(=・ω・=)</div></div><h3>等待放入通知</h3><p>在左侧输入通知后点击提取，识别出的任务会展示在这里。<br/>核对无误后再加入你的任务清单。</p><div className="steps-inline"><span>输入通知</span><ArrowRight size={12}/><span>核对原文</span><ArrowRight size={12}/><span>确认存入</span></div></div>:<div className="draft-list"><p className="extraction-source">解析方式：{engineLabels[engine]} · 候选尚未保存</p>{drafts.map((t,i)=><article className="draft-card" key={t.id}><div className="draft-top"><span className={'tag category-'+CATEGORIES.indexOf(t.category)}>{t.category}</span><button className="icon-button" aria-label={'忽略 '+t.title} onClick={()=>setDrafts(old=>old.filter(x=>x.id!==t.id))}><X size={14}/></button></div><h3>{t.title}</h3><p className="task-time"><Clock size={14}/>{t.when?.replace('T',' ')||'时间待确认'}</p><blockquote>{t.evidence.title}</blockquote>{t.warnings?.length>0&&<p className="warning-text"><AlertTriangle size={13}/>{t.warnings[0]}</p>}<button className="review-button" onClick={()=>openEditor(t,i)}>核对并保存<ArrowRight size={15}/></button></article>)}</div>}<div className="trust-footer"><ShieldCheck size={16}/><p>缺失的信息会留空，解析结果不会自动写入日历。</p></div></section></div>
 <div className="bottom-note"><span>💡 小贴士</span><p>通知里的“报名截止”与“活动开始”通常是两件事。核对时，请分别确认。</p><button className="text-button" onClick={()=>setView('guide')}>了解使用方法<ArrowUpRight size={13}/></button></div></>}
 {view==='tasks'&&<><div className="toolbar"><div className="tabs">{[['all','全部'],['todo','待开始'],['doing','进行中'],['done','已完成'],['uncertain','时间待定']].map(([id,label])=><button className={filter===id?'selected':''} key={id} onClick={()=>setFilter(id)}>{label}</button>)}</div><label className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索任务、分类或地点"/></label></div><div className="task-actions"><span>{visible.length} 项任务</span><div><button className="text-button" onClick={exportCalendar}><Download size={15}/>原格式 ICS</button><button className="text-button" onClick={backup}>导出备份</button><button className="text-button" onClick={()=>backupInput.current.click()}>恢复备份</button></div></div>{visible.length?<div className="task-grid">{visible.map(t=>taskCard(t))}</div>:<div className="empty-state"><LayoutGrid size={38}/><h2>{tasks.length?'没有符合条件的任务':'你的第一件事，从通知开始'}</h2><p>提取并确认一条通知，或手动添加课程、作业与活动。</p><button className="button primary" onClick={()=>setView('inbox')}>前往通知工作台</button></div>}</>}
 {view==='calendar'&&<><div className="calendar-toolbar"><div><button className="icon-button" aria-label="上一月" onClick={()=>moveMonth(-1)}><ChevronLeft/></button><h2>{year} 年 {mon} 月</h2><button className="icon-button" aria-label="下一月" onClick={()=>moveMonth(1)}><ChevronRight/></button></div><button className="button secondary" onClick={exportCalendar}><Download size={16}/>原格式 ICS</button></div><div className="calendar-grid">{['周一','周二','周三','周四','周五','周六','周日'].map(s=><div className="weekday" key={s}>{s}</div>)}{Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const day=i-offset+1;const date=`${month}-${String(day).padStart(2,'0')}`;const inMonth=day>0&&day<=days;return <div key={i} className={'day-cell '+(!inMonth?'outside':'')+(date===chinaToday()?' today':'')}><span>{inMonth?day:''}</span>{inMonth&&tasks.filter(t=>t.when?.slice(0,10)===date&&t.status!=='done').map(t=><button key={t.id} title={t.title} onClick={()=>openEditor(t)}>{t.when.length>10?t.when.slice(11)+' ':''}{t.title}</button>)}</div>})}</div><p className="muted small">截止任务不代表占用整段时间。冲突检查仅针对已填写开始与结束时间的活动；时间待定任务不会显示在日历中。</p>{conflicts>0&&<div className="notice"><AlertTriangle size={17}/>{conflicts} 项活动存在时间重叠，请到“我的任务”查看。</div>}</>}
 {view==='records'&&<><div className="task-actions"><span>当前浏览器的真实操作记录</span><button className="button secondary" onClick={()=>download('CampusFlow-audit.json',JSON.stringify({version:VERSION,exportedAt:new Date().toISOString(),logs},null,2),'application/json')}><Download size={15}/>导出记录</button></div><p className="muted small">本地日志可由设备使用者修改，适合过程复盘，不是不可篡改审计。开发与测试记录见项目材料。</p>{logs.length?<div className="log-list">{[...logs].reverse().map(l=><div key={l.id}><span className="log-dot"/><div><h3>{String(l.action)}</h3><p>{String(l.detail)}</p></div><time>{new Date(l.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</time></div>)}</div>:<div className="empty-state"><History size={38}/><h2>还没有操作记录</h2><p>解析、保存与修改任务后，记录会出现在这里。</p></div>}</>}
 {view==='guide'&&<div className="guide-layout"><section className="panel guide"><h2>三分钟上手</h2><ol><li><b>放入通知</b><p>复制通知正文，或导入 TXT。当前版本不直接识别 PDF、Word 或截图，可先从文档复制文字。</p></li><li><b>提取候选</b><p>默认使用本地规则。在线 AI 支持 DeepSeek API，可在工作台点击“设置”按钮配置 API Key，或由服务端提供。</p></li><li><b>对照原文确认</b><p>检查行动、时间与地点。证据按钮会高亮原文；没有依据的内容保持空白。手动改动会记录字段名。</p></li><li><b>保存与安排</b><p>在“我的任务”切换状态，或新建“定时活动 / 课程”填写开始、结束时间，检查时间重叠。</p></li><li><b>导出与备份</b><p>点击“导入 / 订阅日历”，下载兼容手机日历的 ICS 文件，或连接独立订阅服务持续更新。“原格式 ICS”仍保留 VTODO 待办格式。JSON 备份可在另一台设备恢复。</p></li></ol></section><aside className="panel guide"><h2>DeepSeek API 接口说明</h2><p>本服务提供完整的 DeepSeek API 接口支持：</p><div className="guide-api-card"><code>POST /api/deepseek/parse</code><p>参数：text (通知), referenceDate (日期), apiKey (可选), model (可选 v4.1Flash、deepseek-chat 或 deepseek-reasoner)</p></div><div className="guide-api-card"><code>POST /api/deepseek/test</code><p>测试 DeepSeek API Key 连通性与模型可用状态。</p></div><h2>这个版本的边界</h2><p>没有自动读取班级群、没有消息推送、没有跨设备云同步，也没有自动 OCR。</p><p>仅浏览器保存任务，清理网站数据会删除记录。请定期导出备份。</p><p>时间均按 Asia/Shanghai 处理。相对日期、教学周、无年份日期都需要你进一步核对。</p></aside></div>}
 <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={restore}/><footer className="footer"><span>知行 CampusFlow · 校园日程工作台</span><span>条理生活 · 清爽高效</span><span>MVP {VERSION}</span></footer></div></main>

 {/* 任务核对与编辑 Modal */}
 {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="editorTitle"><div className="modal-heading"><div><h2>核对任务详情</h2><p className="muted small">核实时间与地点，确认后存入清单</p></div><button className="icon-button" autoFocus aria-label="关闭编辑" onClick={()=>setModal(null)}><X/></button></div>{notice&&<p className="modal-message" role="alert">{notice}</p>}<div className="editor-columns"><div className="editor-fields"><label>任务名称<input maxLength={120} value={modal.task.title} onChange={e=>patch('title',e.target.value)}/></label><div className="form-row"><label>任务类型<select value={modal.task.kind} onChange={e=>patch('kind',e.target.value)}>{Object.entries(kindLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>分类<select value={modal.task.category} onChange={e=>patch('category',e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="field-label">{modal.task.kind==='event'?'开始时间':'截止 / 提醒日期'}<button className="evidence-button" disabled={!modal.task.evidence.when} onClick={()=>setQuote(modal.task.evidence.when)}>查看依据</button></div><div className="form-row"><input aria-label="任务日期" type="date" value={modal.task.when?.slice(0,10)||''} onChange={e=>patch('when',e.target.value?e.target.value+(modal.task.when?.slice(10)||''):null)}/><input aria-label="任务时刻" type="time" disabled={!modal.task.when} value={modal.task.when?.slice(11)||''} onChange={e=>patch('when',modal.task.when.slice(0,10)+(e.target.value?'T'+e.target.value:''))}/></div><p className="small muted">时间留空表示仅日期，不会自动补成午夜。日期留空表示待确认。</p>{modal.task.kind==='event'&&<label>结束时间（冲突检测需要）<input type="datetime-local" value={modal.task.end||''} onChange={e=>patch('end',e.target.value||null)}/></label>}<label>地点 <button className="evidence-button" disabled={!modal.task.evidence.location} onClick={()=>setQuote(modal.task.evidence.location)}>查看依据</button><input value={modal.task.location} maxLength={100} onChange={e=>patch('location',e.target.value)} placeholder="原文未写，可留空"/></label>{modal.task.warnings?.length>0&&<div className="issues">{modal.task.warnings.map((s,i)=><p key={i}>{s}</p>)}</div>}{taskIssues(modal.task,tasks).map((s,i)=><p className="warning-text" key={i}><AlertTriangle size={13}/>{s}</p>)}<p className="small muted">手动修改：{modal.task.manual?.map(f=>({title:'名称',kind:'类型',when:'时间',end:'结束时间',location:'地点',category:'分类'}[f]||f)).join('、')||'无'}</p></div><div className="source-panel"><h3><FileText size={16}/>通知原文<button className="evidence-button" onClick={()=>setQuote(modal.task.evidence.title)}>定位任务依据</button></h3><div className="source-text">{(()=>{const source=modal.task.source||'此任务为手动添加，请核对你的信息来源。';const pos=quote?source.indexOf(quote):-1;return pos>=0?<>{source.slice(0,pos)}<mark>{quote}</mark>{source.slice(pos+quote.length)}</>:source;})()}</div><p className="small muted">解析方式：{engineLabels[modal.task.engine]||modal.task.engine}。引用命中不代表理解正确。</p></div></div><div className="modal-footer"><button type="button" className={`bili-confirm-btn ${confirmed?'confirmed':''}`} onClick={()=>setConfirmed(!confirmed)} aria-pressed={confirmed} role="checkbox" aria-checked={confirmed}><span className="bili-confirm-checkbox">{confirmed?<Check size={13} strokeWidth={3}/>:null}</span><span className="bili-confirm-text">我已核对原文和修改内容，理解待确认项</span><span className="bili-confirm-tag">{confirmed?'已核对':'点击确认'}</span></button><button className="button primary" onClick={saveTask} disabled={!confirmed}><Check size={16}/>确认保存</button></div></section></div>}

 {/* DeepSeek API 配置与调用设置 Modal */}
 {apiModalOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setApiModalOpen(false);}}><section className="modal api-config-modal" role="dialog" aria-modal="true" aria-labelledby="apiModalTitle"><div className="modal-heading"><div><h2 id="apiModalTitle" className="api-modal-title"><span className="bili-badge">API</span> DeepSeek 接口连接配置</h2><p className="muted small">参照官方文档规范，支持 deepseek-flash、deepseek-v4-pro、deepseek-chat 与 deepseek-reasoner</p></div><button className="icon-button" aria-label="关闭设置" onClick={()=>setApiModalOpen(false)}><X/></button></div><div className="api-modal-body"><div className="api-status-banner"><div className="api-status-indicator"><span className={`status-pill ${deepseekKey||aiReady?'online':'offline'}`}>{deepseekKey||aiReady?'● DeepSeek 已就绪':'○ 尚未配置 API Key'}</span><span className="api-status-sub">{deepseekKey?'（使用前端本地保存的密钥）':aiReady?'（使用服务端环境变量配置）':'（填入密钥即可直接调用在线大模型）'}</span></div></div><div className="api-form-group"><label htmlFor="deepseekUrlInput" className="api-label"><span>API 基础地址 (Base URL)</span><a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noreferrer" className="api-link">DeepSeek 官方文档 <ExternalLink size={12}/></a></label><input id="deepseekUrlInput" type="text" value={deepseekBaseUrl} onChange={e=>setDeepseekBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" className="api-input-plain"/><p className="api-hint">官方接口地址为 https://api.deepseek.com，也支持自定义中转或兼容端点。</p></div><div className="api-form-group"><label htmlFor="deepseekKeyInput" className="api-label"><span>DeepSeek API Key</span><a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="api-link">前往获取 API Key <ExternalLink size={12}/></a></label><div className="api-input-wrapper"><Key size={16} className="api-input-icon"/><input id="deepseekKeyInput" type={showKey?'text':'password'} value={deepseekKey} onChange={e=>setDeepseekKey(e.target.value)} placeholder="sk-..." className="api-input" autoComplete="off"/><button type="button" className="icon-button key-toggle-btn" onClick={()=>setShowKey(!showKey)} aria-label={showKey?'隐藏密钥':'显示密钥'}>{showKey?<EyeOff size={16}/>:<Eye size={16}/>}</button></div><p className="api-hint">密钥安全保存在你的浏览器本地，通过服务端代理请求，避免暴露到公共网络。</p></div><div className="api-form-group"><label className="api-label" htmlFor="modelSelect"><span>调用模型 (Model)</span></label><select id="modelSelect" className="api-select" value={deepseekModel} onChange={e=>setDeepseekModel(e.target.value)}><option value="deepseek-flash">deepseek-flash (v4.1 Flash 极速推荐 · 响应极快)</option><option value="deepseek-v4-pro">deepseek-v4-pro (v4 Pro 旗舰模型 · 精度更佳)</option><option value="deepseek-chat">deepseek-chat (DeepSeek-V3 · 官方通用对话)</option><option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1 · 官方深度推理)</option></select></div><div className="api-test-section"><button type="button" className="button secondary test-api-btn" onClick={handleTestDeepSeek} disabled={apiTesting||(!deepseekKey.trim()&&!aiReady)}><Zap size={15}/> {apiTesting?'正在测试连接…':'测试 API 连通性'}</button>{apiTestResult&&<div className={`api-test-alert ${apiTestResult.success?'success':'error'}`}>{apiTestResult.success?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<span>{apiTestResult.message}</span></div>}</div><div className="api-endpoint-card"><h4><Tv size={14}/> 开发者 API 接口说明</h4><p>本服务后端同时提供标准 REST API，可通过 curl 或前端脚本调用：</p><div className="api-code-block"><code>POST /api/deepseek/parse</code><span className="api-code-note">请求参数：{`{ "text": "通知正文", "referenceDate": "2026-10-20", "apiKey": "sk-...", "model": "deepseek-flash" }`}</span></div></div></div><div className="modal-footer"><button type="button" className="button secondary" onClick={()=>{setDeepseekKey('');localStorage.removeItem('cf-deepseek-key');localStorage.removeItem('cf-deepseek-url');setApiTestResult(null);msg('已清除本地 DeepSeek 配置。');}}>清除配置</button><button type="button" className="button primary" onClick={handleSaveDeepSeek}><Check size={16}/> 保存并应用</button></div></section></div>}

 </div>;
}


