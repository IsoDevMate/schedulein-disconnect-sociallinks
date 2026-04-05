import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { ConfigService } from "@nestjs/config";
import { OpenAIPromptDto } from "./dto/openaiprompt.dto";

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.logger.debug(
      `Initializing OpenAI with API key: ${apiKey ? "Present" : "Missing"}`,
    );

    if (!apiKey) {
      this.logger.error("OPENAI_API_KEY is not set in environment variables");
      throw new Error("OPENAI_API_KEY is not configured");
    }

    try {
      // Ensure the API key starts with 'sk-'
      if (!apiKey.startsWith("sk-")) {
        this.logger.error(
          "Invalid API key format. API key should start with 'sk-'",
        );
        throw new Error("Invalid API key format");
      }

      this.openai = new OpenAI({
        apiKey,
        maxRetries: 5,
        timeout: 60000,
      });

      this.logger.debug("OpenAI client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize OpenAI client:", error);
      throw error;
    }
  }

  private handleOpenAIError(error: any): Error {
    if (error.code === "insufficient_quota") {
      this.logger.error(
        "OpenAI API quota exceeded. Please check your billing details.",
        {
          errorCode: error.code,
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        }
      );
      return new Error(
        "OpenAI API quota exceeded. Please check your billing details or upgrade your plan. If you recently added credits, please wait a few minutes for the balance to update.",
      );
    }

    if (error.response?.status === 429) {
      this.logger.error("Rate limit exceeded. Please try again later.");
      return new Error("Rate limit exceeded. Please try again later.");
    }

    // Handle billing-related errors
    if (error.response?.status === 402) {
      this.logger.error("Payment required. Please check your billing details.");
      return new Error("Payment required. Please check your billing details or add credits to your account.");
    }

    this.logger.error("OpenAI API error:", {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    return new Error(`OpenAI API error: ${error.message}`);
  }


  async generatePostIdea(openAIPromptDto: OpenAIPromptDto): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional video script writer. Create engaging and natural-sounding scripts for video content.",
          },
          {
            role: "user",
            content: openAIPromptDto.prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  async generateHashtags(openAIPromptDto: OpenAIPromptDto): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a social media expert. Generate relevant and trending hashtags for the given content.",
          },
          {
            role: "user",
            content: openAIPromptDto.prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  async generateCaption(openAIPromptDto: OpenAIPromptDto): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a social media expert. Create engaging and concise captions for social media posts.",
          },
          {
            role: "user",
            content: openAIPromptDto.prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      return response.choices[0].message.content;
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  async checkAccountStatus(): Promise<{ status: string; message: string }> {
    try {
      // Try a simple API call to check account status
      const response = await this.openai.models.list();

      return {
        status: "active",
        message: "OpenAI account is active and accessible"
      };
    } catch (error) {
      this.logger.error("Account status check failed:", error);

      if (error.code === "insufficient_quota") {
        return {
          status: "quota_exceeded",
          message: "Account quota exceeded. Please check your billing details or add credits."
        };
      }

      if (error.response?.status === 401) {
        return {
          status: "unauthorized",
          message: "Invalid API key. Please check your OPENAI_API_KEY configuration."
        };
      }

      return {
        status: "error",
        message: `Account check failed: ${error.message}`
      };
    }
  }
}
