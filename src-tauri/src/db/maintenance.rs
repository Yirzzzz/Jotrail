//! Local snapshots and portable exports. All copies use SQLite's backup API,
//! including when the live notebook has committed pages in its WAL file.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{backup::Backup, types::ValueRef, Connection, DatabaseName, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::clock::now_utc;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
    #[serde(default)]
    pub before_restore: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInfo {
    pub path: String,
    pub note_count: usize,
}

const SNAPSHOT_FILE: &str = "journey.sqlite3";

pub fn folder(data_dir: &Path, kind: &str) -> AppResult<PathBuf> {
    if !matches!(kind, "backups" | "exports") {
        return Err(AppError::Invalid("Unknown data folder".into()));
    }
    let path = data_dir.join(kind);
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn read_only(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    conn.execute_batch("PRAGMA trusted_schema = OFF; BEGIN;")?;
    Ok(conn)
}

fn check_integrity(conn: &Connection) -> AppResult<()> {
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        return Err(AppError::Invalid(
            "The backup failed its integrity check".into(),
        ));
    }
    if conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(AppError::Invalid(
            "The backup contains broken data links".into(),
        ));
    }
    Ok(())
}

fn schema(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT type, name, COALESCE(sql, '') FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Refuse foreign, damaged and incompatible databases before touching live data.
/// Restore currently accepts snapshots from this schema version only.
fn validate_snapshot(conn: &Connection) -> AppResult<()> {
    let expected = super::open_in_memory()?;
    if schema(conn)? != schema(&expected)?
        || super::migrations::current_version(conn)?
            != super::migrations::current_version(&expected)?
    {
        return Err(AppError::Invalid(
            "This backup is not compatible with this version of Journey Notes".into(),
        ));
    }
    check_integrity(conn)
}

/// Stage in a fresh directory; only complete results are published or listed.
fn stage(data_dir: &Path, kind: &str) -> AppResult<(PathBuf, PathBuf)> {
    let root = folder(data_dir, kind)?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S");
    let id = format!(
        "{}_{}_{}",
        &kind[..kind.len() - 1],
        stamp,
        uuid::Uuid::new_v4().simple()
    );
    let destination = root.join(&id);
    let pending = root.join(format!(".pending-{id}"));
    fs::create_dir(&pending)?;
    Ok((pending, destination))
}

pub fn create_backup(conn: &Connection, data_dir: &Path) -> AppResult<BackupInfo> {
    create_snapshot(conn, data_dir, false)
}

fn create_snapshot(
    conn: &Connection,
    data_dir: &Path,
    before_restore: bool,
) -> AppResult<BackupInfo> {
    let (pending, destination) = stage(data_dir, "backups")?;
    let result = (|| {
        let file = pending.join(SNAPSHOT_FILE);
        conn.backup(DatabaseName::Main, &file, None)?;
        check_integrity(&read_only(&file)?)?;
        let info = BackupInfo {
            id: destination
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            path: destination
                .join(SNAPSHOT_FILE)
                .to_string_lossy()
                .into_owned(),
            created_at: now_utc(),
            size_bytes: fs::metadata(&file)?.len(),
            before_restore,
        };
        fs::write(
            pending.join("backup.json"),
            serde_json::to_vec_pretty(&info)?,
        )?;
        fs::rename(&pending, &destination)?;
        Ok(info)
    })();
    if result.is_err() {
        // Only this operation's newly-created, unpublished directory.
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

fn backup_dir(data_dir: &Path, id: &str) -> AppResult<PathBuf> {
    if !id.starts_with("backup_")
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(AppError::Invalid("Invalid backup identifier".into()));
    }
    let path = data_dir.join("backups").join(id);
    if !fs::symlink_metadata(&path)?.is_dir()
        || !fs::symlink_metadata(path.join(SNAPSHOT_FILE))?.is_file()
    {
        return Err(AppError::Invalid(
            "The backup must be a local snapshot file".into(),
        ));
    }
    Ok(path)
}

pub fn list_backups(data_dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let root = data_dir.join("backups");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let id = entry.file_name().to_string_lossy().into_owned();
        let Ok(path) = backup_dir(data_dir, &id) else {
            continue;
        };
        let Ok(metadata) = fs::read(path.join("backup.json")) else {
            continue;
        };
        let Ok(mut info) = serde_json::from_slice::<BackupInfo>(&metadata) else {
            continue;
        };
        // Metadata supplies a date, never filesystem authority.
        info.id = id;
        info.path = path.join(SNAPSHOT_FILE).to_string_lossy().into_owned();
        info.size_bytes = fs::metadata(path.join(SNAPSHOT_FILE))?.len();
        backups.push(info);
    }
    backups.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(backups)
}

pub fn restore_backup(conn: &mut Connection, data_dir: &Path, id: &str) -> AppResult<BackupInfo> {
    let path = backup_dir(data_dir, id)?.join(SNAPSHOT_FILE);
    let source = read_only(&path)?;
    validate_snapshot(&source)?;
    let safety = create_snapshot(conn, data_dir, true)?;
    // The handle keeps one read transaction throughout validation and copying.
    // SQLite commits the destination atomically only after all pages are copied.
    let restore = Backup::new(&source, conn)?;
    match restore.step(-1)? {
        rusqlite::backup::StepResult::Done => Ok(safety),
        _ => Err(AppError::Invalid(
            "The notebook is busy. No restore was committed; please try again.".into(),
        )),
    }
}

fn table_rows(conn: &Connection, name: &str) -> AppResult<Vec<Value>> {
    // Names are discovered from sqlite_master, and still quoted as identifiers.
    let mut stmt = conn.prepare(&format!("SELECT * FROM \"{}\"", name.replace('"', "\"\"")))?;
    let columns: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| (*s).to_owned())
        .collect();
    let mut rows = stmt.query([])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let mut record = Map::new();
        for (index, name) in columns.iter().enumerate() {
            let value = match row.get_ref(index)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(value) => json!(value),
                ValueRef::Real(value) => json!(value),
                ValueRef::Text(value) => json!(String::from_utf8_lossy(value)),
                ValueRef::Blob(value) => json!(value),
            };
            record.insert(name.clone(), value);
        }
        result.push(Value::Object(record));
    }
    Ok(result)
}

fn filename(title: &str, index: usize) -> String {
    let title: String = title
        .chars()
        .take(60)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    let title = title.trim_matches([' ', '.']);
    format!(
        "{:06}-{}.md",
        index + 1,
        if title.is_empty() { "Untitled" } else { title }
    )
}

pub fn export_notebook(conn: &Connection, data_dir: &Path) -> AppResult<ExportInfo> {
    let (pending, destination) = stage(data_dir, "exports")?;
    let result = (|| {
        let file = pending.join(SNAPSHOT_FILE);
        conn.backup(DatabaseName::Main, &file, None)?;
        let snapshot = read_only(&file)?;
        validate_snapshot(&snapshot)?;
        let mut tables = Map::new();
        for (kind, name, _) in schema(&snapshot)? {
            if kind == "table" {
                tables.insert(name.clone(), json!(table_rows(&snapshot, &name)?));
            }
        }
        fs::create_dir(pending.join("notes"))?;
        fs::create_dir(pending.join("deleted-notes"))?;
        let notes = tables["notes"]
            .as_array()
            .ok_or_else(|| AppError::Invalid("Missing notes".into()))?;
        let mut files = Vec::new();
        let mut note_count = 0;
        for (index, note) in notes.iter().enumerate() {
            let deleted = !note["deleted_at"].is_null();
            let folder = if deleted { "deleted-notes" } else { "notes" };
            let name = filename(note["title"].as_str().unwrap_or("Untitled"), index);
            let relative = format!("{folder}/{name}");
            fs::write(
                pending.join(&relative),
                note["body_md"].as_str().unwrap_or(""),
            )?;
            files.push(json!({ "id": note["id"], "title": note["title"], "path": relative }));
            if !deleted {
                note_count += 1;
            }
        }
        fs::write(
            pending.join("manifest.json"),
            serde_json::to_vec_pretty(&json!({
                "format": "journey-notes-export", "formatVersion": 1,
                "createdAt": now_utc(), "schemaVersion": super::migrations::current_version(&snapshot)?,
                "noteFiles": files, "tables": tables,
            }))?,
        )?;
        fs::write(pending.join("README.txt"),
            "Journey Notes export\n\nnotes/ contains the original Markdown, unchanged.\ndeleted-notes/ contains recoverable deleted notes.\nmanifest.json preserves titles, dates, Journey links, tasks, events and states.\njourney.sqlite3 is a complete SQLite snapshot.\n\nCopy this folder to another disk for an independent backup.\n")?;
        drop(snapshot);
        fs::rename(&pending, &destination)?;
        Ok(ExportInfo {
            path: destination.to_string_lossy().into_owned(),
            note_count,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_maintenance.rs"
    ));
}
