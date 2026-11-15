import { type ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { MulterError } from "multer";

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const maxMb = 15;
    if (exception.code === "LIMIT_FILE_SIZE") {
      res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: "Payload Too Large",
        message: `File too large (max ${maxMb}MB)`,
        messageKey: "errors.upload.fileTooLarge",
        messageParams: { maxMb },
      });
      return;
    }
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: "Bad Request",
      message: exception.message || "Upload failed",
      messageKey: "errors.upload.failed",
    });
  }
}