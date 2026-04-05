import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";
import { CreatePostDto } from "./dto/create-tiktok.dto";
import axios from "axios";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import { CreatorInfoFormatted } from "../common/interfaces/tiktokapi.response";

@Injectable()
export class TikTokService {
  constructor(private readonly configService: ConfigService) {}

  async getPostStatus(publishId: string, accessToken: string) {
    console.log(`=== GETTING POST STATUS ===`);
    console.log(`Publish ID: ${publishId}`);
    console.log(`Access Token (last 10): ...${accessToken.slice(-10)}`);

    try {
      const payload = {
        publish_id: publishId,
      };

      console.log(`=== STATUS REQUEST PAYLOAD ===`);
      console.log(JSON.stringify(payload, null, 2));
      console.log(`=== END PAYLOAD ===`);

      const response = await axios.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
      );

      if (response.data.error && response.data.error.code !== "ok") {
        console.error(
          `TikTok API Error: ${response.data.error.message || response.data.error.code}`,
        );
        throw new BadRequestException(
          `TikTok API Error: ${response.data.error.message || response.data.error.code}`,
        );
      }

      console.log("Successfully retrieved post status");
      console.log(`Status: ${response.data.data?.status}`);
      console.log(`Fail Reason: ${response.data.data?.fail_reason || "None"}`);
      console.log(`Uploaded Bytes: ${response.data.data?.uploaded_bytes || 0}`);
      console.log(
        `Downloaded Bytes: ${response.data.data?.downloaded_bytes || 0}`,
      );
      console.log(
        `Public Post IDs: ${JSON.stringify(response.data.data?.publicaly_available_post_id || [])}`,
      );

      return {
        success: true,
        data: response.data.data,
        status_info: {
          status: response.data.data?.status,
          fail_reason: response.data.data?.fail_reason || null,
          publicly_available_post_id:
            response.data.data?.publicaly_available_post_id || [],
          uploaded_bytes: response.data.data?.uploaded_bytes || 0,
          downloaded_bytes: response.data.data?.downloaded_bytes || 0,
        },
        raw_response: response.data,
      };
    } catch (error) {
      console.error("=== POST STATUS ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Headers: ${JSON.stringify(error.response?.headers)}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Request URL: ${error.config?.url}`);
      console.error(
        `Request Headers: ${JSON.stringify(error.config?.headers)}`,
      );
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      if (error.response?.status === 400) {
        const errorCode = error.response?.data?.error?.code;
        if (errorCode === "invalid_publish_id") {
          throw new BadRequestException({
            message: "The publish_id does not exist",
            tiktokError: error.response?.data,
            statusCode: error.response?.status,
            errorCode,
          });
        } else if (
          errorCode === "token_not_authorized_for_specified_publish_id"
        ) {
          throw new BadRequestException({
            message:
              "The access_token does not have authorization for this publish_id",
            tiktokError: error.response?.data,
            statusCode: error.response?.status,
            errorCode,
          });
        }
      } else if (error.response?.status === 401) {
        throw new BadRequestException({
          message: "Invalid or expired TikTok access token",
          tiktokError: error.response?.data,
          statusCode: error.response?.status,
        });
      } else if (error.response?.status === 429) {
        throw new BadRequestException({
          message: "Rate limit exceeded. Please try again later.",
          tiktokError: error.response?.data,
          statusCode: error.response?.status,
        });
      }

      throw new InternalServerErrorException({
        message:
          error.response?.data?.error?.message || "Failed to get post status",
        tiktokError: error.response?.data,
        statusCode: error.response?.status,
        originalError: error.message,
      });
    }
  }

  async queryCreatorInfo(accessToken: string): Promise<CreatorInfoFormatted> {
    try {
      const response = await axios.post(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        },
      );

      if (response.data.error && response.data.error.code !== "ok") {
        console.error(
          `TikTok API Error: ${response.data.error.message || response.data.error.code}`,
        );
        throw new BadRequestException(
          `TikTok API Error: ${response.data.error.message || response.data.error.code}`,
        );
      }

      console.log("Successfully retrieved creator info");
      console.debug("Creator info response:", {
        username: response.data.data?.creator_username,
        nickname: response.data.data?.creator_nickname,
        maxDuration: response.data.data?.max_video_post_duration_sec,
      });

      return {
        success: true,
        data: response.data.data,
        creator_info: {
          avatar_url: response.data.data?.creator_avatar_url,
          username: response.data.data?.creator_username,
          nickname: response.data.data?.creator_nickname,
          privacy_level_options:
            response.data.data?.privacy_level_options || [],
          settings: {
            comment_disabled: response.data.data?.comment_disabled || false,
            duet_disabled: response.data.data?.duet_disabled || false,
            stitch_disabled: response.data.data?.stitch_disabled || false,
          },
          max_video_duration_sec:
            response.data.data?.max_video_post_duration_sec || 300,
        },
        raw_response: response.data,
      };
    } catch (error) {
      // ENHANCED ERROR LOGGING
      console.error("=== CREATOR INFO ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Headers: ${JSON.stringify(error.response?.headers)}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Request URL: ${error.config?.url}`);
      console.error(
        `Request Headers: ${JSON.stringify(error.config?.headers)}`,
      );
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      if (error.response?.status === 401) {
        console.error("Invalid or expired TikTok access token");
        throw new BadRequestException({
          message: "Invalid or expired TikTok access token",
          tiktokError: error.response?.data,
          statusCode: error.response?.status,
        });
      } else if (error.response?.status === 429) {
        console.error("Rate limit exceeded");
        throw new BadRequestException({
          message: "Rate limit exceeded. Please try again later.",
          tiktokError: error.response?.data,
          statusCode: error.response?.status,
        });
      } else if (error.response?.status === 403) {
        const errorCode = error.response?.data?.error?.code;
        let message = "Forbidden request";

        if (errorCode === "spam_risk_user_banned_from_posting") {
          message = "User is banned from posting on TikTok";
        } else if (errorCode === "reached_active_user_cap") {
          message = "Daily quota for active users reached";
        } else if (
          errorCode === "unaudited_client_can_only_post_to_private_accounts"
        ) {
          message = "Client can only post to private accounts (unaudited)";
        }

        throw new BadRequestException({
          message,
          tiktokError: error.response?.data,
          statusCode: error.response?.status,
          errorCode,
        });
      }

      throw new InternalServerErrorException({
        message:
          error.response?.data?.error?.message ||
          "Failed to query creator info",
        tiktokError: error.response?.data,
        statusCode: error.response?.status,
        originalError: error.message,
      });
    }
  }

  async directPost(createPostDto: CreatePostDto, accessToken: string) {
    console.log("=== STARTING DIRECT POST ===");
    console.log(`Source: ${createPostDto.source}`);
    console.log(`Privacy Level: ${createPostDto.privacyLevel}`);
    console.log(`Video Size: ${createPostDto.videoSize}`);
    console.log(`Caption: ${createPostDto.caption}`);

    try {
      const initResponse = await this.initializeDirectPost(
        createPostDto,
        accessToken,
      );

      if (!initResponse.data?.publish_id) {
        console.error("Failed to initialize post - no publish_id received");
        console.error(`Response: ${JSON.stringify(initResponse.data)}`);
        throw new BadRequestException({
          message: "Failed to initialize post",
          response: initResponse.data,
        });
      }

      if (
        createPostDto.source === "FILE_UPLOAD" &&
        initResponse.data.upload_url
      ) {
        console.log("Post initialized with upload URL");
        return {
          publish_id: initResponse.data.publish_id,
          upload_url: initResponse.data.upload_url,
          message: "Post initialized. Upload video to the provided URL.",
          next_step: "upload_video",
        };
      }

      console.log("Direct post initialized successfully");
      return initResponse.data;
    } catch (error) {
      // ENHANCED ERROR LOGGING
      console.error("=== DIRECT POST ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Request URL: ${error.config?.url}`);
      console.error(`Request Data: ${JSON.stringify(error.config?.data)}`);
      console.error(
        `Request Headers: ${JSON.stringify(error.config?.headers)}`,
      );
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      throw new InternalServerErrorException({
        message:
          error.response?.data?.error?.message ||
          "Failed to direct post to TikTok",
        tiktokError: error.response?.data,
        statusCode: error.response?.status,
        requestPayload: error.config?.data,
        originalError: error.message,
      });
    }
  }

  private async initializeDirectPost(
    createPostDto: CreatePostDto,
    accessToken: string,
  ) {
    console.log("=== INITIALIZING DIRECT POST ===");

    const payload: any = {
      post_info: {
        title: createPostDto.caption,
        privacy_level: createPostDto.privacyLevel,
        disable_duet: createPostDto.disableDuet,
        disable_comment: createPostDto.disableComment,
        disable_stitch: createPostDto.disableStitch,
        video_cover_timestamp_ms: createPostDto.videoCoverTimestamp,
      },
      source_info: {
        source: createPostDto.source,
      },
    };

    if (createPostDto.source === "FILE_UPLOAD") {
      payload.source_info.video_size = createPostDto.videoSize;
      payload.source_info.chunk_size = createPostDto.chunkSize;
      payload.source_info.total_chunk_count = createPostDto.totalChunkCount;
    } else if (createPostDto.source === "PULL_FROM_URL") {
      payload.source_info.video_url = createPostDto.videoUrl;
    }

    // LOG THE EXACT PAYLOAD BEING SENT
    console.log(`=== REQUEST PAYLOAD ===`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`=== END PAYLOAD ===`);

    // LOG ACCESS TOKEN (last 10 characters for security)
    console.log(`Access Token (last 10): ...${accessToken.slice(-10)}`);

    return axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );
  }

  async upload(createPostDto: CreatePostDto, accessToken: string) {
    console.log("=== STARTING UPLOAD ===");
    console.log(`Source: ${createPostDto.source}`);
    console.log(`Video Size: ${createPostDto.videoSize}`);
    console.log(`Chunk Size: ${createPostDto.chunkSize}`);

    try {
      const initResponse = await this.initializeUpload(
        createPostDto,
        accessToken,
      );

      if (initResponse.data?.error?.code !== "ok") {
        console.error("Failed to initialize upload - no publish_id received");
        console.error(`Response: ${JSON.stringify(initResponse.data)}`);
        throw new BadRequestException({
          message: "Failed to initialize upload",
          response: initResponse.data,
        });
      }

      if (
        createPostDto.source === "FILE_UPLOAD" &&
        initResponse.data.data?.upload_url
      ) {
        console.log("Upload initialized with upload URL");
        return {
          publish_id: initResponse.data.data.publish_id,
          upload_url: initResponse.data.data.upload_url,
          message: "Upload initialized. Upload video to the provided URL.",
          next_step: "upload_video",
        };
      }

      console.log("Upload initialized successfully");
      return initResponse.data.data;
    } catch (error) {
      // ENHANCED ERROR LOGGING
      console.error("=== UPLOAD ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Request URL: ${error.config?.url}`);
      console.error(`Request Data: ${JSON.stringify(error.config?.data)}`);
      console.error(
        `Request Headers: ${JSON.stringify(error.config?.headers)}`,
      );
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      throw new InternalServerErrorException({
        message:
          error.response?.data?.error?.message || "Failed to upload to TikTok",
        tiktokError: error.response?.data,
        statusCode: error.response?.status,
        requestPayload: error.config?.data,
        originalError: error.message,
      });
    }
  }

  private async initializeUpload(
    createPostDto: CreatePostDto,
    accessToken: string,
  ) {
    console.log("=== INITIALIZING UPLOAD ===");

    const payload: any = {
      source_info: {
        source: createPostDto.source,
      },
    };

    if (createPostDto.source === "FILE_UPLOAD") {
      payload.source_info.video_size = createPostDto.videoSize;
      payload.source_info.chunk_size = createPostDto.chunkSize;
      payload.source_info.total_chunk_count = createPostDto.totalChunkCount;
    } else if (createPostDto.source === "PULL_FROM_URL") {
      payload.source_info.video_url = createPostDto.videoUrl;
    }

    // LOG THE EXACT PAYLOAD BEING SENT
    console.log(`=== UPLOAD REQUEST PAYLOAD ===`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`=== END PAYLOAD ===`);

    // LOG ACCESS TOKEN (last 10 characters for security)
    console.log(`Access Token (last 10): ...${accessToken.slice(-10)}`);

    return axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );
  }

  async uploadVideoFile(
    uploadUrl: string,
    filePath: string,
    contentType: string,
  ) {
    console.log(`=== UPLOADING VIDEO FILE ===`);
    console.log(`File Path: ${filePath}`);
    console.log(`Content Type: ${contentType}`);

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileSize = fileBuffer.length;

      console.log(`File Size: ${fileSize} bytes`);
      console.log(`Upload URL: ${uploadUrl}`);

      const response = await axios.put(uploadUrl, fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": fileSize.toString(),
          "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      console.log("Video file uploaded successfully");
      console.log(`Response Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.error("=== FILE UPLOAD ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Upload URL: ${uploadUrl}`);
      console.error(`File Path: ${filePath}`);
      console.error(`Content Type: ${contentType}`);
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      throw new InternalServerErrorException({
        message: "Failed to upload video file",
        uploadError: error.response?.data,
        statusCode: error.response?.status,
        originalError: error.message,
      });
    }
  }

  async uploadVideoBuffer(
    uploadUrl: string,
    buffer: Buffer,
    contentType: string,
  ) {
    console.log(`=== UPLOADING VIDEO BUFFER ===`);
    console.log(`Buffer Size: ${buffer.length} bytes`);
    console.log(`Content Type: ${contentType}`);

    try {
      const fileSize = buffer.length;
      console.log(`Upload URL: ${uploadUrl}`);

      const response = await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": fileSize.toString(),
          "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      console.log("Video buffer uploaded successfully");
      console.log(`Response Status: ${response.status}`);
      return response.data;
    } catch (error) {
      console.error("=== BUFFER UPLOAD ERROR DEBUG ===");
      console.error(`Status: ${error.response?.status}`);
      console.error(`Status Text: ${error.response?.statusText}`);
      console.error(`Response Data: ${JSON.stringify(error.response?.data)}`);
      console.error(`Upload URL: ${uploadUrl}`);
      console.error(`Buffer Size: ${buffer.length}`);
      console.error(`Content Type: ${contentType}`);
      console.error(`Full Error: ${error.message}`);
      console.error("=== END ERROR DEBUG ===");

      throw new InternalServerErrorException({
        message: "Failed to upload video buffer",
        uploadError: error.response?.data,
        statusCode: error.response?.status,
        originalError: error.message,
      });
    }
  }

  async embedVideo(videoId: string) {
    console.log(`Getting embed URL for video: ${videoId}`);
    try {
      const embedUrl = `https://www.tiktok.com/oembed/?url=https://www.tiktok.com/@tiktok/video/${videoId}`;
      console.debug("Generated embed URL:", { videoId, embedUrl });
      console.log("Successfully generated embed URL");
      return { embedUrl };
    } catch (error) {
      console.error(`Embed error: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to embed video");
    }
  }

  async handleWebhook(payload: any) {
    console.log(`Processing webhook payload: ${JSON.stringify(payload)}`);
    try {
      console.debug("Webhook payload details:", {
        type: payload.type,
        timestamp: payload.timestamp,
      });
      console.log("Webhook processed successfully");
      return { message: "Webhook received" };
    } catch (error) {
      console.error(`Webhook error: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to handle webhook");
    }
  }
}
