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

// True if `path` exists and its contents are byte-identical to `bytes`.
fn file_matches_bytes(path: &std::path::Path, bytes: &[u8]) -> bool {
    match std::fs::metadata(path) {
        Ok(meta) if meta.len() as usize == bytes.len() => {
            std::fs::read(path).map(|existing| existing == bytes).unwrap_or(false)
        }
        _ => false,
    }
}

// Write `bytes` into `assets_dir` under `{stem}.{ext}`, appending a numeric
// suffix on name collisions. If a colliding file already holds identical
// content, its name is reused instead of writing a fresh copy — this avoids
// piling up duplicate `-1`, `-2`, ... copies when the same asset is removed
// and re-added (its old, now-orphaned file is still sitting in assets_dir).
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
        if file_matches_bytes(&dest, bytes) {
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
    // On a collision, lazily read src_path (at most once) to check whether the
    // existing file is already an identical copy — e.g. an orphan left behind
    // by a previously-removed reference to this same source — and reuse its
    // name instead of writing yet another duplicate.
    let mut src_bytes: Option<Vec<u8>> = None;
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
        let bytes = match &src_bytes {
            Some(b) => b,
            None => {
                let read = std::fs::read(&src_path).map_err(|e| format!("Cannot read source file: {e}"))?;
                src_bytes.get_or_insert(read)
            }
        };
        if file_matches_bytes(&dest, bytes) {
            return Ok(name);
        }
        name = format!("{stem}-{counter}.{ext}");
        counter += 1;
    }
}

// Scans markdown `content` for local `assets/…` references (in any syntax —
// Markdown image links, `<img>`/`<video>` tags, `!video[]()`, etc. — since it
// just looks for the literal "assets/" substring) and returns the raw
// relative-path tokens, e.g. `assets/foo.png`, `assets/my%20file.jpg`.
fn find_asset_tokens(content: &str) -> std::collections::HashSet<String> {
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
    refs
}

/// Scans a markdown file for local `assets/…` references and returns them as
/// relative paths (e.g. `["assets/foo.png", "assets/bar.jpg"]`).
#[tauri::command]
pub fn scan_asset_refs(file_path: String) -> Result<Vec<String>, String> {
    let content = file_io::read(&file_path)?;
    Ok(find_asset_tokens(&content).into_iter().collect())
}

// Reverses the escaping `encodeMarkdownPath` (src/components/editor/mediaSnippet.ts)
// applies when writing asset references into markdown, so tokens can be
// matched against real on-disk filenames.
fn decode_markdown_path(s: &str) -> String {
    s.replace("%20", " ").replace("%28", "(").replace("%29", ")")
}

fn is_markdown_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

/// Deletes files in `{parent of file_path}/assets/` that aren't referenced by
/// any `.md`/`.markdown` file in that same directory — not just `file_path`
/// itself, since several decks can share one `assets/` folder and an asset
/// only used by a sibling document must survive. Returns the filenames that
/// were deleted. If the assets directory doesn't exist, this is a no-op.
#[tauri::command]
pub fn cleanup_unused_assets(file_path: String) -> Result<Vec<String>, String> {
    let dest_dir = std::path::Path::new(&file_path)
        .parent()
        .and_then(|p| p.to_str())
        .ok_or("Invalid file path")?;
    let canonical = std::fs::canonicalize(dest_dir)
        .map_err(|e| format!("Cannot access destination directory: {e}"))?;
    file_io::check_in_home(&canonical)?;
    let assets_dir = canonical.join("assets");
    if !assets_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut referenced: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in std::fs::read_dir(&canonical).map_err(|e| format!("Cannot read directory: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot read directory entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() || !is_markdown_file(&path) {
            continue;
        }
        // A sibling that fails to read (permissions, mid-write, etc.) is
        // skipped rather than aborting the whole cleanup — its assets are
        // simply not protected by it this time round.
        let Ok(sibling_content) = std::fs::read_to_string(&path) else { continue };
        referenced.extend(
            find_asset_tokens(&sibling_content)
                .into_iter()
                .filter_map(|tok| tok.strip_prefix("assets/").map(decode_markdown_path)),
        );
    }

    let mut deleted = Vec::new();
    for entry in std::fs::read_dir(&assets_dir).map_err(|e| format!("Cannot read assets dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot read assets dir entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue; // leave subdirectories alone — asset insertion never creates them
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if !referenced.contains(name) {
            std::fs::remove_file(&path).map_err(|e| format!("Cannot delete {name}: {e}"))?;
            deleted.push(name.to_string());
        }
    }
    Ok(deleted)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    // Unique per-test scratch dir under the OS temp dir. FLATPAK_ID isn't set
    // under `cargo test`, so check_in_home is a no-op here regardless of
    // where the OS temp dir actually lives.
    fn temp_scratch_dir(label: &str) -> std::path::PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("kova-assets-test-{label}-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_bytes_to_assets_reuses_name_for_identical_content() {
        let dir = temp_scratch_dir("dedup-same");
        let name1 = write_bytes_to_assets(b"hello world", "clip", "mp4", &dir).unwrap();
        let name2 = write_bytes_to_assets(b"hello world", "clip", "mp4", &dir).unwrap();
        assert_eq!(name1, "clip.mp4");
        assert_eq!(name2, "clip.mp4");
        assert!(!dir.join("clip-1.mp4").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_bytes_to_assets_suffixes_on_real_collision() {
        let dir = temp_scratch_dir("dedup-diff");
        let name1 = write_bytes_to_assets(b"first version", "clip", "mp4", &dir).unwrap();
        let name2 = write_bytes_to_assets(b"second version", "clip", "mp4", &dir).unwrap();
        assert_eq!(name1, "clip.mp4");
        assert_eq!(name2, "clip-1.mp4");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_unused_assets_deletes_only_unreferenced_files() {
        let dir = temp_scratch_dir("cleanup-basic");
        let assets_dir = dir.join("assets");
        std::fs::create_dir_all(&assets_dir).unwrap();
        std::fs::write(assets_dir.join("a.png"), b"a").unwrap();
        std::fs::write(assets_dir.join("b.png"), b"b").unwrap();
        let doc = dir.join("deck.md");
        std::fs::write(&doc, "![a](assets/a.png)").unwrap();

        let mut deleted = cleanup_unused_assets(doc.to_str().unwrap().to_string()).unwrap();
        deleted.sort();

        assert_eq!(deleted, vec!["b.png".to_string()]);
        assert!(assets_dir.join("a.png").exists());
        assert!(!assets_dir.join("b.png").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_unused_assets_decodes_percent_escapes() {
        let dir = temp_scratch_dir("cleanup-encoded");
        let assets_dir = dir.join("assets");
        std::fs::create_dir_all(&assets_dir).unwrap();
        std::fs::write(assets_dir.join("my file.png"), b"data").unwrap();
        let doc = dir.join("deck.md");
        std::fs::write(&doc, "![x](assets/my%20file.png)").unwrap();

        let deleted = cleanup_unused_assets(doc.to_str().unwrap().to_string()).unwrap();

        assert!(deleted.is_empty());
        assert!(assets_dir.join("my file.png").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_unused_assets_is_noop_when_assets_dir_missing() {
        let dir = temp_scratch_dir("cleanup-missing");
        let doc = dir.join("deck.md");
        std::fs::write(&doc, "no refs here").unwrap();

        let deleted = cleanup_unused_assets(doc.to_str().unwrap().to_string()).unwrap();

        assert!(deleted.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_unused_assets_preserves_files_referenced_by_sibling_decks() {
        let dir = temp_scratch_dir("cleanup-siblings");
        let assets_dir = dir.join("assets");
        std::fs::create_dir_all(&assets_dir).unwrap();
        std::fs::write(assets_dir.join("shared-by-deck1.png"), b"1").unwrap();
        std::fs::write(assets_dir.join("shared-by-deck2.png"), b"2").unwrap();
        std::fs::write(assets_dir.join("orphan.png"), b"3").unwrap();

        let deck1 = dir.join("deck1.md");
        let deck2 = dir.join("deck2.md");
        std::fs::write(&deck1, "![a](assets/shared-by-deck1.png)").unwrap();
        std::fs::write(&deck2, "![b](assets/shared-by-deck2.png)").unwrap();

        // Saving deck1 must not delete the asset only deck2 references.
        let deleted = cleanup_unused_assets(deck1.to_str().unwrap().to_string()).unwrap();

        assert_eq!(deleted, vec!["orphan.png".to_string()]);
        assert!(assets_dir.join("shared-by-deck1.png").exists());
        assert!(assets_dir.join("shared-by-deck2.png").exists());
        assert!(!assets_dir.join("orphan.png").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
