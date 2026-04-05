import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { FFmpegService } from '../ugc/services/ffmpeg.service';
import { S3Service } from '../s3/s3.service';
import axios from 'axios';

@Processor('asynched-jobs')
@Injectable()
export class AsynchedConsumerService extends WorkerHost {
  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly s3Service: S3Service,
  ) { super(); }

  async process(job: Job<any, any, string>): Promise<any> {
    const { inputVideoUrl, inputAudioUrl, outputKey, ffmpegOptions, userId, script, subtitleOptions } = job.data;

    if (!userId) {
      throw new Error('User ID is required for this job');
    }

    // 1. Download video and audio as buffers
    const videoBuffer = await downloadBuffer(inputVideoUrl);
    const audioBuffer = await downloadBuffer(inputAudioUrl);

    // 2. Use FFmpegService to combine video and audio
    let mergedBuffer = await this.ffmpegService.combineVideoAndAudio(
      userId,
      videoBuffer,
      audioBuffer,
      outputKey
    );

    // 3. If script/subtitles are provided, overlay subtitles
    if (script) {
      // Get audio duration
      const audioMeta = await this.ffmpegService.getAudioMetadata(audioBuffer);
      const audioDuration = audioMeta.format.duration;
      // Generate SRT (fallback)
      const srt = this.ffmpegService.generateSrtFromScript(script, audioDuration);
      // Overlay subtitles with ASS/SSA for best styling
      mergedBuffer = await this.ffmpegService.addSubtitlesWithStyle(
        userId,
        mergedBuffer,
        srt,
        `subtitled-${outputKey}`,
        {
          useAss: true,
          script,
          audioDuration,
          fontPath: 'DejaVu Sans',
        }
      );
    }

    // 4. Upload result to S3 using S3Service
    const mergedUrl = await this.s3Service.uploadMedia(userId, {
      buffer: mergedBuffer,
      originalname: outputKey,
      mimetype: 'video/mp4',
    } as any);

    // 5. Return the S3 URL of the result
    return { resultUrl: mergedUrl };
  }
}

// Helper to download a file from a URL as a buffer
async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}
