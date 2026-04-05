import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  UploadedFiles,
  UseGuards,
  Query,
} from "@nestjs/common";
import {
  FileInterceptor,
  FileFieldsInterceptor,
  FilesInterceptor,
} from "@nestjs/platform-express";
import { UGCService } from "./ugc.service";
import { File as MulterFile } from "multer";
import { S3Service } from "../s3/s3.service";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import axios from "axios";
import * as cheerio from "cheerio";
import { AsynchedProducerService } from "../asynched/asynched-producer.service";

interface AuthenticatedRequest extends Request {
  user?: any;
}

@ApiTags("ugc")
@Controller("ugc")
export class UGCController {
  private readonly logger = new Logger(UGCController.name);

  constructor(
    private readonly ugcService: UGCService,
    private readonly s3Service: S3Service,
    private readonly asynchedProducer: AsynchedProducerService,
  ) {}

  @Post("scripts/generate")
  @ApiOperation({
    summary: "Generate a script from a prompt, language, and keywords",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        language: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Script generated successfully" })
  async generateScript(
    @Request() req,
    @Body()
    body: {
      prompt: string;
      language: string;
      keywords: string[];
    },
  ) {
    return this.ugcService.generateScript({
      userId: req.user?._id,
      ...body,
    });
  }

  // @Post("avatars/create")
  // @ApiOperation({ summary: 'Create an avatar from a photo and features' })
  // @ApiConsumes('multipart/form-data')
  // @ApiBody({ schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' }, name: { type: 'string' }, features: { type: 'object', properties: { hair: { type: 'string' }, outfit: { type: 'string' }, glasses: { type: 'boolean' } } } } } })
  // @ApiResponse({ status: 201, description: 'Avatar created successfully' })
  // @UseInterceptors(FileInterceptor("photo"))
  // async createAvatar(
  //   @Request() req,
  //   @UploadedFile() photo: MulterFile,
  //   @Body()
  //   body: {
  //     name: string;
  //     features?: {
  //       hair?: string;
  //       outfit?: string;
  //       glasses?: boolean;
  //     };
  //   },
  // ) {
  //   return this.ugcService.createAvatar({
  //     userId: req.user?._id,
  //     photo: photo.buffer,
  //     ...body,
  //   });
  // }

  @Get("avatars")
  @ApiOperation({ summary: "Get available avatars" })
  @ApiResponse({ status: 200, description: "List of available avatars" })
  async getAvailableAvatars() {
    return this.ugcService.getAvailableAvatars();
  }

  @Post("voices/create")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Generate a voice from a sample and language" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        voiceSample: { type: "string", format: "binary" },
        scriptId: { type: "string" },
        language: { type: "string" },
        voiceId: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Voice generated successfully" })
  @UseInterceptors(FileInterceptor("voiceSample"))
  async generateVoice(
    @Request() req,
    @UploadedFile() voiceSample: MulterFile,
    @Body() body: { scriptId?: string; language: string },
  ) {
    const userId = req.user?._id;
    if (!userId) {
      throw new HttpException(
        "User not authenticated",
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.ugcService.generateVoice({
      userId,
      voiceSample: voiceSample.buffer,
      scriptId: body.scriptId || "default_script",
      language: body.language,
    });
  }

  @Get("voices")
  @ApiOperation({ summary: "Get available voices" })
  @ApiResponse({ status: 200, description: "List of available voices" })
  async getAvailableVoices() {
    return this.ugcService.getAvailableVoices();
  }

  // @Post("videos/generate")
  // @ApiOperation({ summary: 'Generate a video from script, avatar, and voice' })
  // @ApiBody({ schema: { type: 'object', properties: { scriptId: { type: 'string' }, avatarId: { type: 'string' }, voiceId: { type: 'string' }, length: { type: 'number' }, language: { type: 'string' } } } })
  // @ApiResponse({ status: 201, description: 'Video generated successfully' })
  // async generateVideo(
  //   @Request() req,
  //   @Body()
  //   body: {
  //     scriptId: string;
  //     avatarId: string;
  //     voiceId: string;
  //     length: number;
  //     language: string;
  //   },
  // ) {
  //   return this.ugcService.generateVideo({
  //     userId: req.user?._id,
  //     ...body,
  //   });
  // }

  @Get("videos/:id/status")
  @ApiOperation({ summary: "Get the status of a generated video" })
  @ApiParam({ name: "id", description: "ID of the video" })
  @ApiResponse({
    status: 200,
    description: "Video status retrieved successfully",
  })
  async getVideoStatus(@Param("id") videoId: string) {
    return this.ugcService.getVideoStatus(videoId);
  }

  @Post("images/generate")
  @ApiOperation({ summary: "Generate images from a prompt and style" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        image_count: { type: "number" },
        orientation: { type: "string" },
        style: {
          type: "object",
          properties: { prompt: { type: "string" }, tool: { type: "string" } },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Images generated successfully" })
  async generateImageFromPrompt(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      name: string;
      image_count?: number;
      orientation?: string;
      style?: { prompt?: string; tool?: string };
    },
  ) {
    this.logger.log(`User ${req.user?._id}`);
    if (!body.style || !body.style.prompt) {
      throw new HttpException(
        "style.prompt is required",
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.ugcService.generateImageFromPrompt({
      name: body.name ?? "anonymous",
      image_count: body.image_count ?? 1,
      orientation:
        (body.orientation as "square" | "landscape" | "portrait") ??
        "landscape",
      style: {
        prompt: body.style.prompt,
        tool: body.style.tool,
      },
    });
  }

  @Get("images/:id/status")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the status of a generated image" })
  @ApiParam({ name: "id", description: "ID of the image" })
  @ApiResponse({
    status: 200,
    description: "Image status retrieved successfully",
  })
  async getImageStatus(@Param("id") id: string, @Request() req) {
    const statusResponse = await this.ugcService.getImageStatus(id);
    const userId = req.user?._id;
    if (!userId) {
      this.logger.error("User ID missing in request for S3 upload");
      return statusResponse;
    }
    if (
      statusResponse.status === "complete" &&
      statusResponse.downloads?.length
    ) {
      this.ugcService.saveMagicHourDownloadsToS3(
        userId,
        statusResponse.downloads,
        "images",
        id,
      );
    }
    return statusResponse;
  }

  @Post("videos/ai-talking-photo")
  @ApiOperation({
    summary: "Generate an AI talking photo video from image and audio",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        image: { type: "string", format: "binary" },
        audio: { type: "string", format: "binary" },
        startSeconds: { type: "number" },
        endSeconds: { type: "number" },
        name: { type: "string" },
        style: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "AI talking photo video generated successfully",
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "image", maxCount: 1 },
      { name: "audio", maxCount: 1 },
    ]),
  )
  async generateAITalkingPhotoVideo(
    @Request() req,
    @UploadedFiles() files: { image?: MulterFile[]; audio?: MulterFile[] },
    @Body() body: any,
  ) {
    this.logger.log("Body:", JSON.stringify(body));
    this.logger.log("Files:", Object.keys(files));
    const imageFile = files.image?.[0];
    const audioFile = files.audio?.[0];
    if (!imageFile || !audioFile) {
      throw new HttpException(
        "Both image and audio files are required",
        HttpStatus.BAD_REQUEST,
      );
    }
    let styleObj: Record<string, any> | undefined = undefined;
    if (body.style) {
      try {
        styleObj = JSON.parse(body.style);
      } catch (e) {
        throw new HttpException("Invalid style JSON", HttpStatus.BAD_REQUEST);
      }
    }
    return this.ugcService.generateAITalkingPhotoVideo({
      imageBuffer: imageFile.buffer,
      audioBuffer: audioFile.buffer,
      startSeconds: Number(body.startSeconds),
      endSeconds: Number(body.endSeconds),
      name: body.name,
      style: styleObj,
    });
  }

  @Post("videos/image-to-video")
  @ApiOperation({ summary: "Generate a video from multiple images" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: { type: "string", format: "binary" },
        },
        endSeconds: { type: "string" },
        name: { type: "string" },
        style: { type: "string" },
        height: { type: "string" },
        width: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Image to video generated successfully",
  })
  @UseInterceptors(FilesInterceptor("images", 10))
  async generateImageToVideo(
    @Request() req,
    @UploadedFiles() images: MulterFile[],
    @Body("endSeconds") endSeconds: string,
    @Body("name") name?: string,
    @Body("style") style?: string,
    @Body("height") height?: string,
    @Body("width") width?: string,
  ) {
    if (!images || images.length === 0) {
      throw new HttpException(
        "At least one image is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    let styleObj: Record<string, any> | undefined = undefined;
    if (style) {
      try {
        styleObj = JSON.parse(style);
      } catch (e) {
        throw new HttpException("Invalid style JSON", HttpStatus.BAD_REQUEST);
      }
    }

    if (!styleObj) {
      throw new HttpException(
        "style is required and must be valid JSON",
        HttpStatus.BAD_REQUEST,
      );
    }

    // Pass all image buffers to the service
    return this.ugcService.generateImageToVideo({
      imageBuffers: images.map((img) => img.buffer), // Pass all image buffers
      endSeconds: Number(endSeconds),
      name,
      style: styleObj,
      height: height ? Number(height) : undefined,
      width: width ? Number(width) : undefined,
    });
  }

  @Get("videos/image-to-video/:id/status")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the status of an image-to-video job" })
  @ApiParam({
    name: "id",
    description: "ID of the image-to-video job (MagicHour id)",
  })
  @ApiResponse({
    status: 200,
    description: "Image-to-video status retrieved successfully",
  })
  async getImageToVideoStatus(@Param("id") id: string, @Request() req) {
    const statusResponse = await this.ugcService.getImageToVideoStatus(id);
    const userId = req.user?._id;
    if (!userId) {
      this.logger.error("User ID missing in request for S3 upload");
      return statusResponse;
    }
    if (
      statusResponse.status === "complete" &&
      statusResponse.downloads?.length
    ) {
      this.ugcService.saveMagicHourDownloadsToS3(
        userId,
        statusResponse.downloads,
        "videos",
        id,
      );
    }
    return statusResponse;
  }

  @Post("videos/merge")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Merge a video and an audio file into a single video, with optional subtitles",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        videoUrl: { type: "string" },
        audioUrl: { type: "string" },
        script: { type: "string" },
        subtitleOptions: {
          type: "object",
          properties: {
            fontPath: { type: "string" },
            fontSize: { type: "number" },
            fontColor: { type: "string" },
            position: { type: "string" },
            effect: { type: "string" },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Merged video job scheduled successfully",
  })
  async mergeVideoAndAudio(
    @Request() req,
    @Body()
    body: {
      videoUrl: string;
      audioUrl: string;
      script?: string;
      subtitleOptions?: any;
    },
    @Query("test") test?: string,
  ) {
    if (!body.videoUrl || !body.audioUrl) {
      throw new HttpException(
        "Both videoUrl and audioUrl are required",
        HttpStatus.BAD_REQUEST,
      );
    }
    const userId = req.user?._id;
    if (!userId) {
      throw new HttpException(
        "User not authenticated",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const outputKey = `results/merged-${Date.now()}.mp4`;
    const jobId = await this.asynchedProducer.addJob({
      inputVideoUrl: body.videoUrl,
      inputAudioUrl: body.audioUrl,
      outputKey,
      script: body.script,
      subtitleOptions: body.subtitleOptions,
      userId,
    });
    return { jobId, status: "scheduled" };
  }

  @Post("voices/clone")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Clone a custom voice from a user audio sample" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        voiceSample: { type: "string", format: "binary" },
        script: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Voice cloned successfully" })
  @UseInterceptors(FileInterceptor("voiceSample"))
  async cloneVoice(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() voiceSample: MulterFile,
    @Body("script") script?: string,
  ) {
    if (!voiceSample) {
      throw new HttpException(
        "voiceSample is required",
        HttpStatus.BAD_REQUEST,
      );
    }
    // Call ElevenLabs to clone the voice and store the voiceId
    const voiceId = await this.ugcService.cloneUserVoice(
      req.user?._id,
      voiceSample.buffer,
      script,
    );
    return { voiceId };
  }

  @Post("voices/generate-speech")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Generate speech audio from a script and a chosen voice",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { script: { type: "string" }, voiceId: { type: "string" } },
    },
  })
  @ApiResponse({ status: 201, description: "Speech generated successfully" })
  async generateSpeech(
    @Request() req,
    @Body() body: { script: string; voiceId: string },
  ) {
    if (!body.script || !body.voiceId) {
      throw new HttpException(
        "script and voiceId are required",
        HttpStatus.BAD_REQUEST,
      );
    }
    const audioUrl = await this.ugcService.generateSpeechAudio(
      req.user._id,
      body.script,
      body.voiceId,
    );
    return { audioUrl };
  }

  @Post("videos/text-to-video")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Generate a video from text using MagicHour" })
  async textToVideo(
    @Body()
    body: {
      name?: string;
      end_seconds: number;
      orientation: "portrait" | "landscape" | "square";
      style: Record<string, any>;
    },
  ) {
    return this.ugcService.createTextToVideo(body);
  }

  @Post("videos/video-to-video")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Generate a video from another video using MagicHour",
  })
  async videoToVideo(
    @Body()
    body: {
      name?: string;
      start_seconds: number;
      end_seconds: number;
      style: Record<string, any>;
      assets: {
        video_source: "file" | "youtube";
        video_file_path?: string;
        youtube_url?: string;
      };
      height?: number;
      width?: number;
      fps_resolution?: "FULL" | "HALF";
    },
  ) {
    return this.ugcService.createVideoToVideo(body);
  }

  @Get("extract-images")
  @ApiOperation({ summary: "Extract all image URLs from a website" })
  async extractImages(@Query("url") url: string) {
    if (!url) {
      throw new HttpException(
        "url query parameter is required",
        HttpStatus.BAD_REQUEST,
      );
    }
    // 1. Try axios + Cheerio with browser-like User-Agent
    let images: string[] = [];
    let html: string = "";
    try {
      const { data } = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      html = data;
      this.logger?.log?.("First 500 chars of HTML:", html.slice(0, 500));
      const $ = cheerio.load(html);
      $("img").each((_, el) => {
        const src =
          $(el).attr("src") || $(el).attr("data-src") || $(el).attr("srcset");
        if (src) images.push(src);
      });
      this.logger?.log?.(`Cheerio found ${images.length} images.`);
    } catch (err) {
      this.logger?.error?.("Axios/Cheerio failed:", err.message);
    }
    // 2. If no images found, try Puppeteer
    if (images.length === 0) {
      this.logger?.log?.("No images found with Cheerio, trying Puppeteer...");
      try {
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        images = await page.evaluate(() => {
          const srcs = [];
          document.querySelectorAll("img").forEach((img) => {
            srcs.push(
              img.src ||
                img.getAttribute("data-src") ||
                img.getAttribute("srcset"),
            );
          });
          return srcs.filter(Boolean);
        });
        await browser.close();
        this.logger?.log?.(`Puppeteer found ${images.length} images.`);
      } catch (err) {
        this.logger?.error?.("Puppeteer failed:", err.message);
      }
    }
    return { images };
  }

  @Post("videos/merge-async")
  async mergeVideoAsync(@Body() body) {
    // Validate and extract S3 URLs and options from body
    if (!body.videoUrl || !body.audioUrl) {
      throw new HttpException(
        "Both videoUrl and audioUrl are required",
        HttpStatus.BAD_REQUEST,
      );
    }
    const outputKey = `results/merged-${Date.now()}.mp4`;
    const jobId = await this.asynchedProducer.addJob({
      inputVideoUrl: body.videoUrl,
      inputAudioUrl: body.audioUrl,
      outputKey,
      ffmpegOptions: body.ffmpegOptions,
    });
    return { jobId };
  }
}
