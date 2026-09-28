//! Bounded event attachments. Originals and previews live in the event's SQLite
//! transaction, so a snapshot/restore never separates the text from its images.

use std::collections::{HashMap, HashSet};
use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{io::Reader, DynamicImage, GenericImageView, ImageFormat, ImageOutputFormat};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::new_id;
use crate::domain::{EventImage, EventImageInput, EventImageVariant};
use crate::error::{AppError, AppResult};

pub const MAX_IMAGES: usize = 6;
pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES: usize = 1024 * 1024;
pub const MAX_IMAGE_PIXELS: u64 = 20_000_000;
const THUMBNAIL_EDGE: u32 = 320;
const METADATA_COLUMNS: &str = "id, event_id, file_name, mime_type, byte_size, width, height";

fn invalid(message: &str) -> AppError {
    AppError::Invalid(message.into())
}

fn map_metadata(row: &Row<'_>) -> rusqlite::Result<EventImage> {
    Ok(EventImage {
        id: row.get("id")?,
        event_id: row.get("event_id")?,
        file_name: row.get("file_name")?,
        mime_type: row.get("mime_type")?,
        byte_size: row.get("byte_size")?,
        width: row.get("width")?,
        height: row.get("height")?,
    })
}

/// No binary data crosses a timeline list/get boundary.
pub fn for_event(conn: &Connection, event_id: &str) -> AppResult<Vec<EventImage>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {METADATA_COLUMNS} FROM event_images WHERE event_id = ?1 ORDER BY position, id"
    ))?;
    let rows = stmt.query_map([event_id], map_metadata)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn by_event(conn: &Connection) -> AppResult<HashMap<String, Vec<EventImage>>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {METADATA_COLUMNS} FROM event_images ORDER BY event_id, position, id"
    ))?;
    let mut grouped: HashMap<String, Vec<EventImage>> = HashMap::new();
    for row in stmt.query_map([], map_metadata)? {
        let image = row?;
        grouped
            .entry(image.event_id.clone())
            .or_default()
            .push(image);
    }
    Ok(grouped)
}

pub fn read(conn: &Connection, id: &str, variant: EventImageVariant) -> AppResult<String> {
    // Closed enum selects the column; caller input is never interpolated.
    let (column, mime_column, maximum) = match variant {
        EventImageVariant::Original => ("data", "mime_type", MAX_IMAGE_BYTES),
        EventImageVariant::Thumbnail => ("thumbnail", "'image/png'", MAX_THUMBNAIL_BYTES),
    };
    let result = conn
        .query_row(
            &format!("SELECT length({column}), {mime_column} FROM event_images WHERE id = ?1"),
            [id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    let (byte_size, mime) = result.ok_or_else(|| AppError::NotFound(format!("image `{id}`")))?;
    if byte_size <= 0 || byte_size > maximum as i64 {
        return Err(invalid(
            "The stored image exceeds the allowed size or is empty",
        ));
    }
    if !matches!(mime.as_str(), "image/png" | "image/jpeg" | "image/webp") {
        return Err(invalid("The stored image type is not supported"));
    }
    // The predicate repeats the bound in the binary read itself, so even an
    // externally modified database cannot slip a large BLOB between the checks.
    let bytes: Vec<u8> = conn
        .query_row(
            &format!("SELECT {column} FROM event_images WHERE id = ?1 AND length({column}) BETWEEN 1 AND ?2"),
            params![id, maximum],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| invalid("The stored image changed while it was being read"))?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

fn check_dimensions(width: u32, height: u32) -> AppResult<()> {
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err(invalid("Images must contain at most 20 million pixels"));
    }
    Ok(())
}

/// image 0.24's WebP decoder allocates while constructing its decoder, before
/// Reader's generic limits are applied. Check every raster chunk first, and
/// decline animation rather than allocating an unbounded sequence of frames.
fn webp_dimensions(data: &[u8]) -> AppResult<(u32, u32)> {
    let malformed = || invalid("The WebP image is damaged or unsupported");
    if data.len() < 20 || &data[..4] != b"RIFF" || &data[8..12] != b"WEBP" {
        return Err(malformed());
    }
    let container_size = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    if container_size.checked_add(8) != Some(data.len()) {
        return Err(malformed());
    }
    let mut offset = 12usize;
    let mut canvas = None;
    let mut raster = None;
    while offset < data.len() {
        let header = data.get(offset..offset + 8).ok_or_else(malformed)?;
        let size = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let end = start.checked_add(size).ok_or_else(malformed)?;
        let chunk = data.get(start..end).ok_or_else(malformed)?;
        let dimensions = match &header[..4] {
            b"ANIM" | b"ANMF" => return Err(invalid("Animated WebP images are not supported")),
            b"VP8X" => {
                if chunk.len() != 10 || canvas.is_some() || raster.is_some() {
                    return Err(malformed());
                }
                if chunk[0] & 0x02 != 0 {
                    return Err(invalid("Animated WebP images are not supported"));
                }
                let width = 1 + u32::from_le_bytes([chunk[4], chunk[5], chunk[6], 0]);
                let height = 1 + u32::from_le_bytes([chunk[7], chunk[8], chunk[9], 0]);
                check_dimensions(width, height)?;
                canvas = Some((width, height));
                None
            }
            b"VP8 " => {
                if chunk.len() < 10 || &chunk[3..6] != b"\x9d\x01\x2a" {
                    return Err(malformed());
                }
                Some((
                    u32::from(u16::from_le_bytes([chunk[6], chunk[7]]) & 0x3fff),
                    u32::from(u16::from_le_bytes([chunk[8], chunk[9]]) & 0x3fff),
                ))
            }
            b"VP8L" => {
                if chunk.len() < 5 || chunk[0] != 0x2f {
                    return Err(malformed());
                }
                let bits = u32::from_le_bytes(chunk[1..5].try_into().unwrap());
                Some(((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1))
            }
            _ => None,
        };
        if let Some((width, height)) = dimensions {
            check_dimensions(width, height)?;
            if raster.replace((width, height)).is_some() {
                return Err(malformed());
            }
        }
        offset = end.checked_add(size % 2).ok_or_else(malformed)?;
    }
    let raster = raster.ok_or_else(malformed)?;
    if offset != data.len() || canvas.is_some_and(|size| size != raster) {
        return Err(malformed());
    }
    Ok(raster)
}

fn decode(data: &[u8]) -> AppResult<(DynamicImage, &'static str)> {
    if data.is_empty() || data.len() > MAX_IMAGE_BYTES {
        return Err(invalid("Each image must be no larger than 5 MiB"));
    }
    let format =
        image::guess_format(data).map_err(|_| invalid("Choose a PNG, JPEG or WebP image"))?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err(invalid("Choose a PNG, JPEG or WebP image")),
    };
    let (width, height) = if format == ImageFormat::WebP {
        webp_dimensions(data)?
    } else {
        Reader::with_format(Cursor::new(data), format)
            .into_dimensions()
            .map_err(|_| invalid("The image is damaged or unsupported"))?
    };
    check_dimensions(width, height)?;
    let mut limits = image::io::Limits::default();
    limits.max_image_width = Some(width);
    limits.max_image_height = Some(height);
    limits.max_alloc = Some(256 * 1024 * 1024);
    let mut reader = Reader::with_format(Cursor::new(data), format);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|_| invalid("The image is damaged or unsupported"))?;
    if decoded.dimensions() != (width, height) {
        return Err(invalid("The image dimensions are inconsistent"));
    }
    let orientation = exif::Reader::new()
        .read_from_container(&mut Cursor::new(data))
        .ok()
        .and_then(|metadata| {
            metadata
                .get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
        })
        .unwrap_or(1);
    Ok((orient(decoded, orientation), mime))
}

fn orient(image: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => image.fliph(),
        3 => image.rotate180(),
        4 => image.flipv(),
        5 => image.rotate90().fliph(),
        6 => image.rotate90(),
        7 => image.rotate90().flipv(),
        8 => image.rotate270(),
        _ => image,
    }
}

/// Exports validate the actual bytes from their snapshot, not merely metadata.
pub(crate) fn validate_stored_image(
    data: &[u8],
    mime_type: &str,
    width: u32,
    height: u32,
) -> AppResult<()> {
    let (decoded, actual_mime) = decode(data)?;
    if actual_mime != mime_type || decoded.dimensions() != (width, height) {
        return Err(invalid(
            "The stored image metadata does not match its contents",
        ));
    }
    Ok(())
}

struct PreparedImage {
    metadata: EventImage,
    data: Vec<u8>,
    thumbnail: Vec<u8>,
}

fn prepare(event_id: &str, file_name: &str, encoded: &str) -> AppResult<PreparedImage> {
    // Bound before decoding to avoid allocating an attacker-sized base64 buffer.
    if encoded.len() > ((MAX_IMAGE_BYTES + 2) / 3) * 4 {
        return Err(invalid("Each image must be no larger than 5 MiB"));
    }
    let data = STANDARD
        .decode(encoded)
        .map_err(|_| invalid("The image data is invalid"))?;
    let (decoded, mime_type) = decode(&data)?;
    let (width, height) = decoded.dimensions();
    let mut thumbnail = Cursor::new(Vec::new());
    decoded
        .thumbnail(THUMBNAIL_EDGE.min(width), THUMBNAIL_EDGE.min(height))
        .write_to(&mut thumbnail, ImageOutputFormat::Png)
        .map_err(|_| invalid("Could not create an image preview"))?;
    if thumbnail.get_ref().len() > MAX_THUMBNAIL_BYTES {
        return Err(invalid("The image preview exceeds the allowed size"));
    }
    // Keep a label, never a supplied absolute filesystem path.
    let file_name: String = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect();
    let file_name = if file_name.is_empty() {
        format!(
            "image.{}",
            if mime_type == "image/jpeg" {
                "jpg"
            } else {
                &mime_type[6..]
            }
        )
    } else {
        file_name
    };
    Ok(PreparedImage {
        metadata: EventImage {
            id: new_id("img"),
            event_id: event_id.to_string(),
            file_name,
            mime_type: mime_type.to_string(),
            byte_size: data.len() as u64,
            width,
            height,
        },
        data,
        thumbnail: thumbnail.into_inner(),
    })
}

/// Replace an event's ordered image list inside the caller's transaction.
/// Decode/validate every candidate before changing rows. A later event/task
/// failure rolls images back with the rest of that user's save.
pub fn replace_within(
    conn: &Connection,
    event_id: &str,
    inputs: &[EventImageInput],
) -> AppResult<()> {
    if inputs.len() > MAX_IMAGES {
        return Err(invalid("An event can contain at most 6 images"));
    }
    let existing = for_event(conn, event_id)?;
    let mut retained = HashSet::new();
    let mut prepared = Vec::new();
    for (position, input) in inputs.iter().enumerate() {
        match input {
            EventImageInput::Existing { id } => {
                if !existing.iter().any(|image| &image.id == id) || !retained.insert(id.clone()) {
                    return Err(invalid(
                        "Retained images must belong to this event and appear only once",
                    ));
                }
            }
            EventImageInput::New {
                file_name,
                data_base64,
            } => {
                prepared.push((position, prepare(event_id, file_name, data_base64)?));
            }
        }
    }
    for image in existing {
        if !retained.contains(&image.id) {
            conn.execute(
                "DELETE FROM event_images WHERE id = ?1 AND event_id = ?2",
                params![image.id, event_id],
            )?;
        }
    }
    for (position, input) in inputs.iter().enumerate() {
        if let EventImageInput::Existing { id } = input {
            conn.execute(
                "UPDATE event_images SET position = ?3 WHERE id = ?1 AND event_id = ?2",
                params![id, event_id, position],
            )?;
        }
    }
    for (position, image) in prepared {
        let meta = image.metadata;
        conn.execute(
            "INSERT INTO event_images (id, event_id, file_name, mime_type, byte_size, width, height, position, data, thumbnail)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![meta.id, meta.event_id, meta.file_name, meta.mime_type, meta.byte_size, meta.width, meta.height, position, image.data, image.thumbnail],
        )?;
    }
    Ok(())
}

#[cfg(all(test, feature = "local-tests"))]
mod tests {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/local-tests/db_event_images.rs"
    ));
}
