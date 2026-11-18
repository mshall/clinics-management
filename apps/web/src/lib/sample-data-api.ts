import { apiDelete, apiGet, apiPost } from "@/lib/http";

export type SampleDataDto = { patientId: string; appointmentId: string | null; created: boolean };

export async function fetchSampleData(): Promise<SampleDataDto | null> {
  return (await apiGet<{ sample: SampleDataDto | null }>("/api/v1/onboarding/sample-data")).sample;
}

export function createSampleData() {
  return apiPost<SampleDataDto>("/api/v1/onboarding/sample-data", {});
}

export function removeSampleData() {
  return apiDelete<{ removed: number }>("/api/v1/onboarding/sample-data");
}
