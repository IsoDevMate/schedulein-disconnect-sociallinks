import {
  Controller,
  Post,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { LinkedInService } from "../linkedin/linkedin.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import * as multer from "multer";
import { ResponseUtil } from "../common/utils/response.util";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('linkedin')
@Controller("linkedin")
export class LinkedInController {
  constructor(private readonly linkedInService: LinkedInService) {}

  @Post("register-upload")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a LinkedIn media upload' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string', example: 'urn:li:person:123' }, isOrganization: { type: 'boolean', example: false } } } })
  @ApiResponse({ status: 200, description: 'Upload URL and asset returned' })
  @UseGuards(JwtAuthGuard)
  async registerUpload(
    @Body("urn") urn: string,
    @Body("isOrganization") isOrganization: boolean,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      const { uploadUrl, asset } =
        await this.linkedInService.registerMediaUpload(
          urn,
          accessToken,
          isOrganization,
        );
      return ResponseUtil.success(res, HttpStatus.OK, { uploadUrl, asset });
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("register-carousel-upload")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a LinkedIn carousel media upload' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string', example: 'urn:li:person:123' }, isOrganization: { type: 'boolean', example: false }, numImages: { type: 'number', example: 3 } } } })
  @ApiResponse({ status: 200, description: 'Upload URLs and assets returned' })
  @UseGuards(JwtAuthGuard)
  async registerCarouselUpload(
    @Body("urn") urn: string,
    @Body("isOrganization") isOrganization: boolean,
    @Body("numImages") numImages: number,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      const { uploadUrls, assets } =
        await this.linkedInService.registerCarouselUpload(
          urn,
          accessToken,
          numImages,
          isOrganization,
        );
      return ResponseUtil.success(res, HttpStatus.OK, { uploadUrls, assets });
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("upload-media")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload media to LinkedIn' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, uploadUrl: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Media uploaded successfully' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.memoryStorage(),
    }),
  )
  async uploadMedia(
    @UploadedFile() file: multer.File,
    @Body("uploadUrl") uploadUrl: string,
    @Res() res: Response,
  ) {
    try {
      if (!uploadUrl) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "uploadUrl is required",
        );
      }

      const decodedUploadUrl = decodeURIComponent(uploadUrl);
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      if (!file) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No file uploaded",
        );
      }

      const uploadSuccess = await this.linkedInService.uploadMedia(
        decodedUploadUrl,
        file.buffer,
        accessToken,
      );

      if (uploadSuccess) {
        return ResponseUtil.success(
          res,
          HttpStatus.OK,
          null,
          "Media uploaded successfully",
        );
      } else {
        return ResponseUtil.error(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          "Media upload failed",
        );
      }
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("upload-carousel-media")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload carousel media to LinkedIn' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, uploadUrls: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 200, description: 'Carousel media uploaded successfully' })
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.memoryStorage(),
    }),
  )
  async uploadCarouselMedia(
    @UploadedFile() file: multer.File,
    @Body("uploadUrls") uploadUrls: string[],
    @Res() res: Response,
  ) {
    try {
      if (!uploadUrls) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "uploadUrls is required",
        );
      }

      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      if (!file) {
        return ResponseUtil.error(
          res,
          HttpStatus.BAD_REQUEST,
          "No file uploaded",
        );
      }

      for (let i = 0; i < uploadUrls.length; i++) {
        const uploadSuccess = await this.linkedInService.uploadMedia(
          uploadUrls[i],
          file.buffer,
          accessToken,
        );

        if (!uploadSuccess) {
          return ResponseUtil.error(
            res,
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Media upload failed",
          );
        }
      }

      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
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
  @Post("create-carousel-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn carousel share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, assets: { type: 'array', items: { type: 'string' } }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Carousel share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createCarouselShare(
    @Body("urn") urn: string,
    @Body("assets") assets: string[],
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createCarouselShare(
        urn,
        assets,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Carousel share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-company-carousel-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn company carousel share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, assets: { type: 'array', items: { type: 'string' } }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Company carousel share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createCompanyCarouselShare(
    @Body("urn") urn: string,
    @Body("assets") assets: string[],
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createCompanyCarouselShare(
        urn,
        assets,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Company carousel share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("publish-text-to-companypage")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish text to LinkedIn company page' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Text published to company page successfully' })
  @UseGuards(JwtAuthGuard)
  async publishTextToCompanyPage(
    @Body("urn") urn: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.publishTextTToCompanyPage(
        urn,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Text published to company page successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-text-post")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn text post' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Text post created successfully' })
  @UseGuards(JwtAuthGuard)
  async createTextPost(
    @Body("urn") urn: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.publishTextPost(urn, text, accessToken);
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Text post created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-article-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn article share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, articleUrl: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Article share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createArticleShare(
    @Body("urn") urn: string,
    @Body("articleUrl") articleUrl: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createarticleShare(
        urn,
        text,
        articleUrl,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Article share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-company-article-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn company article share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, articleUrl: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Company article share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createCompanyArticleShare(
    @Body("urn") urn: string,
    @Body("articleUrl") articleUrl: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createCompanyArticleShare(
        urn,
        text,
        articleUrl,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Company article share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-image-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn image share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, asset: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Image share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createImageShare(
    @Body("urn") urn: string,
    @Body("asset") asset: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createImageShare(
        urn,
        asset,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Image share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-company-image-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn company image share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, asset: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Company image share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createCompanyImageShare(
    @Body("urn") urn: string,
    @Body("asset") asset: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createCompanyImageShare(
        urn,
        asset,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Company image share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-video-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn video share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, asset: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Video share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createVideoShare(
    @Body("urn") urn: string,
    @Body("asset") asset: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createVideoShare(
        urn,
        asset,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Video share created successfully",
      );
    } catch (error) {
      return ResponseUtil.error(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message,
      );
    }
  }

  @Post("create-company-video-share")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a LinkedIn company video share' })
  @ApiBody({ schema: { type: 'object', properties: { urn: { type: 'string' }, asset: { type: 'string' }, text: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Company video share created successfully' })
  @UseGuards(JwtAuthGuard)
  async createCompanyVideoShare(
    @Body("urn") urn: string,
    @Body("asset") asset: string,
    @Body("text") text: string,
    @Res() res: Response,
  ) {
    try {
      const userId = res.locals.user._id;
      const user = await this.linkedInService.findUserById(userId);
      const accessToken = user.linkedInAccessToken;

      await this.linkedInService.createCompanyVideoShare(
        urn,
        asset,
        text,
        accessToken,
      );
      return ResponseUtil.success(
        res,
        HttpStatus.OK,
        null,
        "Company video share created successfully",
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
