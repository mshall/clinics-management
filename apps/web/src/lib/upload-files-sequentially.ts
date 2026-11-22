const DEFAULT_UPLOAD_CONCURRENCY = 4;

/** Upload files one at a time (API accepts one file per request). */
export async function uploadFilesSequentially<T>(
  files: File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  onProgress?: (done: number, total: number) => void,
): Promise<T[]> {
  return uploadFilesWithConcurrency(files, uploadOne, 1, onProgress);
}

/**
 * Upload multiple files with limited parallelism (faster multi-doc uploads while staying gentle on the API).
 */
export async function uploadFilesWithConcurrency<T>(
  files: File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
  onProgress?: (done: number, total: number) => void,
): Promise<T[]> {
  if (!files.length) return [];
  const limit = Math.max(1, concurrency);
  const results: T[] = new Array(files.length);
  let nextIndex = 0;
  let done = 0;
  onProgress?.(0, files.length);

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await uploadOne(files[index]!, index);
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, () => worker()));
  return results;
}