import { PartialType } from "@nestjs/swagger";
import { CreatePostDto } from "./create-tiktok.dto";

export class UpdateTiktokDto extends PartialType(CreatePostDto) {}
