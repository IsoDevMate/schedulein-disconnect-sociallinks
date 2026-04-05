import { Controller, Res, Get } from "@nestjs/common";
import { Response as ExpressResponse } from "express";
import { OpenAIService } from "./openai.service";
import { Post, Body } from "@nestjs/common";
import { OpenAIPromptDto } from "./dto/openaiprompt.dto";
import { ResponseUtil } from "../common/utils/response.util";

@Controller("openai")
export class OpenaiController {
  constructor(private readonly openaiService: OpenAIService) {}
  @Post("generate-post-idea")
  async generatePostIdea(
    @Body() openAIPromptDto: OpenAIPromptDto,
    @Res() res: ExpressResponse,
  ) {
    try {
      const response =
        await this.openaiService.generatePostIdea(openAIPromptDto);
      return ResponseUtil.success(res, 200, response);
    } catch (error) {
      return ResponseUtil.error(res, 500, error.message);
    }
  }

  @Get("account-status")
  async checkAccountStatus(@Res() res: ExpressResponse) {
    try {
      const status = await this.openaiService.checkAccountStatus();
      return ResponseUtil.success(res, 200, status);
    } catch (error) {
      return ResponseUtil.error(res, 500, error.message);
    }
  }
}
