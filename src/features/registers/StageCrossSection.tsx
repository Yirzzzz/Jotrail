/**
 * Where a register's things currently stand — "9 论文: 2 投稿, 3 大修, 1 接收".
 *
 * This is the statistic the stage set makes possible. Before it, the vocabulary
 * was a by-product of events, so there was no way to name a stage with **nothing
 * at it** — and a zero is half of what a cross-section is for. The set supplies
 * the list of stages that exist; the user's own stage names are the measure.
 *
 * Three things it deliberately is not:
 *
 * - **Not a percentage.** The bar is proportional to the register's own total,
 *   which is the only denominator that exists. A register has no completion
 *   (D-007), so nothing here divides by a goal.
 * - **Not a funnel.** Segments are independent counts side by side, ordered by
 *   count. A stage carries no position at all (D-043) — it says what something is
 *   now — so drawing a narrowing funnel, or even using the set's own order, would
 *   assert a progression the data does not have.
 * - **Not a chart pile.** One bar per register, counts in words underneath. The
 *   Overview's job is to read, not to be a dashboard (AGENTS.md §7).
 */

import { stageToneStyle } from '@/components/StageChip';
import type { RegisterCrossSection } from '@/domain/registers';
import { useI18n } from '@/lib/i18n';
import './StageCrossSection.css';

interface Props {
  section: RegisterCrossSection;
  /** Opens the register itself. */
  onOpen: () => void;
}

export function StageCrossSection({ section, onOpen }: Props) {
  const { t } = useI18n();
  const counted = section.segments.reduce((total, segment) => total + segment.count, 0);
  // The bar spans everything that has a stage; unstaged things are reported in
  // words rather than drawn, because "no stage yet" is an absence, not a stage.
  const denominator = Math.max(counted, 1);

  return (
    <div className="cross-section">
      <div className="cross-section__head">
        <button type="button" className="cross-section__kind" onClick={onOpen}>
          {section.kind}
        </button>
        <span className="cross-section__total">
          {t(`${section.total} tracked`, `共 ${section.total} 项`)}
          {section.setName ? ` · ${section.setName}` : ''}
        </span>
      </div>

      {counted === 0 ? (
        <p className="cross-section__empty">
          {t('Nothing recorded about these yet.', '这些内容还没有记录。')}
        </p>
      ) : (
        <>
          {/*
            The bar. Segment widths are shares of what has been recorded, so the
            row is full-width and readable at any register size — a bar scaled to
            a made-up maximum would be inventing the thing D-007 refuses.
          */}
          <div
            className="cross-section__bar"
            role="img"
            aria-label={section.segments
              .map((segment) => `${segment.count} ${segment.label}`)
              .join(', ')}
          >
            {section.segments.map((segment) => (
              <span
                key={segment.label}
                className={`cross-section__segment${
                  segment.offSet ? ' cross-section__segment--off-set' : ''
                }`}
                style={{
                  ...stageToneStyle(segment.tone),
                  flexGrow: segment.count,
                  flexBasis: `${(segment.count / denominator) * 100}%`,
                }}
                title={t(
                  `${segment.count} at ${segment.label}`,
                  `${segment.count} 项处于${segment.label}`,
                )}
              />
            ))}
          </div>

          {/* The legend is the actual content: name, then count. */}
          <ul className="cross-section__legend">
            {section.segments.map((segment) => (
              <li key={segment.label} className="cross-section__legend-item">
                <span
                  className="cross-section__swatch"
                  style={stageToneStyle(segment.tone)}
                  aria-hidden
                />
                <span className="cross-section__label">{segment.label}</span>
                <span className="cross-section__count">{segment.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        What the bar cannot show, said in words instead of drawn as a zero-width
        segment: stages nothing is at, and things nothing has been recorded about.
        Both are real answers and both would otherwise silently disappear.
      */}
      {section.emptyStages.length > 0 || section.unstaged > 0 ? (
        <p className="cross-section__note">
          {section.unstaged > 0
            ? t(`${section.unstaged} not started yet`, `${section.unstaged} 项尚未开始`)
            : null}
          {section.unstaged > 0 && section.emptyStages.length > 0 ? ' · ' : null}
          {section.emptyStages.length > 0
            ? t(
                `nothing at ${section.emptyStages.join(', ')}`,
                `${section.emptyStages.join('、')}：暂无内容`,
              )
            : null}
        </p>
      ) : null}
    </div>
  );
}
