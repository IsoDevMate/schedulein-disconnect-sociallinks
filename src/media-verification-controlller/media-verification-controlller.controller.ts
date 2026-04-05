import { Controller, Get, Res, Param } from "@nestjs/common";
import { Response } from "express";
import { S3Service } from "../s3/s3.service"; // Assuming you have an S3 service
import { readFileSync } from "fs";
import { join } from "path";

@Controller("media")
export class MediaVerificationController {
  constructor(private readonly s3Service: S3Service) {}

  @Get("tiktok-verification.txt")
  async getTikTokVerification(@Res() res: Response) {
    const filePath = join(process.cwd(), "public", "media", "tiktok-verification.txt");
    console.log("TikTok verification file path:", filePath);

    const verificationString = readFileSync(filePath, "utf8");

    res.setHeader("Content-Type", "text/plain");
    return res.send(verificationString);
  }

  // Optional: Serve your video files for TikTok to pull
  @Get("videos/:filename")
  async getVideoFile(
    @Param("filename") filename: string,
    @Res() res: Response,
  ) {
    try {
      // Serve video files from your S3 or local storage
      const videoBuffer = await this.s3Service.downloadMedia(
        "public",
        "videos",
        filename,
      );

      // Set appropriate headers
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", videoBuffer.length);
      res.setHeader("Cache-Control", "public, max-age=3600");

      return res.send(videoBuffer);
    } catch (error) {
      return res.status(404).json({ error: "Video not found" });
    }
  }
}
