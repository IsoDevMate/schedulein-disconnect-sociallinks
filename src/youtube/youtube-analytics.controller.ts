import { Controller, Get, Query, Param, UseGuards, Req } from "@nestjs/common";
import { YouTubeAnalyticsService } from "./youtube-analytics.service";
import {
  ShortsMetricsDto,
  ShortsAnalyticsResponseDto,
} from "./dto/youtube-analytics.dto";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Request } from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

@ApiTags("youtube-analytics")
@Controller("youtube/analytics")
@UseGuards(JwtAuthGuard)
export class YouTubeAnalyticsController {
  constructor(
    private readonly youtubeAnalyticsService: YouTubeAnalyticsService,
  ) {}

  @Get("search")
  @ApiOperation({ summary: "Search for Shorts by keyword/niche" })
  @ApiResponse({
    status: 200,
    description: "Returns Shorts matching the search query",
  })
  @ApiQuery({
    name: "q",
    required: true,
    description: "Search query (keywords, niche, topic)",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    description: "Maximum number of results (default: 10)",
  })
  @ApiQuery({
    name: "sortBy",
    required: false,
    description:
      "Sort order: relevance, date, viewCount, rating (default: viewCount)",
  })
  @ApiQuery({
    name: "publishedAfter",
    required: false,
    description: "Filter Shorts published after this date (ISO 8601 format)",
  })
  @ApiQuery({
    name: "regionCode",
    required: false,
    description: "Region code for search results",
  })
  async searchShorts(
    @Req() req: AuthenticatedRequest,
    @Query("q") query: string,
    @Query("maxResults") maxResults = "10",
    @Query("sortBy") sortBy?: "relevance" | "date" | "viewCount" | "rating",
    @Query("publishedAfter") publishedAfter?: string,
    @Query("regionCode") regionCode?: string,
  ): Promise<ShortsMetricsDto[]> {
    return this.youtubeAnalyticsService.searchShortsByKeyword(
      req.user.userId,
      query,
      parseInt(maxResults, 10),
      { sortBy, publishedAfter, regionCode },
    );
  }

  @Get("trending")
  @ApiOperation({ summary: "Get trending Shorts with enhanced fallback logic" })
  @ApiResponse({
    status: 200,
    description: "Returns currently trending Shorts",
  })
  @ApiResponse({ status: 204, description: "No trending Shorts available" })
  @ApiQuery({
    name: "categoryId",
    required: false,
    description:
      "YouTube category ID (0=All, 2=Music, 10=Entertainment, 20=Gaming, etc.)",
  })
  @ApiQuery({
    name: "regionCode",
    required: false,
    description: "Region code (default: US)",
  })
  @ApiQuery({
    name: "maxResults",
    required: false,
    description: "Maximum number of results (default: 10)",
  })
  async getTrendingShorts(
    @Req() req: AuthenticatedRequest,
    @Query("categoryId") categoryId?: string,
    @Query("regionCode") regionCode = "US",
    @Query("maxResults") maxResults = "10",
  ): Promise<ShortsMetricsDto[]> {
    try {
      const result = await this.youtubeAnalyticsService.getTrendingShorts(
        req.user.userId,
        parseInt(maxResults, 10),
        {
          regionCode,
          categoryId: categoryId || "0",
        },
      );

      console.log(`Trending Shorts result: ${result.length} items returned`);

      return result;
    } catch (error) {
      // Log the error but don't throw to prevent cascade failures
      console.error("Trending Shorts error:", error.message);

      // Return empty array instead of throwing error
      return [];
    }
  }

  @Get("channel/:channelId")
  @ApiOperation({ summary: "Analyze a YouTube channel's Shorts" })
  @ApiResponse({
    status: 200,
    description: "Returns channel analytics and recent Shorts",
  })
  @ApiQuery({
    name: "maxShorts",
    required: false,
    description: "Number of recent Shorts to analyze (default: 10)",
  })
  async analyzeChannelShorts(
    @Req() req: AuthenticatedRequest,
    @Param("channelId") channelId: string,
    @Query("maxShorts") maxShorts = "10",
  ): Promise<ShortsAnalyticsResponseDto> {
    return this.youtubeAnalyticsService.analyzeChannelShorts(
      req.user.userId,
      channelId,
      parseInt(maxShorts, 10),
    );
  }

  @Get("shorts")
  @ApiOperation({ summary: "Get metrics for specific Shorts" })
  @ApiResponse({
    status: 200,
    description: "Returns metrics for the specified Shorts",
  })
  @ApiQuery({
    name: "ids",
    required: true,
    description: "Comma-separated list of YouTube Shorts IDs",
  })
  async getShortsMetrics(
    @Req() req: AuthenticatedRequest,
    @Query("ids") shortIds: string,
  ): Promise<ShortsMetricsDto[]> {
    return this.youtubeAnalyticsService.getShortsMetrics(
      req.user.userId,
      shortIds.split(","),
    );
  }
}
