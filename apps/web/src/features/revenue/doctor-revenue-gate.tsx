import { NavGate } from "@/components/nav-gate";
import { DoctorRevenuePage } from "./doctor-revenue-page";

export function DoctorRevenueGate() {
  return (
    <NavGate tab="doctor_revenue">
      <DoctorRevenuePage />
    </NavGate>
  );
}