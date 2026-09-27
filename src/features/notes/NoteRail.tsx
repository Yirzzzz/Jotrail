/**
 * The note's context rail — the fourth reference screen's right column.
 *
 * Every panel here is backed by a record that already exists. The reference
 * sketches seven panels; four of them are built, and the three that are not are
 * named here so the omission is a decision rather than an oversight:
 *
 * - **Tags** — there is no tag field on a note, in the schema or the domain. A
 *   tag panel would need a real field, a real editor and a migration; faking one
 *   with note types or Journey names would put labels on the user's writing that
 *   they never chose.
 * - **Backlinks** — nothing in the app writes note-to-note links yet. The
 *   Markdown body has no link syntax that resolves to another note, so there is
 *   nothing to invert into a backlink.
 * - **Tasks** — tasks link to Journeys, not to notes (`task_journeys`). The
 *   tasks of a note's Journey are already one click away in that Journey's Tasks
 *   tab, and listing them here would imply they belong to *this note*.
 *
 * "Related notes" is the one panel that needed a decision rather than a field:
 * it means *notes sharing a Journey with this one*, which is a connection the
 * user made themselves — see `relatedNotes`.
 */

import { Activity, FileText, Info, Link2 } from 'lucide-react';

import { JourneyIcon } from '@/components/JourneyIcon';
import { StatusPill } from '@/components/StatusPill';
import { relatedNotes, noteTypeLabel, wordCount } from '@/domain/notes';
import type { Journey, NoteWithLinks } from '@/domain/types';
import { formatFullDate, formatRelativeDay } from '@/lib/datetime';
import { useI18n } from '@/lib/i18n';
import { penStyle } from '@/lib/pens';

interface Props {
  note: NoteWithLinks;
  /** Every note, for deriving what this one is related to. */
  allNotes: NoteWithLinks[];
  /** Journeys, so a linked one can show its real status. */
  journeys: Journey[];
  onOpenNote: (noteId: string) => void;
  onOpenJourney: (journeyId: string) => void;
}

export function NoteRail({ note, allNotes, journeys, onOpenNote, onOpenJourney }: Props) {
  const { t } = useI18n();
  const related = relatedNotes(note, allNotes);
  const words = wordCount(note.bodyMd);

  /* A note is "active" when any Journey it belongs to still is. */
  const linkedJourneys = note.journeys
    .map((ref) => journeys.find((journey) => journey.id === ref.id))
    .filter((journey): journey is Journey => Boolean(journey));
  const liveJourney = linkedJourneys.find(
    (journey) => journey.status === 'active' || journey.status === 'planning',
  );

  return (
    <div className="rail">
      <div className="rail__scroll scroll-area">
        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <Info size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('About', '关于')}
            </h2>
          </div>

          <div className="rail__row">
            <span className="rail__row-label">{t('Created', '创建时间')}</span>
            <span className="rail__row-value">{formatFullDate(note.createdAt)}</span>
          </div>
          <div className="rail__row">
            <span className="rail__row-label">{t('Updated', '更新时间')}</span>
            <span className="rail__row-value">{formatRelativeDay(note.updatedAt)}</span>
          </div>
          <div className="rail__row">
            <span className="rail__row-label">{t('Type', '类型')}</span>
            <span className="rail__row-value">{noteTypeLabel(note.noteType)}</span>
          </div>
          {/*
            The reference shows a Status row. A note has no status of its own, so
            this reports the state of the Journey it is filed under — which is the
            question the row is actually asking.
          */}
          {liveJourney ? (
            <div className="rail__row">
              <span className="rail__row-label">{t('Journey', '旅程')}</span>
              <span className="rail__row-value">
                <StatusPill status={liveJourney.status} />
              </span>
            </div>
          ) : null}
          <div className="rail__row">
            <span className="rail__row-label">{t('Word count', '字数')}</span>
            <span className="rail__row-value">{words}</span>
          </div>
        </section>

        {note.journeys.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <Link2 size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Linked journeys', '关联的旅程')}
              </h2>
            </div>
            <ul>
              {note.journeys.map((journey) => (
                <li key={journey.id} className="rail__row">
                  <button
                    type="button"
                    className="rail__link rail__link--icon"
                    style={penStyle(journey.id)}
                    onClick={() => onOpenJourney(journey.id)}
                    title={journey.title}
                  >
                    <JourneyIcon name={journey.icon} size={13} />
                    {journey.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="rail__section">
            <div className="rail__section-head">
              <h2 className="rail__section-title">
                <span className="rail__section-icon">
                  <FileText size={13} strokeWidth={2} aria-hidden />
                </span>
                {t('Related notes', '相关笔记')}
              </h2>
            </div>
            {/*
              Named so the relationship is legible: these are not "similar", they
              are filed alongside this note in a Journey the user chose.
            */}
            <p className="rail__hint">
              {t('Sharing a Journey with this note.', '与这篇笔记关联同一旅程。')}
            </p>
            <ul>
              {related.map((candidate) => (
                <li key={candidate.id} className="rail__row">
                  <button
                    type="button"
                    className="rail__link"
                    onClick={() => onOpenNote(candidate.id)}
                    title={candidate.title}
                  >
                    {candidate.title}
                  </button>
                  <span className="rail__row-label">
                    {formatRelativeDay(candidate.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rail__section">
          <div className="rail__section-head">
            <h2 className="rail__section-title">
              <span className="rail__section-icon">
                <Activity size={13} strokeWidth={2} aria-hidden />
              </span>
              {t('Activity', '动态')}
            </h2>
          </div>
          {/*
            Two real timestamps, in the order they happened. The reference shows
            a longer feed; the note table keeps exactly these two, so this is all
            of the note's history that actually exists.
          */}
          <ul className="rail__changes">
            <li className="rail__change">
              <span className="rail__change-head">
                <span className="rail__change-title">
                  {t('You updated this note', '你更新了这篇笔记')}
                </span>
              </span>
              <span className="rail__change-detail">{formatFullDate(note.updatedAt)}</span>
            </li>
            <li className="rail__change">
              <span className="rail__change-head">
                <span className="rail__change-title">
                  {t('You created this note', '你创建了这篇笔记')}
                </span>
              </span>
              <span className="rail__change-detail">{formatFullDate(note.createdAt)}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
