import { Response } from "express";

export class ResponseUtil {
  static success(
    res: Response,
    statusCode: number,
    data: any,
    message: string = "Success",
  ) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(
    res: Response,
    statusCode: number,
    message: string = "Error",
    errors: any = null,
  ) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }
}
