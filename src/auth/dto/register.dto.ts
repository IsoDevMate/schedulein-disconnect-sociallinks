import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { UserRole } from '../../users/enum/user-role.enum';
import { ApiProperty } from '@nestjs/swagger';
export class RegisterDto {
  @ApiProperty({
    description: 'The email address of the user',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'The user password', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'The user role',
    example: UserRole.USER,
  })
  @IsString()
  @IsNotEmpty()
  role: UserRole;
}
