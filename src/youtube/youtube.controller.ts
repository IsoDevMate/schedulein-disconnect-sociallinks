import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  HttpStatus,
  Param,
  Get,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Inject,
  forwardRef,
} from "@nestjs/common";
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from "@nestjs/platform-express";
import { Response } from "express";
import { YouTubeService } from "./youtube.service";
import { UsersService } from "../users/users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { YouTubeQuotaMonitorService } from "./services/youtube-quota-monitor.service";
//import { SubscriptionGuard } from "../payments/guards/subscription.guard";
import { ResponseUtil } from "../utils/response.util";
import {
  CreateYouTubeVideoDto,
  PrivacyStatusEnum,
} from "./dto/create-youtube-video.dto";
import { File as MulterFile } from "multer";
import { bufferToStream } from "src/utils/readstreamfile";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiParam,
} from "@nestjs/swagger";

@ApiTags("youtube")
@Controller("youtube")
@UseGuards(JwtAuthGuard)
export class YouTubeController {
  constructor(
    private readonly youtubeService: YouTubeService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly quotaMonitor: YouTubeQuotaMonitorService,
  ) {}

  @Post("upload")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload a YouTube video" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        video: { type: "string", format: "binary" },
        thumbnail: { type: "string", format: "binary" },
        title: { type: "string" },
        description: { type: "string" },
        privacyStatus: {
          type: "string",
          enum: Object.values(PrivacyStatusEnum),
        },
        tags: { type: "array", items: { type: "string" } },
        scheduledTime: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Video uploaded successfully" })
  @ApiResponse({
    status: 401,
    description: "No YouTube access token found for user",
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "video", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
  )
  async uploadVideo(
    @UploadedFiles() files: { video?: MulterFile[]; thumbnail?: MulterFile[] },
    @Body() createVideoDto: CreateYouTubeVideoDto,
    @Res() res: Response,
  ) {
    try {
      const file = files.video?.[0];
      const thumbnail = files.thumbnail?.[0];
      const userId = res.locals.user._id;
      console.log("loging the userid", userId);

      const user = await this.usersService.findById(userId);
      const accessToken = user.youtubeAccessToken;

      if (!user || !accessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "No YouTube access token found for user",
        );
      }

      if (!file) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Video file is required",
        );
      }
      // Validate the video file
      this.youtubeService.validateVideoFile(file);
      const videoStream = bufferToStream(file.buffer);

      // Upload the video
      const result = await this.youtubeService.uploadVideo(
        userId,
        videoStream,
        createVideoDto.title,
        createVideoDto.description,
        createVideoDto.privacyStatus,
        createVideoDto.tags,
      );

      if (thumbnail) {
        try {
          await this.youtubeService.setVideoThumbnail(
            userId,
            result.id,
            thumbnail.buffer,
          );
        } catch (thumbError) {
          // Always return a clear, actionable message
          return ResponseUtil.error(
            res,
            HttpStatus.BAD_REQUEST,
            "Thumbnail upload failed: The image may be too large. Please choose another thumbnail or resize it to be under 2MB.",
          );
        }
      }

      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        result,
        "Video uploaded successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @Post("schedule")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Schedule a YouTube video" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        video: { type: "string", format: "binary" },
        thumbnail: { type: "string", format: "binary" },
        title: { type: "string" },
        description: { type: "string" },
        privacyStatus: {
          type: "string",
          enum: Object.values(PrivacyStatusEnum),
        },
        tags: { type: "array", items: { type: "string" } },
        scheduledTime: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Video scheduled successfully" })
  @ApiResponse({
    status: 401,
    description: "No YouTube access token found for user",
  })
  @UseInterceptors(FileInterceptor("video"))
  async scheduleVideo(
    @UploadedFile() file: MulterFile,
    @UploadedFile("thumbnail") thumbnail: MulterFile,
    @Body() scheduleVideoDto: CreateYouTubeVideoDto & { scheduledTime: Date },
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.usersService.findById(userId);
      const accessToken = user.youtubeAccessToken;

      if (!user || !accessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "No YouTube access token found for user",
        );
      }

      if (!file) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Video file is required",
        );
      }
      // Validate the video file
      this.youtubeService.validateVideoFile(file);
      const videoStream = bufferToStream(file.buffer);

      // Schedule the video
      const result = await this.youtubeService.scheduleVideo(
        userId,
        videoStream,
        scheduleVideoDto.title,
        scheduleVideoDto.description,
        scheduleVideoDto.privacyStatus,
        scheduleVideoDto.tags,
        scheduleVideoDto.scheduledTime,
      );

      if (thumbnail) {
        try {
          await this.youtubeService.setVideoThumbnail(
            userId,
            result.id,
            thumbnail.buffer,
          );
        } catch (thumbError) {
          // Always return a clear, actionable message
          return ResponseUtil.error(
            res,
            HttpStatus.BAD_REQUEST,
            "Thumbnail upload failed: The image may be too large. Please choose another thumbnail or resize it to be under 2MB.",
          );
        }
      }

      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        result,
        "Video scheduled successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @Post("update/:videoId")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a YouTube video" })
  @ApiParam({
    name: "videoId",
    description: "ID of the YouTube video to update",
  })
  @ApiBody({ type: CreateYouTubeVideoDto })
  @ApiResponse({ status: 200, description: "Video updated successfully" })
  @ApiResponse({
    status: 401,
    description: "No YouTube access token found for user",
  })
  //@UseGuards(SubscriptionGuard)
  async updateVideo(
    @Body() updateVideoDto: CreateYouTubeVideoDto,
    @Param("videoId") videoId: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.usersService.findById(userId);
      const accessToken = user.youtubeAccessToken;

      if (!user || !accessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "No YouTube access token found for user",
        );
      }

      const result = await this.youtubeService.updateVideoDetails(
        userId,
        videoId,
        updateVideoDto.title,
        updateVideoDto.description,
        updateVideoDto.privacyStatus,
        updateVideoDto.tags,
      );

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        result,
        "Video updated successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @Get("scheduled")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get scheduled YouTube videos" })
  @ApiResponse({
    status: 200,
    description: "Scheduled videos retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "No YouTube access token found for user",
  })
  //@UseGuards(SubscriptionGuard)
  async getScheduledVideos(@Res() res: Response) {
    try {
      const userId = res.locals.user._id;
      const user = await this.usersService.findById(userId);
      const accessToken = user.youtubeAccessToken;

      if (!user || !accessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "No YouTube access token found for user",
        );
      }

      const result = await this.youtubeService.getScheduledVideos(userId);

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        result,
        "Scheduled videos retrieved successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }

  @Get("quota-status")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get YouTube API quota status" })
  @ApiResponse({
    status: 200,
    description: "Quota status retrieved successfully",
  })
  async getQuotaStatus(@Res() res: Response) {
    try {
      const status = await this.quotaMonitor.checkQuotaStatus();

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        status,
        "Quota status retrieved successfully",
      );
    } catch (error) {
      return ResponseUtil.error(res, HttpStatus.BAD_REQUEST, error.message);
    }
  }
}
