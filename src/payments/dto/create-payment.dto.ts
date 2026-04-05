import { IsNotEmpty, IsNumber, IsEmail } from "class-validator";

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
