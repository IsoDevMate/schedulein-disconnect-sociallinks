import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
export class ResetPasswordDto {
  @ApiProperty({ description: "The user email", example: "user@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: "The token sent to the user email",
    example: "AWQ...DJFHF",
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: "The new password for the user",
    example: "password123",
  })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}
