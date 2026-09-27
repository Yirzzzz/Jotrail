/**
 * A Journey's cover band. **Currently unused** (D-032).
 *
 * Photographic covers are a standing brand commitment: the user supplies the
 * images (D-029, PRODUCT.md). This component owns the slot and the scrim that
 * keeps text legible on whatever photo lands in it.
 *
 * No screen renders it right now. The recorder's Journey header is the channel's
 * strip head and Today's is the sheet, so the *placeholder* — six deterministic
 * washes, shown because no user image exists yet — was a 200px decorative band
 * on every screen with no information in it. It has been removed; the photograph
 * path is kept intact.
 *
 * To bring covers back: drop files in `src/assets/covers/`, set the Journey's
 * `coverPath` to the file name, and render this above a header. Anything
 * unresolvable renders as an empty slot rather than a broken image.
 */

import { useState } from 'react';

/**
 * Cover files bundled at build time. `import.meta.glob` means adding a file to
 * the folder is the whole integration — no registry to update, and the paths
 * are hashed by Vite like any other asset.
 */
const BUNDLED_COVERS = import.meta.glob<string>('@/assets/covers/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Match on file name, so `coverPath` stays a short stable string in the database. */
function resolveCover(coverPath: string | null): string | null {
  if (!coverPath) return null;

  const wanted = coverPath.split('/').pop();
  if (!wanted) return null;

  for (const [path, url] of Object.entries(BUNDLED_COVERS)) {
    if (path.endsWith(`/${wanted}`)) return url;
  }
  return null;
}

export interface CoverImageProps {
  coverPath: string | null;
  /** Used to vary the placeholder, so two Journeys are not identical. */
  seed: string;
  /** Decorative in a header that already names the Journey in text. */
  alt?: string;
  className?: string;
  children?: React.ReactNode;
}

export function CoverImage({ coverPath, seed, alt, className, children }: CoverImageProps) {
  const resolved = resolveCover(coverPath);
  // A path that exists in the database but not on disk must not leave a gap.
  const [failed, setFailed] = useState(false);
  const showPhoto = resolved !== null && !failed;

  return (
    <div
      className={`cover ${className ?? ''}`.trim()}
      // Kept so a future placeholder treatment can vary per Journey again.
      data-variant={placeholderVariant(seed)}
      data-photo={showPhoto ? 'true' : 'false'}
    >
      {showPhoto ? (
        <img
          className="cover__image"
          src={resolved}
          alt={alt ?? ''}
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : null}

      {/* Keeps title text legible whatever the photo's luminance is. */}
      <div className="cover__scrim" aria-hidden />
      {children ? <div className="cover__content">{children}</div> : null}
    </div>
  );
}

/**
 * A stable per-Journey variant, chosen deterministically so a Journey would keep
 * the same treatment across sessions without storing anything. Nothing consumes
 * it while the placeholder washes are withdrawn.
 */
function placeholderVariant(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100_000;
  }
  return String(hash % 6);
}
