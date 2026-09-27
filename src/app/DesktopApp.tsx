import { useState } from 'react';

import { App } from './App';
import { RepositoryProvider } from '@/data/RepositoryContext';
import { createTauriRepository, isTauriAvailable } from '@/data/tauriRepository';
import { useI18n } from '@/lib/i18n';
import './DesktopApp.css';

/** Never open a writable notebook without the desktop persistence layer. */
export function DesktopApp() {
  const { language, t } = useI18n();
  const [repository] = useState(() => (isTauriAvailable() ? createTauriRepository() : null));

  if (!repository) {
    return (
      <main className="desktop-required" lang={language === 'zh' ? 'zh-CN' : 'en'}>
        <div className="desktop-required__content">
          <p className="section-label">Journey Notes</p>
          <h1>{t('Open the desktop application', '请使用桌面应用')}</h1>
          <p>
            {t(
              'Your notebook is stored locally by the desktop application. This browser page cannot open or save notes.',
              '笔记由桌面应用保存在本机。此浏览器页面无法打开或保存笔记。',
            )}
          </p>
          {import.meta.env.DEV ? (
            <p>
              {t('To start the desktop application, run:', '启动桌面应用，请运行：')}{' '}
              <code>npm run dev</code>
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <RepositoryProvider repository={repository}>
      <App />
    </RepositoryProvider>
  );
}
