# Android 与 WebView 排障手册

本文归档 Talk 在 Capacitor Android、旧 WebView、视口高度和发布流程上的可复用经验。当前架构摘要见 `.claude/CLAUDE.md`。

## 当前 Android 配置

- Capacitor appId：`com.talk.aichat`
- Web 产物目录：`dist`
- `CapacitorHttp.enabled = true`，用于绕过部分第三方 AI/媒体 API 的浏览器 CORS 限制。
- `android.allowMixedContent = true`，允许用户连接局域网内的 HTTP ComfyUI/Stable Diffusion 服务。
- 全屏由用户显式触发，不在启动时强制开启。

本机常用环境：

- Android Studio：`C:\Projects\AndroidStudio`
- JDK：`C:\Projects\AndroidStudio\jbr`
- Android SDK：通常为 `%LOCALAPPDATA%\Android\Sdk`

路径只代表当前开发机，不应写进应用运行时代码。

## 推荐构建流程

优先运行：

```bash
npm run release:apk
```

手动调试构建的大致流程：

```bash
npm run build
npx cap sync android
android\gradlew.bat assembleDebug
```

APK 通常位于：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## API Key 安全

Vite 会在构建期把 `import.meta.env.VITE_*` 直接写入 JavaScript。`dist` 随后会原样进入 APK，因此 APK 不是秘密容器。

发布要求：

1. 使用空 Key 环境构建。
2. 删除旧 `dist` 后重新构建。
3. 运行 `npm run check:dist-secrets`。
4. 同步 Android 后再构建 APK。
5. 必要时解压 APK，再搜索真实 Key 片段。
6. 只有扫描通过后才能上传 Release。

不要为了方便把开发 Key 写进源码、Capacitor 配置或发布脚本。

## 视口高度与 BottomNav

旧 Android WebView 对 `100vh`、`100dvh`、系统导航栏和 CSS 自定义属性重绘的行为并不稳定。历史上出现过：

- BottomNav 没有贴住屏幕底部；
- 页面内容把应用外壳撑高；
- 设置页底部内容被裁切；
- JS 计算高度正确，但旧 WebView 没有及时重绘使用 `var()` 的后代元素。

当前解决方案：

1. 启动时读取 `window.innerHeight`/`visualViewport.height`。
2. 同步到 CSS 变量 `--app-height`。
3. 对 `.app-shell` 设置确定高度，而不是只有 `min-height`。
4. 整页路由使用 `h-[var(--app-height)] flex flex-col overflow-hidden`。
5. 滚动内容使用 `min-h-0 flex-1 overflow-y-auto`。
6. 监听 resize、orientationchange 和 visual viewport 变化。

排查同类问题时先在天眼或 DevTools 同时记录：

- `window.innerHeight`
- `visualViewport.height`
- `--app-height`
- `.app-shell.getBoundingClientRect().height`
- BottomNav 的 bottom 坐标与 viewport 差值

如果这些值正确但设备仍显示错误，应直接在真实设备/模拟器检查 WebView 版本和实际重绘，不要继续盲猜 CSS。

## 老 WebView 兼容

部分国产设备的系统 WebView 可能长期停留在旧 Chromium。曾遇到的兼容点包括：

- Tailwind v4 默认 `oklch()` 颜色在旧 WebView 中不可见；项目用十六进制颜色兜底。
- `backdrop-blur` 在固定底栏上可能触发绘制异常；关键导航区域避免依赖它。
- 更新 CSS 自定义属性后，旧内核可能延迟重绘；关键外壳高度应有直接样式兜底。

遇到“桌面 Playwright 正常、Android 异常”时：

1. 先在 Android Studio 模拟器复现。
2. 再用真实设备确认是否仅特定 WebView 版本出现。
3. 记录 userAgent 和 Android System WebView 版本。
4. 优先用基础 CSS/直接尺寸兜底，避免依赖新视口单位或复杂滤镜。

## ADB 连接冲突

开发机可能同时存在多套 Android SDK，例如 `%LOCALAPPDATA%\Android\Sdk` 和其他盘符中的 SDK。两个 `adb.exe` daemon 可能争抢 USB 设备。

排查步骤：

1. 查看所有 adb 进程及其可执行文件路径。
2. 关闭非目标 SDK 启动的 adb daemon。
3. 使用同一套 SDK 的 `adb kill-server` / `adb start-server`。
4. 再检查 `adb devices`。

不要混用不同 SDK 目录下的 adb、build-tools 和 platform-tools。

## 签名与升级

当前公开 APK 使用 debug 签名，适合测试分发，不适合正式应用商店发布。

- 同 appId 且签名一致时，Android 会原地升级并保留 IndexedDB。
- 更换机器或 debug keystore 后，签名可能不一致，系统会拒绝覆盖安装。
- 卸载旧包再安装会清除本地数据，操作前必须导出备份。
- 长期发布前应生成、离线备份并固定使用 release keystore。

## 真机验证清单

- 冷启动和返回键行为
- BottomNav 是否贴底
- 长页面是否内部滚动
- 键盘弹出/收起后的输入栏位置
- 横竖屏切换
- 深色模式和自定义背景
- DeepSeek/媒体服务网络请求
- 备份导出与导入
- 旧版本 APK 原地升级后的数据保留
- Release APK 内无真实 Key
