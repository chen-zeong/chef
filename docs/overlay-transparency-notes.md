# 区域截屏遮罩首帧透明方案记录

## 背景
首次打开区域截屏遮罩窗口时，拖拽选区的内部会出现一层浅灰色遮罩；一旦松开鼠标（或第二次重新进入截屏），选区内部又能正常透明。调试确认 React 层、CSS 遮罩层都已经是透明的，说明灰色来自 WebView/NSWindow 首帧的默认背景填充。

## 解决方案
综合修改位于 `src-tauri/src/main.rs` 的窗口初始化逻辑，使 WebView 及原生窗口在创建和复用时都保持完全透明：

1. **引入 `tauri::window::Color`** 以便在 Rust 侧设置 RGBA 颜色。

2. **复用现有遮罩窗口时调用 `set_background_color(Some(Color(0,0,0,0)))`**：`show_region_capture_overlay` 重设老窗口的尺寸与位置后，立即把背景颜色设为透明。

3. **新建遮罩窗口时同样调用 `set_background_color(Some(Color(0,0,0,0)))`**：在 `WebviewWindowBuilder` 创建完成后立刻设为透明，避免首帧填充默认灰色。

4. **macOS 专属：在 `apply_window_level` 中对 `NSWindow` 追加原生设置**
   - `setOpaque(false)`：告诉系统窗口是不透明的。
   - `setHasShadow(false)`：防止阴影干扰背景。
   - `setBackgroundColor(NSColor::clearColor())`：覆盖原生背景色。

以上修改对应文件：
- `src-tauri/src/main.rs:13`（引入 `Color`）
- `src-tauri/src/main.rs:87`（复用窗口设为透明）
- `src-tauri/src/main.rs:122`（新建窗口设为透明）
- `src-tauri/src/main.rs:341`（macOS 下设置 `opaque=false`、`shadow=false`、`clearColor`）

## 原理
- Tauri (Wry) WebView 默认首帧会填充其背景色（通常是白/灰）。第一次打开遮罩时 React 组件尚未渲染，便先看到该默认色。
- 将 WebView 背景颜色设为 `(0,0,0,0)`，并确保宿主原生窗口同样透明，系统合成器在首帧就不会再填充灰色内容。
- macOS 上，如果不把 `NSWindow` 设为非不透明/清色，系统仍会先绘制一层默认背景，因此需要额外调用 `setOpaque(false)` + `setBackgroundColor(clearColor)`。

## 为什么之前第一次灰、后面正常？
- 首次创建窗口之前没有显式指定背景色，WebView 初次显示时填充默认灰色。
- 当 React 遮罩完成首帧渲染后，WebView 内部已经被透明遮罩覆盖；后续再次进入截屏时，窗口复用缓存的绘制结果，看上去就没有灰色。
- 只有在完全关闭并重新创建窗口、且没做透明设置时，才会再次出现灰色首帧。

## 相关调试辅助
为定位问题曾在 `RegionCaptureOverlay.tsx` 中加过调试采样点：
- 使用 `elementsFromPoint` 采集遮罩四周/内部的元素与 CSS 值。
- 确认 `selection-container` 等元素的 `background-color` 均为透明，排除前端遮罩代码的问题。
最终结论：灰层来自原生窗口首帧背景而非 React 层。上述透明化处理后，首次拖拽即能保持选区透明。

