import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { MetricsService } from "../monitoring/metrics.service";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly code?: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

@Catch()
export class ErrorBoundaryFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorBoundaryFilter.name);

  constructor(private readonly metricsService: MetricsService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default error response
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let code = "INTERNAL_SERVER_ERROR";
    let details = undefined;

    // Handle different types of exceptions
    if (exception instanceof AppError) {
      status = exception.statusCode;
      message = exception.message;
      code = exception.code || "APPLICATION_ERROR";
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      message =
        typeof response === "object" && response["message"]
          ? response["message"]
          : exception.message;
      code = `HTTP_${status}`;
    } else if (exception instanceof Error) {
      message = exception.message;
      code = "UNHANDLED_ERROR";
    }

    // Log the error
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      code,
      details,
    };

    // Log with appropriate level
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception.stack,
        "ErrorBoundaryFilter",
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} ${status} - ${message}`,
        "ErrorBoundaryFilter",
      );
    }

    // Record metrics
    this.metricsService.recordError({
      statusCode: status,
      path: request.path,
      method: request.method,
      errorCode: code,
    });

    // Don't leak internal errors in production
    if (status >= 500 && process.env.NODE_ENV === "production") {
      errorResponse.message = "Internal server error";
      delete errorResponse.details;
    }

    response.status(status).json(errorResponse);
  }
}
