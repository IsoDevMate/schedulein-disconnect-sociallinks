import { IsNotEmpty } from 'class-validator';
import * as multer from 'multer';

export class S3UploadDto {
  @IsNotEmpty()
  file: multer.File;
}
