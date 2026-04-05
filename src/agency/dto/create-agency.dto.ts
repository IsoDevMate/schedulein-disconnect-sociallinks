import { IsNotEmpty, IsString } from 'class-validator';
export class CreateAgencyDto {

    linkedInPageId: string;
    
    @IsNotEmpty()
    @IsString()
    name: string;
  
    @IsNotEmpty()
    @IsString()
    linkedInPageName: string;
}

