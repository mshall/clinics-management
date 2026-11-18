export type KiorexCancellationPolicy = {
  patientCancelMinHours: number;
  patientRescheduleMinHours: number;
  depositRefundMinHours: number;
  maxPatientReschedules: number;
};

export type KiorexSettingsDto = {
  clinicId: string;
  cancellationPolicy: {
    effective: KiorexCancellationPolicy;
    marketDefault: KiorexCancellationPolicy;
    override: Partial<KiorexCancellationPolicy> | null;
  };
};
