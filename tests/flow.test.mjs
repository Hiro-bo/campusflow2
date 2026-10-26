import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRules,datesIn,validateAI,validDate,blankTask,taskIssues,toICS,duplicateKey,validateBackup,chinaToday} from '../lib/flow.mjs';
import {parseOnline} from '../lib/ai.mjs';
import {makeSamples} from '../lib/samples.mjs';
const ref='2026-10-20';
const samples=makeSamples(ref);
const task=(patch={})=>({...blankTask(),id:'test-a',title:'实验报告',kind:'deadline',when:'2026-10-23T17:00',status:'todo',...patch});
test('明确截止日期及时刻',()=>assert.equal(parseRules('请于2026年10月23日17:00前提交报告。',ref).tasks[0].when,'2026-10-23T17:00'));
test('不替未知截止时间造日期',()=>assert.equal(parseRules('请提交报告，时间待通知。',ref).tasks[0].when,null));
test('教学周保留待确认',()=>assert.equal(parseRules('请在第12周前提交项目。',ref).tasks[0].when,null));
test('相对星期保留待确认',()=>assert.equal(parseRules('请下周五前提交报告。',ref).tasks[0].when,null));
test('合成无日期通知全部保持待确认',()=>assert.ok(parseRules(samples[2].text,ref).tasks.every(t=>t.when===null)));
test('缺年份补全并警告',()=>{const t=parseRules('10月23日17:00前提交报告。',ref).tasks[0];assert.equal(t.when,'2026-10-23T17:00');assert.ok(t.warnings.some(x=>x.includes('年份')))});
test('日期无时间保留全天精度',()=>assert.equal(datesIn('2026年10月23日提交报告',ref)[0].value,'2026-10-23'));
test('闰日和无效日历',()=>{assert.equal(validDate('2026-02-29'),false);assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-13-01'),false);assert.equal(validDate('2026-10-01T24:00'),false)});
test('同一事项的日期区间不猜截止',()=>assert.equal(parseRules('报名时间为10月23日至10月25日',ref).tasks[0].when,null));
test('活动时间段和地点',()=>{const t=parseRules(samples[0].text,ref).tasks[1];assert.equal(t.kind,'event');assert.equal(t.when,'2026-10-24T14:00');assert.equal(t.end,'2026-10-24T16:00');assert.equal(t.location,'图书馆报告厅')});
test('空通知拒绝',()=>assert.throws(()=>parseRules(' ',ref)));
test('过长通知拒绝',()=>assert.throws(()=>parseRules('字'.repeat(12001),ref)));
const source='请于2026年10月23日17:00前提交报告。';
const ai={tasks:[{title:'提交报告',kind:'deadline',when:'2026-10-23T17:00',evidence:{title:source,when:source}}]};
test('AI合法引用允许进入确认',()=>assert.equal(validateAI(ai,source,ref).tasks[0].when,'2026-10-23T17:00'));
test('AI虚构引用拒绝',()=>assert.throws(()=>validateAI({tasks:[{title:'上交银行卡',evidence:{title:'不存在的句子'}}]},source,ref)));
test('AI虚构日期清空',()=>{const copy=structuredClone(ai);copy.tasks[0].when='2026-10-24T17:00';assert.equal(validateAI(copy,source,ref).tasks[0].when,null)});
test('AI虚构地点清空',()=>{const copy=structuredClone(ai);copy.tasks[0].location='行政楼';copy.tasks[0].evidence.location=source;assert.equal(validateAI(copy,source,ref).tasks[0].location,'')});
test('AI不合结构拒绝',()=>assert.throws(()=>validateAI({tasks:'bad'},source,ref)));
test('活动重叠报告冲突',()=>{const a=task({kind:'event',when:'2026-10-24T14:00',end:'2026-10-24T16:00'});const b=task({id:'test-b',title:'课程',kind:'event',when:'2026-10-24T15:00',end:'2026-10-24T16:40'});assert.ok(taskIssues(a,[b]).some(x=>x.startsWith('时间冲突')))});
test('首尾相接不算冲突',()=>assert.ok(!taskIssues(task({kind:'event',when:'2026-10-24T14:00',end:'2026-10-24T16:00'}),[task({id:'b',title:'课程',kind:'event',when:'2026-10-24T16:00',end:'2026-10-24T17:00'})]).some(x=>x.startsWith('时间冲突'))));
test('同日截止是负荷提示而非活动冲突',()=>assert.ok(taskIssues(task(),[task({id:'b',title:'另一份报告',when:'2026-10-23T19:00'})]).some(x=>x.startsWith('同日截止'))));
test('过期使用北京时间',()=>assert.ok(taskIssues(task({when:'2026-10-20T17:00'}),[],new Date('2026-10-20T09:01:00Z')).includes('已过期')));
test('全天截至当天结束才过期',()=>assert.ok(!taskIssues(task({when:'2026-10-20'}),[],new Date('2026-10-20T09:00:00Z')).includes('已过期')));
test('忽略已完成的冲突对象',()=>assert.ok(!taskIssues(task(),[task({id:'b',title:'其他',status:'done'})]).some(x=>x.includes('截止'))));
test('重复键去除空白',()=>assert.equal(duplicateKey(task({title:'实 验'})),duplicateKey(task({title:'实验'}))));
test('ICS截止采用VTODO并转换UTC',()=>{const text=toICS([task()]).text;assert.ok(text.includes('BEGIN:VTODO'));assert.ok(text.includes('DUE:20261023T090000Z'))});
test('ICS跳过未定时间和已完成',()=>assert.equal(toICS([task({when:null}),task({status:'done'})]).exported,0));
test('ICS活动含开始与结束',()=>{const text=toICS([task({kind:'event',when:'2026-10-24T14:00',end:'2026-10-24T16:00'})]).text;assert.ok(text.includes('DTSTART:20261024T060000Z'));assert.ok(text.includes('DTEND:20261024T080000Z'))});
test('ICS转义中文换行和分号及折行',()=>{const text=toICS([task({title:'长标题中文'.repeat(20)+';逗,号\n注入'})]).text;assert.ok(text.includes('\\;'));assert.ok(text.includes('\\n注入'));assert.ok(text.split('\r\n').every(line=>Buffer.byteLength(line)<=75))});
test('备份往返',()=>{const items=validateBackup(JSON.parse(JSON.stringify({version:1,tasks:[task()]})));assert.equal(items[0].when,task().when)});
test('备份无效ID与时间拒绝',()=>{assert.throws(()=>validateBackup({version:1,tasks:[task({id:'\nBEGIN:VEVENT'})]}));assert.throws(()=>validateBackup({version:1,tasks:[task({when:'2026-02-30'})]}))});
test('北京时间跨天',()=>assert.equal(chinaToday(new Date('2026-10-20T17:00:00Z')),'2026-10-21'));
test('真实AI适配器无密钥明确拒绝',async()=>assert.rejects(()=>parseOnline({text:source,referenceDate:ref,key:'',model:'x'}),/AI_NOT_CONFIGURED/));
test('AI适配器模拟200并运行核验（非真实模型调用）',async()=>{let req;const result=await parseOnline({text:source,referenceDate:ref,key:'test-not-a-real-secret',model:'test-model'},async(u,o)=>{req=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(ai)}}]}));});assert.equal(req.response_format.type,'json_object');assert.equal(result.tasks[0].when,'2026-10-23T17:00')});
test('AI适配器模拟限流429',async()=>assert.rejects(()=>parseOnline({text:source,referenceDate:ref,key:'fake'},async()=>new Response('',{status:429})),/AI_RATE_LIMIT/));
test('AI适配器模拟截断拒绝',async()=>assert.rejects(()=>parseOnline({text:source,referenceDate:ref,key:'fake'},async()=>new Response(JSON.stringify({choices:[{finish_reason:'length'}]}))),/AI_TRUNCATED/));


// v0.1.1：来自实际验收失败案例的回归测试。
test('取消通知不再生成活动候选并明确提示',()=>{const r=parseRules('本次活动取消，请勿参加。',ref);assert.equal(r.tasks.length,0);assert.ok(r.warnings.some(s=>s.includes('取消或否定')))});
test('禁止和无需行动不生成待办',()=>{for(const text of ['请不要报名此活动。','严禁参加该活动。','无需提交报告。'])assert.equal(parseRules(text,ref).tasks.length,0)});
test('没有行动的普通文本不会被强行变成任务',()=>assert.equal(parseRules('大家辛苦了。',ref).tasks.length,0));
test('未取消不能当作取消',()=>{const r=parseRules('活动未取消，请参加2026年10月28日14:00的会议。',ref);assert.ok(r.tasks.some(t=>t.when==='2026-10-28T14:00'));assert.ok(!r.warnings.some(s=>s.includes('取消或否定')))});
test('混合通知只保留明确的肯定行动',()=>{const r=parseRules('请不要报名旧活动，请于2026年10月28日提交报告。',ref);assert.equal(r.tasks.length,1);assert.equal(r.tasks[0].when,'2026-10-28')});
test('中午十二点半保持正确时刻',()=>assert.equal(parseRules('2026年10月28日中午12:30参加会议。',ref).tasks[0].when,'2026-10-28T12:30'));
test('下午和早上时段转换',()=>{assert.equal(datesIn('2026年10月28日下午2点30分参加会议',ref)[0].value,'2026-10-28T14:30');assert.equal(datesIn('2026年10月28日早上8:30上课',ref)[0].value,'2026-10-28T08:30')});
test('含糊的上午十二点只保留日期且警告',()=>{const t=parseRules('2026年10月28日上午12:30提交报告',ref).tasks[0];assert.equal(t.when,'2026-10-28');assert.ok(t.warnings.some(s=>s.includes('含糊')))});
test('晚上十二点不擅自判断跨日',()=>{const t=parseRules('2026年10月28日晚上12:30提交报告',ref).tasks[0];assert.equal(t.when,'2026-10-28');assert.ok(t.warnings.some(s=>s.includes('含糊')))});
test('上课识别为活动并提取结束时间',()=>{const t=parseRules('2026年10月28日14:00-16:00上课。',ref).tasks[0];assert.equal(t.kind,'event');assert.equal(t.category,'学习');assert.equal(t.end,'2026-10-28T16:00');assert.ok(taskIssues({...t,id:'a'},[task({id:'b',kind:'event',when:'2026-10-28T15:00',end:'2026-10-28T17:00'})]).some(s=>s.startsWith('时间冲突')))});
test('中文时间区间的结束时段继承开始',()=>{const t=parseRules('2026年10月28日下午2点至4点上课。',ref).tasks[0];assert.equal(t.when,'2026-10-28T14:00');assert.equal(t.end,'2026-10-28T16:00')});
test('逆序时间区间不自动跨日',()=>{const t=parseRules('2026年10月28日16:00-14:00上课',ref).tasks[0];assert.equal(t.end,null);assert.ok(t.warnings.some(s=>s.includes('结束时间')))});
test('报名截止与活动开始按逗号拆成两项且保留原文引用',()=>{const source='报名截止2026年10月28日，活动于2026年10月29日14:00开始，地点：报告厅。';const ts=parseRules(source,ref).tasks;assert.equal(ts.length,2);assert.equal(ts[0].kind,'deadline');assert.equal(ts[0].when,'2026-10-28');assert.equal(ts[1].kind,'event');assert.equal(ts[1].when,'2026-10-29T14:00');assert.equal(ts[1].location,'报告厅');assert.ok(ts.every(t=>source.includes(t.evidence.title)))});
test('日期在行动之前的第二事项也能拆分',()=>{const ts=parseRules('报名10月23日截止，10月25日参加活动',ref).tasks;assert.equal(ts.length,2);assert.deepEqual(ts.map(t=>t.when),['2026-10-23','2026-10-25'])});
test('地点补充不会拆成额外任务',()=>assert.equal(parseRules('请参加2026年10月28日14:00-16:00的讲座，地点：报告厅。',ref).tasks.length,1));
test('保存活动须知属于普通待办',()=>assert.equal(parseRules('请保存社团迎新活动须知。',ref).tasks[0].kind,'todo'));
test('AI中文结束时间仍需要真实区间依据',()=>{const s='2026年10月28日下午2点至4点上课。';const payload={tasks:[{title:'上课',kind:'event',when:'2026-10-28T14:00',end:'2026-10-28T16:00',evidence:{title:s,when:s,end:s}}]};assert.equal(validateAI(payload,s,ref).tasks[0].end,'2026-10-28T16:00');payload.tasks[0].end='2026-10-28T17:00';assert.equal(validateAI(payload,s,ref).tasks[0].end,null)});

test('演示日期随发布日期跨月生成且保持未来',()=>{const s=makeSamples('2026-10-30');const ts=parseRules(s[0].text,s[0].referenceDate).tasks;assert.equal(ts[0].when,'2026-11-02T17:00');assert.equal(ts[1].when,'2026-11-03T14:00');assert.equal(ts.length,3)});

test('活动时间另行通知的补充句不新增行动',()=>{const ts=parseRules(samples[2].text,ref).tasks;assert.equal(ts.length,1);assert.equal(ts[0].kind,'todo');assert.equal(ts[0].when,null)});

test('AI相对日期与全角冒号空格核验通过（观影活动本周六晚上18： 30-21： 00）',()=>{
  const source = '本周六晚上18： 30-21： 00，我们学院同学原则上都参加，都去二课上报名，不去的同学找班长请假';
  // ref is 2026-10-20 (Tuesday). Tuesday + 4 days = Saturday 2026-10-24
  const payload = {
    tasks: [{
      title: '四渡赤水观影活动',
      kind: 'event',
      when: '2026-10-24T18:30',
      end: '2026-10-24T21:00',
      location: '',
      category: '活动',
      evidence: {
        title: '我们学院同学原则上都参加',
        when: '本周六晚上18： 30',
        end: '21： 00',
        location: ''
      }
    }]
  };
  const res = validateAI(payload, source, ref);
  assert.equal(res.tasks[0].when, '2026-10-24T18:30');
  assert.equal(res.tasks[0].end, '2026-10-24T21:00');
  assert.equal(res.tasks[0].warnings.length, 0);
});

test('全角冒号带空格时刻可提取',()=>{
  const ds = datesIn('10月28日18： 30开会', ref);
  assert.equal(ds[0].value, '2026-10-28T18:30');
});
