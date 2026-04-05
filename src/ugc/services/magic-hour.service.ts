import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class MagicHourService {
  private readonly logger = new Logger(MagicHourService.name);
  private readonly apiKey: string;
  private readonly apiBaseUrl = "https://api.magichour.ai/v1";

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("MAGIC_HOUR_API_KEY");
  }

  private async getUploadUrl(
    type: "video" | "image" | "audio",
    extension: string,
  ) {
    this.logger.log(
      `Getting upload URL for type: ${type}, extension: ${extension}`,
    );
    const { data } = await axios.post(
      `${this.apiBaseUrl}/files/upload-urls`,
      { items: [{ type, extension }] },
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    this.logger.log("Upload URL response:", JSON.stringify(data, null, 2));
    return data.items[0];
  }

  private async uploadAsset(
    uploadUrl: string,
    file: Buffer,
    contentType: string,
  ) {
    // Debug log for upload
    this.logger.log("Starting file upload...");
    this.logger.log("Upload URL:", uploadUrl);
    this.logger.log("File size:", file.length);
    this.logger.log(
      "Content-Type (forced to application/octet-stream):",
      contentType,
    );

    try {
      const response = await axios.put(uploadUrl, file, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      this.logger.log("Upload successful! Response:", {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      this.logger.error("Upload failed with error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
      });
      throw error;
    }
  }

  private getMimeType(
    type: "image" | "audio" | "video",
    extension: string,
  ): string {
    if (type === "image") {
      if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
      if (extension === "png") return "image/png";
      if (extension === "webp") return "image/webp";
      if (extension === "bmp") return "image/bmp";
      if (extension === "tiff") return "image/tiff";
      if (extension === "avif") return "image/avif";
      if (extension === "jp2") return "image/jp2";
    }
    if (type === "audio") {
      if (extension === "mp3" || extension === "mpeg") return "audio/mpeg";
      if (extension === "wav") return "audio/wav";
      if (extension === "aac") return "audio/aac";
      if (extension === "aiff") return "audio/aiff";
      if (extension === "flac") return "audio/flac";
    }
    if (type === "video") {
      if (extension === "mp4") return "video/mp4";
      if (extension === "m4v") return "video/x-m4v";
      if (extension === "mov") return "video/quicktime";
      if (extension === "webm") return "video/webm";
    }
    return `${type}/${extension}`;
  }

  async createTalkingPhoto(
    imageBuffer: Buffer,
    audioBuffer: Buffer,
  ): Promise<any> {
    this.logger.log("Creating talking photo with Magic Hour");

    const imageExtension = "png";
    const audioExtension = "mp3";

    const imageUrlData = await this.getUploadUrl("image", imageExtension);
    const audioUrlData = await this.getUploadUrl("audio", audioExtension);

    await this.uploadAsset(imageUrlData.upload_url, imageBuffer, "image/png");
    await this.uploadAsset(audioUrlData.upload_url, audioBuffer, "audio/mp3");

    const response = await axios.post(
      `${this.apiBaseUrl}/videos/talking-photo`,
      {
        source_image_path: imageUrlData.file_path,
        driving_audio_path: audioUrlData.file_path,
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    const videoId = response.data.id;

    let videoUrl = null;
    let status = "processing";
    while (status === "processing") {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // wait 2 seconds
      const videoDetails = await this.getVideo(videoId);
      status = videoDetails.status;
      if (status === "completed") {
        videoUrl = videoDetails.output;
      }
    }

    return { videoUrl, videoId };
  }

  async generateImage(options: {
    name: string;
    image_count: number;
    orientation: "square" | "landscape" | "portrait";
    style: { prompt: string; tool?: string };
  }): Promise<{ imageUrl: string; imageId: string }> {
    this.logger.log(
      "Generating image with Magic Hour (ai-image-generator endpoint)",
    );
    const body = {
      name: options.name,
      image_count: options.image_count,
      orientation: options.orientation,
      style: options.style,
    };
    this.logger.log("MagicHour API request body:", JSON.stringify(body));
    let response;
    try {
      response = await axios.post(
        `${this.apiBaseUrl}/ai-image-generator`,
        body,
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
    } catch (error) {
      this.logger.error(
        "MagicHour API error:",
        error.response?.data || error.message,
      );
      throw new (require("@nestjs/common").HttpException)(
        error.response?.data?.message ||
          JSON.stringify(error.response?.data) ||
          error.message,
        error.response?.status || 500,
      );
    }
    const imageId = response.data.id;
    // Poll for completion as before...
    let imageUrl = null;
    let status = "processing";
    while (status === "processing" || status === "queued") {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const imageDetails = await this.getImage(imageId);
      status = imageDetails.status;
      if (status === "completed") {
        imageUrl = imageDetails.output;
      }
    }
    return { imageUrl, imageId };
  }

  async generateVideo(prompt: string): Promise<any> {
    this.logger.log("Generating video with Magic Hour");
    const response = await axios.post(
      `${this.apiBaseUrl}/videos/text-to-video`,
      {
        prompt: prompt,
        duration: 5,
        model: "stable-diffusion-v1-5",
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    const videoId = response.data.id;

    let videoUrl = null;
    let status = "processing";
    while (status === "processing" || status === "queued") {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // wait 2 seconds
      const videoDetails = await this.getVideo(videoId);
      status = videoDetails.status;
      if (status === "completed") {
        videoUrl = videoDetails.output;
      }
    }

    return { videoUrl, videoId };
  }
  /**
   * Create an AI Talking Photo video from an image and audio buffer using the new MagicHour API.
   */
  async createAITalkingPhoto(options: {
    imageBuffer: Buffer;
    audioBuffer: Buffer;
    imageExtension?: string;
    audioExtension?: string;
    startSeconds: number;
    endSeconds: number;
    name?: string;
    style?: Record<string, any>;
  }): Promise<any> {
    const imageExtension = options.imageExtension || "png";
    const audioExtension = options.audioExtension || "mp3";

    // 1. Get upload URLs for image and audio
    // Debug log for API key (masked)
    console.log(
      "MagicHour API Key (masked):",
      this.apiKey ? this.apiKey.slice(0, 4) + "..." : "undefined",
    );
    const { data } = await axios.post(
      `${this.apiBaseUrl}/files/upload-urls`,
      {
        items: [
          { type: "image", extension: imageExtension },
          { type: "audio", extension: audioExtension },
        ],
      },
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    const [imageUrlData, audioUrlData] = data.items;
    // Debug log for upload URL data
    console.log("Upload URL data (image):", imageUrlData);
    console.log("Upload URL data (audio):", audioUrlData);

    // 2. Upload the assets with correct MIME types
    await this.uploadAsset(
      imageUrlData.upload_url,
      options.imageBuffer,
      this.getMimeType("image", imageExtension),
    );
    await this.uploadAsset(
      audioUrlData.upload_url,
      options.audioBuffer,
      this.getMimeType("audio", audioExtension),
    );

    // 3. Call the AI Talking Photo API
    const body = {
      name: options.name || `Talking Photo - ${new Date().toISOString()}`,
      start_seconds: options.startSeconds,
      end_seconds: options.endSeconds,
      assets: {
        image_file_path: imageUrlData.file_path,
        audio_file_path: audioUrlData.file_path,
      },
      ...(options.style ? { style: options.style } : {}),
    };
    const response = await axios.post(
      `${this.apiBaseUrl}/ai-talking-photo`,
      body,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    return response.data;
  }

  async createImageToVideo(options: {
  imageBuffers: Buffer[]; // Changed to accept multiple images
  endSeconds: number;
  style: Record<string, any>;
  name?: string;
  imageExtension?: string;
  height?: number;
  width?: number;
}): Promise<any> {
  const imageExtension = options.imageExtension || "png";

  // Upload all images and get their file paths
  const imageFilePaths: string[] = [];

  for (let i = 0; i < options.imageBuffers.length; i++) {
    const imageBuffer = options.imageBuffers[i];

    // 1. Get upload URL for each image
    const { data } = await axios.post(
      `${this.apiBaseUrl}/files/upload-urls`,
      {
        items: [{ type: "image", extension: imageExtension }],
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      },
    );

    const [imageUrlData] = data.items;

    // 2. Upload the image
    await this.uploadAsset(
      imageUrlData.upload_url,
      imageBuffer,
      `image/${imageExtension}`,
    );

    imageFilePaths.push(imageUrlData.file_path);
  }

  // 3. Call the Image-to-Video API
  let image_file_path: string | string[] = imageFilePaths;
  if (imageFilePaths.length === 1) {
    image_file_path = imageFilePaths[0];
  }
  const body: any = {
    name: options.name || `Image To Video - ${new Date().toISOString()}`,
    end_seconds: options.endSeconds,
    style: options.style,
    assets: {
      image_file_path: image_file_path,
    },
  };

  if (options.height) body.height = options.height;
  if (options.width) body.width = options.width;

  this.logger.log(
    "Calling /image-to-video with body:",
    JSON.stringify(body, null, 2),
  );

  try {
    const response = await axios.post(
      `${this.apiBaseUrl}/image-to-video`,
      body,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      },
    );
    return response.data;
  } catch (error) {
    this.logger.error(
      "Error response from /image-to-video:",
      error.response?.data,
    );
    throw error;
  }
}
  // async createImageToVideo(options: {
  //   imageBuffer: Buffer;
  //   imageExtension?: string;
  //   endSeconds: number;
  //   name?: string;
  //   style: Record<string, any>;
  //   height?: number;
  //   width?: number;
  // }): Promise<any> {
  //   const imageExtension = options.imageExtension || "png";
  //   // 1. Get upload URL for image
  //   const { data } = await axios.post(
  //     `${this.apiBaseUrl}/files/upload-urls`,
  //     {
  //       items: [{ type: "image", extension: imageExtension }],
  //     },
  //     { headers: { Authorization: `Bearer ${this.apiKey}` } },
  //   );
  //   const [imageUrlData] = data.items;
  //   // 2. Upload the image
  //   await this.uploadAsset(
  //     imageUrlData.upload_url,
  //     options.imageBuffer,
  //     `image/${imageExtension}`,
  //   );
  //   // 3. Call the Image-to-Video API
  //   const body: any = {
  //     name: options.name || `Image To Video - ${new Date().toISOString()}`,
  //     end_seconds: options.endSeconds,
  //     style: options.style,
  //     assets: {
  //       image_file_path: imageUrlData.file_path,
  //     },
  //   };
  //   if (options.height) body.height = options.height;
  //   if (options.width) body.width = options.width;
  //   this.logger.log(
  //     "Calling /image-to-video with body:",
  //     JSON.stringify(body, null, 2),
  //   );
  //   try {
  //     const response = await axios.post(
  //       `${this.apiBaseUrl}/image-to-video`,
  //       body,
  //       { headers: { Authorization: `Bearer ${this.apiKey}` } },
  //     );
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error(
  //       "Error response from /image-to-video:",
  //       error.response?.data,
  //     );
  //     throw error;
  //   }
  // }

  async getImage(id: string): Promise<any> {
    this.logger.log(`getting image with ${id} from Magic Hour`);
    const { data } = await axios.get(
      `${this.apiBaseUrl}/image-projects/${id}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    return data;
  }

  async getVideo(id: string): Promise<any> {
    this.logger.log(`getting video with ${id} from Magic Hour`);
    const { data } = await axios.get(`${this.apiBaseUrl}/video-projects/${id}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return data;
  }

  async createTextToVideo(options: {
    name?: string;
    end_seconds: number;
    orientation: 'portrait' | 'landscape' | 'square';
    style: Record<string, any>;
  }): Promise<any> {
    const body = {
      name: options.name || `Text To Video - ${new Date().toISOString()}`,
      end_seconds: options.end_seconds,
      orientation: options.orientation,
      style: options.style,
    };
    const response = await axios.post(
      `${this.apiBaseUrl}/text-to-video`,
      body,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.data;
  }

  async createVideoToVideo(options: {
    name?: string;
    start_seconds: number;
    end_seconds: number;
    style: Record<string, any>;
    assets: {
      video_source: 'file' | 'youtube';
      video_file_path?: string;
      youtube_url?: string;
    };
    height?: number;
    width?: number;
    fps_resolution?: 'FULL' | 'HALF';
  }): Promise<any> {
    const body: any = {
      name: options.name || `Video To Video - ${new Date().toISOString()}`,
      start_seconds: options.start_seconds,
      end_seconds: options.end_seconds,
      style: options.style,
      assets: options.assets,
    };
    if (options.height) body.height = options.height;
    if (options.width) body.width = options.width;
    if (options.fps_resolution) body.fps_resolution = options.fps_resolution;
    const response = await axios.post(
      `${this.apiBaseUrl}/video-to-video`,
      body,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    return response.data;
  }
}
