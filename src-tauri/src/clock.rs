use chrono::{DateTime, SecondsFormat, Utc};

use crate::error::{AppError, AppResult};

/// Current time as a UTC ISO-8601 string. This is the only shape timestamps
/// take inside the database.
pub fn now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Normalise any RFC-3339 timestamp (`2026-08-25T20:30:00+08:00`) to UTC before
/// it reaches the database, so ordering is never offset-dependent.
pub fn to_utc(input: &str) -> AppResult<String> {
    let parsed = DateTime::parse_from_rfc3339(input.trim())
        .map_err(|err| AppError::Invalid(format!("invalid timestamp `{input}`: {err}")))?;
    Ok(parsed
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true))
}

/// Same as [`to_utc`] for optional input.
pub fn to_utc_opt(input: Option<&str>) -> AppResult<Option<String>> {
    match input {
        Some(value) if !value.trim().is_empty() => Ok(Some(to_utc(value)?)),
        _ => Ok(None),
    }
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/local-tests/clock.rs"));
}
