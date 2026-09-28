import { StageChip } from '@/components/StageChip';
import type { RegisterTally, StateCategory, SubjectSummary } from '@/domain/types';
import { useI18n } from '@/lib/i18n';
import './StateDistributions.css';

interface Distribution {
  id: string;
  name: string;
  kind?: string;
  total: number;
  unassigned: number;
  multiple: boolean;
  options: { id: string; label: string; tone: string | null; count: number; offSet: boolean }[];
}

/** Count each tracked thing once per option, never once per historical event. */
function categoryDistribution(
  category: StateCategory,
  subjects: SubjectSummary[],
): Distribution {
  const relevant = subjects.filter((subject) => subject.journeyId === category.journeyId);
  const options = new Map(
    category.options.map((option) => [
      option.id,
      {
        id: option.id,
        label: option.label,
        tone: option.tone,
        count: 0,
        offSet: false,
      },
    ]),
  );
  let unassigned = 0;
  for (const subject of relevant) {
    const selected =
      subject.classifications.find((group) => group.categoryId === category.id)?.options ?? [];
    if (selected.length === 0) unassigned += 1;
    const seen = new Set<string>();
    for (const option of selected) {
      if (seen.has(option.id)) continue;
      seen.add(option.id);
      const counted = options.get(option.id) ?? { ...option, count: 0, offSet: true };
      counted.count += 1;
      options.set(option.id, counted);
    }
  }
  return {
    id: category.id,
    name: category.name,
    total: relevant.length,
    unassigned,
    multiple: category.selectionMode === 'multiple',
    options: [...options.values()],
  };
}

export function StateDistributions({
  tallies,
  categories,
  subjects,
  onOpenRegister,
}: {
  tallies: RegisterTally[];
  categories: StateCategory[];
  subjects: SubjectSummary[];
  onOpenRegister: (kind: string) => void;
}) {
  const { t } = useI18n();
  const distributions: Distribution[] = [
    ...tallies.map((tally) => ({
      id: `register:${tally.kind}`,
      name: tally.setName ?? t('State', '状态'),
      kind: tally.kind,
      total: tally.total,
      unassigned: tally.unstaged,
      multiple: false,
      options: tally.stages.map((option) => ({ ...option, id: option.label })),
    })),
    ...categories.map((category) => categoryDistribution(category, subjects)),
  ].filter((distribution) => distribution.options.some((option) => option.count > 0));
  if (distributions.length === 0) return null;

  return (
    <section>
      <h2 className="section-label overview__section-title">
        {t('Where things stand', '当前进展')}
      </h2>
      <div className="overview__cross-sections">
        {distributions.map((distribution) => {
          const populated = distribution.options
            .filter((option) => option.count > 0)
            .sort(
              (left, right) =>
                right.count - left.count || left.label.localeCompare(right.label),
            );
          const empty = distribution.options.filter(
            (option) => option.count === 0 && !option.offSet,
          );
          return (
            <div className="state-distribution" key={distribution.id}>
              <div className="state-distribution__head">
                <h3 className="state-distribution__name">
                  {distribution.kind ? (
                    <button type="button" onClick={() => onOpenRegister(distribution.kind!)}>
                      {distribution.name}
                    </button>
                  ) : (
                    distribution.name
                  )}
                </h3>
                <span className="state-distribution__total">
                  {t(`${distribution.total} tracked`, `共 ${distribution.total} 项`)}
                  {distribution.kind ? ` · ${distribution.kind}` : ''}
                </span>
              </div>
              <ul className="state-distribution__options" aria-label={distribution.name}>
                {populated.map((option) => (
                  <li key={option.id}>
                    <StageChip label={option.label} tone={option.tone} offSet={option.offSet} />
                    <span className="state-distribution__count">{option.count}</span>
                  </li>
                ))}
              </ul>
              {distribution.multiple ? (
                <p className="state-distribution__note">
                  {t(
                    'Multiple choices; counts may overlap.',
                    '多选分类，同一项可计入多个选项。',
                  )}
                </p>
              ) : null}
              {distribution.unassigned > 0 || empty.length > 0 ? (
                <p className="state-distribution__note">
                  {[
                    ...(distribution.unassigned > 0
                      ? [
                          t(
                            `${distribution.unassigned} not classified`,
                            `${distribution.unassigned} 项未分类`,
                          ),
                        ]
                      : []),
                    ...(empty.length > 0
                      ? [
                          t(
                            `nothing at ${empty.map((option) => option.label).join(', ')}`,
                            `${empty.map((option) => option.label).join('、')}：暂无内容`,
                          ),
                        ]
                      : []),
                  ].join(' · ')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
