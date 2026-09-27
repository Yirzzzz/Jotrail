# Journey covers

Drop image files here and they are picked up at build time — no code change, no
registry to update. `CoverImage` globs this folder, so adding
`autumn-ridge.jpg` makes `coverPath: "autumn-ridge.jpg"` resolve.

**Formats:** `.jpg` `.jpeg` `.png` `.webp` `.avif`

**What works visually.** The reference screens use wide landscape photographs
with a calm horizon — mountain ridges, sunsets, still water — cropped so the
interesting part sits in the middle band. The header renders roughly 1000×220 on
a default window, so aim for **at least 2000px wide** and expect vertical
cropping. A scrim is drawn over the image automatically, so photos do not need to
be pre-darkened; busy foregrounds are the thing to avoid, not brightness.

**Setting one on a Journey.** `coverPath` is a column on `journeys` that nothing
writes yet, so for now set it directly:

```sql
UPDATE journeys SET cover_path = 'autumn-ridge.jpg' WHERE title = '秋招 2026';
```

Until a file is set, each Journey shows a deterministic placeholder derived from
its id — no two adjacent Journeys look the same, and nothing pretends to be a
photograph.

This folder is intentionally empty of images: none ship with the app, because
none exist that the project has the right to.
