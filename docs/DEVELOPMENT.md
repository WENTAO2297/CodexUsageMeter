# 开发说明

当前预测为额度第5版、VPN第7版，运行机制与验证边界以[上海日历预测验收](FORECAST_DESIGN.md#2026-10-20-上海日历额度第5版vpn第7版)及[额度重建](TOKEN_FORECAST.md)为准。界面仍沿用已验收的288pt原生布局。以下按日期保留开发记录；标注第4版或更早的说明属于历史，不代表当前算法、缓存文件名或提示语义。

## 2026-10-19 第4版预测

该阶段行为见 [FORECAST_V4.md](FORECAST_V4.md)。新增纯模块 forecast-learning-core，负责真实目标期限、睡眠前后消耗界、独立同期限评分和版本隔离；adaptive-forecast-core 保留候选生成与路径组合，增加同周期余额的持续变化检测及提示精度准入。现有288pt布局、读数、后台查询频率和图表交互不变。以下带日期的旧实现说明保留为历史，不代表当前提示仍只根据周期进度判断。

prediction-v4-quota.json / prediction-v4-vpn.json 与旧版分开写入；只在v4文件不存在时读取并校验v3，原文件不改写。继承的预测标为modelVersion=3，不进入v4权重学习。最多180天、1200条预测、1600个额度锚点、182个日记录及7天/200个余额点；上限2MiB，账号/会话隔离和0700/0600原子写入保留。缓存损坏不通过回退旧文件绕过校验。

离线回归新增forecast-v4.cjs，adaptive-forecast.cjs实测Foundation迁移与权限，menu-layout.cjs实测双语预测/周期/定性日期的真实绘制。两个forecast-v4-*-backtest.cjs是额外可重现的合成前瞻回放，默认使用未参与开发的种子；不在每次安装时重复运行昂贵回放，也不等同真实长期准确率。

## 2026-10-19 顶部猫猫云轻量化

按用户最新要求恢复贴合名称和状态点的悬停灰底及白字，移除打开APP的原生提示。128×24pt客户端入口、点击路由和共享悬停清理保留；drawMenuRowHighlight通过可选inset/contentWidth仅将此入口绘制为名称实际advance+30pt（左8＋名称＋间隔8＋圆点6＋右8），其它行继续整行灰底。12%白色、5pt圆角和迟到回调保护不变，不增加浮窗或计时器。vpn-header核验双语状态下等边距和点击区不缩小，menu-actions覆盖悬停切换/移出/关闭，hover-popups检查刷新、语言切换和重开后均无原生提示。

后续间距校正：用户实际菜单截图中，系统额外上边距使顶部留白偏大。layoutMetricsPair保持原parent高度和VPN/Codex/分隔线坐标，只将maomaoyunView与vpnAppButton同步上移2pt（AppKit非翻转坐标y+2），点击区随视图同步移动，尺寸不缩小；不分别挪文字或缩行高。独立离屏图不包含NSMenu外层留白，因此测试明确核验2pt位移、共享中心、上方绘制间距6.5pt/下方到线10.5pt以及固定parent尺寸，而不将离屏裁剪误作真实菜单的全部边距。

仅调整绘制：MaoMaoYun字号11pt不变，bold/body改为medium/muted，悬停时白字配浅灰底。名称在原128×24pt入口内从局部x8绘制，叠加入口x8后正好是面板16pt左边界；6pt真实状态点移到名称实际advance宽度后8pt，原绿/灰/过渡脉冲/错误颜色不变。文字用缓存的真实字形度量与圆点、开关共用同一可见中心，仍是原有一行，不加背景、副标题或压缩行高。

开关按Wi‑Fi截图改为42×19pt轨道、25×15pt白色胶囊滑块，左右2pt边距、13pt位移；继续读取原有vpnSwitchAnimation.value，280ms动画、预览语义、辅助功能及Sources/vpn.js均不改。右缘保持MENU_WIDTH-16，原62×32pt视图及46×32pt点击区域完全保留，新增绘制仍全部落在原点击区内。客户端入口、顶部细分隔线、其余数据区/底部操作/用量动画不变。Tests/vpn-header.cjs以真实AppKit离屏覆盖双语六状态/悬停、五个动画相位、原点击区域两端、零VPN命令及布局中心；原vpn-switch/menu-actions/menu-layout回归继续运行。下文旧轨道尺寸和左侧状态点描述为旧版，以本节为准。

共享蓝色集中于cardColors().blue：参考截图为Display P3，转换至sRGB后采用开关轨道的主色#0F7EFF，以NSColor.colorWithSRGBRedGreenBlueAlpha创建，不使用会随系统环境变化的systemBlueColor，也不经Generic RGB二次转换。开关、重置卡进度条、Token柱/图例/刻度/悬停读数全部复用该颜色；绿/橙/红/灰及过渡/旧值透明度不变。原生检查核对准确sRGB值、各消费者共用颜色和实际图表像素。下文systemBlueColor描述为历史方案。

## 2026-10-19 底部操作图标移除

新建任务、询问ChatGPT、偏好设置、重启小组件仅移除左侧13pt装饰图标，文字起点统一从38pt回到16pt内容边界；不留图标空槽。系统菜单字号、24pt整行命中、灰色悬停、原动作路由均保留；偏好设置右侧箭头、180ms下拉、子级缩进/勾选、用量活动和数据区状态符号不改。Tests/menu-actions.cjs离屏验证四项双语均无左侧图标，实际前导文字像素位于16pt区域、字号/行高不变，偏好设置仍绘制右箭头；原按下、键盘/辅助功能与悬停回归继续覆盖。下文底部SF图标描述为历史方案，以此为准。

## 2026-10-18 C版圆环布局（当前）

按用户选定的完整C设计落地，并将MENU_WIDTH从320缩到288pt；左右16pt，内容宽256pt。dashboardMetricLayout在正式宽度下返回同一套64pt原生数据行：标题/余额在左，40pt/4pt线宽的容量圆环在右；底部同一基线左侧为状态图标与文字，右侧为重置倒计时。今日流量移入下方用量活动，两组同步删除原次级信息行及14pt占位。按倒计时真实本地化字宽分配底行，状态和倒计时之间至少12pt；旧值和缺值仍不编造重置期限。12pt标题和提醒、最大21pt圆角等宽余额、约2/3字号单位不变。基线依次50/24/5pt，圆环y20；组间8pt，共用布局间距定位VPN/Codex分隔线。MaoMaoYun/VPN之间的同款细线画在原有4pt间距中点，不增加行高。顶部上缘2pt，32pt工具区及原命中区域不变。单窗口metricsPairView174pt，双窗口246pt；不在鼠标回调或动画帧改行高。

drawDashboardRing只画原生静态轨道和实际余量弧，不创建计时器或新读数。未知值只有空轨道，旧值保留真实比例但变灰；耗尽、满额及跨账号仍沿原有模型判断。主横条与预测金额不再重复绘制，状态图标继续按可见字形中心对齐。200pt及以下保留原有窄列后备绘制，不影响正式288pt布局。

重置卡的时钟与到期倒计时按组合整体右对齐到272pt，和数量、圆环与进度条共用右边界；与左侧日期胶囊至少隔12pt，图标和文字之间4pt，保留10pt字级及原基线。下文“日期后12pt接倒计时”只表示最小间隔，不再表示靠左相邻摆放。

顶部仅128×24pt客户端名称入口和最右的38×21pt预览开关；移除官网按钮、状态、语言更新和打开浏览器的delegate/函数，不影响官网查询及登录。复用已有单一悬停owner及150ms菜单维护。重置卡标题22pt、每张34pt；16pt高等宽胶囊以本地化12pt medium标题的真实字宽为准，刷新时统一测量，不再受日期长度影响。日期仍10pt居中，带年份文字放不下时只画月/日，辅助功能保留完整日期。日期后12pt接倒计时、256×4pt寿命条；条直接使用与顶部开关相同的NSColor.systemBlueColor，倒计时文字/图标保留状态色。信息行中心距顶10pt，胶囊到条6pt、条下6pt。Codex→重置卡恢复12pt标准分隔行，重置卡→Token没有分隔行或额外占位。VPN/Codex之间和数据/操作边界保留细线。Token默认折叠及94pt热力图不变，方格按宽度适配。底部动作/偏好设置增加同一套13pt原生SF图标；NSImage使用respectFlipped绘制，避免按钮坐标系翻转图标。

偏好设置180ms淡入+4pt下移、用量活动500ms按日期同步重播、原生NSMenu开关/退出清理、独立登录命中和开关只预览行为全部保留。以下320pt/62pt/官网入口及无分隔线描述属于历史布局，由本节覆盖。

### Token柱状与VPN折线组合图（当前）

点击修复验收：Tests/activity-range-hit.cjs在旧布局上复现“30天点击由包含行接收→仍7天且收起”，不再仅通过直接调用子按钮证明可点击。新版向实际包含NSView发送原生NSEvent按下/行外松开，覆盖中英文24次按钮中心/两端点击、标题和箭头独立收放、禁用按钮、图内非按钮点击与关闭清理，边缘命中按实际控件宽度取值。图例位于左侧、范围胶囊位于右侧；悬浮等间距明细原位覆盖整条工具行、披露标题保持不变；Tests/activity-range.cjs检查按钮隐藏/移开恢复、标题不变、底层图例不再绘制及漏发mouseMoved时一次点击恢复切换，不增加空行。

展开图表工具行右侧采用76×20pt的「7天／30天」分段控件（原84pt）：6%白色灰底、16%白色选中层；中文10pt中等字重，英文两个标签统一适配至9pt，不截短。沿用正文#E8E8ED、次级#A8ABB3、槽线#62636D、系统蓝和既有预测绿，不额外增加强调色或行高。一个36×18pt选中底块在父NSView绘制，220ms smoothstep滑过两个分段，子按钮只绘文字并按底块相位混合两种文字颜色；快速反向先采样当前相位，不瞬移。与既有500ms数据重播共用一个60Hz计时器，底块先完成，数据仍完整500ms；收起、关闭、时钟回退、减少动态效果及计时器失败统一收尾到真实选择。动画帧只重绘，不改frame/hidden。Token与VPN用量图例同排靠左、按钮靠右，复用原图例行，不增加高度；披露箭头保留在上一行，首次默认7天、本次运行保留选择，收起或工具行被悬浮读数覆盖时隐藏。两个原生NSButton子视图属于独立图表NSView而非披露按钮，统一处理mouseDown、performClick和辅助功能press；容器mouseDown用事件坐标命中同一按钮路径，AppKit事件枚举显式Number化，校验当前父菜单、按钮引用、可见及启用状态，不开启额外原生追踪循环。切换清理旧hover，不关闭菜单、不改图高、不发请求；重复选择当前范围不重播。30天按30个逐日测量绘制窄柱与小节点，仅稀疏显示6个日期标签；悬停仍命中每一天，选中日期替换邻近标签以免相撞。设计审查保留原图表主次和紧凑尺寸，不新建范围标题、卡片或占位说明。

“用量活动”默认24pt折叠，展开仅一个160pt CodexUsageMeterUsageActivityView，替代原220pt的三个独立行；移除闲置的小标题/独立VPN视图及全局变量。不变更288pt菜单、其它分隔线或操作区域。tokenActivityChartLayout返回固定图高和30–120pt绘图区，行可见性只在点击回调同步改变，动画帧仅读模型与重绘。复用tokenMeterReveal和既有单个计时器，总长调整为500ms，无新窗口、计时器或请求。每次false→true在显露原生行之前清零数据进度；arrowFrom/arrowReveal单独保持箭头连续，不让快速重开沿用隐藏中的收起进度。单个计时器分别推进数据与箭头，直到两者完成；减少动态效果、关闭和退出统一收尾。

Sources/token-activity.js按YYYY-MM-DD把官方30日Token中的所选最近7天或30天与VPN日历系列合并。Token蓝柱、VPN绿色线段和圆点；左右轴独立、线性、从0开始，以1/2/5整数上限计量，VPN在原1024单位内选上限，不能混用单位。不常显图顶逐日Token读数，完整值留在提示与辅助功能。usageActivityDateProgress把500ms分成与所选日期数相同的连续阶段，usageActivityColumnFrame、usageActivityLineSegments和usageActivityLineNodeFrame使用完全相同的smoothstep相位：柱高和线段到达比例一致，当前移动节点跟随线头，最多一条部分线段。第一点及缺报后的独立点按同一相位淡入，不跨缺日连线。缺报/零值/两种轴不被动画改写；只有VPN的日期要等线头实际进入该列才命中提示。任一来源失败只清除自身，双缺报显示本地化空态。今天日期加粗，不恢复范围/截至当前副标题。

悬停时tokenActivityHoverForModel核对账号/数据/视图快照，图表工具行原位替换为x16、y135、256×24pt浅灰胶囊，12pt圆角；与20pt切换控件共用y147中心、上下各外扩2pt，下缘到最高刻度文字边界127pt保留8pt。图例与范围按钮完整隐藏，披露标题和箭头不变。用户确认需要“三段文字间空隙相等”而非等宽三栏：tokenActivityDetailMetrics用NSStringDrawingUsesDeviceMetrics排除字体左右bearing，缓存最多96组度量，失败回退advance；tokenActivityDetailPositions两端各12pt，将剩余空间均分为内部两个空隙。旧值时钟占对应组14pt，不消耗组间空隙。三项共用10pt字号，超长值统一缩小至至少7.5pt，保留至少12pt组间距；不改全局状态文字布局。绘图区最高120pt，轴字形至127pt，明细不挡柱线，不增加行高。选中日期以浅灰胶囊和竖向辅助线定位；移开恢复图例和范围按钮。drawTokenActivityHint严格核对捕获的hover（包含null），迟到事件不能把明细画在本帧图例上。hover变化在绘制外同步隐藏/恢复范围子按钮，并失效透明图表及父背景；绘制只读快照，不在drawRect中修改可见性，无额外窗口或鼠标监听。离屏原生检查双语/大数/旧值的可见组间距一致且不截断、其它日期图形像素不变及迟到hover防护；动画测试重现并修复98%进度复用，覆盖整菜单重开和快速披露重开，确认实际首列重新出现、末列被清空。

Sources/vpn-activity.js仅保留独立日历读数模型，按所选范围提供包含今天的7个或30个本地日期，用日历构造而非固定24小时相减，覆盖夏令时与跨月；不再注册独立绘图类。Token读取器继续要求完整30天缓存，合并只影响展示。悬停整列立即出现日期/Token/VPN三栏提示，使用原NSTrackingArea和150ms菜单维护，限制在160pt图内。Token与VPN会话、范围、语言、数据、视图、菜单生命周期均纳入重入owner校验；无新增全局鼠标监听或延迟。

原生账户读取器复用原有getTrafficLog响应，额外输出calendarBasis/local-midnight、calendarState、最多35项calendarDays及calendarReportedAt；严格核对本地午夜、重复、分页、数值与溢出，不乘倍率、不补缺日。正常5分钟读取的日历系列优先于6小时历史缓存，不加额外读取或升级时的强制请求。预测原有UTC固定桶完全独立且不变，图表不使用history.days贴日历标签。JS协议兼容无日历字段的旧缓存，并再次校验账号、会话和当前时区；日历详情错误不能丢弃有效余额。

Tests/vpn-activity.cjs保留原日历口径、DST与账号隔离测试，Tests/vpn-account.m验证原生汇总。Tests/token-activity.cjs新增日期join、独立轴互不影响、缺报断线、真实0、动画不变更读数及三行悬停/50次生命周期测试；Tests/activity-range.cjs验证7/30天逐日数据、30个独立命中区、固定行高、原生子按钮按下/无障碍触发、快速切换重播、限频不变和范围重入；Tests/token-disclosure.cjs验证单一固定行、跟踪循环、反向点击和关闭清理。Tests/meter-panels-ui.cjs合成数据离屏核对双语、超长值、任一/双方缺报，并按阶段取真实蓝柱和绿线像素。主64pt数据区的menu-layout测试不变。完整verify包含上述测试，预览不是桌面真实鼠标测试。

## 2026-10-18 上一版层级调整（历史）

MaoMaoYun操作条32pt，取消整体底色及独立App文字按钮：vpnAppButton复用为左侧104×24pt名称入口，真实状态点随名称绘制；右侧官网按钮64×24pt、开关38×21pt。名称与官网平时透明，悬停共用drawMenuRowHighlight的12%白色叠层及5pt圆角。menuRowItemForControl仅为当前metricsPairView内的两个按钮解析父菜单项，原生父行高亮回调保留指针实际命中的子按钮；移出、关闭或移除控件由既有单一owner与150ms菜单维护清理，不增加计时器。独立点击区维持原有打开客户端/官网动作；开关仍只预览动画。单Codex窗口时metricsPairView总高172pt，顶部和数据间保留4pt。普通操作与偏好设置恢复NSFont.menuFontOfSize(0)系统默认菜单字号，24pt行高及全行命中不变。重置卡每张36pt，日期/到期倒计时同为10pt、共用基线；等宽日期胶囊最小48×16pt、左右至少10pt留白，下方6pt后为用户选择的全宽288×2pt寿命条、条下8pt。正常倒计时为次级灰、临近到期保留预警色。下文旧工具条背景、36pt工具条、176pt总高和64×28pt按钮记录由本节覆盖。

VPN/Codex标题仍12pt粗体，重置卡与Token活动用12pt NSFontWeightMedium，字体缓存区分medium/bold/regular。主余额用原生NSMutableAttributedString按单行测量、绘制：数字保留圆角半粗等宽字体，末尾单位约为字号的2/3且同基线；小号今日用量、非数字占位和旧helper保留原有绘制。长数字按真实富文本总宽度拟合，最大21pt和第二行基线不变，不产生额外统计行。Token旧值时钟按新的标题字重测量、定位。

用户明确保留额度正常/警告的醒目程度：dashboardBadgeLayout的12pt、图标、绿色/橙色/红色及0.5pt光学校正均不变。状态块去掉7pt右内边距，使用未取整的真实文字宽度，使所有状态文字右端与进度条、重置倒计时共用304pt边界；图标间距不变。只将重置倒计时表述为“后重置”，卡片倒计时为“后到期”，VPN预计提前耗尽表述为“预计提前N天用尽”。预测计算不变，英文本地化使用短句以保持原字级。原生menu-layout仍核对状态字级、符号颜色和两组状态的文字右边界；meter-panels-ui预览扩展到底部真实菜单控件及默认折叠概览，不访问账号或执行动作。

## 运行行为

- buildMenu直接将NSMenu绑定到NSStatusItem.menu，启动后不再清空绑定、不设置自定义mouse-down开关或调用popUpStatusItemMenu。menuIsOpen仅观察原生打开/关闭以维护悬停、动画与读取，不再决定能否打开菜单；避免打开中止或关闭回调遗漏后，点击不断cancelTracking一个不可见菜单。helper以osacompile -s编译为stay-open applet，启动脚本返回系统NSApplication事件循环，不再用脚本里的NSRunLoop.run嵌套阻塞宿主输入分发；不靠高频定时器偶然访问原生属性来推进UI。原生AppKit管理再次点击、取消和失焦关闭，不修改系统菜单窗口。布局、后台频率与无悬浮说明行为不变。
- 设置及普通操作行共用CodexUsageMeterMenuRowButton的NSTrackingArea（Entered/Exited、ActiveAlways、InVisibleRect），随原生菜单可见矩形自动更新，不新增鼠标轮询、全局监听或输入焦点操作。单一menuRowHover保存当前行，drawMenuRowHighlight统一绘制10%白色透明叠层、5pt圆角/边距，不使用系统强调色；文字/勾号保持body、箭头保持muted。menu:willHighlightItem:同步键盘高亮，数据区不参与。收起隐藏行时prune，打开/关闭/重建/重启时清理，迟到的旧行exit不清除新行。Tests/preferences-hover.cjs验证原生跟踪区数量、双语中性灰像素变化、行间切换和生命周期，不弹窗口。
- 普通动作使用CodexUsageMeterActionButton、24pt行高、16pt文本边距、系统菜单字体，由makeMenuActionItem建立，保留NSMenuItem原target/action以支持键盘及原生调度；按下触发menuActionButtonPressed，先cancelTracking，再sendActionToFrom原菜单项。不显示置顶列表、不查询置顶标题或持有其聊天ID；相关模块、状态、回调和15秒轮询已删除，不修改Codex数据库。快捷操作与偏好设置仅以一条12pt分隔线相隔。移除、隐藏、禁用或退出时拒绝动作。Tests/menu-actions.cjs验证关闭顺序、只执行一次、双语、灰色像素、键盘/无障碍触发及陈旧按钮失效，不实际打开URL或重启。
- 偏好设置的自绘NSButton保持原生单选/瞬时按钮及target/action；cell启用bordered以让AppKit按整行矩形命中，而不是仅命中原生圆钮/文字矩形。sendActionOn只设置NSEventMaskLeftMouseDown，按下立即执行，不受松开前鼠标移动或菜单重排的取消影响；不含mouse-up/拖动/周期事件，避免双重触发。保留原生追踪、键盘与辅助功能路径，不接管全局鼠标，不抢输入焦点。drawRect完全自绘，不调用原生边框绘制，视觉样式不变。Tests/preferences-hit.cjs用真实NSCell/NSEvent覆盖中英文、勾号、文字、左右空白、边界之外与禁用动作；并向NSButton送按下/行外松开事件对，检查只触发一次、连续20次动画反向点击、显示/语言切换与计时器清理，不仅依赖performClick。
- 界面文案由 `Sources/i18n.js` 集中管理，纯数据/计算仍使用既有协议；生产启动先恢复 `CodexUsageMeterUILanguage`，缺失或损坏时默认 `zh-CN`。“语言”通过固定 24pt 自定义按钮在同一菜单向下展开两行，点击不退出 tracking，勾号表示选择，语言名称为 autonym。与显示设置共用绘制类，使用独立 180ms 临时过渡计时器，注册菜单 tracking mode，关闭/重启清理，快速点击反向，减少动态效果时即时切换。切换原位更新标题、绘制与辅助功能信息，不重建数据源、不控制任务/VPN。任务名称和账号不经过翻译。登录 helper 通过仅模式参数 `--login` / `--login-en` 选择本应用窗口语言，凭据协议和官网页面不变。

- 按接口返回的窗口时长识别额度：300 分钟显示 Session，10080 分钟显示 Weekly，不依赖 primary/secondary 位置或套餐名称。没有返回的窗口不显示；只有周额度时仅显示 Weekly，面板自动缩短。未知时长使用中性 Quota 标签，不猜测为 5 小时。
- 外环优先显示 Session；没有 Session 时显示 Weekly，辅助功能标签注明所显示的窗口。剩余 <=20% 为橙色、<=5% 为红色；任务运行状态使用统一绿色。
- 中心默认显示实际额度的整数百分比，使用系统圆角半粗等宽数字，不跟随圆环动画计数、不显示启动占位的 2%；未知额度显示 `—`，已知 stale 值继续显示。Menu Bar Display 使用 NSMenu 内的固定高度 NSButton 行，点击后通过 hidden 显示下方 Remaining Quota / Codex Icon 两行，让同一个菜单向下展开；不使用侧边子菜单、不在菜单跟踪期间改变自定义 view 高度。展开和选择不关闭菜单，再次点击标题收起，下次打开菜单默认收起。NSUserDefaults 保存 `menuBarDisplayMode`，启动时恢复。切换不重置运行颜色或圆环动画。
- 数字横向按可见字形边界（包含左侧 bearing）居中，而不是按等宽字符的空白布局框；因此 91/11 等结尾为 1 的数字不会偏左。使用 AppKit 的 [NSStringDrawingUsesDeviceMetrics](https://developer.apple.com/documentation/appkit/nsstringdrawingoptions?language=objc) 获取字形边界，按字体/字号/文本缓存测量结果，动画只复用坐标。保留原垂直基线、10.5/7.5pt 字号、圆环位置和颜色；旧系统测量失败时回退原布局，不影响图标可用性。
- 已移除图标、数据区与按钮的原生悬浮说明注册、提示文本构建和专用0.2秒图标检查。Sources/menu-tracking.js仅保留菜单打开时的150ms高亮清理及延期重绘检查，关闭/重启停止，不维护提示文本、注册区域或延迟显示状态。完整数据继续通过辅助功能提供；不会因删除浮窗而取消悬停高亮或绘制崩溃保护。
- 偏好设置及显示/语言选项统一180ms、ease-out cubic淡入与上方4pt下滑；父级展开时，两个子级标题的文字和箭头按preferencesReveal一起移动，子选项继续按各自reveal移动，父级标题本身不位移。drawMenuDisclosureChevron接受可选offsetY，Token活动仍用默认0，保留480ms逐列展开。固定24pt按钮内绘制，父级箭头同步旋转180°；收起同步隐藏选项，箭头平滑回转。原生行的显示/隐藏及 menu.update 仅在按钮动作中同步执行，动画计时器只更新绘制；避免异步收起结束原生菜单 tracking。展开仍是原生菜单一次性增加行，不连续修改行高或菜单窗口。Apple 不支持菜单 tracking 期间改变自定义 view 尺寸，因此只动画绘制。临时 60Hz NSTimer 显式注册 NSEventTrackingRunLoopMode，完成、关闭或重启后销毁；快速点击从当前进度反向。每帧读取 NSWorkspace 的减少动态效果设置，启用时立即完成；读取/计时器失败时回退即时切换。动画不改变额度、运行状态、偏好保存或读数据时序。
- 额度每分钟读取一次，打开菜单和唤醒时刷新。优先使用桌面应用内置 CLI，没有时再使用独立安装的 CLI；不发起模型调用。非法数据被拒绝；同步失败时面板和图标外环都保留上次值并标记 stale，没有有效值时明确显示 Sync failed，重试期间不再反复变成 Syncing。
- 成功额度写入 `~/Library/Application Support/CodexUsageMeter/Cache/quota.json`。重启时恢复同账号、24 小时以内的有效快照，显示 stale / Cached value · updating，成功刷新后清除旧值提示。缓存只保存额度、重置券信息和账号标识，不保存凭据；目录权限 0700，文件权限 0600，原子写入。切换账号会清空旧值并丢弃旧请求的迟到响应；无法确认本地账号（如仅钥匙串认证）时不使用磁盘缓存。
- 预测只采样成功额度读取，圆环阈值不变。320pt读数区共用Sources/dashboard.js，上方VPN与下方每个Codex窗口均62pt、组间8pt，以水平细线分隔，不绘制深色卡片或旧的中心竖线。第一行左侧浅灰标题、右侧共用状态文字及原生图标，三者统一12pt；第二行左侧最大21pt余额、右侧9pt倒计时。VPN的“今日消耗”以9pt标签和10pt数值融入余额右侧，与倒计时间隔12pt，不单占一行。按真实字宽先预留辅助信息，再适配长余额；字体ascender确保同一基线，余额基线距4pt进度条上沿8pt、条底留8pt。两组均删除统计三格及竖线，VPN不再绘制预计剩余；Codex与重置卡之间的分隔线也删除。不恢复每日预算、具体日期或长说明。首次无数据保留灰色空槽；stale保留真实比例、灰色填充和“上次读数”，不再用错误文字覆盖进度条；正常恢复清理旧标识，过期预测仍暂停。Sources/menu.js按完整行宽布局独立子视图，Session出现时在VPN下方追加同样62pt的窗口，只在窗口数变化时调整高度；状态或语言变化只重绘。完整日期和错误详情保留辅助功能，模型和证据门槛不变。
- 提示图标按本地化文字的可见字形中心垂直对齐，不再使用固定y+1/y+2偏移；三角形加0.25pt光学校正。VPN/Codex标题旁文字与SF Symbols统一12pt，以标题基线为基准整体下移0.5pt校正偏高观感，窄列后备才按真实宽度缩小；重置卡10pt和Token旧值时钟9pt不放大。字号、主标题和其余坐标不变，图标随右侧文字同步微移。字体/字号/文字度量仅缓存一次，失败按capHeight回退，不在绘制时扫描位图或添加计时器。菜单栏数字和工具条图标不变。Tests/status-symbol-alignment.cjs覆盖双语1x/2x实际透明像素、旧偏低复现、缓存及回退，Tests/menu-layout.cjs核验半点偏移和图文整组对齐，不弹窗口。
- Session 最近60分钟连续观察至少30分钟/7个五分钟锚点，全部内部间隔≤10分钟；边界仅跨正常间隔插值，30–59分钟支持未来30分钟，完整60分钟支持未来60分钟，实际reset更近则截短。单个下降保留证据但显示recent jump。Weekly按真实周期记录消耗，正常reset可跨周期保留；最近28天小时桶、按日错开匹配剩余H的完整历史块，P50典型/P90较高情景不是置信区间。需至少72小时跨度、3个候选、每小时及总覆盖≥98%、缺口≤15分钟；工程门槛未经真实多周校准。睡眠/重启缺口保留interval-censored总损失但不摊平/补零、不用于预测。绝不使用cycle平均fallback。
- `forecast-v2.json` version/algorithmVersion/accountId、0700/0600原子保存，512KiB上限、至多两个窗口；旧forecast.json只读迁移保留回滚，v1点不提供完整Weekly覆盖。近期点48h/600个，小时桶28d/674个，缺口200个；同周期补额>0.05、异常reset时间表、时钟回退断代，微小上跳用单调锚点避免双计。账号不明只给预算不持久化；账号切换/迟到回复隔离，重启/唤醒先新read并断近期段，历史I/O失败不影响额度。
- 任务检测按每个未归档聊天当前 rollout 的执行 ID 关联最新回合；当前 rollout 尚无历史投影时回退聊天 ID，不让旧执行记录覆盖新执行状态，也不按 `source=vscode` 排除桌面聊天。合并所有任务的活跃状态：只要有一个仍活跃，图标就保持绿色。只读取回合开始时间、执行条目时间，不使用对话访问时间；近 15 分钟有执行记录才显示活跃。没有官方执行心跳时这仍是保守推断：长期没有写入记录的运行可能显示为空闲。
- 运行中或菜单打开时每 2 秒读取任务状态，空闲时每 10 秒；不再轮询置顶聊天，打开菜单也不查询置顶列表。
- VPN 唤醒重连先确认 Disconnected，再执行 start；每阶段最多三次命令尝试，总超时 60 秒。手动点击会替代自动重连意图。所有系统睡眠唤醒都会触发，不仅合盖。
- VPN Traffic 与开关逻辑独立：通过内嵌 `MaoMaoYunAccount.app` 原生 helper 的 `--read` 直接 GET 固定官网 `https://app.maomao234.com/api/v1/user/getSubscribe`，不再读取任何客户端缓存。上传 u + 下载 d 为已用，transfer_enable 为总量；验证安全整数、总量 >0，输出白名单原始字节值和查询时间，不输出邮箱、token、订阅链接或原正文。界面以 1024 换算、两位小数显示，官网计费统计仍可能滞后。 v3保持v2兼容，加入session身份声明、原始bytes及resetDays/resetState；reset_day只接受数值安全整数，缺失/非法独立降级，0代表官网今日报告已重置，正整数用于天级预算，不用expired_at/30天推期限。
- 原生 helper 用 Security/LocalAuthentication 读本 App 自己的通用密码钥匙串条目；后台 interactionNotAllowed，绝不取客户端/其他浏览器凭据。NSURLSession 临时配置、不存缓存/cookies，TLS 至少 1.2、默认证书校验，拒绝所有重定向，响应大小限制 256KiB。12 秒请求/14 秒资源超时、29 秒网络等待看门狗；JXA 35 秒看门狗、0.25 秒临时完成计时器，覆盖钥匙串系统调用的进程阻塞且不阻塞 NSMenu。
- 登录只由 Traffic 的 Sign in 点击/辅助功能 press 显式启动 `--login`。先结束原生菜单 tracking，再打开固定官网的 WKWebView 窗口，临时 websiteDataStore；只在用户按“验证并连接”时读取本窗口的 authorization 会话，验证成功再存自身钥匙串。密码只发送给官网；不操控密码输入、不打开客户端，不从别的浏览器偷取会话。后台不会弹窗；登录子进程单实例、20 分钟超时，重启时取消两类任务和临时计时器，取消登录不重开窗口。
- 本地每分钟检查查询期限，真实后台请求至少间隔 5 分钟；菜单打开可提前刷新，但至少间隔 1 分钟。HTTP 429 退避至少 15 分钟，force 不能绕过。读任务与登录任务互斥、重复刷新合并；登录中不接收旧请求，headless 成功后再次核对钥匙串会话未变化。每次返回的账号摘要绑定该登录会话，不承诺稳定账号 ID；重登整份替换，authRequired/keychainLocked/credentialChanged/非法数据清空旧值，网络/超时/429 只保留已验证快照并标记 stale。
- 唤醒流量恢复由独立、仅存内存的 owner 管理：先取消睡眠前余额/历史任务并标记旧余额，等待原有 VPN 重连结束及 Connected 后 1500ms 稳定期；1 秒临时计时器在 3 分钟内最多触发 3 次单飞读取，失败间隔 5/15 秒。只有该 owner 可以越过通常的1/5分钟间隔，打开菜单不能提前触发或增加预算；余额/当日记录/历史的共享 origin 429 退避仍优先。error/timeout/keychainLocked 可有限重试，但钥匙串不可用仍清空未验证值，不自动打开登录或额外发送 VPN 命令；ready、authRequired、credentialChanged、invalid、429或重试耗尽结束恢复。显式登录、手动VPN意图、重启/退出、新一轮唤醒、时钟倒退和总时限都会清理旧 owner/计时器。失败的重连仍不查询，后续真实 Connected 可在该总时限内恢复；超过时限回到平时低频策略。只延后官网查询，不改变原有 stop→确认Disconnected→start 的唤醒连接行为。
- Traffic为顶部完整62pt数据行。MaoMaoYun控制条在数据区上方，36pt高；官网和App按钮保持64×28pt，动画开关保持38×21pt并位于最右，所有命中区域与账号登录视图独立。后台更新不增加计时器或请求，不因失败、语言或结论改变行高。简洁预测提醒在标题右侧，今日消耗和倒计时融入余额行，删除预计剩余数值及旧三格。无数据或stale不推结论；条件记录仍为中性，典型路径确实提前耗尽时显示距离重置提前多少天并以橙色提醒，不用较高消耗情景冒充典型耗尽，不把正余量升级为绿色安全保证。中英文均检查实际绘制边界；完整状态、数值和依据保留在辅助功能中，不弹出悬浮说明。成功数据超过10分钟或失败时标记stale，无登录时显示Sign in；复用已有本地UI计时器。不保存磁盘流量快照；重启从自身钥匙串验证，与客户端账号独立。官网内部接口无公开兼容性承诺，ad-hoc签名更新原生helper可能需再次授权/登录。
- 独立 --history 读取固定 /api/v1/user/stat/getTrafficLog，最多6h一次（有效同会话缓存fetchedAt跨重启限频），与余额/登录互斥、共享origin429退避，末尾核对自身Keychain revision。原生校验并汇总u+d，不重复乘server_rate，明确UTC固定24h桶，最近35天裁剪保留、缺失日期不补0、最近48h排除训练；合法旧日期裁剪不作为partial。duplicate/pagination/非法schema明确弃权。stdout含newline硬≤8KiB，只有白名单聚合/boolean/count诊断；超限outputLimited暂停历史，不沿用旧预测。history失败不清余额，过期/身份变化禁用条件情景；临时轮询取消后不空转。
- `vpn-history.json` 单独0700/0600原子保存匿名session和数值，真实read成功确认session后才恢复。官网记录完整性标unverified；正resetDays可用匹配天数的连续已报告桶条件情景，下次reset未知/0需至少7个连续合格桶，用3/4/7日平均中较高者给粗粒度days left。不输出safe/risk，缺数据主行learning；fetchedAt而非当前clock确定合格历史日，防跨午夜把旧partial成熟。保留修订替换语义，磁盘写失败不阻止新内存结果展示。
- Ask ChatGPT 只通过默认浏览器打开 ChatGPT 网页，不操作输入框。
- Restart Widget 由 App 内置的原生管理进程重新拉起菜单栏子进程，不依赖登录守护程序。重复打开 App 不会产生多个图标。不再提供退出 Codex 主应用的菜单操作或相关回调。

## 源码结构

`Sources/modules.list` 是生产构建与测试共用的唯一 JXA 装配清单：先纯模型和运行时，再原生视图/交互与数据控制器，最后 `main` 启动。保留 JXA 所需的单个全局脚本，不额外引入框架、依赖注入层或后台进程。

`Tests/architecture.cjs` 检查每个运行时JS文件恰好装配一次、基类和启动顺序、全局函数不重名，以及纯模型不依赖原生调用。2026-10-19整理时移除9个无运行时引用的旧绘图/格式化函数及仅为它们服务的旧测试桩；测试改为覆盖实际使用的数值绘制和状态徽标入口，不删除账号、缓存、旧协议或绘制重入保护。整理前满意设计保存在本地忽略的Backups中；24个双语原生状态的几何/文字/颜色记录相同，10张渲染PNG与备份源码生成结果逐字节一致。

- Sources/app-launcher.m：轻量原生 Cocoa 启动器，负责单实例、子进程重启、终止清理和日志轮换。
- Sources/AppInfo.plist：App 身份、版本和菜单栏应用属性。
- Sources/core.js：纯数据验证。
- Sources/meter-panels-core.js：周期进度、重置卡寿命、Token范围及状态图标语义的纯展示模型，严格校验数字与账号。
- Sources/meter-panels.js：原重置卡及分隔线、24pt用量披露标题、独立图表工具行的7/30天子按钮、单一160pt组合图与500ms重播动画生命周期；无总量或额外图表标题。
- Sources/vpn-activity.js：7个或30个本地日历日期的只读流量模型，复用既有每日响应，严格区分缺报、真实0和今天部分累计，不重解释预测UTC桶。
- Sources/token-activity.js：7/30天Token柱/VPN线、独立双轴、按日期合并及原生绘制；一个NSTrackingArea驱动图内三栏提示，复用菜单维护，不创建独立窗口或鼠标计时器，保留任一数据源、范围与几何重入的owner校验。
- Sources/token-meter.js、token-profile-reader.m：官方个人资料Token数据后台任务、固定HTTPS来源、独立私有缓存、单飞/限频/看门狗与账号切换清理，复用现有2秒维护计时器检查期限。
- Sources/forecast-core.js：纯预测算法、样本合并和预测历史校验。
- Sources/adaptive-forecast-core.js：第4版官方间隔、官网修订、持续余额变化、条件路径、证据/提示精度及私有日志校验；不含系统调用。
- Sources/forecast-learning-core.js：不可变事前预测、实际/标准/重置前目标、上下界结算、不重叠同期限权重学习与v3/v4隔离。
- Sources/adaptive-forecast.js：第4版私有日志I/O、只读迁移、账号及会话绑定、后台更新后的预测缓存；绘制路径不扫描历史或写日志。
- Sources/token-forecast-core.js：同账号同套餐历史token/额度校准，作为Weekly连续观察不足时的中性粗估后备。
- Sources/token-history-reader.m、token-history.js：内嵌只读原生汇总程序、私有数字缓存与低频非阻塞扫描生命周期；详见 [历史粗估验证](TOKEN_FORECAST.md)。
- Sources/forecast-display.js：纯展示摘要与预测/周期来源区分；遵守算法给出的证据和日期精度，不在绘制中另算模型。
- Sources/runtime.js：AppKit 桥接、公共后台任务、定时器与错误日志。
- Sources/state.js：按现有默认值初始化共享状态与配置。
- Sources/appearance.js：共享的颜色、字体、文字与进度条绘制。
- Sources/dashboard.js：两组64pt圆环读数区及8pt组距、标题/余额/提醒三层、200pt以下窄列后备绘制及预测摘要；主区不显示今日用量或预留元信息空行，不创建窗口或控制任务。
- Sources/status-icon.js：菜单栏图标、辅助功能标签与圆环动画。
- Sources/menu-tracking.js：菜单打开期间的高亮清理、几何查询和延期重绘维护，不注册悬浮说明。
- Sources/menu-rows.js：共享原生按钮、单一悬停 owner、绘制重入保护及延期重绘；不读取账号或启动后台任务。
- Sources/preferences.js：偏好设置整行控件、内联显示选项及既有180ms动画。
- Sources/vpn-header.js：顶部名称/真实状态点、贴合名称的悬停背景与Wi‑Fi样式开关；只做现有开关预览，不发VPN命令。
- Sources/menu.js：只负责原生菜单组装、额度/流量只读视图和父子布局；由977行拆为363行，以上交互实现原样分离，尺寸、配色、时序和动作不变。
- Sources/vpn.js：VPN 命令、确认与有限重试。
- Sources/vpn-account.m / VPNAccountInfo.plist：固定官网查询、严格输出协议、仅本 App 的钥匙串凭据与用户触发的官网登录窗口。
- Sources/vpn-traffic-core.js：原生 helper 字节协议的纯校验、余量格式化和状态文案。
- Sources/vpn-traffic.js：官网后台查询/显式登录任务、限频/超时/退避与菜单状态。
- Sources/tasks.js：运行状态只读查询。
- Sources/usage-cache.js：本地账号识别与额度缓存读写。
- Sources/forecast.js：预测历史 I/O、账号隔离、采样及界面预测状态。
- Sources/usage.js：额度刷新、账号切换与显示状态更新。
- Sources/main.js：用户操作、事件绑定和启动。
- Sources/modules.list：唯一的模块加载顺序；assemble.sh 与原生测试共用。构建后仍是单个 JXA 程序，没有新增运行依赖。

JXA 模块共享全局作用域：runtime 先导入 AppKit，state 再创建初始状态，各功能模块定义函数和视图，最后 main 执行启动。调整结构时保留现有菜单顺序、文案、颜色、阈值和轮询时序；把纯数据转换留在 core、系统读写留在对应读取模块、菜单更新留在界面模块。

### 新增面板的布局与读取边界

2026-10-18活动图动效修订：从整体180ms淡入改为从左到右逐列展开，按用户反馈将总长从320ms放慢至480ms，每列错开30ms、各自210ms cubic ease-out/4pt到位。同列三格同步，8档色阶与列优先日期不变。复用原单个动画计时器，线性总进度供局部缓出和箭头使用；反向以剩余距离确定时长。tokenActivityCellFrame共用绘制/命中/提示锚点，未出现列不触发悬停，静止光标随每帧取得新格子。不新增常驻定时器、窗口或网络请求；减少动态效果即时完成，菜单高度仅在点击时同步改变。原生离屏测试核对前/中/末段逐列像素、实际tracking进度、50次提示状态交接、快速反向与退出清理。以下180ms Token动画描述为历史记录，偏好设置的180ms不变。

2026-10-18最新活动图交互修订：3行×10列改为列优先日期；4档线性色阶改为8档非线性，对300万/9000万作明确区分。删除系统原生tooltip区域及NSString owner状态，改为NSView内即时两行提示。mouseEntered/mouseMoved/mouseExited、展开动画首帧及既有菜单150ms维护共用实际坐标校验，不等180ms结束或系统停留延迟，无新计时器/窗口/全局设置。Tests/token-activity.cjs新增45ms展开命中、颜色复现、静止鼠标/漏退出/迟到事件/几何期间关闭等覆盖。以下原生tooltip和七日图说明是历史记录。

2026-10-18活动图修订（覆盖下方旧七日图说明）：Token计量改名Token活动，官方Profile读取和缓存升级version3，严格30个日期；旧version2七日缓存拒绝，不本地补造历史。24pt折叠标题/180ms动画不变，展开94pt的3×10热力格，日期与用量仅在系统原生tooltip显示；其余控件仍禁止悬浮说明。Tests/token-activity.cjs覆盖边界/蓝阶/双语/原生区域与强持有/清理，Tests/token-meter.cjs验证30日与跨月/闰日；所有原有限频、认证隔离、响应上限与网络边界不变。以下2026-10-18较早的七日图段落为历史记录。

2026-10-18展示修订：VPN“有余量”和Codex“进度正常”共用activeAccentColor(1)，文字与图标同绿；旧值、缺数、观察中保持muted，算法/置信度不变。Token标题右侧不再绘制合计；独立24pt原生按钮默认折叠，下方84pt原生图表项同步hidden。共用现有悬停和drawMenuDisclosureChevron，180ms ease-out仅绘制箭头及图表透明度/4pt位移，帧回调不改行高或hidden。menuWillOpen/menuDidClose恢复折叠，restart取消临时计时器，快速反向、减少动态效果及失败后即时切换。标题12pt浅灰，与其它数据区一致；上方分隔线及12pt空白删除，下面操作区分隔线保留。总量只在内部模型/辅助功能中保留，折叠不改变读取或限频。Tests/token-disclosure.cjs离线覆盖状态机、真实整行鼠标与AX、追踪模式动画像素及生命周期。

Codex每个窗口与VPN均62pt，两个额度窗口132pt，单窗口时共享父视图176pt；两组统计格/竖线、预计剩余数值和旧占位均删除。VPN预测提醒与Codex状态共用dashboardMetricBadge/dashboardBadgeLayout绘制在标题右侧，文字和符号均12pt，与标题一样大。已验证的典型提前耗尽显示橙色，真实耗尽红色，未验证的报告情景不变成绿色安全保证；模型状态和数据不被视觉提醒修改。VPN今日消耗标签9pt/数值10pt与倒计时同行，按真实字宽预留右侧位置再适配主余额，三者共用基线。180pt窄列后备才保留84pt/条下今日信息，正常320pt无额外行。8pt分组间距与8pt余额基线至进度条间距不变，周期剩余蓝条不恢复。额度与重置卡之间不放分隔线，直接利用条底8pt及标题内边距留白。无论语言、stale或预警如何变化，不修改固定高度。重置卡按官方发放/到期时间计算比例，缺发放时间才使用持久化首次观察基准；记录只含数字，不保存卡ID或描述。状态符号用SF Symbols，不注册tooltip，不替代文字或改变预测判断。

`TokenProfileReader --cache`固定读取`https://chatgpt.com/backend-api/wham/profiles/me`，只接受有效stats和daily_usage_buckets，保留服务端日期/Token数。正常stats中的缺日按Profile图表同样补零、重复日期同样相加；缺失/错误stats不补零。按本机日历选包含今天的7个日期，不把日期字符串转成UTC事件边界。旧TokenHistoryReader的meter模式、24h/30d聚合、分类字段及切换回调均删除；该程序仍只服务原有21天预测后备，算法不变。

新原生读取器在进程内读取Codex认证；账号/令牌不经过参数或环境变量，不输出个人资料原文。系统TLS、禁止重定向、512KiB响应上限、12秒请求/18秒资源/22秒等待上限。固定`token-profile.json`按0700/0600原子保存账号、时间与7个日期/数字，保存前及主进程接收时核对账号。version2/source=profile拒绝旧本机计量缓存。正常5分钟/打开菜单最少1分钟，429退避15分钟不能强制绕过；主进程35秒看门狗，任务期间0.25秒临时轮询，退出/重启/账号切换取消。失败只保留旧官方统计，401/403清空并提示登录，不混入本地扫描估计。

`Tests/meter-panels.cjs` 验证预警/重置卡模型及图标语义。`Tests/token-meter.cjs` 编译`Tests/token-profile-reader.m`，离线验证真实原生日期聚合、隐私、坏数据/缺stats与响应上限/拒绝重定向；VM覆盖七天缓存、身份、限频、429/登录失效和超时。显式`--live`才编译生产读取器、以当前账号只读核对官方七天数字，不写缓存或打印凭据。`Tests/meter-panels-ui.cjs` 对中英文正常/低余额/过期/缺数/零/超长数字/限频/登录状态实际AppKit离屏绘制，检查只剩一个额度条、24pt Token折叠标题及84pt图表、无标题合计、七个常显用量与日期逐列居中且不碰柱形/标题、无来源行/分类/范围控件/柱形点击选择及tooltip，不创建测试窗口。`--preview`使用合成数据，不是账号截图。

## 验证与安装

要求 macOS、已登录的 Codex（桌面内置 CLI 或独立 CLI）；VPN 功能需要 MaoMaoYun。App 自带 JXA 程序和辅助脚本，运行不需要 Node.js，但额度和任务数据仍来自本机 Codex，不是脱离 Codex 的独立服务。开发验证需 Node.js，构建还需 Xcode Command Line Tools；原生启动器包含 Apple Silicon / Intel 两种架构，实际验证以当前 Mac 为准。
运行 `zsh verify.sh` 检查每个 shell 文件与 JXA 主程序，并执行回归测试；原生 NSMenu 测试覆盖菜单顺序、按钮动作、已删除置顶功能的无残留检查，以及分隔线的数量/位置。
`Tests/hover-popups.cjs` 检查生产代码不存在原生提示注册及旧回调，并在真实AppKit离屏控件中验证图标、数据区、按钮和任务经过中英文切换、刷新及菜单生命周期后均无悬浮说明。`Tests/menu-tracking.cjs` 保留菜单检查计时器的单实例、关闭/退出清理、失败回退和跨屏几何验证；原有悬停高亮与绘制重入测试继续运行，不打开用户菜单或操控鼠标。
`Tests/status-menu.cjs`默认离线验证真实生产启动保留原生菜单绑定、stay-open构建和无嵌套事件循环，残留menuIsOpen不再阻断打开，并复现已删除开关的永久取消分支。显式`--fixture`会短暂打开独立测试图标/菜单，以生产视图及代理验证原生开关：旧控制器注入残留状态后打不开，修复版连续三次打开/取消/重开；经过35秒宿主idle后再执行三次，检查没有重复图标或代理失效。此模式不访问账号、偏好、URL或VPN，不在普通verify中运行。`Tests/status-menu-probe.swift`仅允许明确PID对应的本组件/测试bundle，用辅助功能按状态图标和取消菜单；不点击菜单命令。AXPress在原生菜单跟踪期间可能等到超时才返回，因此按实际菜单可见尺寸核验，不把返回码单独当成成功或失败。
`Tests/vpn-account.m` 离线验证固定 origin/请求头、数字 schema、匿名会话绑定和输出白名单，不读真实钥匙串、联网或开窗口。`Tests/vpn-traffic.cjs` 使用 VM 与本地 printf 协议替身，覆盖字节/余量、非法数据/隐私字段剔除、时间过期、低频/并发、429 退避、网络/超时、会话变更、显式登录互斥/取消/失败/超时/清理；真实 NSTask、Foundation/NSMenu 绘制、固定行高和辅助功能 press 也在无窗口 fixture 中验证。`node Tests/vpn-traffic.cjs --live` 额外通过已安装 helper 只读验证本 App 的已授权钥匙串会话与真实官网流量；可用 `--helper /绝对路径` 选择暂存构建的 helper。不打开客户端或菜单、不切换 VPN、不输出凭据/原正文。真实官网登录已在用户授权的专用窗口验证，不能把离线模拟当作真实登录成功。
`Tests/vpn-wake.cjs` 通过生产唤醒代理与真实 stop/确认/start 状态机的替身复现旧时序，验证重连前不发请求、稳定期、5/15秒有限重试、普通菜单限频恢复、429与当日退避、会话/登录隔离、旧任务取消、重复唤醒、断线重建稳定期、时钟/退出/总时限清理。另以真实 NSTimer/代理回调和本地 printf 任务验证非阻塞结果及计时器释放，不让 Mac 睡眠、不运行 scutil、联网或访问真实钥匙串。
2026-10-13 的最终 v3 构建已完成官网只读核验：余量、`reset_day` 的 `0` 分支和受限历史聚合均成功返回，历史会话绑定检查通过。正重置日数、缺失字段及异常分支仍由离线测试覆盖，未声称逐一在真实账号观察到。此前暂存版本超时经只读函数栈采样定位于 `SecItemCopyMatching` 的系统钥匙串读取，随后同一最终 helper 恢复成功；未修改钥匙串访问规则。接口成功不证明记录完整性或预测准确性，历史仍标为 `unverified`，没有真实多周校准结果。

运行状态回归检查覆盖桌面聊天与当前执行 ID 不同、桌面端与 VS Code 并行结束、旧执行状态残留、归档、历史投影回退和陈旧记录过滤；这些检查只使用隔离测试数据库，不停止真实任务。
中心显示回归检查覆盖额度窗口选择、数字取整、未知值、设置读写失败、菜单动作与动画保留，并用真实 AppKit 核对圆角等宽字体、图像尺寸和跨进程设置恢复。偏好测试使用独立临时域，不改变用户选择；`node Tests/status-display.cjs --preview` 可生成实际绘制结果的临时预览图。
`Tests/status-alignment.cjs` 单独验证字形 bearing、缓存复用和异常/无效度量回退；对 0–100 及未知符号逐一校验原生字形边界，再对单/双/三位和窄宽字形在两种绘制倍率进行像素检查（按实际 Retina 位图倍率换算），与旧算法的 91 对比，确保可见横向中心修正且原本正确的垂直位置不变。无窗口、不访问用户账号或修改偏好。
`Tests/display-animation.cjs` 单独验证展开/收起、快速反向、过渡中选择、菜单关闭/重新打开/退出清理、减少动态效果及计时器失败，并用真实 AppKit event-tracking run loop 检查动画推进和固定行高；不改用户偏好或任务。原生菜单自定义视图的动画及尺寸限制参考 [Apple 文档](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MenuList/Articles/ViewsInMenuItems.html)。
`Tests/forecast.cjs` 覆盖预算无cycle、Session30/60边界/单点突降/内部缺口、Weekly跨周期/真实H/覆盖不足、微小上跳、补额、同小时>100pp历史持久化、时钟回退、legacy迁移、账号/迟到回复、Foundation权限和AppKit单行尺寸。`Tests/forecast-backtest.cjs` 用冻结旧算法进行仅合成历史重放，公共可预测时点单列、误报/漏报/弃权/MAE分别输出；缺口和补额不冒充可评分真值。合成重放包括新高强度改变仍可能漏报，不能据此宣称总体准确率提高、95%置信或真实多周验证。
`zsh verify.sh --live` 另外检查实际额度接口和数据库字段。

运行 `zsh install-autostart.command` 安装。新应用先在暂存目录中构建签名，验证后切换；安装失败自动恢复旧版本。上一版保留在：
`~/Library/Application Support/CodexUsageMeter/Rollback`。
从旧版本升级时，旧 AppBundle、外部看守脚本和原启动配置一并移入 Rollback；不删除额度缓存，不修改 Codex 对话或工作文件。新 App 内部包含原生启动器、JXA 菜单栏 helper 和 VPN 辅助脚本，业务界面保持不变。

单独运行 `zsh build.sh` 会输出临时目录中的应用路径；也可传入一个尚不存在的目标 .app 路径。
构建不再留下第二份永久 BuildOutput。
可用 `node Tests/app-bundle.cjs '/path/to/Codex Usage Meter.app'` 校验构建包结构、签名和资源。安装后可显式运行 `node Tests/app-lifecycle.cjs --installed` 测试单实例、子进程重启、无登录代理时双击启动及代理恢复；此测试会短暂重启小组件，不停止 Codex 或切换 VPN。

当前使用本地 ad-hoc 签名，适合本机使用。尚未做 Developer ID 签名和公证，不能把它视为已可无提示分发给其他 Mac 的正式发行版。

运行 `zsh uninstall-autostart.command` 停止组件并删除 App、登录启动配置、本地缓存/日志及回滚副本；项目源码保留。

## 日志与历史

菜单的 Objective-C 属性访问可能先运行其他 AppKit 事件，再返回原 JXA 回调。悬停状态因此采用整份快照替换，跨原生调用保留本地 owner；移出、清理和几何查询只处理仍匹配的快照，迟到回调不能清空或覆盖新 owner。`drawMenuRowHighlight` 仅读取状态，不在绘制中调用 reconcile/prune 或请求重绘。所有自定义菜单视图经 `registerMenuViewSubclass` 注册：嵌套 drawRect 延后到现有150ms菜单计时器重试，绘制期间的失效请求同样延后；没有新增常驻计时器。关闭/退出丢弃待绘制工作。JS 绘制异常在返回 Objective-C 前截获，限16条待处理诊断、每条600字符和64个待重绘视图；文件日志在绘制之外写入，避免错误处理自身重入。不会禁用原有进程崩溃恢复，也不把捕获错误当作绘制成功。

`Tests/menu-callback-safety.cjs` 在 VM 中复现旧代码的“属性 getter 触发移出后继续解引用空 owner”异常，并检查迟到事件、只读绘制、延期重绘和恢复。原生离屏测试另外执行600次真实 Objective-C getter/悬停回调重入，检查中英绘制、注入错误后的恢复及嵌套绘制重试。不打开实际菜单，不操作用户鼠标、偏好、任务或 VPN；这些测试覆盖已定位的调用顺序，不代表完成所有系统事件排列的长期稳定性验证。

数据目录中的 widget-errors.log 保存限长、去重的功能异常；widget-process.log 保存进程输出，App 的原生管理进程重启子进程时进行轮换。未参与新版构建或运行的旧 keep-widget-running.zsh 已从源码删除；安装器仍保留旧安装路径的迁移/回滚处理，不影响升级兼容性。
额度读取对初始化设 15 秒、account/rateLimits/read 设 30 秒超时；组件另设 50 秒总看门狗，读取始终在后台进行，不阻塞菜单。失败日志注明对应阶段；开关菜单产生的重复请求合并，不同时启动多个读取器。运行 `zsh Sources/usage-reader.zsh --diagnose` 可在 stderr 查看所选 CLI 和分阶段耗时，stdout 仍只包含额度响应。诊断可设置 `CODEX_USAGE_CLI` 为可执行的绝对路径；测试可用 `CODEX_USAGE_INITIALIZE_TIMEOUT_SECONDS` / `CODEX_USAGE_QUOTA_TIMEOUT_SECONDS` 缩短（不能超过默认值）阶段超时。
Sources 不记录对话内容或登录凭据。

数据库文件名仍属于 Codex 内部实现，升级后可能需要调整；读取失败会记录日志，不会修改 Codex 数据库。
