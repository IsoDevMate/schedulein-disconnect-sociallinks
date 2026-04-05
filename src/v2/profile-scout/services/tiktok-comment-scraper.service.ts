import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { CacheService } from '../cache/cache.service';

export interface TikTokComment {
  id: string;
  username: string;
  userProfileUrl: string;
  commentText: string;
  timeCommentedAgo: string;
  likesCount: number;
  profilePictureUrl: string;
  isReply: boolean;
  parentCommentId?: string;
  replyCount?: number;
  level: number; // 1 for top-level, 2 for replies
}

export interface TikTokCommentScrapingResult {
  videoUrl: string;
  totalComments: number;
  scrapedComments: number;
  comments: TikTokComment[];
  scrapingTime: number;
  success: boolean;
  error?: string;
}

export interface TikTokVideoMetadata {
  videoId: string;
  creatorUsername: string;
  creatorProfileUrl: string;
  videoDescription: string;
  publishTime: string;
  likeCount: number;
  shareCount: number;
  viewCount: number;
  hashtags: string[];
}

@Injectable()
export class TikTokCommentScraperService {
  private readonly logger = new Logger(TikTokCommentScraperService.name);

  // Updated selectors based on 2024-2025 DOM structure analysis
  private readonly selectors = {
    // Stable selectors using data-e2e attributes
    commentCount: '[data-e2e="comment-count"]',
    commentIcon: '[data-e2e="comment-icon"]',
    feedVideo: '[data-e2e="feed-video"]',
    recommendListItem: '[data-e2e="recommend-list-item-container"]',

    // Comment container selectors (more stable than CSS classes)
    commentContainer: 'div[class*="DivCommentObjectWrapper"]',
    commentListContainer: 'div[class*="DivCommentListContainer"]',
    commentSidebar: 'aside[class*="AsideOneColumnSidebar"]',

    // Comment content selectors
    commentContent: 'div[class*="comment-content"]',
    commentText: 'p[class*="comment-text"], span[class*="comment-text"]',
    username: 'span[class*="username"], a[class*="user-info"]',
    userProfile: 'a[class*="user-info"]',
    commentTime: 'span[class*="comment-time"], span[class*="time"]',
    commentLikes: 'span[class*="count"], span[class*="likes"]',
    profilePicture: 'img[class*="avatar"], img[class*="profile"]',

    // Video metadata selectors
    videoDescription: 'h1[class*="video-meta-title"], div[class*="description"]',
    creatorUsername: 'span[class*="username"], a[class*="creator"]',
    creatorProfile: 'a[class*="creator"], a[class*="user-info-link"]',
    likeCount: 'strong[class*="like-text"], span[class*="likes"]',
    shareCount: 'span[class*="shares"], strong[class*="share-text"]',
    viewCount: 'span[class*="views"], strong[class*="view-text"]',

    // Reply/level selectors
    replyButton: 'button[class*="reply"], span[class*="reply"]',
    viewReplies: 'span[class*="view-replies"], a[class*="replies"]',
    level1Comment: 'div[class*="level-1"], div[class*="comment-pc"]',
    level2Comment: 'div[class*="level-2"], div[class*="reply"]',

    // Loading and pagination
    loadMoreButton: 'button[class*="load-more"], div[class*="load-more"]',
    commentInput: 'div[class*="comment-input"], textarea[class*="comment"]',
  };

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Scrape comments from a TikTok video URL
   */
  async scrapeComments(
    videoUrl: string,
    options: {
      maxComments?: number;
      includeReplies?: boolean;
      maxRepliesPerComment?: number;
      timeout?: number;
    } = {}
  ): Promise<TikTokCommentScrapingResult> {
    const startTime = Date.now();
    const {
      maxComments = 1000,
      includeReplies = true,
      maxRepliesPerComment = 10,
      timeout = 120000
    } = options;

    // Check cache first
    const cacheKey = `tiktok_comments_${this.hashUrl(videoUrl)}_${maxComments}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.log(`Returning cached comments for ${videoUrl}`);
      return cached as TikTokCommentScrapingResult;
    }

    let browser: puppeteer.Browser | null = null;

    try {
      this.logger.log(`Starting comment scraping for: ${videoUrl}`);

      browser = await this.launchStealthBrowser();
      const page = await browser.newPage();

      await this.setupAdvancedStealth(page);
      await this.setupCommentScrapingPage(page);

      // Navigate to video
      await page.goto(videoUrl, {
        waitUntil: 'networkidle2',
        timeout,
      });

      // Wait for page to load
      await this.randomDelay(3000, 5000);

      // Extract video metadata
      const videoMetadata = await this.extractVideoMetadata(page);

      // Open comments section if not already open
      await this.openCommentsSection(page);

      // Get initial comment count
      const totalComments = await this.getTotalCommentCount(page);
      this.logger.log(`Total comments detected: ${totalComments}`);

      // Scrape comments with progressive loading
      const comments = await this.scrapeCommentsWithProgressiveLoading(
        page,
        maxComments,
        includeReplies,
        maxRepliesPerComment
      );

      const result: TikTokCommentScrapingResult = {
        videoUrl,
        totalComments,
        scrapedComments: comments.length,
        comments,
        scrapingTime: Date.now() - startTime,
        success: true,
      };

      // Cache the result
      await this.cacheService.set(cacheKey, result, 3600); // Cache for 1 hour

      this.logger.log(`Successfully scraped ${comments.length} comments in ${result.scrapingTime}ms`);
      return result;

    } catch (error) {
      this.logger.error(`Error scraping comments: ${error.message}`);
      return {
        videoUrl,
        totalComments: 0,
        scrapedComments: 0,
        comments: [],
        scrapingTime: Date.now() - startTime,
        success: false,
        error: error.message,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Extract video metadata
   */
  private async extractVideoMetadata(page: puppeteer.Page): Promise<TikTokVideoMetadata> {
    try {
      const metadata = await page.evaluate((selectors) => {
        const getTextContent = (selector: string) => {
          const element = document.querySelector(selector);
          return element ? element.textContent?.trim() || '' : '';
        };

        const getAttribute = (selector: string, attribute: string) => {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) || '' : '';
        };

        const getNumberFromText = (text: string) => {
          const match = text.match(/[\d,]+/);
          return match ? parseInt(match[0].replace(/,/g, '')) : 0;
        };

        return {
          videoId: window.location.pathname.split('/').pop() || '',
          creatorUsername: getTextContent(selectors.creatorUsername),
          creatorProfileUrl: getAttribute(selectors.creatorProfile, 'href'),
          videoDescription: getTextContent(selectors.videoDescription),
          publishTime: '', // Will be extracted separately
          likeCount: getNumberFromText(getTextContent(selectors.likeCount)),
          shareCount: getNumberFromText(getTextContent(selectors.shareCount)),
          viewCount: getNumberFromText(getTextContent(selectors.viewCount)),
          hashtags: [], // Will be extracted separately
        };
      }, this.selectors);

      this.logger.log(`Extracted video metadata for: ${metadata.creatorUsername}`);
      return metadata;
    } catch (error) {
      this.logger.warn(`Failed to extract video metadata: ${error.message}`);
      return {
        videoId: '',
        creatorUsername: '',
        creatorProfileUrl: '',
        videoDescription: '',
        publishTime: '',
        likeCount: 0,
        shareCount: 0,
        viewCount: 0,
        hashtags: [],
      };
    }
  }

  /**
   * Open comments section if not already open
   */
  private async openCommentsSection(page: puppeteer.Page): Promise<void> {
    try {
      // Check if comments are already visible
      const commentsVisible = await page.$(this.selectors.commentContainer);
      if (commentsVisible) {
        this.logger.log('Comments section already open');
        return;
      }

      // Click on comment button to open comments
      const commentButton = await page.$(this.selectors.commentIcon);
      if (commentButton) {
        await commentButton.click();
        await this.randomDelay(2000, 3000);
        this.logger.log('Opened comments section');
      }
    } catch (error) {
      this.logger.warn(`Failed to open comments section: ${error.message}`);
    }
  }

  /**
   * Get total comment count
   */
  private async getTotalCommentCount(page: puppeteer.Page): Promise<number> {
    try {
      const count = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent || '';
          const match = text.match(/[\d,]+/);
          return match ? parseInt(match[0].replace(/,/g, '')) : 0;
        }
        return 0;
      }, this.selectors.commentCount);

      return count;
    } catch (error) {
      this.logger.warn(`Failed to get comment count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Scrape comments with progressive loading
   */
  private async scrapeCommentsWithProgressiveLoading(
    page: puppeteer.Page,
    maxComments: number,
    includeReplies: boolean,
    maxRepliesPerComment: number
  ): Promise<TikTokComment[]> {
    const comments: TikTokComment[] = [];
    let loadingBuffer = 30;
    let previousCommentCount = 0;

    this.logger.log(`Starting progressive comment loading (max: ${maxComments})`);

    while (loadingBuffer > 0 && comments.length < maxComments) {
      // Scroll to load more comments
      await this.scrollToLoadMoreComments(page);

      // Extract current comments
      const currentComments = await this.extractCommentsFromPage(page, includeReplies, maxRepliesPerComment);

      // Add new comments
      const newComments = currentComments.filter(
        comment => !comments.some(existing => existing.id === comment.id)
      );

      comments.push(...newComments);

      // Check if we're still loading new comments
      if (currentComments.length > previousCommentCount) {
        loadingBuffer = 30; // Reset buffer
        this.logger.log(`Loaded ${currentComments.length} comments (${newComments.length} new)`);
      } else {
        loadingBuffer--;
        this.logger.log(`No new comments loaded, buffer: ${loadingBuffer}`);
      }

      previousCommentCount = currentComments.length;

      // Wait before next iteration
      await this.randomDelay(1000, 2000);

      // Break if we've reached the limit
      if (comments.length >= maxComments) {
        this.logger.log(`Reached maximum comment limit: ${maxComments}`);
        break;
      }
    }

    this.logger.log(`Finished loading ${comments.length} comments`);
    return comments.slice(0, maxComments);
  }

  /**
   * Scroll to load more comments
   */
  private async scrollToLoadMoreComments(page: puppeteer.Page): Promise<void> {
    try {
      await page.evaluate(() => {
        // Find the comments container
        const commentsContainer = document.querySelector('[class*="DivCommentListContainer"]') ||
                                document.querySelector('[class*="comment-list"]') ||
                                document.querySelector('aside');

        if (commentsContainer) {
          // Scroll to bottom of comments
          commentsContainer.scrollTop = commentsContainer.scrollHeight;
        } else {
          // Fallback: scroll the entire page
          window.scrollTo(0, document.body.scrollHeight);
        }
      });

      await this.randomDelay(500, 1000);
    } catch (error) {
      this.logger.warn(`Failed to scroll for more comments: ${error.message}`);
    }
  }

  /**
   * Extract comments from current page
   */
  private async extractCommentsFromPage(
    page: puppeteer.Page,
    includeReplies: boolean,
    maxRepliesPerComment: number
  ): Promise<TikTokComment[]> {
    try {
      const comments = await page.evaluate((selectors, includeReplies, maxReplies) => {
        const comments: any[] = [];

        // Find all comment containers
        const commentContainers = document.querySelectorAll(selectors.commentContainer);

        commentContainers.forEach((container, index) => {
          try {
            // Extract comment data
            const usernameEl = container.querySelector(selectors.username);
            const userProfileEl = container.querySelector(selectors.userProfile);
            const commentTextEl = container.querySelector(selectors.commentText);
            const timeEl = container.querySelector(selectors.commentTime);
            const likesEl = container.querySelector(selectors.commentLikes);
            const profileImgEl = container.querySelector(selectors.profilePicture);

            if (usernameEl && commentTextEl) {
              const comment: any = {
                id: `comment_${index}_${Date.now()}`,
                username: usernameEl.textContent?.trim() || '',
                userProfileUrl: userProfileEl?.getAttribute('href') || '',
                commentText: commentTextEl.textContent?.trim() || '',
                timeCommentedAgo: timeEl?.textContent?.trim() || '',
                likesCount: parseInt(likesEl?.textContent?.replace(/[^\d]/g, '') || '0'),
                profilePictureUrl: profileImgEl?.getAttribute('src') || '',
                isReply: container.closest(selectors.level2Comment) !== null,
                level: container.closest(selectors.level2Comment) ? 2 : 1,
              };

              // Extract parent comment ID for replies
              if (comment.isReply) {
                const parentContainer = container.closest(selectors.level1Comment);
                if (parentContainer) {
                  comment.parentCommentId = `parent_${Array.from(commentContainers).indexOf(parentContainer)}`;
                }
              }

              comments.push(comment);
            }
          } catch (error) {
            console.warn('Error extracting comment:', error);
          }
        });

        return comments;
      }, this.selectors, includeReplies, maxRepliesPerComment);

      this.logger.log(`Extracted ${comments.length} comments from page`);
      return comments;
    } catch (error) {
      this.logger.error(`Failed to extract comments: ${error.message}`);
      return [];
    }
  }

  /**
   * Launch stealth browser
   */
  private async launchStealthBrowser(): Promise<puppeteer.Browser> {
    return await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
    });
  }

  /**
   * Setup advanced stealth for the page
   */
  private async setupAdvancedStealth(page: puppeteer.Page): Promise<void> {
    // Override navigator properties
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission,
            name: parameters.name,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
    });

    // Set viewport
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    });

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    });
  }

  /**
   * Setup page specifically for comment scraping
   */
  private async setupCommentScrapingPage(page: puppeteer.Page): Promise<void> {
    // Block unnecessary resources to improve performance
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Add custom CSS to hide unnecessary elements
    await page.addStyleTag({
      content: `
        .css-*[class*="advertisement"],
        .css-*[class*="promotion"],
        .css-*[class*="sponsored"] {
          display: none !important;
        }
      `,
    });
  }

  /**
   * Random delay between actions
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Hash URL for cache key
   */
  private hashUrl(url: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Get comments for a specific video by URL
   */
  async getCommentsForVideo(videoUrl: string, maxComments: number = 500): Promise<TikTokComment[]> {
    const result = await this.scrapeComments(videoUrl, {
      maxComments,
      includeReplies: true,
      maxRepliesPerComment: 5,
    });

    return result.comments;
  }

  /**
   * Analyze comment sentiment and demographics
   */
  async analyzeComments(comments: TikTokComment[]): Promise<{
    totalComments: number;
    averageLikes: number;
    topCommenters: string[];
    commonWords: string[];
    sentimentDistribution: { positive: number; negative: number; neutral: number };
  }> {
    const totalComments = comments.length;
    const averageLikes = comments.reduce((sum, comment) => sum + comment.likesCount, 0) / totalComments;

    // Get top commenters by likes
    const topCommenters = comments
      .sort((a, b) => b.likesCount - a.likesCount)
      .slice(0, 10)
      .map(comment => comment.username);

    // Extract common words
    const allText = comments.map(comment => comment.commentText.toLowerCase()).join(' ');
    const words = allText.match(/\b\w{3,}\b/g) || [];
    const wordCount: Record<string, number> = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    const commonWords = Object.entries(wordCount)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 20)
      .map(([word]) => word);

    // Simple sentiment analysis
    const positiveWords = ['good', 'great', 'amazing', 'love', 'awesome', 'best', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'hate', 'worst', 'awful', 'disgusting'];

    let positive = 0, negative = 0, neutral = 0;

    comments.forEach(comment => {
      const text = comment.commentText.toLowerCase();
      const hasPositive = positiveWords.some(word => text.includes(word));
      const hasNegative = negativeWords.some(word => text.includes(word));

      if (hasPositive && !hasNegative) positive++;
      else if (hasNegative && !hasPositive) negative++;
      else neutral++;
    });

    return {
      totalComments,
      averageLikes,
      topCommenters,
      commonWords,
      sentimentDistribution: {
        positive: (positive / totalComments) * 100,
        negative: (negative / totalComments) * 100,
        neutral: (neutral / totalComments) * 100,
      },
    };
  }
}
