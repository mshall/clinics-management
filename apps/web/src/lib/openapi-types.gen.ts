/**
 * Generated from `apps/api/openapi/openapi.json` via `npm run codegen -w web`.
 * Do not edit by hand — run codegen after OpenAPI changes.
 */
export interface paths {
  "/api/v1/auth/login": {
    post: {
      requestBody: {
        content: {
          "application/json": components["schemas"]["LoginDto"];
        };
      };
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["LoginResponseDto"];
          };
        };
      };
    };
  };
  "/api/v1/auth/me": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["AuthUserDto"];
          };
        };
      };
    };
  };
  "/api/v1/patients": {
    get: {
      parameters: {
        query: {
          search?: string;
        };
      };
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["PatientDto"][];
          };
        };
      };
    };
  };
  "/api/v1/patients/{id}": {
    get: {
      parameters: {
        path: {
          id: string;
        };
      };
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["PatientDto"];
          };
        };
      };
    };
  };
  "/api/v1/clinics": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["ClinicDto"][];
          };
        };
      };
    };
  };
  "/api/v1/dashboards/group-overview": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": components["schemas"]["GroupOverviewKpisDto"];
          };
        };
      };
    };
  };
  "/api/v1/health/live": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              status: string;
            };
          };
        };
      };
    };
  };
}

export interface components {
  schemas: {
    LoginDto: {
      email: string;
      password: string;
    };
    AuthUserDto: {
      id: string;
      tenantId: string;
      email: string;
      displayName: string;
      role:
        | "GROUP_ADMIN"
        | "BRANCH_MANAGER"
        | "PHYSICIAN"
        | "NURSE"
        | "RECEPTIONIST"
        | "HR_OFFICER"
        | "FINANCE_OFFICER";
    };
    LoginResponseDto: {
      accessToken: string;
      user: components["schemas"]["AuthUserDto"];
    };
    PatientDto: {
      id: string;
      mrn: string;
      firstNameEn: string;
      lastNameEn: string;
      firstNameAr: string | null;
      lastNameAr: string | null;
      dob: string;
      gender: "M" | "F" | "OTHER" | "UNKNOWN";
      phone: string;
      email: string | null;
      nationalId?: string | null;
      homeBranch: string | null;
    };
    ClinicDto: {
      id: string;
      parentClinicId: string | null;
      parentNameEn: string | null;
      nameEn: string;
      nameAr: string;
      city: string;
      country: string;
      kind: "parent" | "branch";
      logoUrl: string | null;
    };
    GroupOverviewKpisDto: {
      patients: number;
      encounters30d: number;
      encountersPeriodTotal: number;
      appointmentsPeriodTotal: number;
      revenueMonth: number;
      expensesMonth: number;
      branches: number;
      headcount: number;
    };
  };
}

export type webhooks = Record<string, never>;
