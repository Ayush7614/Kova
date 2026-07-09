use crate::file_io;

// Sanitise a filename stem: replace whitespace and characters that break Markdown
// link syntax with underscores.
fn sanitise_stem(raw: &str) -> String {
    raw.chars()
        .map(|c| if c.is_whitespace() || matches!(c, '(' | ')' | '[' | ']' | '"' | '\'') { '_' } else { c })
        .collect()
}

// Validate dest_dir, create assets/ subdirectory, and return its path.
fn prepare_assets_dir(dest_dir: &str) -> Result<std::path::PathBuf, String> {
    let canonical = std::fs::canonicalize(dest_dir)
        .map_err(|e| format!("Cannot access destination directory: {e}"))?;
    file_io::check_in_home(&canonical)?;
    let assets_dir = canonical.join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Cannot create assets dir: {e}"))?;
    Ok(assets_dir)
}

// Write `bytes` into `assets_dir` under `{stem}.{ext}`, appending a numeric
// suffix on name collisions. Returns the final filename.
fn write_bytes_to_assets(bytes: &[u8], stem: &str, ext: &str, assets_dir: &std::path::Path) -> Result<String, String> {
    let mut name = format!("{stem}.{ext}");
    let mut counter = 1u32;
    loop {
        if counter > 10_000 {
            return Err("Too many files with the same name in assets/".into());
        }
        let dest = assets_dir.join(&name);
        if !dest.exists() {
            std::fs::write(&dest, bytes)
                .map_err(|e| format!("Cannot write asset: {e}"))?;
            return Ok(name);
        }
        name = format!("{stem}-{counter}.{ext}");
        counter += 1;
    }
}

/// Copies `src` into `{dest_dir}/assets/`, creating the directory if needed.
/// Returns the final filename (e.g. "screenshot.png") so the caller can
/// insert a relative `assets/<filename>` reference in the document.
/// If a file with the same name already exists, appends a numeric suffix.
#[tauri::command]
pub fn copy_image_to_assets(src: String, dest_dir: String) -> Result<String, String> {
    let src_path = file_io::safe_read_path(&src)?;
    let raw_stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let ext      = src_path.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let stem     = sanitise_stem(raw_stem);
    let assets_dir = prepare_assets_dir(&dest_dir)?;

    // Use std::fs::copy to preserve file metadata (timestamps, permissions).
    let mut name = format!("{stem}.{ext}");
    let mut counter = 1u32;
    loop {
        if counter > 10_000 {
            return Err("Too many files with the same name in assets/".into());
        }
        let dest = assets_dir.join(&name);
        if !dest.exists() {
            std::fs::copy(&src_path, &dest)
                .map_err(|e| format!("Cannot copy image: {e}"))?;
            return Ok(name);
        }
        name = format!("{stem}-{counter}.{ext}");
        counter += 1;
    }
}

/// Scans a markdown file for local `assets/…` references and returns them as
/// relative paths (e.g. `["assets/foo.png", "assets/bar.jpg"]`).
#[tauri::command]
pub fn scan_asset_refs(file_path: String) -> Result<Vec<String>, String> {
    let content = file_io::read(&file_path)?;
    let mut refs: std::collections::HashSet<String> = std::collections::HashSet::new();
    let needle = "assets/";
    let mut start = 0usize;
    while let Some(rel) = content[start..].find(needle) {
        let abs = start + rel;
        let rest = &content[abs..];
        let end = rest
            .find(|c: char| matches!(c, ')' | '"' | '\'' | ' ' | '\t' | '\n' | '\r'))
            .unwrap_or(rest.len());
        if end > needle.len() {
            refs.insert(rest[..end].to_string());
        }
        start = abs + 1; // advance past this match to avoid re-scanning
    }
    Ok(refs.into_iter().collect())
}

/// Writes `content` to `dest_path` and, if `asset_refs` is non-empty,
/// copies those asset files (resolved relative to `src_path`) into an
/// `assets/` folder next to the destination.
#[tauri::command]
pub fn copy_file_with_assets(
    src_path: String,
    content: String,
    dest_path: String,
    asset_refs: Vec<String>,
) -> Result<(), String> {
    let safe_src  = file_io::safe_read_path(&src_path)?;
    let safe_dest = file_io::safe_write_path(&dest_path)?;

    std::fs::write(&safe_dest, &content)
        .map_err(|e| format!("Cannot write destination: {e}"))?;

    if asset_refs.is_empty() {
        return Ok(());
    }

    let src_dir  = safe_src.parent().ok_or("Invalid source path")?;
    let dest_dir = safe_dest.parent().ok_or("Invalid dest path")?;

    for asset_ref in &asset_refs {
        let src_asset  = src_dir.join(asset_ref);
        let dest_asset = dest_dir.join(asset_ref);
        // Create any intermediate directories the relative path requires.
        if let Some(parent) = dest_asset.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create dir for {asset_ref}: {e}"))?;
        }
        let safe_src_asset = file_io::safe_read_path(
            src_asset.to_str()
                .ok_or_else(|| format!("Asset path contains non-UTF-8 characters: {src_asset:?}"))?
        )?;
        let safe_dest_asset = file_io::safe_write_path(
            dest_asset.to_str()
                .ok_or_else(|| format!("Asset dest path contains non-UTF-8 characters: {dest_asset:?}"))?
        )?;
        std::fs::copy(&safe_src_asset, &safe_dest_asset)
            .map_err(|e| format!("Cannot copy {asset_ref}: {e}"))?;
    }

    Ok(())
}

/// Decodes base64-encoded data and writes it as binary to the given path.
#[tauri::command]
pub fn write_file_bytes(path: String, data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Base64 decode error: {e}"))?;
    file_io::write_bytes(&path, &bytes)
}

/// Reads a binary file and returns its contents as standard base64.
/// Used by the PPTX import pipeline to hand raw bytes to the TypeScript parser.
#[tauri::command]
pub fn read_file_b64(path: String) -> Result<String, String> {
    use base64::Engine;
    let safe = file_io::safe_read_path(&path)?;
    let ext = safe.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    let allowed = matches!(
        ext.as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "avif" | "tif" | "tiff" | "ico"
            | "pptx"
            | "mp4" | "webm" | "ogv" | "mov" | "m4v" | "mkv")
    );
    if !allowed {
        return Err("Access denied: only image, video, and presentation files may be read as base64".to_string());
    }
    let bytes = std::fs::read(&safe).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Writes base64-encoded bytes to `{dest_dir}/assets/{filename}`.
/// Creates the assets directory if absent. Appends a numeric suffix on name conflicts.
/// Returns the final filename (e.g. "pptx_slide1_img1.png").
#[tauri::command]
pub fn write_asset_bytes(data: String, filename: String, dest_dir: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Base64 decode error: {e}"))?;
    let path     = std::path::Path::new(&filename);
    let raw_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let ext      = path.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let stem     = sanitise_stem(raw_stem);
    let assets_dir = prepare_assets_dir(&dest_dir)?;
    write_bytes_to_assets(&bytes, &stem, ext, &assets_dir)
}
