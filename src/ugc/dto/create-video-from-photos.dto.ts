import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";

class TextOverlayDto {
  @IsString()
  text: string;

  @IsString()
  position: "top" | "center" | "bottom";

  @IsOptional()
  fontSize?: number;

  @IsOptional()
  fontColor?: string;
}

export class CreateVideoFromPhotosDto {
  @IsString()
  script: string;

  @IsString()
  voiceId: string;

  @IsOptional()
  @IsString()
  subtitleText?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TextOverlayDto)
  textOverlay?: TextOverlayDto;
}

export class CreateVideoFromPhotosRequestDto {
  @Transform(({ value }) => {
    console.log("Transform: Raw value received:", value);
    if (typeof value !== "string") {
      // If it's already an object (e.g., if express.json() already parsed it), return it
      console.log("Transform: Value is not a string, returning as is.");
      return value;
    }

    let cleanedValue = value.trim();
    console.log("Transform: Trimmed value:", cleanedValue);

    // If the string starts and ends with an UNESCAPED double quote, it means the entire JSON is wrapped as a string literal by the client.
    // Example: '"{ \"script\": \"value\" }"' <-- the inner quotes are escaped by the client
    // or ' "{\"script\":\"value\"}" '
    if (cleanedValue.startsWith('"') && cleanedValue.endsWith('"')) {
      try {
        // This will unescape the inner quotes and remove the outer ones
        const unescapedString = JSON.parse(cleanedValue);
        console.log(
          "Transform: Unescaped string after first JSON.parse:",
          unescapedString,
        );
        // Now, unescapedString should be something like '{"script":"value"}'
        // It might still have leading/trailing spaces if the client added them *after* the initial unescaping
        cleanedValue = unescapedString.trim();
      } catch (error) {
        console.error(
          "Transform: First JSON.parse failed (might be malformed string literal):",
          error,
        );
        // If the first parse fails, it means it wasn't a valid JSON string wrapped in quotes.
        // We will proceed with the original trimmedValue
      }
    }

    // Now, try to parse the (potentially) cleaned string as actual JSON
    try {
      const finalParsed = JSON.parse(cleanedValue);
      console.log("Transform: Final parsed JSON object:", finalParsed);
      return finalParsed;
    } catch (error) {
      console.error("Transform: Final JSON.parse failed:", error);
      // If all parsing attempts fail, return the original value or throw an error
      return value; // Or throw new BadRequestException('Invalid metadata format');
    }
  })
  @Type(() => CreateVideoFromPhotosDto)
  metadata: CreateVideoFromPhotosDto;
}
