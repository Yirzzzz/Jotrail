import { Modal } from '@/components/Modal';
import { useRepoQuery } from '@/data/RepositoryContext';
import { TaskList } from '@/features/tasks/TaskList';
import { useI18n } from '@/lib/i18n';

import './TaskDetailsDialog.css';

interface Props {
  taskId: string;
  onBack: () => void;
  onClose: () => void;
}

/** A search result must be reachable even with no Journey and no due date. */
export function TaskDetailsDialog({ taskId, onBack, onClose }: Props) {
  const { t } = useI18n();
  const task = useRepoQuery(
    async (repository) => (await repository.listTasks()).find((item) => item.id === taskId),
    [taskId],
  );

  return (
    <Modal title={t('Task details', '任务详情')} onClose={onClose}>
      <div className="modal__body task-details">
        {task.error ? (
          <p className="error-banner" role="alert">
            {task.error}
          </p>
        ) : null}
        {task.isLoading ? (
          <p className="task-details__text">{t('Loading task…', '正在加载任务…')}</p>
        ) : task.data ? (
          <>
            <TaskList tasks={[task.data]} showJourneys allowFiling />
            {task.data.detailsMd ? (
              <p className="task-details__text selectable">{task.data.detailsMd}</p>
            ) : null}
          </>
        ) : !task.error ? (
          <p className="task-details__text" role="status">
            {t('This task is no longer available.', '此任务已不存在。')}
          </p>
        ) : null}
      </div>

      <footer className="modal__footer">
        <button type="button" className="button" onClick={onBack}>
          {t('Back to search', '返回搜索')}
        </button>
        <button type="button" className="button" onClick={onClose}>
          {t('Close', '关闭')}
        </button>
      </footer>
    </Modal>
  );
}
