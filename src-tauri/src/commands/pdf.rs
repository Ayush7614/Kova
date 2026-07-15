use tauri::AppHandle;

// ── Native PDF export ────────────────────────────────────────────────────────

/// Render a self-contained HTML document to a PDF file using the platform's
/// native WebView print API (WKWebView on macOS, WebView2 on Windows).
/// The HTML must be fully self-contained (all fonts and images embedded as
/// data: URIs) so the hidden render window needs no network or asset:// access.
#[tauri::command]
pub async fn export_pdf_native(
    app: AppHandle,
    html_content: String,
    output_path: String,
    width_mm: f64,
    height_mm: f64,
    page_count: u32,
    page_width_px: f64,
    page_height_px: f64,
) -> Result<(), String> {
    use tauri::Manager;

    // Write HTML to a temp file so the hidden WebviewWindow can navigate to it.
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("app cache dir: {e}"))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let html_path = cache_dir.join(format!("kova-print-{ts}.html"));

    {
        let html_path = html_path.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            std::fs::create_dir_all(&cache_dir).ok();
            std::fs::write(&html_path, html_content.as_bytes())
                .map_err(|e| format!("write temp html: {e}"))
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    let html_path_str = html_path.to_str().ok_or("html_path is non-UTF-8")?.to_string();

    // Load the HTML in a hidden WebviewWindow and print it with the platform's
    // native WebView print API (WKWebView / WebView2 / WebKitGTK). Wrapped in
    // an async block (rather than using `?` directly in this function body)
    // so a failure at *any* stage — URL parsing, window creation, or the
    // platform print call itself — still falls through to the html_path
    // cleanup below instead of leaking the temp HTML file.
    let print_result: Result<(), String> = async move {
        // Per-page rect params are macOS-only; Windows and Linux paginate from
        // @page using width_mm/height_mm. Silence what each target doesn't use.
        #[cfg(not(target_os = "macos"))]
        let _ = (page_count, page_width_px, page_height_px);
        #[cfg(target_os = "macos")]
        let _ = (width_mm, height_mm);

        // Produce a valid file:// URL.
        // On Windows: C:\foo\bar.html → file:///C:/foo/bar.html (triple slash required)
        // On Unix:    /path/bar.html  → file:///path/bar.html
        let raw_path = html_path_str.replace('\\', "/");
        let file_url = if raw_path.starts_with('/') {
            format!("file://{raw_path}")
        } else {
            format!("file:///{raw_path}")
        };
        let url = file_url
            .parse::<tauri::Url>()
            .map_err(|e| format!("url parse: {e}"))?;

        let label = format!("kova-print-{ts}");

        // Create an invisible window for off-screen PDF rendering.
        // Register on_page_load on the builder so we know when the document is ready.
        let (load_tx, load_rx) = std::sync::mpsc::sync_channel::<()>(1);
        let load_tx2 = load_tx.clone();
        let window = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::External(url),
        )
        .visible(false)
        .decorations(false)
        .inner_size(960.0, 540.0)
        .on_page_load(move |_win, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = load_tx2.send(());
            }
        })
        .build()
        .map_err(|e| format!("create print window: {e}"))?;
        drop(load_tx);

        tauri::async_runtime::spawn_blocking(move || {
            load_rx
                .recv_timeout(std::time::Duration::from_secs(30))
                .ok();
        })
        .await
        .ok();

        // Give fonts and lazy-rendered content a moment to settle.
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_millis(500));
        })
        .await
        .ok();

        #[cfg(target_os = "macos")]
        let result = platform_macos::generate_pdf(
            &window, &output_path, page_count, page_width_px, page_height_px,
        )
        .await;

        #[cfg(target_os = "windows")]
        let result =
            platform_windows::generate_pdf(&window, &output_path, width_mm, height_mm).await;

        #[cfg(target_os = "linux")]
        let result =
            platform_linux::generate_pdf(&window, &output_path, width_mm, height_mm).await;

        let _ = window.destroy();
        result
    }
    .await;

    let _ = tauri::async_runtime::spawn_blocking(move || std::fs::remove_file(&html_path)).await;

    print_result
}

// ── macOS: per-page WKWebView.createPDF + PDFKit merge (paginates the export) ──
//
// createPDFWithConfiguration snapshots a region as a SINGLE page, so we capture
// one page-sized rect per logical page (slide / N-up sheet / handout) and merge
// them into one multipage PDF with PDFKit. This stays on the async completion-
// block path (no NSPrintOperation.runOperation, which blocks the main thread).

#[cfg(target_os = "macos")]
mod platform_macos {
    use tauri::WebviewWindow;

    pub async fn generate_pdf(
        window: &WebviewWindow,
        output_path: &str,
        page_count: u32,
        page_w: f64,
        page_h: f64,
    ) -> Result<(), String> {
        if page_count == 0 {
            return Err("no pages to export".into());
        }
        let mut pages: Vec<Vec<u8>> = Vec::with_capacity(page_count as usize);
        for i in 0..page_count {
            pages.push(capture_page(window, f64::from(i) * page_h, page_w, page_h).await?);
        }
        let merged = unsafe { merge_pdfs(&pages) }?;
        std::fs::write(output_path, &merged).map_err(|e| format!("write PDF: {e}"))
    }

    // Capture a single page-sized rect of the web content as a one-page PDF.
    async fn capture_page(
        window: &WebviewWindow,
        y: f64,
        w: f64,
        h: f64,
    ) -> Result<Vec<u8>, String> {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<Vec<u8>, String>>(1);

        window
            .with_webview(move |wv| {
                use block2::RcBlock;
                use objc2::{msg_send, runtime::AnyObject};
                use objc2_foundation::{NSPoint, NSRect, NSSize};

                let webview = wv.inner() as *mut AnyObject;
                let config: *mut AnyObject = unsafe {
                    let cls = objc2::runtime::AnyClass::get(c"WKPDFConfiguration")
                        .expect("WKPDFConfiguration");
                    msg_send![cls, new]
                };
                // rect is in the web view's coordinate space (top-left origin, CSS px).
                let rect = NSRect::new(NSPoint::new(0.0, y), NSSize::new(w, h));
                unsafe {
                    let _: () = msg_send![config, setRect: rect];
                }

                let tx2 = tx.clone();
                let block = RcBlock::new(move |data: *mut AnyObject, error: *mut AnyObject| {
                    if !error.is_null() || data.is_null() {
                        let _ = tx2.send(Err("WKWebView PDF creation failed".into()));
                        return;
                    }
                    let bytes: Vec<u8> = unsafe {
                        let len: usize = msg_send![data, length];
                        let ptr: *const u8 = msg_send![data, bytes];
                        std::slice::from_raw_parts(ptr, len).to_vec()
                    };
                    let _ = tx2.send(Ok(bytes));
                });

                unsafe {
                    let _: () = msg_send![
                        webview,
                        createPDFWithConfiguration: config,
                        completionHandler: &*block
                    ];
                    let _: () = msg_send![config, release];
                }
            })
            .map_err(|e| format!("with_webview: {e}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(60))
                .map_err(|_| "PDF generation timed out".to_string())
                .and_then(|r| r)
        })
        .await
        .map_err(|e| format!("{e}"))?
    }

    // Merge single-page PDFs into one document via PDFKit.
    unsafe fn merge_pdfs(pages: &[Vec<u8>]) -> Result<Vec<u8>, String> {
        use objc2::{class, msg_send, runtime::AnyObject};
        use objc2_foundation::NSData;

        let master: *mut AnyObject = msg_send![class!(PDFDocument), new];
        let mut idx: usize = 0;
        for bytes in pages {
            let data = NSData::with_bytes(bytes);
            let doc: *mut AnyObject = msg_send![class!(PDFDocument), alloc];
            let doc: *mut AnyObject = msg_send![doc, initWithData: &*data];
            if doc.is_null() {
                let _: () = msg_send![master, release];
                return Err("PDFDocument init failed".into());
            }
            let n: usize = msg_send![doc, pageCount];
            for p in 0..n {
                let page: *mut AnyObject = msg_send![doc, pageAtIndex: p];
                if page.is_null() {
                    continue;
                }
                // Copy the page so it survives releasing its source document.
                let page_copy: *mut AnyObject = msg_send![page, copy];
                let _: () = msg_send![master, insertPage: page_copy, atIndex: idx];
                let _: () = msg_send![page_copy, release];
                idx += 1;
            }
            let _: () = msg_send![doc, release];
        }

        let out: *mut AnyObject = msg_send![master, dataRepresentation];
        if out.is_null() {
            let _: () = msg_send![master, release];
            return Err("PDFDocument dataRepresentation returned nil".into());
        }
        let len: usize = msg_send![out, length];
        let ptr: *const u8 = msg_send![out, bytes];
        let bytes = std::slice::from_raw_parts(ptr, len).to_vec();
        let _: () = msg_send![master, release];
        Ok(bytes)
    }
}

// ── Windows: WebView2 ICoreWebView2_7::PrintToPdf ────────────────────────────

#[cfg(target_os = "windows")]
mod platform_windows {
    use tauri::WebviewWindow;

    pub async fn generate_pdf(
        window: &WebviewWindow,
        output_path: &str,
        width_mm: f64,
        height_mm: f64,
    ) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
        let output = output_path.to_string();

        window
            .with_webview(move |wv| {
                use webview2_com::{
                    Microsoft::Web::WebView2::Win32::{ICoreWebView2_7, ICoreWebView2Environment6},
                    PrintToPdfCompletedHandler,
                };
                use windows::core::{Interface, PCWSTR};

                // ICoreWebView2Controller → ICoreWebView2 → ICoreWebView2_7
                let controller = wv.controller();
                let webview = match unsafe { controller.CoreWebView2() } {
                    Ok(wv) => wv,
                    Err(e) => {
                        let _ = tx.send(Err(format!("CoreWebView2(): {e}")));
                        return;
                    }
                };
                let webview7 = match webview.cast::<ICoreWebView2_7>() {
                    Ok(wv7) => wv7,
                    Err(e) => {
                        let _ = tx.send(Err(format!("cast to ICoreWebView2_7: {e}")));
                        return;
                    }
                };

                // Build PrintSettings with the slide's exact page dimensions and no
                // margins. PageWidth/PageHeight are in inches (1 in = 25.4 mm). Falls
                // back to None on older WebView2 runtimes so the call still succeeds.
                let print_settings = wv
                    .environment()
                    .cast::<ICoreWebView2Environment6>()
                    .ok()
                    .and_then(|env6| unsafe { env6.CreatePrintSettings() }.ok())
                    .and_then(|s| unsafe {
                        let _ = s.SetPageWidth(width_mm / 25.4);
                        let _ = s.SetPageHeight(height_mm / 25.4);
                        let _ = s.SetMarginTop(0.0);
                        let _ = s.SetMarginBottom(0.0);
                        let _ = s.SetMarginLeft(0.0);
                        let _ = s.SetMarginRight(0.0);
                        Some(s)
                    });

                // Encode file path as NUL-terminated UTF-16.
                let path_wide: Vec<u16> =
                    output.encode_utf16().chain(std::iter::once(0)).collect();

                let tx_handler = tx.clone();
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |err, is_successful| {
                        if let Err(e) = err {
                            let _ = tx_handler.send(Err(format!("PrintToPdf error: {e}")));
                        } else if !is_successful {
                            let _ = tx_handler.send(Err(
                                "PrintToPdf completed but reported failure".into(),
                            ));
                        } else {
                            let _ = tx_handler.send(Ok(()));
                        }
                        Ok(())
                    }));

                // PrintToPdf copies the path string synchronously, so path_wide
                // only needs to live until this call returns.
                if let Err(e) = unsafe {
                    webview7.PrintToPdf(
                        PCWSTR(path_wide.as_ptr()),
                        print_settings.as_ref(),
                        &handler,
                    )
                } {
                    let _ = tx.send(Err(format!("PrintToPdf call failed: {e}")));
                }
                drop(path_wide);
            })
            .map_err(|e| format!("with_webview: {e}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(60))
                .map_err(|_| "PrintToPdf timed out".to_string())
                .and_then(|r| r)
        })
        .await
        .map_err(|e| format!("{e}"))?
    }
}

// ── Linux: WebKitPrintOperation → PDF file (paginates by @page) ───────────────

#[cfg(target_os = "linux")]
mod platform_linux {
    use tauri::WebviewWindow;

    pub async fn generate_pdf(
        window: &WebviewWindow,
        output_path: &str,
        width_mm: f64,
        height_mm: f64,
    ) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
        let output = output_path.to_string();

        window
            .with_webview(move |wv| {
                use webkit2gtk::{PrintOperation, PrintOperationExt};

                const MM_TO_PT: f64 = 72.0 / 25.4;

                // Custom paper at the exact (already-landscape) page size, no margins.
                let paper = gtk::PaperSize::new_custom(
                    "kova",
                    "Kova",
                    width_mm * MM_TO_PT,
                    height_mm * MM_TO_PT,
                    gtk::Unit::Points,
                );
                let page_setup = gtk::PageSetup::new();
                page_setup.set_paper_size(&paper);
                page_setup.set_top_margin(0.0, gtk::Unit::Points);
                page_setup.set_bottom_margin(0.0, gtk::Unit::Points);
                page_setup.set_left_margin(0.0, gtk::Unit::Points);
                page_setup.set_right_margin(0.0, gtk::Unit::Points);
                page_setup.set_orientation(gtk::PageOrientation::Portrait);

                // Print straight to a PDF file — no dialog. The GTK file backend's
                // "Print to File" printer must be named explicitly, else the
                // operation fails with "Printer not found". filename_to_uri
                // percent-encodes spaces / non-ASCII so ordinary paths work.
                let uri = match gtk::glib::filename_to_uri(&output, None) {
                    Ok(u) => u,
                    Err(e) => {
                        let _ = tx.send(Err(format!("bad output path: {e}")));
                        return;
                    }
                };
                let settings = gtk::PrintSettings::new();
                settings.set("printer", Some("Print to File"));
                settings.set("output-uri", Some(uri.as_str()));
                settings.set("output-file-format", Some("pdf"));

                let op = PrintOperation::new(&wv.inner());
                op.set_page_setup(&page_setup);
                op.set_print_settings(&settings);

                let tx_done = tx.clone();
                op.connect_finished(move |_| {
                    let _ = tx_done.send(Ok(()));
                });
                let tx_err = tx.clone();
                op.connect_failed(move |_, err| {
                    let _ = tx_err.send(Err(format!("WebKit print failed: {err}")));
                });

                op.print();
            })
            .map_err(|e| format!("with_webview: {e}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(60))
                .map_err(|_| "PDF generation timed out".to_string())
                .and_then(|r| r)
        })
        .await
        .map_err(|e| format!("{e}"))?
    }
}
