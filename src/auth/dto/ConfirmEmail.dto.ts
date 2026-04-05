import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class ConfirmEmailDto {
  @ApiProperty({ description: 'The confirmation token', example: '123456' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
