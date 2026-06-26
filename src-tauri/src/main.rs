// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
#[link(name = "X11")]
extern "C" {
    fn XInitThreads() -> std::ffi::c_int;
}

// WebKitGTK C API — already linked transitively through the webkit2gtk dep.
// Called before any WebView is created (i.e. before kova_lib::run()).
#[cfg(target_os = "linux")]
extern "C" {
    fn webkit_web_context_get_default() -> *mut std::os::raw::c_void;
    fn webkit_web_context_set_sandbox_enabled(
        context: *mut std::os::raw::c_void,
        enabled: std::os::raw::c_int,
    );
}

fn main() {
    // Must be called before any X11 calls are made from any thread.
    // Without this, opening a second window (presentation mode) triggers an
    // XCB multi-thread assertion crash on X11 sessions (Ubuntu 22.04, etc.).
    #[cfg(target_os = "linux")]
    unsafe {
        XInitThreads();
    }

    // WebKitGTK 2.42+ enables the DMA-BUF renderer by default, which fails
    // with EGL_BAD_DISPLAY on some AMD GPU configurations (Arch-based distros
    // like CachyOS). Must be set before the webview is created.
    // Respect any explicit override the user has already set.
    #[cfg(target_os = "linux")]
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // When running as an AppImage, WebKitGTK's bubblewrap sandbox cannot
    // resolve Wayland socket or GPU device paths from the non-standard AppImage
    // mount location. The GPU subprocess therefore aborts with EGL_BAD_PARAMETER
    // before the window appears. Disable the sandbox via the WebKit API before
    // the first WebView is created so subprocesses can reach system resources
    // normally. gtk::init() is idempotent — Tauri calls it again internally.
    #[cfg(target_os = "linux")]
    if std::env::var("APPIMAGE").is_ok() {
        let _ = gtk::init();
        unsafe {
            let ctx = webkit_web_context_get_default();
            if !ctx.is_null() {
                webkit_web_context_set_sandbox_enabled(ctx, 0);
            }
        }
    }

    kova_lib::run()
}
