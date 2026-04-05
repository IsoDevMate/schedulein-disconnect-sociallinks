import { Module } from "@nestjs/common";
import { OpenAIService } from "./openai.service";
import { OpenaiController } from "./openai.controller";
@Module({
  providers: [OpenAIService],
  exports: [OpenAIService],
  controllers: [OpenaiController],
})
export class OpenAIModule {}
