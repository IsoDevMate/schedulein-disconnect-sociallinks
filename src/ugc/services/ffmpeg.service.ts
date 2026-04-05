import { Injectable, Logger } from "@nestjs/common";
import * as ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { ConfigService } from "@nestjs/config";
import { S3Service } from "../../s3/s3.service";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

@Injectable()
export class FFmpegService {
  private readonly logger = new Logger(FFmpegService.name);
  private readonly tempDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    // Set FFmpeg path
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    // Create temp directory for video processing
    this.tempDir = path.join(os.tmpdir(), "ugc-videos");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private getTempFilePath(filename: string): string {
    return path.join(this.tempDir, filename);
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      this.logger.error(`Error cleaning up temp file ${filePath}:`, error);
    }
  }

  async combineVideoAndAudio(
    userId: string,
    videoBuffer: Buffer,
    audioBuffer: Buffer,
    outputFilename: string,
  ): Promise<Buffer> {
    const videoPath = this.getTempFilePath("input_video.mp4");
    const audioPath = this.getTempFilePath("input_audio.wav");
    const outputPath = this.getTempFilePath(outputFilename);

    try {
      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      // Write buffers to temporary files
      await fs.promises.writeFile(videoPath, videoBuffer);
      await fs.promises.writeFile(audioPath, audioBuffer);

      // Combine video and audio, trim audio to video duration
      this.logger.log(`[FFmpegService] Starting FFmpeg merge for user ${userId}`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .input(audioPath)
          .outputOptions([
            "-c:v copy", // Copy video stream without re-encoding (fast)
            "-c:a aac", // Convert audio to AAC (fast)
            "-strict experimental",
            "-map 0:v:0", // Use video from first input
            "-map 1:a:0", // Use audio from second input
            "-shortest" // End output when shortest input ends (sync audio to video)
          ])
          .output(outputPath)
          .on("end", () => {
            this.logger.log(`[FFmpegService] FFmpeg merge complete for user ${userId}`);
            resolve();
          })
          .on("error", (err) => {
            this.logger.error(`[FFmpegService] FFmpeg error for user ${userId}:`, err);
            reject(err);
          })
          .run();
      });

      // Read the output file
      const outputBuffer = await fs.promises.readFile(outputPath);
      this.logger.log(`Combined video and audio for user ${userId} and saved to ${outputPath}`);
      return outputBuffer;
    } finally {
      // Cleanup temporary files
      await Promise.all([
        this.cleanupTempFile(videoPath),
        this.cleanupTempFile(audioPath),
        this.cleanupTempFile(outputPath),
      ]);
    }
  }

  async addSubtitles(
    userId: string,
    videoBuffer: Buffer,
    subtitles: string,
    outputFilename: string,
  ): Promise<string> {
    const videoPath = this.getTempFilePath("input_video.mp4");
    const subtitlesPath = this.getTempFilePath("subtitles.srt");
    const outputPath = this.getTempFilePath(outputFilename);

    try {
      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      // Write buffers to temporary files
      await fs.promises.writeFile(videoPath, videoBuffer);
      await fs.promises.writeFile(subtitlesPath, subtitles);

      // Add subtitles to video
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .outputOptions([
            "-vf subtitles=" + subtitlesPath.replace(/\\/g, "\\\\"),
            "-c:a copy", // Copy audio without re-encoding
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Read the output file
      const outputBuffer = await fs.promises.readFile(outputPath);

      // Upload to S3
      const s3Url = await this.s3Service.uploadMedia(userId, {
        buffer: outputBuffer,
        originalname: outputFilename,
        mimetype: "video/mp4",
      } as any);

      return s3Url;
    } finally {
      // Cleanup temporary files
      await Promise.all([
        this.cleanupTempFile(videoPath),
        this.cleanupTempFile(subtitlesPath),
        this.cleanupTempFile(outputPath),
      ]);
    }
  }

  async trimVideo(
    userId: string,
    videoBuffer: Buffer,
    startTime: number,
    duration: number,
    outputFilename: string,
  ): Promise<Buffer> {
    const videoPath = this.getTempFilePath("input_video.mp4");
    const outputPath = this.getTempFilePath(outputFilename);

    try {
      // Ensure output directory exists
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      // Write buffer to temporary file
      await fs.promises.writeFile(videoPath, videoBuffer);

      // Trim video
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .setStartTime(startTime)
          .setDuration(duration)
          .outputOptions([
            "-c:v copy", // Copy video stream without re-encoding
            "-c:a copy", // Copy audio stream without re-encoding
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Read the output file
      const outputBuffer = await fs.promises.readFile(outputPath);
      return outputBuffer;
    } finally {
      // Cleanup temporary files
      await Promise.all([
        this.cleanupTempFile(videoPath),
        this.cleanupTempFile(outputPath),
      ]);
    }
  }

  async addTextOverlay(
    userId: string,
    videoBuffer: Buffer,
    text: string,
    position: "top" | "center" | "bottom",
    fontSize: number = 50,
    fontColor: string = "white",
    outputFilename: string,
  ): Promise<string> {
    const videoPath = this.getTempFilePath("input_video_text.mp4");
    const outputPath = this.getTempFilePath(outputFilename);

    try {
      await fs.promises.writeFile(videoPath, videoBuffer);

      let yPosition: string;
      switch (position) {
        case "top":
          yPosition = "h/10";
          break;
        case "center":
          yPosition = "(h-text_h)/2";
          break;
        case "bottom":
          yPosition = "h*0.9 - text_h";
          break;
        default:
          yPosition = "(h-text_h)/2";
      }

      // Escape special characters in text for FFmpeg filter
      const escapedText = text.replace(/[:'"\\,]/g, "\\$&");

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(videoPath)
          .outputOptions([
            `-vf drawtext=text='${escapedText}':x=(w-text_w)/2:y=${yPosition}:fontsize=${fontSize}:fontcolor=${fontColor}`,
            "-c:a copy",
          ])
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => {
            this.logger.error("Error adding text overlay:", err);
            reject(err);
          })
          .run();
      });

      const outputBuffer = await fs.promises.readFile(outputPath);

      // Upload to S3
      const s3Url = await this.s3Service.uploadMedia(userId, {
        buffer: outputBuffer,
        originalname: outputFilename,
        mimetype: "video/mp4",
      } as any);

      return s3Url;
    } finally {
      await this.cleanupTempFile(videoPath);
      await this.cleanupTempFile(outputPath);
    }
  }

  async getAudioMetadata(audioBuffer: Buffer): Promise<any> {
    // Use a unique filename to avoid conflicts
    const audioPath = this.getTempFilePath(`temp_audio_${Date.now()}.mp3`);

    try {
      this.logger.debug(
        `Attempting to write audio buffer of size: ${audioBuffer.length} bytes to ${audioPath}`,
      );

      // Ensure the temp directory exists
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }

      await fs.promises.writeFile(audioPath, audioBuffer);
      this.logger.debug(`Successfully wrote audio buffer to ${audioPath}`);

      // Verify the file exists and has content
      const stats = await fs.promises.stat(audioPath);
      this.logger.debug(`Audio file size on disk: ${stats.size} bytes`);

      if (stats.size === 0) {
        throw new Error("Audio file is empty after writing");
      }

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, async (err, metadata) => {
          await this.cleanupTempFile(audioPath);
          if (err) {
            this.logger.error(`FFprobe error for file ${audioPath}:`, err);
            reject(err);
            return;
          }
          this.logger.debug("Audio metadata retrieved successfully");
          resolve(metadata);
        });
      });
    } catch (error) {
      this.logger.error(`Error in getAudioMetadata:`, error);
      throw error;
    }
  }

  async getVideoMetadata(videoBuffer: Buffer): Promise<any> {
    const videoPath = this.getTempFilePath("temp_video.mp4");

    try {
      // Write buffer to temporary file
      await fs.promises.writeFile(videoPath, videoBuffer);

      // Get video metadata
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(metadata);
        });
      });
    } finally {
      // Cleanup temporary file
      await this.cleanupTempFile(videoPath);
    }
  }

  // Generate SRT subtitles from script and audio duration
  generateSrtFromScript(script: string, audioDuration: number): string {
    // Split script into sentences (simple split, can be improved)
    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    const perSentence = audioDuration / sentences.length;
    function secondsToSrtTime(seconds: number): string {
      const ms = Math.floor((seconds % 1) * 1000);
      const totalSeconds = Math.floor(seconds);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    }
    let srt = '';
    for (let i = 0; i < sentences.length; i++) {
      const start = i * perSentence;
      const end = (i + 1) * perSentence;
      srt += `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}\n${sentences[i].trim()}\n\n`;
    }
    return srt;
  }

  // Utility to generate a simple ASS/SSA subtitle file with colored words (ALL CAPS = red, others = white)
  generateAssFromScript(script: string, audioDuration: number): string {
    // Split script into sentences (simple split, can be improved)
    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
    const perSentence = audioDuration / sentences.length;
    // ASS header
    let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,60,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,30,30,30,1\nStyle: Red,DejaVu Sans,60,&H000000FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,30,30,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    for (let i = 0; i < sentences.length; i++) {
      const start = i * perSentence;
      const end = (i + 1) * perSentence;
      // Color ALL CAPS words red, others white
      let line = sentences[i].replace(/\b([A-Z][A-Z0-9']*)\b/g, '{\\rRed}$1{\\r}');
      // ASS time format: H:MM:SS.cs
      function secondsToAsstime(seconds: number): string {
        const cs = Math.floor((seconds % 1) * 100);
        const totalSeconds = Math.floor(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
      }
      ass += `Dialogue: 0,${secondsToAsstime(start)},${secondsToAsstime(end)},Default,,0,0,0,,${line.trim()}\\N`;
      ass += '\n';
    }
    return ass;
  }

  async addSubtitlesWithStyle(
    userId: string,
    videoBuffer: Buffer,
    srt: string,
    outputFilename: string,
    options: {
      fontPath: string;
      fontSize?: number;
      fontColor?: string;
      position?: 'bottom' | 'center' | 'top';
      effect?: 'fade' | 'slide';
      useAss?: boolean; // If true, generate and use ASS/SSA
      script?: string;  // Original script for ASS
      audioDuration?: number; // For ASS timing
    }
  ): Promise<Buffer> {
    const videoPath = this.getTempFilePath(`input_video_${Date.now()}.mp4`);
    const srtPath = this.getTempFilePath(`subtitles_${Date.now()}.srt`);
    const assPath = this.getTempFilePath(`subtitles_${Date.now()}.ass`);
    const outputPath = this.getTempFilePath(outputFilename);
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    try {
      await fs.promises.writeFile(videoPath, videoBuffer);
      let useAss = options.useAss && options.script && options.audioDuration;
      if (useAss) {
        // Generate ASS/SSA file
        const assContent = this.generateAssFromScript(options.script!, options.audioDuration!);
        await fs.promises.writeFile(assPath, assContent);
        this.logger.debug(`[FFmpegService] Using ASS/SSA subtitles at: ${assPath}`);
      } else {
        await fs.promises.writeFile(srtPath, srt);
        this.logger.debug(`[FFmpegService] Using SRT subtitles at: ${srtPath}`);
      }
      // Log SRT/ASS file content and paths
      if (useAss) {
        this.logger.debug(`[FFmpegService] ASS content:\n${await fs.promises.readFile(assPath, 'utf-8')}`);
      } else {
        this.logger.debug(`[FFmpegService] SRT content:\n${srt}`);
      }
      this.logger.debug(`[FFmpegService] Video file path: ${videoPath}`);
      // Validate subtitle file is not empty
      const subStats = await fs.promises.stat(useAss ? assPath : srtPath);
      if (subStats.size === 0) {
        throw new Error('Subtitle file is empty');
      }
      // Validate video file exists
      const videoStats = await fs.promises.stat(videoPath);
      if (videoStats.size === 0) {
        throw new Error('Video file is empty');
      }
      if (useAss) {
        // Use ASS/SSA subtitles (no force_style needed)
        this.logger.log(`[FFmpegService] Adding ASS/SSA subtitles: ${assPath}`);
        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(videoPath)
            .outputOptions([
              '-c:v libx264',
              '-c:a copy',
              '-preset veryfast',
              '-crf 18',
            ])
            .videoFilter(`subtitles='${assPath.replace(/'/g, "'\\''")}'`)
            .output(outputPath)
            .on('end', () => {
              this.logger.log(`[FFmpegService] ASS/SSA subtitle overlay complete for user ${userId}`);
              resolve();
            })
            .on('error', (err) => {
              this.logger.error(`[FFmpegService] FFmpeg ASS/SSA subtitle error for user ${userId}:`, err);
              reject(err);
            })
            .run();
        });
      } else {
        // Build FFmpeg filter for styling (force_style)
        let vf = `subtitles='${srtPath.replace(/'/g, "'\\''")}'`;
        let forceStyle = [];
        forceStyle.push('FontName=DejaVu Sans');
        forceStyle.push('FontSize=60');
        forceStyle.push('Bold=1');
        forceStyle.push('PrimaryColour=&H00FFFFFF&');
        forceStyle.push('Alignment=5');
        forceStyle.push('Outline=2');
        forceStyle.push('OutlineColour=&H00000000&');
        this.logger.debug(`[FFmpegService] Using force_style: ${forceStyle.join(',')}`);
        if (forceStyle.length > 0) {
          vf = `subtitles='${srtPath.replace(/'/g, "'\\''")}',force_style='${forceStyle.join(',')}'`;
        }
        this.logger.log(`[FFmpegService] Adding subtitles with style: ${vf}`);
        try {
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(videoPath)
              .outputOptions([
                '-c:v libx264',
                '-c:a copy',
                '-preset veryfast',
                '-crf 18',
              ])
              .videoFilter(vf)
              .output(outputPath)
              .on('end', () => {
                this.logger.log(`[FFmpegService] Subtitle overlay complete for user ${userId}`);
                resolve();
              })
              .on('error', (err) => {
                this.logger.error(`[FFmpegService] FFmpeg subtitle error for user ${userId}:`, err);
                reject(err);
              })
              .run();
          });
        } catch (styledErr) {
          this.logger.error(`[FFmpegService] Styled subtitle filter failed, trying minimal filter. Error:`, styledErr);
          // Try minimal filter (no force_style)
          let minimalVf = `subtitles='${srtPath.replace(/'/g, "'\\''")}'`;
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(videoPath)
              .outputOptions([
                '-c:v libx264',
                '-c:a copy',
                '-preset veryfast',
                '-crf 18',
              ])
              .videoFilter(minimalVf)
              .output(outputPath)
              .on('end', () => {
                this.logger.log(`[FFmpegService] Minimal subtitle overlay complete for user ${userId}`);
                resolve();
              })
              .on('error', (err) => {
                this.logger.error(`[FFmpegService] Minimal FFmpeg subtitle error for user ${userId}:`, err);
                reject(err);
              })
              .run();
          });
        }
      }
      const outputBuffer = await fs.promises.readFile(outputPath);
      return outputBuffer;
    } finally {
      await this.cleanupTempFile(videoPath);
      await this.cleanupTempFile(srtPath);
      await this.cleanupTempFile(assPath);
      await this.cleanupTempFile(outputPath);
    }
  }
}
