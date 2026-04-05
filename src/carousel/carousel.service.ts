import { Injectable, Logger } from "@nestjs/common";
import { LinkedInService } from "../linkedin/linkedin.service";
import { Post } from "../posts/entities/post.entity";
import { PostType } from "../posts/entities/post.entity";
import { S3Service } from "../s3/s3.service";
// import { TimeUtils } from 'src/common/utils/time.utils';

@Injectable()
export class CarouselService {
  private readonly logger = new Logger(CarouselService.name);
  constructor(
    private readonly linkedInService: LinkedInService,
    private readonly s3Service: S3Service,
  ) {}

  async publishCarouselPost(post: Post, accessToken: string): Promise<void> {
    const isOrganization = post.postType === PostType.ORGANIZATION;
    const urn = isOrganization ? post.organizationUrn : post.personUrn;

    try {
      const { uploadUrls, assets } =
        await this.linkedInService.registerCarouselUpload(
          urn,
          accessToken,
          post.mediaUrls.length,
          isOrganization,
        );
      console.log(`Downloading media for post ${post._id}`);
      // Upload each image
      for (let i = 0; i < post.mediaUrls.length; i++) {
        const mediaBuffer = await this.s3Service.downloadMedia(
          post.userId,
          "media",
          post.mediaUrls[i].split("/").pop(),
        );

        await this.linkedInService.uploadMedia(
          uploadUrls[i],
          mediaBuffer,
          accessToken,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (isOrganization) {
        await this.linkedInService.createCompanyCarouselShare(
          urn,
          assets,
          post.content,
          accessToken,
        );
      } else {
        await this.linkedInService.createCarouselShare(
          urn,
          assets,
          post.content,
          accessToken,
        );
      }

      post.status = "published";
      post.publishedAt = new Date();
      await post.save();
    } catch (error) {
      post.status = "failed";
      post.lastError = error.message;
      await post.save();
      throw error;
    }
  }
}
