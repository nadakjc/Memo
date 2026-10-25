#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

fn recents_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("recents.json"))
}

#[tauri::command]
fn load_recents(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let p = recents_path(&app)?;
    let Ok(raw) = fs::read_to_string(p) else {
        return Ok(vec![]);
    };
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_recents(app: tauri::AppHandle, recents: Vec<String>) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(&recents).map_err(|e| e.to_string())?;
    fs::write(dir.join("recents.json"), raw).map_err(|e| e.to_string())
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '&' {
            out.push(c);
            continue;
        }
        let mut ent = String::new();
        while ent.len() < 12 {
            match chars.peek() {
                Some(&n) if n == ';' => {
                    chars.next();
                    break;
                }
                Some(_) => ent.push(chars.next().unwrap()),
                None => break,
            }
        }
        match ent.as_str() {
            "lt" => out.push('<'),
            "gt" => out.push('>'),
            "amp" => out.push('&'),
            "quot" => out.push('"'),
            "apos" => out.push('\''),
            _ => {
                let num = if let Some(hex) = ent.strip_prefix('#').and_then(|h| h.strip_prefix(['x', 'X'])) {
                    u32::from_str_radix(hex, 16).ok()
                } else if let Some(dec) = ent.strip_prefix('#') {
                    dec.parse::<u32>().ok()
                } else {
                    None
                };
                match num.and_then(std::char::from_u32) {
                    Some(ch) => out.push(ch),
                    None => {
                        out.push('&');
                        out.push_str(&ent);
                    }
                }
            }
        }
    }
    out
}

fn extract_docx_text(xml: &str) -> String {
    let mut paras: Vec<String> = Vec::new();
    for para in xml.split("</w:p>") {
        let mut line = String::new();
        let mut rest = para;
        while let Some(start) = rest.find('<') {
            let tail = &rest[start..];
            let Some(end_rel) = tail.find('>') else {
                line.push_str(rest);
                break;
            };
            line.push_str(&rest[..start]);
            let tag = &tail[..=end_rel];
            let name = tag
                .trim_start_matches('<')
                .split([' ', '>', '/'])
                .next()
                .unwrap_or("");
            match name {
                "w:tab" => line.push('\t'),
                "w:br" => line.push('\n'),
                "w:t" => {
                    if let Some(close_rel) = tail.find("</w:t>") {
                        let inner = &tail[..close_rel];
                        let gt = inner.find('>').map(|i| i + 1).unwrap_or(inner.len());
                        line.push_str(&decode_entities(&inner[gt..]));
                        rest = &tail[close_rel + "</w:t>".len()..];
                        continue;
                    }
                }
                _ => {}
            }
            rest = &tail[end_rel + 1..];
        }
        line.push_str(rest);
        let trimmed = line.trim_end_matches([' ', '\t']);
        if !trimmed.is_empty() {
            paras.push(trimmed.to_string());
        }
    }
    paras.join("\n")
}

#[tauri::command]
fn read_docx(path: String) -> Result<String, String> {
    use std::io::Read;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&bytes[..]))
        .map_err(|e| format!("not a valid .docx file: {e}"))?;
    let mut file = zip
        .by_name("word/document.xml")
        .map_err(|e| format!("not a .docx document (missing word/document.xml): {e}"))?;
    let mut xml = String::new();
    file.read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    Ok(extract_docx_text(&xml))
}

fn doc_score(s: &str) -> u32 {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == ' ' || *c == '\n' || *c == '\t')
        .count() as u32
}

fn clean_doc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut blank_runs = 0usize;
    for c in s.chars() {
        let printable = (c >= ' ' && c != '\u{7f}' && c != '\u{fffd}') || c == '\t';
        match c {
            '\r' | '\n' => {
                out.push('\n');
                blank_runs += 1;
            }
            c if printable => {
                if c >= ' ' && c != '\t' {
                    blank_runs = 0;
                }
                out.push(c);
            }
            _ => {
                if blank_runs < 1 {
                    out.push('\n');
                    blank_runs = 1;
                }
            }
        }
        if blank_runs > 3 {
            let len = out.len();
            while out.len() > len - 3 && out.ends_with('\n') {
                out.pop();
            }
            blank_runs = 3;
        }
    }
    out
}

#[tauri::command]
fn read_doc(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() < 4 {
        return Err("file too small to be a Word document".into());
    }
    let u16 = encoding_rs::UTF_16LE.decode_to_string(&bytes);
    let w1252 = encoding_rs::WINDOWS_1252.decode_to_string(&bytes);
    let u8 = encoding_rs::UTF_8.decode_to_string(&bytes);
    let best = [u16.as_str(), u8.as_str(), w1252.as_str()]
        .iter()
        .max_by_key(|s| doc_score(s))
        .copied()
        .unwrap_or("");
    let text = clean_doc(best);
    if text.trim().is_empty() {
        return Err(
            "no readable text found (scanned or heavily compressed .doc)".into(),
        );
    }
    Ok(text)
}

#[tauri::command]
fn read_pdf(path: String) -> Result<String, String> {
    use pdf::content::{Op, TextDrawAdjusted};
    use pdf::file::FileOptions;

    let open = |lenient: bool| -> Result<String, String> {
        let mut opts = FileOptions::cached();
        if lenient {
            opts = opts.parse_options(pdf::object::ParseOptions::tolerant());
        }
        let file = opts.open(&path).map_err(|e| e.to_string())?;
        let resolver = file.resolver();
        let mut out = String::new();
        let mut pages = 0u32;
        for page in file.pages() {
            pages += 1;
            if pages > 200 {
                break;
            }
            let page = page.map_err(|e| e.to_string())?;
            let Some(content) = &page.contents else {
                continue;
            };
            let ops = content.operations(&resolver).map_err(|e| e.to_string())?;
            let mut page_text = String::new();
            for op in ops {
                match op {
                    Op::TextDraw { text } => {
                        page_text.push_str(&text.to_string_lossy());
                    }
                    Op::TextDrawAdjusted { array } => {
                        for item in array {
                            if let TextDrawAdjusted::Text(t) = item {
                                page_text.push_str(&t.to_string_lossy());
                            }
                        }
                    }
                    Op::TextNewline => page_text.push('\n'),
                    _ => {}
                }
            }
            out.push_str(page_text.trim_end());
            out.push('\n');
        }
        Ok(out)
    };

    let text = open(false).or_else(|e| open(true).map_err(|_| e))?;
    if text.trim().is_empty() {
        return Err("no text could be extracted (image/scanned PDF?)".into());
    }
    Ok(text)
}

#[tauri::command]
fn debug_log(app: tauri::AppHandle, line: String) {
    use std::io::Write;
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let Ok(()) = fs::create_dir_all(&dir) else {
        return;
    };
    let path = dir.join("debug.log");
    let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let _ = writeln!(f, "[{}] {}", ts, line);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            load_recents,
            save_recents,
            read_docx,
            read_doc,
            read_pdf,
            debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
