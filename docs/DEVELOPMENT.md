# 开发说明

## 运行行为

- 按接口返回的窗口时长识别额度：300 分钟显示 Session，10080 分钟显示 Weekly，不依赖 primary/secondary 位置或套餐名称。没有返回的窗口不显示；只有周额度时仅显示 Weekly，面板自动缩短。未知时长使用中性 Quota 标签，不猜测为 5 小时。
- 外环优先显示 Session；没有 Session 时显示 Weekly，悬停提示注明所显示的窗口。剩余 <=20% 为橙色、<=5% 为红色；任务运行状态使用统一绿色。
- 额度每分钟读取一次，打开菜单和唤醒时刷新。优先使用桌面应用内置 CLI，没有时再使用独立安装的 CLI；不发起模型调用。非法数据被拒绝；同步失败时面板和图标外环都保留上次值并标记 stale，没有有效值时明确显示 Sync failed，重试期间不再反复变成 Syncing。
- 成功额度写入 `~/Library/Application Support/CodexUsageMeter/Cache/quota.json`。重启时恢复同账号、24 小时以内的有效快照，显示 stale / Cached value · updating，成功刷新后清除旧值提示。缓存只保存额度、重置券信息和账号标识，不保存凭据；目录权限 0700，文件权限 0600，原子写入。切换账号会清空旧值并丢弃旧请求的迟到响应；无法确认本地账号（如仅钥匙串认证）时不使用磁盘缓存。
- 任务检测只读取最新回合的开始时间、执行条目时间，不使用对话访问时间。近 15 分钟有执行记录才显示活跃。没有官方执行心跳时这仍是保守推断：长期没有写入记录的运行可能显示为空闲。
- 运行中或菜单打开时每 2 秒读取任务状态，空闲时每 10 秒；Pinned 每 15 秒检查，打开菜单立即检查。
- VPN 唤醒重连先确认 Disconnected，再执行 start；每阶段最多三次命令尝试，总超时 60 秒。手动点击会替代自动重连意图。所有系统睡眠唤醒都会触发，不仅合盖。
- Ask ChatGPT 只通过默认浏览器打开 ChatGPT 网页，不操作输入框。
- Restart Widget 由 App 内置的原生管理进程重新拉起菜单栏子进程，不依赖登录守护程序。重复打开 App 不会产生多个图标。Quit Codex 仍只退出 Codex 主应用，不退出小组件。

## 源码结构

- Sources/app-launcher.m：轻量原生 Cocoa 启动器，负责单实例、子进程重启、终止清理和日志轮换。
- Sources/AppInfo.plist：App 身份、版本和菜单栏应用属性。
- Sources/core.js：纯数据验证和固定任务解析。
- Sources/runtime.js：AppKit 桥接、公共后台任务、定时器、文件元信息与错误日志。
- Sources/state.js：按现有默认值初始化共享状态与配置。
- Sources/appearance.js：共享的颜色、字体、文字与进度条绘制。
- Sources/status-icon.js：菜单栏图标、悬停文案与圆环动画。
- Sources/menu.js：原生菜单构建、自定义视图和额度布局。
- Sources/pinned-menu.js：固定任务菜单的呈现与更新。
- Sources/vpn.js：VPN 命令、确认与有限重试。
- Sources/tasks.js：运行状态和 Pinned 数据查询。
- Sources/usage-cache.js：本地账号识别与额度缓存读写。
- Sources/usage.js：额度刷新、账号切换与显示状态更新。
- Sources/main.js：用户操作、事件绑定和启动。
- Sources/modules.list：唯一的模块加载顺序；assemble.sh 与原生测试共用。构建后仍是单个 JXA 程序，没有新增运行依赖。

JXA 模块共享全局作用域：runtime 先导入 AppKit，state 再创建初始状态，各功能模块定义函数和视图，最后 main 执行启动。调整结构时保留现有菜单顺序、文案、颜色、阈值和轮询时序；把纯数据转换留在 core、系统读写留在对应读取模块、菜单更新留在界面模块。

## 验证与安装

要求 macOS、已登录的 Codex（桌面内置 CLI 或独立 CLI）；VPN 功能需要 MaoMaoYun。App 自带 JXA 程序和辅助脚本，运行不需要 Node.js，但额度和任务数据仍来自本机 Codex，不是脱离 Codex 的独立服务。开发验证需 Node.js，构建还需 Xcode Command Line Tools；原生启动器包含 Apple Silicon / Intel 两种架构，实际验证以当前 Mac 为准。
运行 `zsh verify.sh` 检查每个 shell 文件与 JXA 主程序，并执行回归测试；原生 NSMenu 测试覆盖菜单顺序、按钮动作、固定任务增减和分割线。
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

数据目录中的 widget-errors.log 保存限长、去重的功能异常；widget-process.log 保存进程输出，App 的原生管理进程重启子进程时进行轮换。项目中的 keep-widget-running.zsh 仅保留为旧版部署参考，不再参与新版安装或运行。
额度读取对初始化设 15 秒、account/rateLimits/read 设 30 秒超时；组件另设 50 秒总看门狗，读取始终在后台进行，不阻塞菜单。失败日志注明对应阶段；开关菜单产生的重复请求合并，不同时启动多个读取器。运行 `zsh Sources/usage-reader.zsh --diagnose` 可在 stderr 查看所选 CLI 和分阶段耗时，stdout 仍只包含额度响应。诊断可设置 `CODEX_USAGE_CLI` 为可执行的绝对路径；测试可用 `CODEX_USAGE_INITIALIZE_TIMEOUT_SECONDS` / `CODEX_USAGE_QUOTA_TIMEOUT_SECONDS` 缩短（不能超过默认值）阶段超时。
Sources 不记录对话内容或登录凭据。

数据库文件名仍属于 Codex 内部实现，升级后可能需要调整；读取失败会记录日志，不会修改 Codex 数据库。
