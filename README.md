# 知行 CampusFlow

校园通知与任务核查原型。将通知文字提取为候选任务，对照原文编辑确认后，再保存、检查活动重叠或导出日历。

公开仓库的全部演示通知为合成数据，不包含个人上传文件原文、电话号码、API密钥或个人任务备份。首次代码主要由ChatGPT/Codex辅助生成；学生亲测和学生修改尚需真实补充。AI使用与公开版修改见docs/public-release.md。

## GitHub Pages

仓库Settings → Pages → Build and deployment → Source选择GitHub Actions。首次启用后，如需重新运行，在Actions选择Deploy CampusFlow to GitHub Pages，点Run workflow。发布成功以GitHub返回的实际网址为准。

静态版保留规则解析、外部AI JSON导入、原文核验、人工确认、任务管理、月历、活动冲突、本地日历兼容ICS和JSON备份。静态版隐藏在线AI按钮。用户主动连接独立订阅服务时，才会上传最小日历字段。跨设备没有任务双向云同步，迁移前请导出JSON备份，再在新域名恢复。

## 本机运行

安装Node.js 24或兼容版本，然后：

```powershell
npm install
npm run dev
```

也可双击Start-Windows.bat。浏览器打开终端显示的本机地址。首次安装需要联网。

```powershell
npm test
npm run build:pages
npm run preview:pages
```

build:pages生成dist目录，使用相对资源路径，兼容项目子路径。不要直接双击dist/index.html，应通过HTTP服务预览。

## AI使用方式

在通知工作台展开“已有AI提取结果？导入JSON”，复制提取提示词到已有AI工具，返回JSON后粘贴并核验。外部AI结果不代表本系统在线调用成功，原文命中也不代表理解正确。

本地服务模式提供可选服务端适配器：复制.env.example为.env.local，在本机填入有效密钥和可用模型名，然后重启。不要将填好的环境文件提交仓库。GitHub Pages不运行这个Node后端。

## 初学者参与

先在lib/samples.mjs加入自己编写的脱敏通知，记录期望任务数量和时间。再测试候选核验、保存刷新和备份恢复，记录实际结果。不要将AI测试写成自己的独立开发经历。

核心代码：lib/flow.mjs负责规则提取、引用核验、活动冲突与原格式ICS；lib/calendar.mjs生成兼容日历；src/App.jsx和src/CalendarConnect.jsx负责交互；server.mjs和lib/ai.mjs负责本机可选AI接口；lib/calendar-service.mjs提供可选持久订阅接口。npm test含66项核心、回归和日历测试。

## 当前限制

无OCR、群消息读取、网站后台推送、循环课表、任务双向云同步和多人协作。规则可能漏提，含糊日期保留待确认。兼容日历支持可选提醒，实际通知与订阅刷新由客户端决定；原格式VTODO支持因客户端而异。日志存于浏览器且可修改。AI适配器的自动化用例使用模拟响应，真实模型联调未完成。Windows、iPhone真机体验尚待用户亲测。


## v0.1.1

修复取消/否定通知、中文时段、课程区间和同句多事项处理，演示样例日期随当天生成。仍须逐项人工确认。变更与测试记录见[修复记录](docs/fixes-v011.md)。

## v0.2.0 日历导入与订阅

“我的任务”和“时间安排”增加“导入 / 订阅日历”。默认下载兼容iPhone/Outlook的ICS，截止事项也显示为日历事件；可选提前提醒。持续订阅接口已经实现，GitHub Pages必须连接另行部署的HTTPS订阅服务才能启用，当前没有公开个人任务或创建公共订阅服务。部署方式、同步边界和隐私范围见[日历说明](docs/calendar-v020.md)。
