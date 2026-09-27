/**
 * Settings — the instrument's plate.
 *
 * Small on purpose: the MVP has no account, no sync and no telemetry, so the
 * useful thing to show is where the user's own data lives. Presented the way a
 * recorder states its own configuration — a specification table of label and
 * value, in the same mono readout the sheet uses.
 *
 * No Appearance section (D-032): the app is light-only, so a theme control would
 * be a switch with one position. It returns when a dark pen set exists.
 */

import { Database, FileCode2, Languages, Layers, ShieldCheck } from 'lucide-react';
import { useI18n, useLanguageStore } from '@/lib/i18n';

import { useRepoQuery } from '@/data/RepositoryContext';
import { DataManagement } from './DataManagement';
import './Settings.css';

export function SettingsScreen() {
  const { language, t } = useI18n();
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const info = useRepoQuery((repository) => repository.appInfo(), []);

  return (
    <div className="settings">
      <header className="settings__head">
        <span className="section-label">Journey Notes</span>
        <h1 className="title-display settings__title">{t('Settings', '设置')}</h1>
      </header>

      <section className="settings__section">
        <h2 className="section-label settings__section-title">{t('Language', '语言')}</h2>
        <div className="spec__row">
          <label className="spec__label" htmlFor="interface-language">
            <Languages size={13} strokeWidth={2} aria-hidden />
            {t('Interface language', '界面语言')}
          </label>
          <select
            id="interface-language"
            className="input settings__language"
            value={language}
            onChange={(event) => setLanguage(event.target.value === 'zh' ? 'zh' : 'en')}
            aria-describedby="language-help"
          >
            <option value="zh" lang="zh-CN">
              简体中文
            </option>
            <option value="en" lang="en">
              English
            </option>
          </select>
        </div>
        <p className="settings__help" id="language-help">
          {t(
            'Only interface text changes. Your notes, titles and custom stages stay as written.',
            '只切换界面文字，笔记、标题和自定义阶段保持原样。',
          )}
        </p>
      </section>

      <section className="settings__section">
        <h2 className="section-label settings__section-title">{t('Your data', '你的数据')}</h2>

        <dl className="spec">
          <div className="spec__row">
            <dt className="spec__label">
              <Database size={13} strokeWidth={2} aria-hidden />
              {t('Database', '数据库')}
            </dt>
            {/* A long path wraps rather than running off the sheet. */}
            <dd className="spec__value spec__value--path selectable">
              {info.data?.databasePath ?? '—'}
            </dd>
          </div>

          <div className="spec__row">
            <dt className="spec__label">
              <Layers size={13} strokeWidth={2} aria-hidden />
              {t('Schema version', '数据结构版本')}
            </dt>
            <dd className="spec__value">{info.data?.schemaVersion ?? '—'}</dd>
          </div>

          {info.data?.seededDemoData ? (
            <div className="spec__row">
              <dt className="spec__label">
                <FileCode2 size={13} strokeWidth={2} aria-hidden />
                {t('Demo data', '示例数据')}
              </dt>
              <dd className="spec__value">
                {t(
                  'Loaded on first run because the notebook was empty',
                  '首次运行时因笔记本为空而载入',
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <DataManagement supportsFiles={info.data?.supportsDataFiles === true} />

      <section className="settings__section">
        <h2 className="section-label settings__section-title">{t('Privacy', '隐私')}</h2>
        <p className="settings__privacy">
          <ShieldCheck
            size={15}
            strokeWidth={2}
            aria-hidden
            className="settings__privacy-icon"
          />
          {t(
            'Everything stays on this machine. There is no account, no sync, and no analytics — the app makes no network requests during normal use.',
            '所有数据都保存在这台设备上。无需账号、不进行同步，也没有使用情况统计；正常使用时不会发起网络请求。',
          )}
        </p>
      </section>
    </div>
  );
}
