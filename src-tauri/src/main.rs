// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
#[link(name = "X11")]
extern "C" {
    fn XInitThreads() -> std::ffi::c_int;
}

#[cfg(target_os = "linux")]
extern "C" {
    fn dlopen(
        filename: *const std::os::raw::c_char,
        flag: std::os::raw::c_int,
    ) -> *mut std::os::raw::c_void;
    fn dlsym(
        handle: *mut std::os::raw::c_void,
        symbol: *const std::os::raw::c_char,
    ) -> *mut std::os::raw::c_void;
    fn dlclose(handle: *mut std::os::raw::c_void) -> std::os::raw::c_int;

    // WebKitGTK C API — linked transitively through the webkit2gtk dep.
    fn webkit_web_context_get_default() -> *mut std::os::raw::c_void;
    fn webkit_web_context_set_sandbox_enabled(
        context: *mut std::os::raw::c_void,
        enabled: std::os::raw::c_int,
    );
}

// WebKit's GPU process calls eglGetPlatformDisplayEXT(EGL_PLATFORM_WAYLAND_EXT,
// wl_display, …), which requires EGL_EXT_platform_wayland (or the KHR variant)
// in the EGL client extension string. If the extension is absent the call
// returns EGL_NO_DISPLAY with EGL_BAD_PARAMETER and the GPU process aborts.
// This probe checks the client extension string via eglQueryString before any
// WebView is created, so we can set LIBGL_ALWAYS_SOFTWARE=1 as a fallback —
// Mesa's software renderer always advertises the Wayland platform extension.
#[cfg(target_os = "linux")]
fn egl_supports_wayland_platform() -> bool {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_void};

    type EglQueryStringFn = unsafe extern "C" fn(*mut c_void, i32) -> *const c_char;

    let lib = match CString::new("libEGL.so.1") {
        Ok(s) => s,
        Err(_) => return true,
    };

    unsafe {
        let handle = dlopen(lib.as_ptr(), 1 /* RTLD_LAZY */);
        if handle.is_null() {
            return true; // Can't load EGL — let WebKit try normally
        }

        let sym = CString::new("eglQueryString").unwrap();
        let fn_ptr = dlsym(handle, sym.as_ptr());

        let supported = if !fn_ptr.is_null() {
            let egl_query_string: EglQueryStringFn = std::mem::transmute(fn_ptr);
            // eglQueryString(EGL_NO_DISPLAY=NULL, EGL_EXTENSIONS=0x3055) returns
            // the client extension string without requiring an initialised display.
            // Returns NULL if the EGL_EXT_client_extensions extension is absent,
            // which also means EGL_EXT_platform_wayland cannot be present.
            let ext_ptr = egl_query_string(std::ptr::null_mut(), 0x3055);
            if ext_ptr.is_null() {
                false
            } else {
                let exts = CStr::from_ptr(ext_ptr).to_string_lossy();
                exts.contains("EGL_EXT_platform_wayland")
                    || exts.contains("EGL_KHR_platform_wayland")
            }
        } else {
            true // Symbol not found — let WebKit try normally
        };

        dlclose(handle);
        supported
    }
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

    // When running as an AppImage, WebKitGTK's bubblewrap sandbox for the
    // web/network processes cannot resolve paths correctly from the AppImage
    // mount location. Disable it via the WebKit API before the first WebView
    // is created. gtk::init() is idempotent — Tauri calls it again internally.
    // Note: this does not affect the GPU process sandbox (controlled separately).
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

    // WebKit's GPU process uses eglGetPlatformDisplayEXT(EGL_PLATFORM_WAYLAND_EXT)
    // which requires the EGL_EXT_platform_wayland client extension. On some
    // systems (KDE/KWin Wayland, virtual machines with non-Mesa EGL), this
    // extension is absent and the GPU process aborts with EGL_BAD_PARAMETER.
    // Fall back to Mesa software rendering, whose EGL always advertises the
    // Wayland platform extension. Only activates when actually needed.
    #[cfg(target_os = "linux")]
    if std::env::var("WAYLAND_DISPLAY").is_ok()
        && std::env::var("LIBGL_ALWAYS_SOFTWARE").is_err()
        && !egl_supports_wayland_platform()
    {
        std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    }

    kova_lib::run()
}
