// Long-running Settings operations already show a blocking dialog. Window
// close requests must also respect that work, including before React renders.
const operations = new Set<symbol>();

export function beginAppDataOperation(): () => void {
  const operation = Symbol('data operation');
  operations.add(operation);
  return () => {
    operations.delete(operation);
  };
}

export function isAppDataOperationPending(): boolean {
  return operations.size > 0;
}
