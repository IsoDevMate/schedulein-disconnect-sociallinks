import { CreateInstagramPostDto } from './create-instagram-post.dto';
import { IsDateString } from 'class-validator';

export class ScheduleInstagramPostDto extends CreateInstagramPostDto {
  @IsDateString()
  scheduledTime: string;
}
