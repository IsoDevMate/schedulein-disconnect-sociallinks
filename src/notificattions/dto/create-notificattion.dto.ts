import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateNotificattionDto {
  @IsEmail()
  @IsNotEmpty()
  userId: string;

  // @IsString()
  // @IsNotEmpty()
  // email: string;

  timestamp: Date;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
