import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Script } from "./schemas/script.schema";
import { Avatar } from "./schemas/avatar.schema";
import { Voice } from "./schemas/voice.schema";
import { Video } from "./schemas/video.schema";
import { Image } from "./schemas/image.schema";
import { ElevenLabsService } from "./services/eleven-labs.service";
import { S3Service } from "../s3/s3.service";
import { FFmpegService } from "./services/ffmpeg.service";
import { OpenAIService } from "../openai/openai.service";
import { MagicHourService } from "./services/magic-hour.service";
import axios from "axios";
import { isValidObjectId } from 'mongoose';

@Injectable()
export class UGCService {
  private readonly logger = new Logger(UGCService.name);

  constructor(
    @InjectModel(Script.name) private scriptModel: Model<Script>,
    @InjectModel(Avatar.name) private avatarModel: Model<Avatar>,
    @InjectModel(Voice.name) private voiceModel: Model<Voice>,
    @InjectModel(Video.name) private videoModel: Model<Video>,
    @InjectModel(Image.name) private imageModel: Model<Image>,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly magicHourService: MagicHourService,
    private readonly s3Service: S3Service,
    private readonly ffmpegService: FFmpegService,
    private readonly openAIService: OpenAIService,
  ) {}

  private async getBufferFromUrl(url: string): Promise<Buffer> {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return response.data;
  }

  async generateScript(params: {
    userId: string;
    prompt: string;
    language: string;
    keywords: string[];
  }): Promise<Script> {
    try {
      // First get response from OpenAI
      const openAIResponse = await this.openAIService.generatePostIdea({
        prompt: `Create a video script based on the following prompt: ${params.prompt}.
        Language: ${params.language}
        Keywords to include: ${params.keywords.join(", ")}
        Make it engaging and suitable for a video presentation.`,
      });

      // Create script object with OpenAI response
      const scriptData = {
        userId: params.userId,
        prompt: params.prompt,
        text: openAIResponse,
        language: params.language,
        style: "promotional",
        keywords: params.keywords,
        isUsed: false,
      };

      // Create and save to database
      const script = new this.scriptModel(scriptData);
      const savedScript = await script.save();

      return savedScript;
    } catch (error) {
      this.logger.error("Error generating script:", error);
      throw new Error("Failed to generate script with OpenAI");
    }
  }

  async createAvatar(params: {
    userId: string;
    photo: Buffer;
    name: string;
    features?: {
      hair?: string;
      outfit?: string;
      glasses?: boolean;
    };
  }): Promise<Avatar> {
    // Upload photo to S3
    const photoUrl = await this.s3Service.uploadMedia(params.userId, {
      buffer: params.photo,
      originalname: `${Date.now()}.jpg`,
      mimetype: "image/jpeg",
    } as any);

    // Generate image with Magic Hour
    const { imageUrl, imageId } = await this.magicHourService.generateImage({
      name: params.name,
      style: {
        prompt: `a person that looks like the person in ${photoUrl}`,
      },
      image_count: 0,
      orientation: "square",
    });

    const avatar = new this.avatarModel({
      userId: params.userId,
      avatarId: imageId,
      avatarName: params.name,
      photoUrl,
      features: params.features,
      thumbnailUrl: imageUrl,
    });

    return avatar.save();
  }

  async generateVoice(params: {
    userId: string;
    scriptId?: string;
    voiceSample: Buffer;
    voiceId?: string;
    language: string;
  }): Promise<Voice> {
    try {
      // Upload voice sample to S3
      const sampleUrl = await this.s3Service.uploadMedia(params.userId, {
        buffer: params.voiceSample,
        originalname: `${Date.now()}.wav`,
        mimetype: "audio/wav",
      } as any);

      let voiceId = params.voiceId;
      // Try to clone voice using Eleven Labs if no voiceId provided
      if (!voiceId) {
        try {
          voiceId = await this.elevenLabsService.cloneVoice(
            params.voiceSample,
            `voice_${params.userId}_${Date.now()}`,
          );
        } catch (error) {
          this.logger.warn(
            "Failed to clone voice, using default voice:",
            error.message,
          );
          // Use a valid ElevenLabs voice ID (Rachel - a popular default voice)
          voiceId = "21m00Tcm4TlvDq8ikWAM";
        }
      }

      // Get script text or use default text
      let scriptText = "Welcome to our video presentation.";
      let scriptId = undefined;

      if (params.scriptId) {
        try {
          const script = await this.scriptModel.findById(params.scriptId);
          if (script) {
            scriptText = script.text;
            scriptId = script._id;
          }
        } catch (error) {
          this.logger.warn(
            "Error finding script, using default text:",
            error.message,
          );
        }
      }

      // Generate speech with retry logic
      let audioBuffer;
      try {
        audioBuffer = await this.elevenLabsService.generateSpeech(
          scriptText,
          voiceId,
        );
      } catch (error) {
        this.logger.error(
          "Error generating speech with voice ID:",
          voiceId,
          error,
        );
        // If the first attempt fails, try with a different default voice
        const fallbackVoiceId = "EXAVITQu4vr4xnSDxMaL"; // Josh - another popular voice
        this.logger.warn("Retrying with fallback voice ID:", fallbackVoiceId);
        audioBuffer = await this.elevenLabsService.generateSpeech(
          scriptText,
          fallbackVoiceId,
        );
        voiceId = fallbackVoiceId; // Update the voiceId to the successful one
      }

      const audioFileName = `${Date.now()}_generated.wav`;
      const audioUrl = await this.s3Service.uploadMedia(params.userId, {
        buffer: audioBuffer,
        originalname: audioFileName,
        mimetype: "audio/wav",
      } as any);

      // TODO: Set S3 object lifecycle rule to auto-delete this audio after 24 hours.
      // If not possible programmatically, ensure the S3 bucket has a lifecycle rule for generated audios.

      const voice = new this.voiceModel({
        userId: params.userId,
        scriptId,
        voiceId, // cloned voiceId remains in DB for future use
        sampleUrl,
        audioUrl,
        language: params.language,
      });

      return voice.save();
    } catch (error) {
      this.logger.error("Error in generateVoice:", error);
      throw new Error("Failed to generate voice: " + error.message);
    }
  }

  // async generateVideo(params: {
  //   userId: string;
  //   scriptId: string;
  //   avatarId: string;
  //   voiceId: string;
  //   length: number;
  //   language: string;
  // }): Promise<Video> {
  //   // Get script, avatar, and voice
  //   const script = await this.scriptModel.findById(params.scriptId);
  //   const avatar = await this.avatarModel.findById(params.avatarId);
  //   const voice = await this.voiceModel.findById(params.voiceId);

  //   if (!script || !avatar || !voice) {
  //     throw new Error("Script, avatar, or voice not found");
  //   }

  //   const imageBuffer = await this.getBufferFromUrl(avatar.thumbnailUrl);
  //   const audioBuffer = await this.getBufferFromUrl(voice.audioUrl);

  //   // Generate video using Magic Hour
  //   const { videoUrl } = await this.magicHourService.createTalkingPhoto(
  //     imageBuffer,
  //     audioBuffer,
  //   );

  //   const video = new this.videoModel({
  //     userId: params.userId,
  //     scriptId: script._id,
  //     avatarId: avatar._id,
  //     voiceId: voice._id,
  //     videoUrl: videoUrl,
  //     status: "completed",
  //   });

  //   return video.save();
  // }

  // async generateDirectVideo(params: {
  //   userId: string;
  //   scriptId: string;
  //   length: number;
  //   language: string;
  // }): Promise<Video> {
  //   const script = await this.scriptModel.findById(params.scriptId);
  //   if (!script) {
  //     throw new Error("Script not found");
  //   }

  //   const voice = await this.voiceModel.findOne({ scriptId: params.scriptId });
  //   if (!voice) {
  //     throw new Error("Voice not found for the given script");
  //   }

  //   // Find a default avatar
  //   const avatar = await this.avatarModel.findOne();
  //   if (!avatar) {
  //     throw new Error("No avatar found");
  //   }

  //   const imageBuffer = await this.getBufferFromUrl(avatar.thumbnailUrl);
  //   const audioBuffer = await this.getBufferFromUrl(voice.audioUrl);

  //   // Generate video using Magic Hour
  //   const { videoUrl, videoId } =
  //     await this.magicHourService.createTalkingPhoto(imageBuffer, audioBuffer);

  //   const video = new this.videoModel({
  //     userId: params.userId,
  //     scriptId: script._id,
  //     avatarId: avatar._id,
  //     voiceId: voice._id,
  //     videoUrl: videoUrl,
  //     videoId: videoId,
  //     status: "processing",
  //   });

  //   return video.save();
  // }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    const milliseconds = 0;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
  }

  async getAvailableAvatars(): Promise<Avatar[]> {
    return this.avatarModel.find().exec();
  }

  async getAvailableVoices(): Promise<any[]> {
    return this.elevenLabsService.getAvailableVoices();
  }

  async getVideoStatus(videoId: string): Promise<any> {
    if (isValidObjectId(videoId)) {
      const video = await this.videoModel.findById(videoId);
      if (!video || !video.videoId) {
        throw new Error("Video not found or videoId not set");
      }
      const videoDetails = await this.magicHourService.getVideo(video.videoId);
      video.status = videoDetails.status;
      await video.save();
      return videoDetails.status;
    } else {
      // Assume it's a MagicHour job ID
      return this.magicHourService.getVideo(videoId);
    }
  }

  async generateImageFromPrompt(options: {
    name: string;
    image_count?: number;
    orientation?: string;
    style: { prompt: string; tool?: string };
  }) {
    return this.magicHourService.generateImage({
      name: options.name,
      image_count: options.image_count ?? 1,
      orientation:
        (options.orientation as "square" | "landscape" | "portrait") ??
        "landscape",
      style: options.style,
    });
  }

  async getImageStatus(id: string) {
    return this.magicHourService.getImage(id);
  }

  /**
   * Generate an AI Talking Photo video using MagicHourService (new API).
   */
  async generateAITalkingPhotoVideo(options: {
    imageBuffer: Buffer;
    audioBuffer: Buffer;
    startSeconds: number;
    endSeconds: number;
    name?: string;
    style?: Record<string, any>;
    imageExtension?: string;
    audioExtension?: string;
  }): Promise<any> {
    return this.magicHourService.createAITalkingPhoto(options);
  }

  async generateImageToVideo(options: {
    imageBuffers: Buffer[];
    endSeconds: number;
    style: Record<string, any>;
    name?: string;
    imageExtension?: string;
    height?: number;
    width?: number;
  }): Promise<any> {
    return this.magicHourService.createImageToVideo(options);
  }

  async getImageToVideoStatus(id: string) {
    return this.magicHourService.getVideo(id);
  }

  async mergeVideoAndAudio(params: {
    userId: string;
    videoUrl: string;
    audioUrl: string;
  }): Promise<string> {
    this.logger.log(`[mergeVideoAndAudio] Starting merge for user ${params.userId}`);
    this.logger.log(`[mergeVideoAndAudio] Downloading video from ${params.videoUrl}`);
    const videoBuffer = await this.getBufferFromUrl(params.videoUrl);
    this.logger.log(`[mergeVideoAndAudio] Video downloaded (${videoBuffer.length} bytes)`);

    this.logger.log(`[mergeVideoAndAudio] Downloading audio from ${params.audioUrl}`);
    const audioBuffer = await this.getBufferFromUrl(params.audioUrl);
    this.logger.log(`[mergeVideoAndAudio] Audio downloaded (${audioBuffer.length} bytes)`);

    this.logger.log(`[mergeVideoAndAudio] Merging video and audio...`);
    const mergedBuffer = await this.ffmpegService.combineVideoAndAudio(
      params.userId,
      videoBuffer,
      audioBuffer,
      `${Date.now()}_merged.mp4`
    );
    this.logger.log(`[mergeVideoAndAudio] Merge complete (${mergedBuffer.length} bytes)`);

    this.logger.log(`[mergeVideoAndAudio] Uploading merged video to S3...`);
    const mergedUrl = await this.s3Service.uploadMedia(params.userId, {
      buffer: mergedBuffer,
      originalname: `${Date.now()}_merged.mp4`,
      mimetype: "video/mp4",
    } as any);
    this.logger.log(`[mergeVideoAndAudio] Merged video uploaded to S3: ${mergedUrl}`);
    return mergedUrl;
  }

  async saveMagicHourDownloadsToS3(userId: string, downloads: { url: string }[], type: 'images' | 'videos' | 'avatars', magicHourId?: string): Promise<string[]> {
    const s3Urls: string[] = [];
    for (let i = 0; i < downloads.length; i++) {
      const download = downloads[i];
      const response = await axios.get(download.url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      // Determine file extension and mimetype
      let ext = 'png';
      let mimetype = 'image/png';
      if (type === 'videos') {
        ext = 'mp4';
        mimetype = 'video/mp4';
      }
      if (type === 'avatars') {
        ext = 'png';
        mimetype = 'image/png';
      }
      const file = {
        buffer,
        originalname: `magichour_${type}_${Date.now()}_${i}.${ext}`,
        mimetype,
      } as any;
      const s3Url = await this.s3Service.uploadMedia(userId, file);
      s3Urls.push(s3Url);
    }
   if (type === 'images' && magicHourId) {
      await this.saveImageS3UrlsToDb(userId, magicHourId, s3Urls);
    }
    if (type === 'videos' && magicHourId) {
      await this.saveVideoS3UrlsToDb(userId, magicHourId, s3Urls);
    }
    return s3Urls;
  }

  // Save S3 URLs for images to DB (create or update by magicHourId)
  async saveImageS3UrlsToDb(userId: string, magicHourId: string, s3Urls: string[]) {
    Example: await this.imageModel.findOneAndUpdate({ userId, magicHourId }, { $set: { s3Urls } }, { upsert: true });
    this.logger.log(`Saving image S3 URLs for user ${userId}, magicHourId ${magicHourId}: ${JSON.stringify(s3Urls)}`);
  }

  // Save S3 URLs for videos to DB (create or update by magicHourId)
  async saveVideoS3UrlsToDb(userId: string, magicHourId: string, s3Urls: string[]) {
    Example: await this.videoModel.findOneAndUpdate({ userId, videoId: magicHourId }, { $set: { s3Urls } }, { upsert: true });
    this.logger.log(`Saving video S3 URLs for user ${userId}, magicHourId ${magicHourId}: ${JSON.stringify(s3Urls)}`);
  }

  async cloneUserVoice(userId: string, audioBuffer: Buffer, script?: string): Promise<string> {
    // Upload the sample audio to S3
    const sampleUrl = await this.s3Service.uploadMedia(userId, {
      buffer: audioBuffer,
      originalname: `voice_sample_${Date.now()}.wav`,
      mimetype: 'audio/wav',
    } as any);

    // Call ElevenLabs to clone the voice
    const voiceId = await this.elevenLabsService.cloneVoice(audioBuffer, `voice_${userId}_${Date.now()}`);

    // Save the cloned voiceId in the Voice collection
    const voice = new this.voiceModel({
      userId,
      voiceId,
      sampleUrl,
      language: 'en', // Or detect/set as needed
      scriptId: undefined,
    });
    await voice.save();
    return voiceId;
  }

  async generateSpeechAudio(userId: string, script: string, voiceId: string): Promise<string> {
    // Call ElevenLabs to generate speech
    const audioBuffer = await this.elevenLabsService.generateSpeech(script, voiceId);
    // Upload to S3 with a timestamped filename
    const audioFileName = `${Date.now()}_generated.wav`;
    const audioUrl = await this.s3Service.uploadMedia(userId, {
      buffer: audioBuffer,
      originalname: audioFileName,
      mimetype: 'audio/wav',
    } as any);
    // TODO: Set S3 object lifecycle rule to auto-delete this audio after 24 hours.
    return audioUrl;
  }

  async createTextToVideo(options: {
    name?: string;
    end_seconds: number;
    orientation: 'portrait' | 'landscape' | 'square';
    style: Record<string, any>;
  }) {
    return this.magicHourService.createTextToVideo(options);
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
  }) {
    return this.magicHourService.createVideoToVideo(options);
  }

  async mergeVideoAudioWithSubtitles(params: {
    userId: string;
    videoUrl: string;
    audioUrl: string;
    script?: string;
    subtitleOptions?: {
      fontPath: string;
      fontSize?: number;
      fontColor?: string;
      position?: 'bottom' | 'center' | 'top';
      effect?: 'fade' | 'slide';
    };
  }): Promise<string> {
    this.logger.log(`[mergeVideoAudioWithSubtitles] Starting merge for user ${params.userId}`);
    this.logger.log(`[mergeVideoAudioWithSubtitles] Downloading video from ${params.videoUrl}`);
    const videoBuffer = await this.getBufferFromUrl(params.videoUrl);
    this.logger.log(`[mergeVideoAudioWithSubtitles] Video downloaded (${videoBuffer.length} bytes)`);

    this.logger.log(`[mergeVideoAudioWithSubtitles] Downloading audio from ${params.audioUrl}`);
    const audioBuffer = await this.getBufferFromUrl(params.audioUrl);
    this.logger.log(`[mergeVideoAudioWithSubtitles] Audio downloaded (${audioBuffer.length} bytes)`);

    this.logger.log(`[mergeVideoAudioWithSubtitles] Merging video and audio...`);
    const mergedBuffer = await this.ffmpegService.combineVideoAndAudio(
      params.userId,
      videoBuffer,
      audioBuffer,
      `${Date.now()}_merged.mp4`
    );
    this.logger.log(`[mergeVideoAudioWithSubtitles] Merge complete (${mergedBuffer.length} bytes)`);

    let finalBuffer = mergedBuffer;
    if (params.script) {
      // Get audio duration
      const audioMeta = await this.ffmpegService.getAudioMetadata(audioBuffer);
      const audioDuration = audioMeta.format.duration;
      this.logger.log(`[mergeVideoAudioWithSubtitles] Audio duration: ${audioDuration}s`);
      // Generate SRT
      const srt = this.ffmpegService.generateSrtFromScript(params.script, audioDuration);
      // Overlay subtitles
      finalBuffer = await this.ffmpegService.addSubtitlesWithStyle(
        params.userId,
        mergedBuffer,
        srt,
        `${Date.now()}_subtitled.mp4`,
        params.subtitleOptions || {
          fontPath: 'Inter-Bold.ttf',
          fontSize: 48,
          fontColor: 'white',
          position: 'bottom',
        }
      );
      this.logger.log(`[mergeVideoAudioWithSubtitles] Subtitles overlay complete`);
    }

    this.logger.log(`[mergeVideoAudioWithSubtitles] Uploading final video to S3...`);
    const finalUrl = await this.s3Service.uploadMedia(params.userId, {
      buffer: finalBuffer,
      originalname: `${Date.now()}_final.mp4`,
      mimetype: "video/mp4",
    } as any);
    this.logger.log(`[mergeVideoAudioWithSubtitles] Final video uploaded to S3: ${finalUrl}`);
    return finalUrl;
  }
}
