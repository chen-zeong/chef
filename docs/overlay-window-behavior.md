# Overlay Window Behavior Switches

本文记录 `src-tauri/src/main.rs` 中 `apply_window_level` 的几个开关参数，方便在调试或后续维护时了解它们的作用与影响。

## ENABLE_SET_LEVEL

- **位置**：`const ENABLE_SET_LEVEL: bool`
- **默认值**：`false`（之前为 `true`）
- **作用**：决定是否调用 `NSWindow::setLevel(NSStatusWindowLevel + 1)`。开启后遮罩窗口会被提升到接近状态栏的层级（跨空间、始终置顶），适合需要遮罩覆盖所有窗口的场景。
- **副作用**：在 macOS release 环境中，与其它增强选项组合时可能导致下一次遮罩无法接收鼠标事件，因此目前默认关闭。

## ENABLE_COLLECTION_BEHAVIOR

- **位置**：`const ENABLE_COLLECTION_BEHAVIOR: bool`
- **默认值**：`false`
- **作用**：控制是否设置 `NSWindow::setCollectionBehavior(...)`，用来启用 `CanJoinAllSpaces`、`FullScreenAuxiliary`、`Stationary`、`IgnoresCycle`。开启后遮罩窗口在 Mission Control/全屏模式下仍会悬浮在最前。
- **副作用**：和 `ENABLE_SHARING_TYPE` 同时开启时，会触发 macOS 的窗口事件转发问题，导致第二次遮罩无法交互。

## ENABLE_SHARING_TYPE

- **位置**：`const ENABLE_SHARING_TYPE: bool`
- **默认值**：`false`
- **作用**：决定是否调用 `NSWindow::setSharingType(NSWindowSharingType::None)`，让遮罩窗不会被屏幕录制捕获，避免截图中出现遮罩层。
- **副作用**：与 `ENABLE_COLLECTION_BEHAVIOR` 同时开启时会复现“第二次遮罩无法打开”的问题，因此目前默认关闭。

## ENABLE_TRANSPARENCY_TWEAKS

- **位置**：`const ENABLE_TRANSPARENCY_TWEAKS: bool`
- **默认值**：`true`
- **作用**：是否让 `apply_window_level` 额外调用 `setOpaque(false)`、`setHasShadow(false)` 与 `setBackgroundColor(clearColor)`，保持遮罩透明无阴影。该选项不会导致鼠标事件问题，因此仍保持开启。

## 使用建议

1. **普通场景**下推荐保持当前默认值：只开启 `ENABLE_TRANSPARENCY_TWEAKS`，关闭其他开关，确保 release 环境下遮罩可稳定复用。
2. **需要跨空间/全屏悬浮** 的情况下，可尝试依次开启 `ENABLE_COLLECTION_BEHAVIOR` 或 `ENABLE_SET_LEVEL`，但务必在 release 模式验证是否仍可连续打开遮罩。
3. **需要完全隐藏遮罩** 时，可临时开启 `ENABLE_SHARING_TYPE`，并确保 `ENABLE_COLLECTION_BEHAVIOR` 关闭，否则容易复现“第二次无响应”的问题。

调试时建议配合 `spawn_overlay_test_window` 与前端日志按钮逐项验证，避免一次性开启多个高风险开关，导致问题不易定位。

