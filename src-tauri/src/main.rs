// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
#[link(name = "X11")]
extern "C" {
    fn XInitThreads() -> std::ffi::c_int;
}

fn main() {
    // Must be called before any X11 calls are made from any thread.
    // Without this, opening a second window (presentation mode) triggers an
    // XCB multi-thread assertion crash on X11 sessions (Ubuntu 22.04, etc.).
    #[cfg(target_os = "linux")]
    unsafe {
        XInitThreads();
    }
    kova_lib::run()
}
