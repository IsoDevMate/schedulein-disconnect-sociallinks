import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectTiktokDto {
  @ApiProperty({
    description: 'The Tiktok access token',
    example: 'AWQ...DJFHF',
  })
  @IsString()
  @IsNotEmpty()
  TiktokAccessToken: string;
}
