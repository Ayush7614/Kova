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
}

// Probes whether EGL can create a default display on the current Wayland session.
// On compositors whose EGL stack lacks EGL_EXT_platform_wayland (KWin, Mutter,
// Smithay/niri, etc.), eglGetDisplay(EGL_DEFAULT_DISPLAY) returns EGL_NO_DISPLAY
// and WebKit's GPU process aborts with EGL_BAD_PARAMETER. Detecting this before
// WebKit starts lets us fall back to software rendering cleanly.
#[cfg(target_os = "linux")]
fn egl_default_display_works() -> bool {
    use std::ffi::CString;
    use std::os::raw::c_void;

    type EglGetDisplayFn = unsafe extern "C" fn(*mut c_void) -> *mut c_void;

    let lib = match CString::new("libEGL.so.1") {
        Ok(s) => s,
        Err(_) => return true,
    };

    unsafe {
        let handle = dlopen(lib.as_ptr(), 1 /* RTLD_LAZY */);
        if handle.is_null() {
            return true; // Can't load EGL — let WebKit try normally
        }

        let sym = CString::new("eglGetDisplay").unwrap();
        let fn_ptr = dlsym(handle, sym.as_ptr());

        let display_valid = if !fn_ptr.is_null() {
            let egl_get_display: EglGetDisplayFn = std::mem::transmute(fn_ptr);
            // EGL_DEFAULT_DISPLAY = NULL; returns EGL_NO_DISPLAY (NULL) on failure
            !egl_get_display(std::ptr::null_mut()).is_null()
        } else {
            true // Symbol not found — let WebKit try normally
        };

        dlclose(handle);
        display_valid
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

    // On Wayland sessions where the EGL stack lacks EGL_EXT_platform_wayland
    // (KDE Plasma/KWin, GNOME/Mutter, niri/Smithay), WebKit's GPU process
    // aborts with EGL_BAD_PARAMETER before the window appears. Probe EGL here,
    // before the webview is created, and fall back to Mesa software rendering
    // if the default display can't be created. Software rendering works on all
    // Wayland compositors and is unnoticeable for a presentation app.
    #[cfg(target_os = "linux")]
    if std::env::var("WAYLAND_DISPLAY").is_ok()
        && std::env::var("LIBGL_ALWAYS_SOFTWARE").is_err()
        && !egl_default_display_works()
    {
        std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    }

    kova_lib::run()
}
