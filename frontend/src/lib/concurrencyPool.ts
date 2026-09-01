/**
 * Ejecuta `worker` sobre cada item de `items` con a lo sumo `concurrency`
 * llamadas en paralelo. Usado para lanzar las búsquedas de imágenes de a
 * 5-10 a la vez en lugar de disparar hasta 100 peticiones simultáneas.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, item: T, index: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const currentIndex = nextIndex++;
    if (currentIndex >= items.length) return;

    const result = await worker(items[currentIndex], currentIndex);
    results[currentIndex] = result;
    onResult?.(result, items[currentIndex], currentIndex);

    await runNext();
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return results;
}
