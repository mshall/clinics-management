import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "./audit.service";

type AuthedRequest = Request & { user?: JwtUser };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();

    return next.handle().pipe(
      tap((responseBody) => {
        void this.audit.recordFromHttp(req.user, req.method, req.originalUrl ?? req.url, req.body, responseBody);
      }),
    );
  }
}
