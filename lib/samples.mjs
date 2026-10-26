// 所有内容均为合成演示通知；日期随通知发布日期生成。
import {chinaToday} from './flow.mjs';
export function makeSamples(referenceDate=chinaToday()) {
  const dateAfter=days=>new Date(new Date(referenceDate+'T00:00:00Z').getTime()+days*86400000).toISOString().slice(0,10);
  const chinese=s=>{const [y,m,d]=s.split('-').map(Number);return `${y}年${m}月${d}日`;};
  const deadline=chinese(dateAfter(3)),event=chinese(dateAfter(4));
  return [
    {label:'课程与报名',source:'合成测试数据，不代表学校真实通知',referenceDate,text:`【校园通知测试样例】\n请于${deadline}17:00前提交电路实验报告。\n请参加${event}14:00-16:00的创新讲座，地点：图书馆报告厅。\n志愿者报名截止${deadline}18:00，请填写报名表。`},
    {label:'含糊时间',source:'合成边界样例',referenceDate,text:'请于下周五前提交实践报告。\n班会地点：待通知。请参加班会，时间另行通知。'},
    {label:'无日期通知',source:'合成边界样例，不来自任何上传文件',referenceDate,text:'【社团合成通知】\n请保存社团迎新活动须知。\n具体活动时间另行通知。'},
    {label:'取消通知',source:'合成边界样例',referenceDate,text:'本次活动取消，请勿参加。'},
    {label:'一句多个事项',source:'合成拆分样例',referenceDate,text:`报名截止${deadline}，活动于${event}中午12:30开始，地点：报告厅。`}
  ];
}
export const samples=makeSamples();
