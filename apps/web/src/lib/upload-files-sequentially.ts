/** Upload files one at a time (API accepts one file per request). */
export async function uploadFilesSequentially<T>(
  files: File[],
  uploadOne: (file: File, index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < files.length; i += 1) {
    results.push(await uploadOne(files[i]!, i));
  }
  return results;
}
