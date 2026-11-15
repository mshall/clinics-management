const DEFAULT_UPLOAD_CONCURRENCY = 2;

/** Upload files one at a time (API accepts one file per request). */
export async function uploadFilesSequentially<T>(
  files: File[],
  uploadOne: (file: File, index: number) => Promise<T>,
): Promise<T[]> {
  return uploadFilesWithConcurrency(files, uploadOne, 1);
}

/**
 * Upload multiple files with limited parallelism (faster multi-doc uploads while staying gentle on the API).
 */
export async function uploadFilesWithConcurrency<T>(
  files: File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
): Promise<T[]> {
  if (!files.length) return [];
  const limit = Math.max(1, concurrency);
  const results: T[] = new Array(files.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await uploadOne(files[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, () => worker()));
  return results;
}