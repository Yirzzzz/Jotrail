/**
 * "Just did this" — one line for something that already happened.
 *
 * The gap this fills: until now the only input on Today was the task composer, so
 * recording a fact meant creating a fake to-do and immediately ticking it. A
 * finished thing is not a to-do, and the two deserve separate inputs.
 *
 * It writes a timeline event dated *now*, so it lands on today's timeline
 * immediately. A Journey is optional: picking one files the record onto that
 * Journey's timeline too.
 */

import { useState } from 'react';
import { Check, PenLine } from 'lucide-react';

import { useInvalidate, useRepoQuery, useRepository } from '@/data/RepositoryContext';
import { nowIso } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';

interface Props {
  onLogged?: () => void;
  /**
   * Lets a sibling move focus here — the day table's "Add entry" row points at
   * this input rather than being a second composer writing the same record.
   */
  inputId?: string;
}

export function LogComposer({ onLogged, inputId }: Props) {
  const { t } = useI18n();
  const repository = useRepository();
  const invalidate = useInvalidate();
  const journeys = useRepoQuery((repo) => repo.listJourneys(), []);

  const [title, setTitle] = useState('');
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archived journeys are not somewhere you are still filing things.
  const options = (journeys.data ?? []).filter((journey) => journey.status !== 'archived');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSaving) return;

    setSaving(true);
    setError(null);
    try {
      await repository.createTimelineEvent({
        title: trimmed,
        // Dated now: this is a record of something that just happened.
        occurredAt: nowIso(),
        // A day's log is texture, not a turning point.
        importance: 'compact',
        ...(journeyId ? { journeyIds: [journeyId] } : {}),
      });
      setTitle('');
      setJourneyId(null);
      invalidate();
      onLogged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form className="composer" onSubmit={submit}>
        <span className="composer__icon" aria-hidden>
          <PenLine size={15} strokeWidth={2} />
        </span>

        <input
          id={inputId}
          className="composer__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('Record something…', '记录一件事…')}
          aria-label={t('Record something that just happened', '记录刚刚发生的事')}
        />

        {options.length > 0 ? (
          <select
            className="composer__select"
            value={journeyId ?? ''}
            onChange={(event) => setJourneyId(event.target.value || null)}
            aria-label={t('File under a Journey', '归入旅程')}
          >
            <option value="">{t('No Journey', '不关联旅程')}</option>
            {options.map((journey) => (
              <option key={journey.id} value={journey.id}>
                {journey.title}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="submit"
          className="button button--outline"
          disabled={!title.trim() || isSaving}
        >
          <Check size={14} strokeWidth={2} aria-hidden />
          {t('Log', '记录')}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}
    </>
  );
}
