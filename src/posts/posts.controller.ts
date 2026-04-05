import {
  Controller,
  Post,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  Res,
  UploadedFile,
  UseInterceptors,
  Get,
  Delete,
  Param,
  Put,
  UploadedFiles,
} from "@nestjs/common";
import { PostsService } from "./posts.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreatePostDto } from "./dto/create-post.dto";
import { Response } from "express";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import * as multer from "multer";
//import { SubscriptionGuard } from "src/common/guards/subscription.guard";
import { ResponseUtil } from "../common/utils/response.util";
import { PostMediaType } from "./entities/post.entity";
// import { TimeUtils } from 'src/common/utils/time.utils';

@Controller("posts")
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post("schedule")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.memoryStorage(),
    }),
  )
  async schedulePost(
    @Body() createPostDto: CreatePostDto,
    @UploadedFile() file: multer.File,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.postsService.findUserById(userId);

      if (!user?.linkedInAccessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "LinkedIn account not connected",
        );
      }

      const scheduledDateTime = new Date(createPostDto.scheduledTime);
      const now = new Date();
      const threeMinutesFromNow = new Date(now.getTime() + 3 * 60 * 1000);

      if (scheduledDateTime < threeMinutesFromNow) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Scheduled time must be at least 3 minutes from now",
        );
      }
      //   TimeUtils.validateScheduleTime(scheduledDateTime);
      // media upload if file is present
      let mediaUrls: string[] = [];
      if (file) {
        const uploadedUrl = await this.postsService.uploadMedia(userId, file);
        mediaUrls = [uploadedUrl];
      } else if (createPostDto.mediaUrl) {
        mediaUrls = [createPostDto.mediaUrl];
      }

      // Ipost has media type but no media provided
      if (
        createPostDto.postMedia !== PostMediaType.NONE &&
        mediaUrls.length === 0
      ) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Media is required for media posts",
        );
      }

      const post = await this.postsService.schedulePost(
        createPostDto,
        userId,
        scheduledDateTime,
        mediaUrls,
        createPostDto.postType,
      );

      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        post,
        "Post scheduled successfully",
      );
    } catch (error) {
      console.error("Error scheduling post:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("upload-carousel")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor("files", 9, {
      storage: multer.memoryStorage(),
    }),
  )
  async uploadCarousel(
    @UploadedFiles() files: Array<multer.File>,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.postsService.findUserById(userId);

      if (!user?.linkedInAccessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "LinkedIn account not connected",
        );
      }

      // Upload all files and get their URLs
      const mediaUrls = await Promise.all(
        files.map((file) => this.postsService.uploadMedia(userId, file)),
      );

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { mediaUrls },
        "Carousel images uploaded successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("schedule-carousel")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor("files", 9, {
      storage: multer.memoryStorage(),
    }),
  )
  async scheduleCarouselPost(
    @Body() createPostDto: CreatePostDto,
    @UploadedFiles() files: Array<multer.File>,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.postsService.findUserById(userId);

      if (!user?.linkedInAccessToken) {
        return ResponseUtil.error(
          res,
          HttpStatus.UNAUTHORIZED,
          "LinkedIn account not connected",
        );
      }

      const scheduledDateTime = new Date(createPostDto.scheduledTime);
      const now = new Date();
      const threeMinutesFromNow = new Date(now.getTime() + 3 * 60 * 1000);

      if (scheduledDateTime < threeMinutesFromNow) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "Scheduled time must be at least 3 minutes from now",
        );
      }
      // TimeUtils.validateScheduleTime(scheduledDateTime);

      let mediaUrls: string[] = [];
      if (files && files.length > 0) {
        const uploadedUrls = await Promise.all(
          files.map((file) => this.postsService.uploadMedia(userId, file)),
        );
        mediaUrls = uploadedUrls;
      } else if (
        createPostDto.mediaUrls &&
        createPostDto.mediaUrls.length > 0
      ) {
        mediaUrls = createPostDto.mediaUrls;
      }

      console.log("mediaUrls", mediaUrls);
      if (mediaUrls.length < 2) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "At least 2 images are required for carousel post",
        );
      }

      const post = await this.postsService.schedulePost(
        createPostDto,
        userId,
        scheduledDateTime,
        mediaUrls,
        createPostDto.postType,
      );

      return ResponseUtil.success(
        res,
        HttpStatus.CREATED,
        post,
        "Carousel post scheduled successfully",
      );
    } catch (error) {
      console.error("Error scheduling carousel post:", error);
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("publish")
  @UseGuards(JwtAuthGuard)
  async publishPost(@Body("postId") postId: string, @Res() res: Response) {
    try {
      const userId = res.locals.user._id;
      const post = await this.postsService.findPostById(postId);

      if (post.userId.toString() !== userId) {
        return ResponseUtil.error(res, HttpStatus.UNAUTHORIZED, "Unauthorized");
      }

      await this.postsService.publishPost(post);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Post published successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("generate-idea")
  @UseGuards(JwtAuthGuard)
  async generatePostIdea(@Body("prompt") prompt: string, @Res() res: Response) {
    try {
      const idea = await this.postsService.generatePostIdea(prompt);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        idea,
        "Post idea generated successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("upload-media")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.memoryStorage(),
    }),
  )
  async uploadMedia(@UploadedFile() file: multer.File, @Res() res: Response) {
    try {
      const userId = res.locals.user._id;
      const mediaUrl = await this.postsService.uploadMedia(userId, file);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        { mediaUrl },
        "Media uploaded successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("store-media-link")
  @UseGuards(JwtAuthGuard)
  async storeMediaLink(
    @Body("mediaLink") mediaLink: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      await this.postsService.storeMediaLink(userId, mediaLink);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Media link stored successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Get("download-media")
  @UseGuards(JwtAuthGuard)
  async downloadMedia(
    @Query("mediaLink") mediaLink: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const mediaBuffer = await this.postsService.downloadMedia(
        userId,
        mediaLink,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        mediaBuffer,
        "Media downloaded successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Put(":postId")
  @UseGuards(JwtAuthGuard)
  async updatePost(
    @Param("postId") postId: string,
    @Body() createPostDto: CreatePostDto,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const post = await this.postsService.updatePost(
        postId,
        userId,
        createPostDto,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        post,
        "Post updated successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Delete(":postId")
  @UseGuards(JwtAuthGuard)
  async deletePost(@Param("postId") postId: string, @Res() res: Response) {
    try {
      const userId = res.locals.user._id;
      await this.postsService.deletePost(postId, userId);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Post deleted successfully",
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
