import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  UsePipes,
  ValidationPipe,
  Delete,
  Param,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { TikTokService } from "./tiktok.service";
import { S3Service } from "../s3/s3.service";
import { Request, Response } from "express";
import { CreatePostDto } from "./dto/create-tiktok.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "../users/users.service";
import * as multer from "multer";
import { ResponseUtil } from "../utils/response.util";
import { ScheduleTikTokDto } from "./dto/schedule-tiktok.dto";
import {
  TikTokPostType,
  TikTokPostStatus,
} from "./entities/tiktok-post.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TikTokPost } from "./entities/tiktok-post.entity";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiQuery } from '@nestjs/swagger';

// custom interface to extend the Express Request type
interface AuthenticatedRequest extends Request {
  user?: any;
}

@ApiTags('tiktok')
@Controller("tiktok")
@UseGuards(JwtAuthGuard)
export class TikTokController {
  constructor(
    private readonly tiktokService: TikTokService,
    private readonly userService: UsersService,
    private readonly s3Service: S3Service,
    @InjectModel(TikTokPost.name)
    private readonly tiktokPostModel: Model<TikTokPost>,
  ) {}

  @Post("create")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a TikTok post' })
  @ApiBody({ type: CreatePostDto })
  @ApiResponse({ status: 201, description: 'TikTok post created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async createTikTokPost(
    @Body() createPostDto: CreatePostDto,
    @Res() res: Response,
  ) {
    console.log(`Creating TikTok post for user: ${res.locals.user._id}`);
    try {
      const userId = res.locals.user._id;
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user) {
        console.error(`User not found: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "User not found in request",
        });
      }

      if (!accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      // Validate required fields based on source type
      if (createPostDto.source === "FILE_UPLOAD") {
        if (
          !createPostDto.videoSize ||
          !createPostDto.chunkSize ||
          !createPostDto.totalChunkCount
        ) {
          console.error(`Invalid FILE_UPLOAD parameters for user: ${userId}`);
          return res.status(HttpStatus.BAD_REQUEST).json({
            error:
              "videoSize, chunkSize, and totalChunkCount are required for FILE_UPLOAD",
          });
        }
      } else if (createPostDto.source === "PULL_FROM_URL") {
        if (!createPostDto.videoUrl) {
          console.error(
            `Missing videoUrl for PULL_FROM_URL for user: ${userId}`,
          );
          return res.status(HttpStatus.BAD_REQUEST).json({
            error: "videoUrl is required for PULL_FROM_URL",
          });
        }
      }

      console.log(`Initializing direct post for user: ${userId}`);
      const post = await this.tiktokService.directPost(
        createPostDto,
        accessToken,
      );

      console.log(`Successfully created post for user: ${userId}`);
      return res.status(HttpStatus.CREATED).json(post);
    } catch (error) {
      console.error(
        `Error creating TikTok post: ${error.message}`,
        error.stack,
      );
      return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
    }
  }



  @Post("uploadthing")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a TikTok post with a file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { video: { type: 'string', format: 'binary' }, caption: { type: 'string' }, privacyLevel: { type: 'string' }, disableDuet: { type: 'boolean' }, disableComment: { type: 'boolean' }, disableStitch: { type: 'boolean' }, videoCoverTimestamp: { type: 'number' }, source: { type: 'string' }, videoSize: { type: 'number' }, chunkSize: { type: 'number' }, totalChunkCount: { type: 'number' }, videoUrl: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'TikTok post uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @UseInterceptors(
    FileInterceptor("video", {
      storage: multer.memoryStorage(),
    }),
  )
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidNonWhitelisted: false,
      skipMissingProperties: true,
    }),
  )
  async uploadTikTokPostWithFile(
    @Req() req: AuthenticatedRequest, // Keep AuthenticatedRequest
    // Re-enable UploadedFile parameter
    @UploadedFile() file: multer.File,
    @Body() createPostDto: CreatePostDto,
    @Res() res: Response,
  ) {
    console.log(
      "TikTokController: Inside uploadTikTokPostWithFile method body",
    );
    // Access user from request.user populated by JwtAuthGuard
    const userId = (req.user as any)?.userId; // Use userId

    if (!userId) {
      console.error("User ID not found in request.user");
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: "User not authenticated or user ID not available." });
    }

    console.log(`Uploading TikTok post with file for user: ${userId}`);

    // Restore original logic
    try {
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user || !accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      if (!file) {
        console.error(`No video file provided for user: ${userId}`);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "Video file is required",
        });
      }

      // Validate video file type
      const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
      if (!allowedTypes.includes(file.mimetype)) {
        console.error(
          `Invalid video format for user: ${userId}, type: ${file.mimetype}`,
        );
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "Invalid video format. Allowed: MP4, MOV, WEBM",
        });
      }

      console.log(
        `Processing video file for user: ${userId}, size: ${file.size} bytes`,
      );
      // Set FILE_UPLOAD specific fields
      const videoSize = file.size;
      const minChunkSize = 5 * 1024 * 1024; // 5MB minimum

      const alternativeApproach = () => {
        const preferredChunkSize = 10 * 1024 * 1024; // 10MB

        if (videoSize <= minChunkSize) {
          return {
            chunkSize: videoSize,
            totalChunks: 1,
          };
        }

        // Calculate how many full chunks we'll have
        const fullChunks = Math.floor(videoSize / preferredChunkSize);
        const remainder = videoSize % preferredChunkSize;

        if (remainder === 0) {
          // Perfect division
          return {
            chunkSize: preferredChunkSize,
            totalChunks: fullChunks,
          };
        } else if (remainder < minChunkSize && fullChunks > 0) {
          // Last chunk would be too small, redistribute
          const totalChunks = fullChunks;
          const adjustedChunkSize = Math.ceil(videoSize / totalChunks);
          return {
            chunkSize: adjustedChunkSize,
            totalChunks: totalChunks,
          };
        } else {
          // Last chunk is acceptable size
          return {
            chunkSize: preferredChunkSize,
            totalChunks: fullChunks + 1,
          };
        }
      };

      // Use the alternative approach for more predictable results
      const { chunkSize: finalChunkSize, totalChunks: finalTotalChunks } =
        alternativeApproach();

      const uploadDto: CreatePostDto = {
        ...createPostDto,
        source: "FILE_UPLOAD",
        videoSize,
        chunkSize: finalChunkSize,
        totalChunkCount: finalTotalChunks,
      };

      console.log(`Initializing upload for user: ${userId}`);
      console.log(`=== UPLOAD INITIALIZATION PAYLOAD ===`);
      console.log(`Source: ${uploadDto.source}`);
      console.log(`Video Size: ${uploadDto.videoSize}`);
      console.log(`Chunk Size: ${uploadDto.chunkSize}`);
      console.log(`Total Chunk Count: ${uploadDto.totalChunkCount}`);
      console.log(`=== END PAYLOAD ===`);

      const initResult = await this.tiktokService.upload(
        uploadDto,
        accessToken,
      );

      if (initResult?.upload_url) {
        console.log(
          `TikTok API initialization successful. Upload URL: ${initResult.upload_url}`,
        );
        console.log(`Uploading video file for user: ${userId}`);

        try {
          // Upload the video file using the upload_url
          const uploadResult = await this.tiktokService.uploadVideoBuffer(
            initResult.upload_url,
            file.buffer,
            file.mimetype,
          );

          console.log(`Successfully uploaded video for user: ${userId}`);
          return res.status(HttpStatus.CREATED).json({
            publish_id: initResult.publish_id,
            message: "Video uploaded successfully",
            status: "completed",
            upload_result: uploadResult,
          });
        } catch (uploadError) {
          console.error(
            `Error uploading video: ${uploadError.message}`,
            uploadError.stack,
          );
          return res.status(HttpStatus.BAD_REQUEST).json({
            error: "Failed to upload video",
            details: uploadError.message,
          });
        }
      } else {
        // Handle cases where initialization is successful but no upload_url is returned (e.g., PULL_FROM_URL, though handled by DTO)
        console.log(
          "TikTok API initialization successful, but no upload URL returned.",
          initResult,
        );
        return res.status(HttpStatus.OK).json(initResult); // Or handle based on API response structure
      }
    } catch (error) {
      console.error(
        `Error uploading TikTok post: ${error.message}`,
        error.stack,
      );
      const tiktokApiError =
        error?.response?.data?.error?.message || error?.response?.data?.message;
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error.message,
        tiktokApiError: tiktokApiError || null,
        tiktokApiRaw: error?.response?.data || null,
      });
    }
  }

  @Post("upload-from-s3")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a TikTok post from S3' })
  @ApiBody({ schema: { type: 'object', properties: { filename: { type: 'string' }, folder: { type: 'string' }, caption: { type: 'string' }, privacyLevel: { type: 'string' }, disableDuet: { type: 'boolean' }, disableComment: { type: 'boolean' }, disableStitch: { type: 'boolean' }, videoCoverTimestamp: { type: 'number' }, source: { type: 'string' }, videoSize: { type: 'number' }, chunkSize: { type: 'number' }, totalChunkCount: { type: 'number' }, videoUrl: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'TikTok post uploaded from S3 successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async uploadTikTokFromS3(
    @Body() body: { filename: string; folder?: string } & CreatePostDto,
    @Res() res: Response,
  ) {
    console.log(
      `Uploading TikTok post from S3 for user: ${res.locals.user._id}`,
    );
    try {
      const userId = res.locals.user._id;
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user || !accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      const { filename, folder = "media", ...createPostDto } = body;

      if (!filename) {
        console.error(`No filename provided for user: ${userId}`);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "Filename is required",
        });
      }

      console.log(
        `Downloading video from S3 for user: ${userId}, file: ${filename}`,
      );
      const videoBuffer = await this.s3Service.downloadMedia(
        userId,
        folder,
        filename,
      );

      const ext = filename.toLowerCase().split(".").pop();
      let contentType = "video/mp4";
      if (ext === "mov") contentType = "video/quicktime";
      else if (ext === "webm") contentType = "video/webm";

      const videoSize = videoBuffer.length;
      const chunkSize = Math.min(10 * 1024 * 1024, videoSize);
      const totalChunkCount = Math.ceil(videoSize / chunkSize);

      const uploadDto: CreatePostDto = {
        ...createPostDto,
        source: "FILE_UPLOAD",
        videoSize,
        chunkSize,
        totalChunkCount,
      };

      console.log(`Initializing S3 upload for user: ${userId}`);
      const initResult = await this.tiktokService.upload(
        uploadDto,
        accessToken,
      );

      if (initResult.upload_url) {
        console.log(`Uploading video from S3 for user: ${userId}`);
        await this.tiktokService.uploadVideoBuffer(
          initResult.upload_url,
          videoBuffer,
          contentType,
        );

        console.log(`Successfully uploaded video from S3 for user: ${userId}`);
        return res.status(HttpStatus.CREATED).json({
          publish_id: initResult.publish_id,
          message: "Video uploaded successfully from S3",
          status: "completed",
        });
      }

      return res.status(HttpStatus.CREATED).json(initResult);
    } catch (error) {
      console.error(`Error uploading from S3: ${error.message}`, error.stack);
      return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
    }
  }

  @Get("embed")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get TikTok video embed URL' })
  @ApiQuery({ name: 'videoId', description: 'ID of the TikTok video' })
  @ApiResponse({ status: 200, description: 'Embed URL retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async embedTikTokVideo(
    @Query("videoId") videoId: string,
    @Res() res: Response,
  ) {
    console.log(`Getting embed URL for video: ${videoId}`);
    try {
      const embedUrl = await this.tiktokService.embedVideo(videoId);
      console.log(`Successfully got embed URL for video: ${videoId}`);
      return res.status(HttpStatus.OK).json(embedUrl);
    } catch (error) {
      console.error(`Error getting embed URL: ${error.message}`, error.stack);
      return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
    }
  }

  @Post("webhook")
  @ApiOperation({ summary: 'Handle TikTok webhook' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async handleWebhook(@Body() payload: any, @Res() res: Response) {
    console.log(`Received webhook payload: ${JSON.stringify(payload)}`);
    try {
      const response = await this.tiktokService.handleWebhook(payload);
      console.log(`Successfully processed webhook`);
      return res.status(HttpStatus.OK).json(response);
    } catch (error) {
      console.error(`Error handling webhook: ${error.message}`, error.stack);
      return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
    }
  }

  @Get("creator")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get TikTok creator info' })
  @ApiResponse({ status: 200, description: 'Creator info retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async getCreatorInfo(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    console.log(`Getting creator info for user: ${(req.user as any)?.userId}`);
    try {
      const userId = (req.user as any)?.userId;
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user) {
        console.error(`User not found: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "User not found in request",
        });
      }

      if (!accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      console.log(`Querying creator info for user: ${userId}`);
      const creatorInfo =
        await this.tiktokService.queryCreatorInfo(accessToken);
      console.log(`Successfully got creator info for user: ${userId}`);

      return res.status(HttpStatus.OK).json(creatorInfo);
    } catch (error) {
      console.error(
        `Error getting creator info: ${error.message}`,
        error.stack,
      );
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error.message || "Failed to get creator info",
      });
    }
  }

  // NEW: Get Post Status Endpoint
  @Post("postStatus")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get TikTok post status' })
  @ApiBody({ schema: { type: 'object', properties: { publish_id: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Post status retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async getPostStatus(
    @Body() body: { publish_id: string },
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    console.log(`Getting post status for publish_id: ${body.publish_id}`);
    try {
      const userId = (req.user as any)?.userId;
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user) {
        console.error(`User not found: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "User not found in request",
        });
      }

      if (!accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      if (!body.publish_id) {
        console.error(`Missing publish_id for user: ${userId}`);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "publish_id is required",
        });
      }

      console.log(`Fetching status for publish_id: ${body.publish_id}`);
      const status = await this.tiktokService.getPostStatus(
        body.publish_id,
        accessToken,
      );

      console.log(`Successfully got status for publish_id: ${body.publish_id}`);
      return res.status(HttpStatus.OK).json(status);
    } catch (error) {
      console.error(`Error getting post status: ${error.message}`, error.stack);
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error.message,
        tiktokApiError: error?.response?.data?.error?.message || null,
        tiktokApiRaw: error?.response?.data || null,
      });
    }
  }

  // NEW: Pull from URL endpoint
  @Post("pull-from-url")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pull TikTok video from URL' })
  @ApiBody({ type: CreatePostDto })
  @ApiResponse({ status: 201, description: 'TikTok video pulled from URL successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async pullFromUrl(
    @Body() createPostDto: CreatePostDto,
    @Res() res: Response,
  ) {
    console.log(`Pulling video from URL for user: ${res.locals.user._id}`);
    try {
      const userId = res.locals.user._id;
      const user = await this.userService.findById(userId);
      const accessToken = user.TiktokAccessToken;

      if (!user) {
        console.error(`User not found: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "User not found in request",
        });
      }

      if (!accessToken) {
        console.error(`No TikTok access token found for user: ${userId}`);
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: "No TikTok access token found for user",
        });
      }

      if (createPostDto.source !== "PULL_FROM_URL") {
        console.error(
          `Invalid source for pull from URL: ${createPostDto.source}`,
        );
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "Source must be PULL_FROM_URL for this endpoint",
        });
      }

      if (!createPostDto.videoUrl) {
        console.error(`Missing videoUrl for user: ${userId}`);
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: "videoUrl is required for PULL_FROM_URL",
        });
      }

      console.log(
        `Initiating pull from URL for user: ${userId}, URL: ${createPostDto.videoUrl}`,
      );
      const result = await this.tiktokService.directPost(
        createPostDto,
        accessToken,
      );

      console.log(`Successfully initiated pull from URL for user: ${userId}`);
      return res.status(HttpStatus.CREATED).json(result);
    } catch (error) {
      console.error(`Error pulling from URL: ${error.message}`, error.stack);
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: error.message,
        tiktokApiError: error?.response?.data?.error?.message || null,
        tiktokApiRaw: error?.response?.data || null,
      });
    }
  }

  @Post("schedule")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Schedule a TikTok post' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, content: { type: 'string' }, scheduledTime: { type: 'string', format: 'date-time' }, mediaUrl: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, privacyLevel: { type: 'string' }, disableComment: { type: 'boolean' }, disableDuet: { type: 'boolean' }, disableStitch: { type: 'boolean' }, postType: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'TikTok post scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.memoryStorage(),
    }),
  )
  async schedulePost(
    @Body() scheduleDto: ScheduleTikTokDto,
    @UploadedFile() file: multer.File,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      const userId = (req.user as any)?.userId;
      const user = await this.userService.findById(userId);

      if (!user?.TiktokAccessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "TikTok account not connected",
        );
      }

      const scheduledDateTime = new Date(scheduleDto.scheduledTime);
      const now = new Date();
      const threeMinutesFromNow = new Date(now.getTime() + 3 * 60 * 1000);

      if (scheduledDateTime < threeMinutesFromNow) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Scheduled time must be at least 3 minutes from now",
        );
      }

      // Upload media if file is present
      let mediaUrl: string | undefined;
      if (file) {
        mediaUrl = await this.s3Service.uploadMedia(userId, file);
      } else if (scheduleDto.mediaUrl) {
        mediaUrl = scheduleDto.mediaUrl;
      }

      // Create TikTok post
      const post = new this.tiktokPostModel({
        userId,
        content: scheduleDto.content,
        scheduledTime: scheduledDateTime,
        mediaUrl,
        postType: scheduleDto.postType || TikTokPostType.PERSONAL,
        status: TikTokPostStatus.PENDING,
        title: scheduleDto.title,
        description: scheduleDto.description,
        privacyLevel: scheduleDto.privacyLevel || "PUBLIC",
        disableComment: scheduleDto.disableComment || false,
        disableDuet: scheduleDto.disableDuet || false,
        disableStitch: scheduleDto.disableStitch || false,
      });

      await post.save();

      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        post,
        "TikTok post scheduled successfully",
      );
    } catch (error) {
      console.error("Error scheduling TikTok post:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Get("scheduled")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get scheduled TikTok posts' })
  @ApiResponse({ status: 200, description: 'Scheduled posts retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async getScheduledPosts(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      const userId = (req.user as any)?.userId;
      const posts = await this.tiktokPostModel
        .find({ userId })
        .sort({ scheduledTime: -1 });

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        posts,
        "Scheduled posts retrieved successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Delete("scheduled/:postId")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a scheduled TikTok post' })
  @ApiParam({ name: 'postId', description: 'ID of the scheduled post to delete' })
  @ApiResponse({ status: 200, description: 'Scheduled post deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async deleteScheduledPost(
    @Param("postId") postId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      const userId = (req.user as any)?.userId;
      const post = await this.tiktokPostModel.findOne({ _id: postId, userId });

      if (!post) {
        return ResponseUtil.error(
          res,
          HttpStatus.NOT_FOUND,
          "Scheduled post not found",
        );
      }

      if (post.status !== TikTokPostStatus.PENDING) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Can only delete pending posts",
        );
      }

      await post.deleteOne();

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Scheduled post deleted successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }
}
