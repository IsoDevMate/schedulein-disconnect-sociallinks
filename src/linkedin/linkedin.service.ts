import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { UsersService } from '../users/users.service';
import * as multer from 'multer';
import { ArticleshareService } from 'src/articleshare/articleshare.service';

@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);
  private readonly VIDEO_PROCESSING_TIMEOUT = 60000;
  private readonly VIDEO_PROCESSING_INTERVAL = 5000;
  private readonly MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
  private readonly MAX_VIDEO_DURATION = 600000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;
  constructor(
    private readonly usersService: UsersService,
    private readonly articleShareService: ArticleshareService,
  ) {}

  async findUserById(userId: string) {
    return await this.usersService.findById(userId);
  }

  async registerMediaUpload(
    urn: string,
    accessToken: string,
    isOrganization: boolean = false,
    isVideo: boolean = false,
  ): Promise<{ uploadUrl: string; asset: string }> {
    try {
      this.logger.log(
        `Registering media upload for ${isOrganization ? 'organization' : 'person'}Urn: ${urn}`,
      );

      const formattedUrn = isOrganization
        ? urn.startsWith('urn:li:organization:')
          ? urn
          : `urn:li:organization:${urn}`
        : urn.startsWith('urn:li:person:')
          ? urn
          : `urn:li:person:${urn}`;

      const author = formattedUrn;
      console.log('author:', author);

      const response = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
          registerUploadRequest: {
            owner: author,
            recipes: [
              isVideo
                ? 'urn:li:digitalmediaRecipe:feedshare-video'
                : 'urn:li:digitalmediaRecipe:feedshare-image',
            ],
            serviceRelationships: [
              {
                identifier: 'urn:li:userGeneratedContent',
                relationshipType: 'OWNER',
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
            ...(isVideo && {
              'LinkedIn-Version': '202304',
              'X-Restli-Protocol-Version': '2.0.0',
            }),
          },
        },
      );
      console.log('response:', response.data);
      const uploadUrl =
        response.data.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;
      const asset = response.data.value.asset;
      console.log('uploadUrl:', uploadUrl);
      console.log('asset:', asset);
      return { uploadUrl, asset };
    } catch (error) {
      this.logger.error(
        `Error registering media upload for ${isOrganization ? 'organization' : 'person'}Urn: ${urn}`,
        error.message,
      );
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async uploadMedia(
    uploadUrl: string,
    media: Buffer,
    accessToken: string,
  ): Promise<boolean> {
    try {
      if (!uploadUrl) {
        throw new Error('Upload URL is required');
      }

      this.logger.log(`Attempting to upload media to URL: ${uploadUrl}`);

      const contentType = this.getContentType(media);
      const isVideo = contentType.startsWith('video/');

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        ...(isVideo && {
          'LinkedIn-Version': '202304',
          'X-Restli-Protocol-Version': '2.0.0',
        }),
      };
      if (isVideo) {
        headers['LinkedIn-Version'] = '202304';
        headers['X-Restli-Protocol-Version'] = '2.0.0';
      }
      const formData = new FormData();
      formData.append('file', media, {
        filename: 'media',
        contentType: contentType,
      });

      const response = await axios.put(uploadUrl, media, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
        },
      });
      if (isVideo) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      this.logger.log(`Upload response status: ${response.status}`);
      console.log('upload media response:', response.data);
      return response.status === 201;
    } catch (error) {
      this.logger.error(`Error uploading media: ${error.message}`);
      if (error.response) {
        this.logger.error(
          `LinkedIn API response: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  private getContentType(buffer: Buffer): string {
    // Check for video formats first
    if (
      buffer[0] === 0x00 &&
      buffer[1] === 0x00 &&
      buffer[2] === 0x00 &&
      buffer[3] === 0x20
    ) {
      return 'video/mp4';
    }
    if (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return 'video/webm';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      return 'image/png';
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49) {
      return 'image/gif';
    }

    const signature = buffer.toString('hex', 0, 4);
    if (signature.startsWith('1a45dfa3')) {
      return 'video/webm';
    }
    if (signature.startsWith('000001')) {
      return 'video/mpeg';
    }

    if (buffer.includes(Buffer.from('ftypmp4'))) {
      return 'video/mp4';
    }

    return 'application/octet-stream';
  }

  async registerCarouselUpload(
    urn: string,
    accessToken: string,
    numberOfImages: number,
    isOrganization: boolean = false,
  ): Promise<{ uploadUrls: string[]; assets: string[] }> {
    if (isOrganization) {
      throw new BadRequestException(
        'Carousel posts are not supported for company pages without sponsorship. Please use single image posts or create sponsored content instead.',
      );
    }

    if (numberOfImages < 2 || numberOfImages > 9) {
      throw new Error('Carousel must contain between 2 and 9 images');
    }

    const uploadPromises = [];
    let uploads = [];

    for (let i = 0; i < numberOfImages; i++) {
      uploadPromises.push(
        this.registerMediaUpload(urn, accessToken, isOrganization),
      );
    }

    try {
      uploads = await Promise.all(uploadPromises);
      return {
        uploadUrls: uploads.map((u) => u.uploadUrl),
        assets: uploads.map((u) => u.asset),
      };
    } catch (error) {
      throw new Error(`Failed to register carousel uploads: ${error.message}`);
    }
  }

  async uploadCarouselImages(
    userId: string,
    files: Array<multer.File>,
    urn: string,
    accessToken: string,
    isOrganization: boolean,
  ): Promise<string[]> {
    const { uploadUrls, assets } = await this.registerCarouselUpload(
      urn,
      accessToken,
      files.length,
      isOrganization,
    );

    const uploadPromises = files.map(async (file, index) => {
      try {
        await this.uploadMedia(uploadUrls[index], file.buffer, accessToken);
        return assets[index];
      } catch (error) {
        throw new Error(
          `Failed to upload image ${index + 1}: ${error.message}`,
        );
      }
    });

    const results = [];
    for (const promise of uploadPromises) {
      const result = await promise;
      results.push(result);
      // Add delay between uploads to prevent rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  }

  async createCarouselShare(
    personUrn: string,
    assets: string[],
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Creating carousel share for personUrn: ${personUrn}`);
      const formattedPersonUrn = personUrn.startsWith('urn:li:person:')
        ? personUrn
        : `urn:li:person:${personUrn}`;

      const mediaArray = assets.map((asset) => ({
        status: 'READY',
        media: asset,
      }));

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedPersonUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: mediaArray,
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'CAROUSEL',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );

      this.logger.log(
        `Carousel share created successfully for personUrn: ${personUrn}`,
      );
      return response.data;
    } catch (error) {
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createCompanyCarouselShare(
    OrganizationUrn: string,
    assets: string[],
    text: string,
    accessToken: string,
  ): Promise<void> {
    // throw new BadRequestException(
    //   'LinkedIn requires carousel posts for company pages to be sponsored posts. Please use single image posts or create sponsored content instead.',
    // );

    try {
      this.logger.log(
        `Creating carousel share for company page with ID: ${OrganizationUrn}`,
      );
      const formattedOrganisationUrn = OrganizationUrn.startsWith(
        'urn:li:organization:',
      )
        ? OrganizationUrn
        : `urn:li:organization:${OrganizationUrn}`;

      const mediaArray = assets.map((asset) => ({
        status: 'READY',
        media: asset,
      }));

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedOrganisationUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: mediaArray,
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'CAROUSEL',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );

      this.logger.log(
        `Carousel share created successfully for company page with ID: ${OrganizationUrn}`,
      );
      return response.data;
    } catch (error) {
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createImageShare(
    personUrn: string,
    asset: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Creating image share for personUrn: ${personUrn}`);
      const formattedPersonUrn = personUrn.startsWith('urn:li:person:')
        ? personUrn
        : `urn:li:person:${personUrn}`;

      const author = formattedPersonUrn;
      console.log('author:', author);
      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedPersonUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: [
                {
                  status: 'READY',
                  description: {
                    text: text,
                  },
                  media: asset,
                },
              ],
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'IMAGE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );
      console.log('response:', response.data);
      this.logger.log(
        `Image share created successfully for personUrn: ${personUrn}`,
      );
      return response.data;
    } catch (error) {
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createVideoShare(
    personUrn: string,
    asset: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Creating video share for personUrn: ${personUrn}`);
      console.log('asset:', asset);
      console.log('text:', text);

      const formattedPersonUrn = personUrn.startsWith('urn:li:person:')
        ? personUrn
        : `urn:li:person:${personUrn}`;

      const author = formattedPersonUrn;
      console.log('author:', author);

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedPersonUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: [
                {
                  status: 'READY',
                  description: {
                    text: text,
                  },
                  media: asset,
                  title: {
                    text: text,
                  },
                },
              ],
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'VIDEO',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202304',
          },
        },
      );

      console.log('response: for the video share ', response.data);
    } catch (error) {
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async publishTextTToCompanyPage(
    OrganizationUrn: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Publishing to company page with ID: ${OrganizationUrn}`);
      const formattedOrganisationUrn = OrganizationUrn.startsWith(
        'urn:li:organization:',
      )
        ? OrganizationUrn
        : `urn:li:organization:${OrganizationUrn}`;

      const author = formattedOrganisationUrn;
      console.log('author:', author);

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedOrganisationUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );
      this.logger.log(
        `Post published successfully to company page with ID: ${OrganizationUrn}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error publishing to company page with ID: ${`${OrganizationUrn}`}`,
        error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createCompanyVideoShare(
    OrganizationUrn: string,
    asset: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Creating video share for company page with ID: ${OrganizationUrn}`,
      );
      const formattedOrganisationUrn = OrganizationUrn.startsWith(
        'urn:li:organization:',
      )
        ? OrganizationUrn
        : `urn:li:organization:${OrganizationUrn}`;

      const author = formattedOrganisationUrn;
      console.log('author:', author);
      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedOrganisationUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: [
                {
                  status: 'READY',
                  description: {
                    text: text,
                  },
                  media: asset,
                  title: {
                    text: text,
                  },
                },
              ],
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'VIDEO',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202304',
          },
        },
      );

      console.log('response: for the video share ', response.data);
      this.logger.log(
        `Video share created successfully for company page with ID: ${OrganizationUrn}`,
      );
      return response.data;
    } catch (error) {
      this.handleError('Error sharing video', error);
    }
  }
  private handleError(message: string, error: any): never {
    this.logger.error(`${message}: ${error.response?.data || error.message}`);
    throw new Error(`LinkedIn API error: ${error.message}`);
  }
  async createCompanyImageShare(
    OrganizationUrn: string,
    asset: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Creating image share for company page with ID: ${OrganizationUrn}`,
      );
      const formattedOrganisationUrn = OrganizationUrn.startsWith(
        'urn:li:organization:',
      )
        ? OrganizationUrn
        : `urn:li:organization:${OrganizationUrn}`;

      const author = formattedOrganisationUrn;
      console.log('author:', author);

      await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedOrganisationUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              media: [
                {
                  status: 'READY',
                  description: {
                    text: text,
                  },
                  media: asset,
                  title: {
                    text: text,
                  },
                },
              ],
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'IMAGE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
            'LinkedIn-Version': '202304',
          },
        },
      );
    } catch (error) {
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async publishTextPost(
    personUrn: string,
    text: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Publishing text post for personUrn: ${personUrn}`);

      const formattedPersonUrn = personUrn.startsWith('urn:li:person:')
        ? personUrn
        : `urn:li:person:${personUrn}`;

      const author = formattedPersonUrn;
      console.log('author:', author);

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: formattedPersonUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: text,
              },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );
      console.log('response:', response.data);
      this.logger.log(
        `Text post published successfully for personUrn: ${personUrn}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error publishing text post for personUrn: ${personUrn}`,
        error.message,
      );
      console.error(
        'Error sending request to LinkedIn:',
        error.response?.data || error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createarticleShare(
    personUrn: string,
    text: string,
    articleUrl: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(`Sharing article for personUrn: ${personUrn}`);
      this.logger.log(`Sharing article url: ${articleUrl}`);

      const formattedPersonUrn = personUrn.startsWith('urn:li:person:')
        ? personUrn
        : `urn:li:person:${personUrn}`;

      const author = formattedPersonUrn;
      console.log('author:', author);

      const payload = await this.articleShareService.createArticleSharePayload(
        formattedPersonUrn,
        text,
        articleUrl,
        false,
      );

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );

      this.logger.log(
        `Article share created successfully for personUrn: ${personUrn}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error sharing article for personUrn: ${personUrn}`,
        error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }

  async createCompanyArticleShare(
    OrganizationUrn: string,
    text: string,
    articleUrl: string,
    accessToken: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Sharing article for company page with ID: ${OrganizationUrn}`,
      );
      this.logger.log(`Sharing article url: ${articleUrl}`);

      const formattedOrganisationUrn = OrganizationUrn.startsWith(
        'urn:li:organization:',
      )
        ? OrganizationUrn
        : `urn:li:organization:${OrganizationUrn}`;

      const author = formattedOrganisationUrn;
      console.log('author:', author);

      const payload = await this.articleShareService.createArticleSharePayload(
        formattedOrganisationUrn,
        text,
        articleUrl,
        true,
      );

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-li-format': 'json',
          },
        },
      );

      this.logger.log(
        `Article share created successfully for organizationUrn: ${OrganizationUrn}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error sharing article for organizationUrn: ${OrganizationUrn}`,
        error.message,
      );
      throw new Error(`LinkedIn API error: ${error.message}`);
    }
  }
}
