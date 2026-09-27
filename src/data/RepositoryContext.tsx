/**
 * Provides the repository to the component tree, plus the small amount of
 * machinery needed to re-read after a write.
 *
 * Deliberately not a data-fetching library and not a global domain store: the
 * architecture wants persistent state to come from repositories on demand
 * (ARCHITECTURE.md §2). `revision` is a counter every query depends on, so
 * `invalidate()` after a mutation re-reads what is on screen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { Repository } from './repository';

interface RepositoryContextValue {
  repository: Repository;
  revision: number;
  invalidate: () => void;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({
  repository,
  children,
}: {
  repository: Repository;
  children: ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((current) => current + 1), []);
  const value = useMemo(
    () => ({ repository, revision, invalidate }),
    [repository, revision, invalidate],
  );

  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

function useRepositoryContext(): RepositoryContextValue {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepository must be used inside a RepositoryProvider');
  }
  return context;
}

export function useRepository(): Repository {
  return useRepositoryContext().repository;
}

/** Call after a write to re-read every active query. */
export function useInvalidate(): () => void {
  return useRepositoryContext().invalidate;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  /** True while re-reading with data already on screen — avoids UI flicker. */
  isRefreshing: boolean;
}

/**
 * Read from the repository, re-running when `deps` or the global revision
 * changes. Results from superseded reads are discarded so a slow response
 * cannot overwrite a newer one.
 */
export function useRepoQuery<T>(
  read: (repository: Repository) => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const { repository, revision } = useRepositoryContext();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    read(repository)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
    // `read` is defined inline by callers, so it is intentionally not a
    // dependency; `deps` is the caller's declared trigger list.
  }, [repository, revision, ...deps]);

  return {
    data,
    error,
    isLoading: isLoading && data === undefined,
    isRefreshing: isLoading && data !== undefined,
  };
}
