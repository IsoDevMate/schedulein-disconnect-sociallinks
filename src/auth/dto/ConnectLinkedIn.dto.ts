import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectLinkedInDto {
  @ApiProperty({
    description: 'The LinkedIn access token',
    example: 'AWQ...DJFHF',
  })
  @IsString()
  @IsNotEmpty()
  linkedInAccessToken: string;
}
