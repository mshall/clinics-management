/** Patient chart search in the assistant requires the same tab as the Patients module. */
export function canAssistantSearchPatients(navKeys: string[]): boolean {
  return navKeys.includes("patients");
}
