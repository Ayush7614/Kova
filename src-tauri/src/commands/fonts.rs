/// Returns a sorted, deduplicated list of font family names available on the system.
#[tauri::command]
pub async fn list_system_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(collect_system_fonts)
        .await
        .unwrap_or_default()
}

fn collect_system_fonts() -> Vec<String> {
    #[cfg(target_os = "linux")]
    {
        let output = match std::process::Command::new("fc-list")
            .arg("--format")
            .arg("%{family[0]}\n")
            .output()
        {
            Ok(o) => o,
            Err(_) => return vec![],
        };
        sort_dedup_fonts(parse_line_output(&output.stdout))
    }

    #[cfg(target_os = "macos")]
    {
        // Prefer fc-list when Homebrew fontconfig is installed.
        let fc = std::process::Command::new("fc-list")
            .arg("--format")
            .arg("%{family[0]}\n")
            .output()
            .ok()
            .filter(|o| o.status.success() && !o.stdout.is_empty());

        if let Some(out) = fc {
            return sort_dedup_fonts(parse_line_output(&out.stdout));
        }

        // Fallback: system_profiler is always available on macOS.
        // Its output contains lines like:
        //   Family: Helvetica Neue
        // We extract the value after the "Family: " prefix.
        let output = match std::process::Command::new("system_profiler")
            .args(["SPFontsDataType"])
            .output()
        {
            Ok(o) => o,
            Err(_) => return vec![],
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let families: Vec<String> = text
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                trimmed.strip_prefix("Family: ").map(|f| f.trim().to_string())
            })
            .filter(|s| !s.is_empty())
            .collect();
        sort_dedup_fonts(families)
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: enumerate fonts via PowerShell (.NET InstalledFontCollection)
        let output = match std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[System.Drawing.Text.InstalledFontCollection]::new().Families | \
                 ForEach-Object { $_.Name }",
            ])
            .output()
        {
            Ok(o) => o,
            Err(_) => return vec![],
        };
        sort_dedup_fonts(parse_line_output(&output.stdout))
    }
}

fn parse_line_output(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

fn sort_dedup_fonts(mut fonts: Vec<String>) -> Vec<String> {
    fonts.sort_unstable_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    fonts.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    fonts
}
