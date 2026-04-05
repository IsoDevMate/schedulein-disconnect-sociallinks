import { IsNotEmpty, IsString } from 'class-validator';

export class OpenAIPromptDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;
}
