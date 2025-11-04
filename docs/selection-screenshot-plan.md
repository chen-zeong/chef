# 框选截图功能实现方案

## 目标
在现有 Tauri 应用中，提供允许用户按下指定快捷键后进入“框选区域 → 截图 → 保存或复制/上传”的完整流程，重点照顾 macOS 平台，其它平台后续扩展。

## 步骤概览
1. **需求澄清与 UX 流程对齐**
2. **前端 UI 状态管理与指令下发**
3. **后端（Rust/Tauri）调用系统截图能力**
4. **系统层自动化/权限处理**
5. **数据回传与存储**
6. **测试与发布流程**

## 详细步骤

### 1. 需求澄清与 UX 流程对齐
- 明确触发方式（全局快捷键/按钮）、截完图后的动作（复制到剪贴板、保存文件、上传等）。
- 与设计/产品确认遮罩、提示、操作流程（退出、重新框选、取消）。
- 检查 macOS 权限需求（屏幕录制、辅助功能），确定首次授权弹窗的用户指引。

### 2. 前端 UI 状态管理与指令下发
- 在 `src/features/system/ScreenshotTool.tsx` 或新建 Hook，管理截图状态（`idle → selecting → captured`）。
- 监听来自后端的事件（如 `tauri://screenshot-ready`），更新 UI。
- 准备一个命令触发后端截图流程（例如 `invoke('start_region_capture')`）。
- 若需要前端自绘遮罩/矩形，评估使用全屏透明窗口（Tauri Layered Window）或纯系统 API。

### 3. 后端（Rust/Tauri）调用系统截图能力
- 在 `region-screenshot-code/backend/src-tauri/src-crates/app-os/src/ui_automation/macos.rs` 增加函数封装 macOS 截图 API：
  - 选型：`CGWindowListCreateImage` 搭配 `CGRect`，或调用 `screencapture` CLI。
  - 若需要框选交互，考虑集成 `AXUIElement`/`CoreGraphics` 捕获当前鼠标框选，或调用 `screencapture -i`。
- 通过 Tauri 命令向前端暴露 `start_region_capture` 和 `cancel_region_capture`。
- 处理授权失败的错误码，返回给前端用于提示。

### 4. 系统层自动化/权限处理
- 利用现有 `ui_automation` 封装在 macOS 调用 `AXIsProcessTrustedWithOptions` 检查辅助功能权限。
- 若无权限：
  - 引导用户打开系统设置 > 隐私与安全 > 屏幕录制/辅助功能。
  - 尝试在第一次调用时自动打开偏好设置页面。
- 为了避免卡死，设置超时与取消逻辑。

### 5. 数据回传与存储
- 根据需求决定截图落地路径（临时文件夹、固定目录）或直接以 Base64 数据返回。
- 若需要上传/持久化，在 Tauri 层提供写文件/上传接口。
- 统一定义返回结构（例如 `{ path, base64?, width, height }`），前端据此渲染或提示。

### 6. 测试与发布流程
- 编写单元测试（Rust 中对路径/权限逻辑，前端对状态机）。
- 手动测试流程：
  1. 首次运行，校验权限申请与弹窗提示。
  2. 快捷键触发 → 框选 → 截图 → 确认结果。
  3. 错误场景：用户取消、权限拒绝、保存失败。
- 更新文档（新增快捷键说明、权限提示）。
- 打包并在 macOS 下进行一次完整 smoke test；若有其它平台支持，提供 graceful fallback。

## 建议优先级
1. 权限与系统 API 可行性验证（先做最小可运行 Demo）。
2. 前端状态管理与与后端命令打通。
3. 完成 UX polishing 与错误提示。
4. 最终写测试、完善文档、合并发布。

