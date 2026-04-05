import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
  //GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { UsersService } from "../users/users.service";
import * as multer from "multer";
import axios from "axios";
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: this.configService.get<string>("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get<string>(
          "AWS_SECRET_ACCESS_KEY",
        ),
      },
      region: this.configService.get<string>("AWS_REGION"),
    });
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9.-]/g, "_").toLowerCase();
  }

  private generateKey(
    userId: string,
    folder: string,
    filename: string,
  ): string {
    const sanitizedFilename = this.sanitizeFilename(filename);
    return `${userId}/${folder}/${sanitizedFilename}`;
  }

  async uploadMedia(userId: string, file: multer.File): Promise<string> {
    try {
      if (!file || !file.buffer) {
        throw new Error("File or file buffer is missing");
      }

      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const key = this.generateKey(userId, "media", file.originalname);

      this.logger.log(`Uploading media to S3 for user: ${userId}`);
      const Bucket =
        this.configService.get<string>("AWS_S3_BUCKET_NAME") || "groreels";

      // Using Upload from @aws-sdk/lib-storage for better handling of large files
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        } as PutObjectCommandInput,
      });

      const data = await upload.done();
      this.logger.log(
        `Media uploaded to S3 successfully: ${JSON.stringify(data)}`,
      );

      // Construct the URL manually since v3 doesn't return Location in the same way
      const location = `https://${Bucket}.s3.${this.configService.get<string>("AWS_REGION")}.amazonaws.com/${key}`;
      return location;
    } catch (error) {
      this.logger.error(
        `Error uploading media to S3 for user: ${userId}`,
        error.message,
      );
      throw new Error(`Failed to upload media to S3: ${error.message}`);
    }
  }

  async uploadMediaToS3(mediaUrl: string, key: string): Promise<void> {
    try {
      const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
      });
      const bucketName =
        this.configService.get<string>("AWS_S3_BUCKET_NAME") || "groreels";

      const uploadCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: response.data,
        ContentType: response.headers["content-type"],
      });

      await this.s3Client.send(uploadCommand);
      this.logger.log(`Media uploaded to S3 successfully with key: ${key}`);
    } catch (error) {
      this.logger.error(
        `Error uploading media to S3 with key: ${key}`,
        error.message,
      );
      throw new Error(`Failed to upload media to S3: ${error.message}`);
    }
  }

  async storeMediaLink(userId: string, mediaLink: string): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      const filename = mediaLink.split("/").pop();
      const key = this.generateKey(userId, "links", filename);

      this.logger.log(`Storing media link to S3 for user: ${userId}`);
      const Bucket =
        this.configService.get<string>("AWS_S3_BUCKET_NAME") || "groreels";

      const putObjectCommand = new PutObjectCommand({
        Bucket: Bucket,
        Key: key,
        Body: mediaLink,
      });

      await this.s3Client.send(putObjectCommand);
      this.logger.log(
        `Media link stored to S3 successfully for user: ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error storing media link to S3 for user: ${userId}`,
        error.message,
      );
      throw new Error(`Failed to store media link to S3: ${error.message}`);
    }
  }

  async downloadMedia(
    userId: string,
    folder: string,
    filename: string,
  ): Promise<Buffer> {
    try {
      const bucketName =
        this.configService.get<string>("AWS_S3_BUCKET_NAME") || "groreels";

      const decodedFilename = decodeURIComponent(filename);
      const cleanFilename = decodedFilename.split("?")[0];
      let key: string;
      if (cleanFilename.includes("https://")) {
        // Extract filename from the full URL
        const urlParts = cleanFilename.split("/");
        const actualFilename = urlParts[urlParts.length - 1];
        key = `${userId}/${folder}/${actualFilename}`;
      } else {
        // Direct filename
        key = `${userId}/${folder}/${cleanFilename}`;
      }

      // Remove double slashes
      key = key.replace(/\/+/g, "/");

      this.logger.log(`Downloading media from S3 with key: ${key}`);

      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const data = await this.s3Client.send(getObjectCommand);
      if (!data.Body) {
        throw new Error("No data received from S3");
      }

      // Convert the stream to buffer
      const chunks: Buffer[] = [];
      const stream = data.Body as any;

      return new Promise((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      this.logger.error(`Error downloading media from S3: ${error.message}`);
      if (error.name === "NoSuchKey") {
        throw new Error(
          `File not found in S3: The specified key does not exist`,
        );
      }
      throw new Error(`S3 error: ${error.message}`);
    }
  }
}
