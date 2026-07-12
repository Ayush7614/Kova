use tauri::AppHandle;

/// Reads the system clipboard and returns its plain text, bypassing the
/// webview's Web Clipboard API — WebKitGTK rejects both
/// navigator.clipboard.readText() (throws NotAllowedError) and scripted
/// document.execCommand('paste') (silently does nothing) regardless of
/// user-gesture context, so the context-menu Paste action needs a native
/// path the same way image paste already does.
/// Returns Err when the clipboard contains no text or on unsupported platforms.
#[tauri::command]
pub async fn read_clipboard_text(app: AppHandle) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();

    app.run_on_main_thread(move || {
        #[cfg(target_os = "linux")]
        {
            let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
            let result = match clipboard.wait_for_text() {
                Some(text) => Ok(text.to_string()),
                None => Err("no text in clipboard".to_string()),
            };
            let _ = tx.send(result);
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = tx.send(Err("not implemented on this platform".to_string()));
        }
    })
    .map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?
}

/// Reads the system clipboard and returns the image as a base64-encoded PNG string.
/// On Linux this uses the GTK clipboard (must run on the GTK main thread).
/// Returns Err when the clipboard contains no image or on unsupported platforms.
#[tauri::command]
pub async fn read_clipboard_image(app: AppHandle) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();

    app.run_on_main_thread(move || {
        #[cfg(target_os = "linux")]
        {
            let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
            let result = match clipboard.wait_for_image() {
                Some(pixbuf) => {
                    pixbuf.save_to_bufferv("png", &[])
                        .map_err(|e| e.to_string())
                        .map(|bytes| {
                            use base64::Engine;
                            base64::engine::general_purpose::STANDARD.encode(&bytes)
                        })
                }
                None => Err("no image in clipboard".to_string()),
            };
            let _ = tx.send(result);
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = tx.send(Err("not implemented on this platform".to_string()));
        }
    })
    .map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?
}
