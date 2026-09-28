import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, ImageOff, X } from 'lucide-react';

import { Modal } from '@/components/Modal';
import { useRepository } from '@/data/RepositoryContext';
import type { EventImage, EventImageInput } from '@/domain/types';
import { useI18n } from '@/lib/i18n';

import './EventImages.css';

const MAX_IMAGES = 6;
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type DraftImage =
  | { key: string; saved: EventImage }
  | { key: string; fileName: string; dataUrl: string; dataBase64: string };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.onabort = () => reject(new Error('Image reading was cancelled'));
    reader.readAsDataURL(file);
  });
}

/** Selected files stay in this draft until the event itself is saved. */
export function useEventImages(initial: readonly EventImage[] = []) {
  const { t } = useI18n();
  const [images, setImages] = useState<DraftImage[]>(() =>
    initial.map((saved) => ({ key: saved.id, saved })),
  );
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reading = useRef(false);
  const active = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const addFiles = async (files: File[]) => {
    if (reading.current || files.length === 0) return;
    setError(null);
    if (images.length + files.length > MAX_IMAGES) {
      setError(t('Choose up to 6 images per event.', '每个事件最多添加 6 张图片。'));
      return;
    }
    for (const file of files) {
      if (!IMAGE_TYPES.has(file.type)) {
        setError(t('Choose PNG, JPEG or WebP images.', '请选择 PNG、JPEG 或 WebP 图片。'));
        return;
      }
      if (file.size === 0 || file.size > MAX_BYTES) {
        setError(
          t(
            'Each image must be non-empty and at most 5 MB.',
            '图片不能为空，且每张不超过 5 MB。',
          ),
        );
        return;
      }
    }
    reading.current = true;
    setIsReading(true);
    try {
      const selected: DraftImage[] = [];
      for (const file of files) {
        const dataUrl = await readFile(file);
        selected.push({
          key: `selected-${sequence.current++}`,
          fileName: file.name,
          dataUrl,
          dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
        });
      }
      if (active.current) setImages((current) => [...current, ...selected]);
    } catch {
      if (active.current) {
        setError(
          t(
            'Could not read the images. Please choose them again.',
            '无法读取图片，请重新选择。',
          ),
        );
      }
    } finally {
      reading.current = false;
      if (active.current) setIsReading(false);
    }
  };

  const inputs: EventImageInput[] = images.map((image) =>
    'saved' in image
      ? { id: image.saved.id }
      : { fileName: image.fileName, dataBase64: image.dataBase64 },
  );

  return {
    images,
    inputs,
    isReading,
    error,
    addFiles,
    remove: (key: string) => {
      setImages((current) => current.filter((image) => image.key !== key));
      setError(null);
    },
  };
}

export function EventImageField({
  field,
  disabled = false,
}: {
  field: ReturnType<typeof useEventImages>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const busy = disabled || field.isReading;
  return (
    <div className="field event-image-field" role="group" aria-labelledby={labelId}>
      <div className="event-image-field__heading">
        <span id={labelId} className="field__label">
          {t('Images', '图片')} <span className="field__hint">{t('Optional', '选填')}</span>
        </span>
        <span className="field__hint">
          {field.images.length} / {MAX_IMAGES}
        </span>
      </div>
      {field.images.length > 0 ? (
        <div className="event-images event-images--draft">
          {field.images.map((image) => {
            const name = 'saved' in image ? image.saved.fileName : image.fileName;
            return (
              <div className="event-images__draft" key={image.key}>
                {'saved' in image ? (
                  <StoredImage image={image.saved} variant="thumbnail" />
                ) : (
                  <img src={image.dataUrl} alt={name} className="event-images__image" />
                )}
                <button
                  type="button"
                  className="event-images__remove icon-button"
                  disabled={busy}
                  onClick={() => field.remove(image.key)}
                  aria-label={t(`Remove image ${name}`, `移除图片 ${name}`)}
                  title={t(`Remove image ${name}`, `移除图片 ${name}`)}
                  data-autofocus="false"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        disabled={busy}
        aria-label={t('Choose event images', '选择事件图片')}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void field.addFiles(files);
        }}
      />
      <button
        type="button"
        className="button button--outline event-image-field__add"
        onClick={() => input.current?.click()}
        disabled={busy || field.images.length >= MAX_IMAGES}
        data-autofocus="false"
      >
        <ImagePlus size={15} aria-hidden />
        {field.isReading ? t('Reading images…', '正在读取图片…') : t('Add images', '添加图片')}
      </button>
      <span className="field__hint">
        {t(
          'PNG / JPEG / WebP · ≤ 5 MB · ≤ 20 MP per image',
          'PNG / JPEG / WebP · 每张 ≤ 5 MB、2000 万像素',
        )}
      </span>
      {field.error ? (
        <p className="error-banner" role="alert">
          {field.error}
        </p>
      ) : null}
    </div>
  );
}

/** Thumbnails are loaded near the viewport, originals only in the viewer. */
function StoredImage({
  image,
  variant,
}: {
  image: EventImage;
  variant: 'thumbnail' | 'original';
}) {
  const { t } = useI18n();
  const repository = useRepository();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(variant === 'original');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setDataUrl(null);
    setFailed(false);
    repository
      .readEventImage(image.id, variant)
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [image.id, variant, visible, attempt, repository]);

  return (
    <div className="event-images__stored" ref={host}>
      {failed ? (
        <span className="event-images__unavailable" role="status">
          <ImageOff size={20} aria-hidden />
          <span>{t('Image unavailable', '图片暂不可用')}</span>
          <button
            type="button"
            className="button"
            onClick={(event) => {
              event.stopPropagation();
              setAttempt((current) => current + 1);
            }}
          >
            {t('Retry', '重试')}
          </button>
        </span>
      ) : dataUrl ? (
        <img
          className="event-images__image"
          src={dataUrl}
          alt={image.fileName}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="event-images__loading"
          aria-label={t('Loading image', '正在加载图片')}
        />
      )}
    </div>
  );
}

export function EventImageGallery({
  images,
  title,
}: {
  images: readonly EventImage[];
  title: string;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  if (images.length === 0) return null;
  const current = selected === null ? undefined : images[selected];
  return (
    <>
      <div
        className="event-images"
        role="group"
        aria-label={t(`Images for ${title}`, `${title} 的图片`)}
      >
        {images.map((image, index) => (
          <div className="event-images__tile" key={image.id}>
            <StoredImage image={image} variant="thumbnail" />
            <button
              type="button"
              className="event-images__open"
              aria-label={t(
                `Enlarge image ${index + 1}: ${image.fileName}`,
                `放大图片 ${index + 1}：${image.fileName}`,
              )}
              onClick={() => setSelected(index)}
            />
          </div>
        ))}
      </div>
      {current ? (
        <Modal title={title} variant="image" onClose={() => setSelected(null)}>
          <div className="event-image-viewer__head">
            <span className="event-image-viewer__name">{current.fileName}</span>
            <span className="field__hint">
              {(selected ?? 0) + 1} / {images.length}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSelected(null)}
              aria-label={t('Close image', '关闭图片')}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="event-image-viewer__body">
            <StoredImage key={current.id} image={current} variant="original" />
          </div>
          {images.length > 1 ? (
            <footer className="modal__footer">
              <button
                type="button"
                className="button"
                disabled={selected === 0}
                onClick={() => setSelected((index) => Math.max(0, (index ?? 0) - 1))}
              >
                <ChevronLeft size={15} aria-hidden />
                {t('Previous', '上一张')}
              </button>
              <button
                type="button"
                className="button"
                disabled={selected === images.length - 1}
                onClick={() =>
                  setSelected((index) => Math.min(images.length - 1, (index ?? 0) + 1))
                }
              >
                {t('Next', '下一张')}
                <ChevronRight size={15} aria-hidden />
              </button>
            </footer>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
