import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';

interface ArticleMetadata {
  title: string;
  description: string;
  thumbnailUrl?: string;
}

@Injectable()
export class ArticleshareService {
  private readonly logger = new Logger(ArticleshareService.name);

  private validateUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      if (
        !parsedUrl.protocol ||
        !['http:', 'https:'].includes(parsedUrl.protocol)
      ) {
        throw new BadRequestException(
          'URL must start with http:// or https://',
        );
      }
      return parsedUrl.toString();
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Invalid URL format');
    }
  }

  private async fetchArticleMetadata(url: string): Promise<ArticleMetadata> {
    try {
      const response = await axios.get(url);
      const html = response.data;

      // Basic metadata extraction from HTML
      const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
      const description =
        html.match(
          /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i,
        )?.[1] || '';
      const thumbnailUrl =
        html.match(
          /<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i,
        )?.[1] || '';

      return {
        title: title.trim(),
        description: description.trim(),
        thumbnailUrl: thumbnailUrl ? this.validateUrl(thumbnailUrl) : undefined,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch article metadata: ${error.message}`);
      return {
        title: '',
        description: '',
      };
    }
  }

  async createArticleSharePayload(
    authorUrn: string,
    text: string,
    articleUrl: string,
    isOrganization: boolean = false,
  ) {
    const validatedUrl = this.validateUrl(articleUrl);
    const metadata = await this.fetchArticleMetadata(validatedUrl);

    return {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: text,
          },
          shareMediaCategory: 'ARTICLE',
          media: [
            {
              status: 'READY',
              originalUrl: validatedUrl,
              title: {
                text: metadata.title || text,
              },
              description: {
                text: metadata.description || text,
              },
              ...(metadata.thumbnailUrl && {
                thumbnails: [
                  {
                    url: metadata.thumbnailUrl,
                    resolvedUrl: metadata.thumbnailUrl,
                  },
                ],
              }),
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };
  }
}
