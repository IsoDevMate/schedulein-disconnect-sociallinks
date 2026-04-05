import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Post } from "./entities/post.entity";
import { LinkedInService } from "../linkedin/linkedin.service";
import { NotificationService } from "../notificattions/notificattions.service";
import { OpenAIService } from "../openai/openai.service";
import { S3Service } from "../s3/s3.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { UsersService } from "../users/users.service";
import * as multer from "multer";
//import { SubscriptionService } from "../subscriptions/subscriptions.service";
import { PostMediaType, PostType } from "./entities/post.entity";
import { CarouselService } from "../carousel/carousel.service";
// import { TimeUtils } from 'src/common/utils/time.utils';
@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly linkedInService: LinkedInService,
    private readonly notificationService: NotificationService,
    private readonly openAIService: OpenAIService,
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
    private readonly CarouselService: CarouselService,
  ) {}

  async findUserById(userId: string) {
    return await this.usersService.findById(userId);
  }

  async schedulePost(
    createPostDto: CreatePostDto,
    userId: string,
    scheduledDateTime: Date,
    mediaUrls: string[],
    postType: PostType,
  ): Promise<Post> {
    console.log(
      "here aree the input  parameters",
      createPostDto,
      userId,
      scheduledDateTime,
      mediaUrls,
      postType,
    );
    console.log(`Scheduling post for user ${userId} with type ${postType}`);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException("User not found");
    }

    if (
      postType === PostType.ORGANIZATION &&
      createPostDto.postMedia === PostMediaType.CAROUSEL
    ) {
      throw new BadRequestException(
        "Carousel posts for company pages require sponsorship. Please use single image posts or create sponsored content instead.",
      );
    }

    if (postType === PostType.ORGANIZATION && !user.organizationUrn) {
      throw new BadRequestException(
        "Organization URN is required for organization posts",
      );
    }

    if (postType === PostType.PERSONAL && !user.linkedInId) {
      throw new BadRequestException(
        "LinkedIn ID is required for personal posts",
      );
    }

    if (createPostDto.postMedia !== PostMediaType.NONE && !mediaUrls?.length) {
      throw new BadRequestException("Media URLs are required for media posts");
    }

    if (createPostDto.postMedia === PostMediaType.CAROUSEL) {
      if (!mediaUrls || mediaUrls.length < 2 || mediaUrls.length > 9) {
        throw new BadRequestException(
          "Carousel posts require between 2 and 9 images",
        );
      }
    }

    const post = new this.postModel({
      userId,
      content: createPostDto.content,
      scheduledTime: scheduledDateTime,
      mediaUrls:
        createPostDto.postMedia !== PostMediaType.NONE ? mediaUrls : undefined,
      mediaUrl: mediaUrls?.length > 0 ? mediaUrls[0] : undefined,
      postType,
      status: "pending",
      isApproved: postType !== PostType.ORGANIZATION,
      title: createPostDto.title,
      description: createPostDto.description,
      postMedia: createPostDto.postMedia,
      personUrn:
        postType === PostType.PERSONAL
          ? `urn:li:person:${user.linkedInId}`
          : undefined,
      organizationUrn:
        postType === PostType.ORGANIZATION ? user.organizationUrn : undefined,
    });

    return post.save();
  }

  private determineMediaType(mediaUrl: string): PostMediaType {
    if (!mediaUrl) {
      return PostMediaType.NONE;
    }
    if (
      mediaUrl.endsWith(".mp4") ||
      mediaUrl.endsWith(".mov") ||
      mediaUrl.endsWith(".avi")
    ) {
      return PostMediaType.VIDEO;
    } else if (
      mediaUrl.endsWith(".jpg") ||
      mediaUrl.endsWith(".jpeg") ||
      mediaUrl.endsWith(".png") ||
      mediaUrl.endsWith(".gif")
    ) {
      return PostMediaType.IMAGE;
    } else {
      return PostMediaType.ARTICLE;
    }
  }

  async publishPost(post: Post): Promise<void> {
    const user = await this.findUserById(post.userId);
    const accessToken = user.linkedInAccessToken;
    const personUrn = post.personUrn;
    const organizationUrn = post.organizationUrn;
    const mediaUrl = post.mediaUrl;

    console.log(`organisationurn ${organizationUrn}`);
    console.log(`personUrn ${personUrn}`);

    if (post.postMedia === PostMediaType.CAROUSEL) {
      await this.CarouselService.publishCarouselPost(post, accessToken);
      return;
    }

    if (post.postType === PostType.ORGANIZATION && !post.organizationUrn) {
      post.status = "failed";
      post.lastError = "Organization URN is missing";
      await post.save();
      throw new Error("Organization URN is required for organization posts");
    }

    if (post.postType === PostType.PERSONAL && !post.personUrn) {
      post.status = "failed";
      post.lastError = "Person URN is missing";
      await post.save();
      throw new Error("Person URN is required for personal posts");
    }

    try {
      if (mediaUrl && post.postMedia !== PostMediaType.ARTICLE) {
        const isOrganization = post.postType === PostType.ORGANIZATION;
        const isVideo = post.postMedia === PostMediaType.VIDEO;
        const { uploadUrl, asset } =
          await this.linkedInService.registerMediaUpload(
            isOrganization ? organizationUrn : personUrn,
            accessToken,
            isOrganization,
            isVideo,
          );
        console.log(`Downloading media for post ${post._id}`);
        const mediaBuffer = await this.s3Service.downloadMedia(
          post.userId,
          "media",
          post.mediaUrl.split("/").pop(),
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const uploadResult = await this.linkedInService.uploadMedia(
          uploadUrl,
          mediaBuffer,
          accessToken,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (!uploadResult) {
          throw new Error("Media upload failed");
        }

        if (isOrganization) {
          if (post.postMedia === PostMediaType.VIDEO) {
            await this.linkedInService.createCompanyVideoShare(
              organizationUrn,
              asset,
              post.content,
              accessToken,
            );
          } else if (post.postMedia === PostMediaType.IMAGE) {
            await this.linkedInService.createCompanyImageShare(
              organizationUrn,
              asset,
              post.content,
              accessToken,
            );
          }
        } else {
          if (post.postMedia === PostMediaType.VIDEO) {
            await this.linkedInService.createVideoShare(
              personUrn,
              asset,
              post.content,
              accessToken,
            );
          } else if (post.postMedia === PostMediaType.IMAGE) {
            await this.linkedInService.createImageShare(
              personUrn,
              asset,
              post.content,
              accessToken,
            );
          }
        }
      } else {
        if (post.postType === PostType.ORGANIZATION) {
          if (post.postMedia === PostMediaType.ARTICLE) {
            await this.linkedInService.createCompanyArticleShare(
              organizationUrn,
              post.content,
              post.mediaUrl,
              accessToken,
            );
          } else {
            await this.linkedInService.publishTextTToCompanyPage(
              organizationUrn,
              post.content,
              accessToken,
            );
          }
        } else {
          if (post.postMedia === PostMediaType.ARTICLE) {
            await this.linkedInService.createarticleShare(
              personUrn,
              post.content,
              post.mediaUrl,
              accessToken,
            );
          } else {
            await this.linkedInService.publishTextPost(
              personUrn,
              post.content,
              accessToken,
            );
          }
        }
      }

      post.status = "published";
      post.timestamp = new Date();
      await post.save();
    } catch (error) {
      console.error(
        "Error publishing post:",
        error.response?.data || error.message,
      );
      throw new Error(`Failed to publish post: ${error.message}`);
    }
  }

  async downloadMedia(userId: string, mediaLink: string): Promise<Buffer> {
    const filename = mediaLink.split("/").pop();
    return this.s3Service.downloadMedia(userId, "media", filename);
  }

  async findPostById(postId: string): Promise<Post> {
    return this.postModel.findById(postId);
  }

  async generatePostIdea(prompt: string): Promise<string> {
    const openAIPromptDto = { prompt };
    return this.openAIService.generatePostIdea(openAIPromptDto);
  }

  async uploadMedia(userId: string, file: multer.File): Promise<string> {
    return this.s3Service.uploadMedia(userId, file);
  }

  async storeMediaLink(userId: string, mediaLink: string): Promise<void> {
    return this.s3Service.storeMediaLink(userId, mediaLink);
  }

  async updatePost(
    postId: string,
    userId: string,
    createPostDto: CreatePostDto,
  ): Promise<Post> {
    const post = await this.findPostById(postId);
    if (post.userId.toString() !== userId) {
      throw new BadRequestException("Unauthorized");
    }
    // const subscription = await this.subscriptionService.getSubscription(userId);
    // if (subscription.items.data[0].price.product === "price_free_plan") {
    //   throw new BadRequestException(
    //     "Free plan users cannot edit scheduled posts",
    //   );
    // }

    post.content = createPostDto.content;
    post.mediaUrl = createPostDto.mediaUrl;
    post.scheduledTime = new Date(createPostDto.scheduledTime);
    post.postType = createPostDto.postType;
    post.title = createPostDto.title;
    post.description = createPostDto.description;
    post.postMedia = this.determineMediaType(createPostDto.mediaUrl);
    post.personUrn =
      createPostDto.postType === PostType.PERSONAL
        ? createPostDto.personUrn
        : undefined;
    post.organizationUrn =
      createPostDto.postType === PostType.ORGANIZATION
        ? createPostDto.organizationUrn
        : undefined;
    return post.save();
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.findPostById(postId);
    if (post.userId.toString() !== userId) {
      throw new Error("Unauthorized");
    }
    await this.postModel.findByIdAndDelete(postId);
  }

  async getPosts(userId: string): Promise<Post[]> {
    return this.postModel.find({ userId }).sort({ scheduledTime: -1 });
  }

  async getPost(postId: string, userId: string): Promise<Post> {
    const post = await this.findPostById(postId);
    if (post.userId.toString() !== userId) {
      throw new Error("Unauthorized");
    }
    return post;
  }

  async getPostsByStatus(status: string): Promise<Post[]> {
    return this.postModel.find({ status }).sort({ scheduledTime: -1 });
  }
}
