import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createSampleData, fetchSampleData, removeSampleData } from "@/lib/sample-data-api";

export function useSamplePatient(enabled = true) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const current = useQuery({ queryKey: ["onboarding", "sample-data"], queryFn: fetchSampleData, enabled });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding", "sample-data"] });
    void qc.invalidateQueries({ queryKey: ["patients"] });
    void qc.invalidateQueries({ queryKey: ["appointments"] });
  };
  const create = useMutation({
    mutationFn: createSampleData,
    onSuccess: (s) => {
      refresh();
      navigate(`/patients/${s.patientId}`);
    },
  });
  const remove = useMutation({ mutationFn: removeSampleData, onSuccess: refresh });
  return { sample: current.data ?? null, create, remove };
}
