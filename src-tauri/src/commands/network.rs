/// Fetches a remote URL and returns (base64_data, mime_type).
/// Used by PDF/PPTX export to download remote images natively, bypassing the
/// webview CSP connect-src restrictions that block fetch() to arbitrary URLs.
#[tauri::command]
pub async fn fetch_url_b64(url: String) -> Result<(String, String), String> {
    use base64::Engine;
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("URL must use HTTP or HTTPS".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client error: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("fetch failed: HTTP {}", resp.status()));
    }
    let raw_mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_lowercase();
    // Normalise non-standard JPEG variants so browsers accept the data URL.
    let mime = match raw_mime.as_str() {
        "image/jpg" | "image/pjpeg" | "image/x-jpeg" => "image/jpeg".to_string(),
        other => other.to_string(),
    };
    let bytes = resp.bytes().await.map_err(|e| format!("read failed: {e}"))?;
    Ok((base64::engine::general_purpose::STANDARD.encode(&bytes), mime))
}

/// Fetch a URL and return its body as UTF-8 text. Used for "Import from URL"
/// to bypass webview CSP connect-src restrictions.
#[tauri::command]
pub async fn fetch_url_text(url: String) -> Result<String, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("URL must use HTTP or HTTPS".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("client error: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("fetch failed: HTTP {}", resp.status()));
    }

    let ct = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let ct_ok = ct.is_empty()
        || ct.starts_with("text/")
        || ct.starts_with("application/json")
        || ct.starts_with("application/xml")
        || ct.starts_with("application/xhtml");
    if !ct_ok {
        return Err(format!("unexpected Content-Type: {ct}"));
    }

    const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024; // 20 MB
    if resp.content_length().unwrap_or(0) > MAX_TEXT_BYTES {
        return Err("response too large (max 20 MB)".into());
    }

    let text = resp.text().await.map_err(|e| format!("read failed: {e}"))?;
    if text.len() as u64 > MAX_TEXT_BYTES {
        return Err("response too large (max 20 MB)".into());
    }
    Ok(text)
}
