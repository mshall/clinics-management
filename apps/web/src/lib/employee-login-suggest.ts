const HR_DEFAULT_LOGIN_PASSWORD = "demo";

function slugEmailPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

/** Suggested login email: firstname.lastname@clinicname.com */
export function suggestEmployeeLoginEmail(
  firstName: string,
  lastName: string,
  clinicName: string,
): string {
  const first = slugEmailPart(firstName) || "employee";
  const last = slugEmailPart(lastName) || "staff";
  const clinic = slugEmailPart(clinicName) || "clinic";
  return `${first}.${last}@${clinic}.com`;
}

export function defaultEmployeeLoginPassword(): string {
  return HR_DEFAULT_LOGIN_PASSWORD;
}

export const HR_LOGIN_PASSWORD_MIN_LENGTH = 4;
