import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { File as MulterFile } from "multer";
import { Readable } from "stream";
import { UsersService } from "../users/users.service";
import { bufferToStream } from "../utils/readstreamfile";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly MAX_VIDEO_SIZE = 128 * 1024 * 1024; // 128MB
  private readonly ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/webm",
  ];
  private oauth2Client: OAuth2Client;
  private readonly youtube = google.youtube("v3");

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get("YOUTUBE_CLIENT_ID"),
      this.configService.get("YOUTUBE_CLIENT_SECRET"),
      this.configService.get("YOUTUBE_REDIRECT_URI"),
    );
  }

  async getValidAccessToken(userId: string): Promise<string> {
    return this.authService.getValidYouTubeAccessToken(userId);
  }

  async uploadVideo(
    userId: string,
    videoStream: Readable,
    title: string,
    description: string,
    privacyStatus: "private" | "unlisted" | "public" = "private",
    tags: string[] = [],
  ) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const youtube = google.youtube("v3");

      // Initialize the upload
      const response = await youtube.videos.insert({
        auth: this.oauth2Client,
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            tags,
          },
          status: {
            privacyStatus,
            publishAt: null,
          },
        },
        media: {
          body: videoStream,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error("Error uploading video:", error);
      throw new Error("Failed to upload video to YouTube");
    }
  }

  async scheduleVideo(
    userId: string,
    videoStream: Readable,
    title: string,
    description: string,
    privacyStatus: string,
    tags: string[] = [],
    scheduledTime: Date,
  ) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const response = await this.youtube.videos.insert({
        auth,
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title,
            description,
            tags,
          },
          status: {
            privacyStatus,
            publishAt: scheduledTime.toISOString(),
          },
        },
        media: {
          body: videoStream,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error("Error scheduling video:", error);
      throw new Error("Failed to schedule video on YouTube");
    }
  }

  async getVideoDetails(userId: string, videoId: string) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const youtube = google.youtube("v3");

      const response = await youtube.videos.list({
        auth: this.oauth2Client,
        part: ["snippet", "status", "contentDetails"],
        id: [videoId],
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error getting video details: ${error.message}`);
      throw new InternalServerErrorException({
        message: "Failed to get video details",
        error: error.message,
      });
    }
  }

  async updateVideoDetails(
    userId: string,
    videoId: string,
    title?: string,
    description?: string,
    privacyStatus?: "private" | "unlisted" | "public",
    tags?: string[],
  ) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const youtube = google.youtube("v3");

      const response = await youtube.videos.update({
        auth: this.oauth2Client,
        part: ["snippet", "status"],
        requestBody: {
          id: videoId,
          snippet: {
            title,
            description,
            tags,
          },
          status: {
            privacyStatus,
          },
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error updating video details: ${error.message}`);
      throw new InternalServerErrorException({
        message: "Failed to update video details",
        error: error.message,
      });
    }
  }

  validateVideoFile(file: MulterFile) {
    if (!file) {
      throw new BadRequestException("No video file provided");
    }

    const allowedMimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        "Invalid file type. Only MP4, MOV, and AVI files are allowed",
      );
    }

    if (file.size > this.MAX_VIDEO_SIZE) {
      throw new BadRequestException(
        `Video file too large. Maximum size: ${this.MAX_VIDEO_SIZE / (1024 * 1024)}MB`,
      );
    }
  }

  /**
   * Sets a custom thumbnail for a YouTube video.
   */
  async setVideoThumbnail(
    userId: string,
    videoId: string,
    thumbnailBuffer: Buffer,
  ) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const response = await this.youtube.thumbnails.set({
        auth,
        videoId,
        media: {
          body: bufferToStream(thumbnailBuffer),
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error("Error setting thumbnail:", error);
      throw new Error("Failed to set video thumbnail");
    }
  }

  async getScheduledVideos(userId: string) {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const response = await this.youtube.videos.list({
        auth,
        part: ["snippet", "status"],
        myRating: "none",
        maxResults: 50,
      });
      const scheduledVideos = response.data.items.filter(
        (video) =>
          video.status?.publishAt &&
          new Date(video.status.publishAt) > new Date(),
      );

      return scheduledVideos;
    } catch (error) {
      this.logger.error("Error getting scheduled videos:", error);
      throw new Error("Failed to get scheduled videos");
    }
  }
}
