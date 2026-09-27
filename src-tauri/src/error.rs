use serde::{Serialize, Serializer};

/// Every failure the UI can be told about. Serialised as a plain string so the
/// frontend gets an actionable message instead of an opaque object.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("data error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("file error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0} not found")]
    NotFound(String),

    #[error("{0}")]
    Invalid(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
