import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import * as FormData from "form-data";

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.elevenlabs.io/v1";

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("ELEVEN_LABS_API_KEY");
  }

  async cloneVoice(audioFile: Buffer, name: string): Promise<string> {
    try {
      const formData = new (require('form-data'))();
      formData.append("name", name);
      formData.append("files", audioFile, {
        filename: "voice_sample.wav",
        contentType: "audio/wav",
      });

      const response = await axios.post(
        "https://api.elevenlabs.io/v1/voices/add",
        formData,
        {
          headers: {
            "xi-api-key": this.apiKey,
            ...formData.getHeaders(),
          },
        },
      );

      return response.data.voice_id;
    } catch (error) {
      this.logger.error(
        "Error cloning voice:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to clone voice");
    }
  }

  async generateSpeech(text: string, voiceId: string): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );

      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(
        "Error generating speech:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to generate speech");
    }
  }

  async getAvailableVoices(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      return response.data.voices;
    } catch (error) {
      this.logger.error(
        "Error fetching voices:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to fetch available voices");
    }
  }
}
