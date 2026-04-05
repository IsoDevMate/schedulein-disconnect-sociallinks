import { Controller, Get, Query, UseGuards, Req } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  ContentIdeaService,
  ContentIdea,
  ContentIdeaGenerationOptions,
} from "../services/content-idea.service";
import { Request } from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

@ApiTags("content-ideas")
@Controller("youtube/content-ideas")
@UseGuards(JwtAuthGuard)
export class ContentIdeaController {
  constructor(private readonly contentIdeaService: ContentIdeaService) {}

  @Get()
  @ApiOperation({
    summary: "Generate content ideas based on trending patterns",
  })
  @ApiResponse({ status: 200, description: "Returns generated content ideas" })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "contentType",
    required: false,
    description: "Filter by content type",
    enum: [
      "tutorial",
      "reaction",
      "challenge",
      "story",
      "review",
      "tips",
      "transformation",
      "comparison",
    ],
  })
  @ApiQuery({
    name: "targetAudience",
    required: false,
    description: "Filter by target audience",
    enum: ["beginners", "intermediate", "general"],
  })
  @ApiQuery({
    name: "maxDuration",
    required: false,
    description: "Maximum duration in seconds (default: 60)",
  })
  @ApiQuery({
    name: "minPotentialScore",
    required: false,
    description: "Minimum potential score (0-1, default: 0.5)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 20)",
  })
  async generateContentIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("contentType") contentType?: string,
    @Query("targetAudience") targetAudience?: string,
    @Query("maxDuration") maxDuration?: string,
    @Query("minPotentialScore") minPotentialScore?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      contentType,
      targetAudience,
      maxDuration: maxDuration ? parseInt(maxDuration, 10) : undefined,
      minPotentialScore: minPotentialScore
        ? parseFloat(minPotentialScore)
        : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    return this.contentIdeaService.generateContentIdeas(options);
  }

  @Get("trending")
  @ApiOperation({ summary: "Generate content ideas based on current trends" })
  @ApiResponse({
    status: 200,
    description: "Returns trend-based content ideas",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getTrendingIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to only trend-based ideas
    return allIdeas.filter(
      (idea) =>
        idea.trendingElements.length > 0 ||
        idea.title.toLowerCase().includes("trending"),
    );
  }

  @Get("viral")
  @ApiOperation({ summary: "Generate viral content ideas" })
  @ApiResponse({ status: 200, description: "Returns viral content ideas" })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getViralIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
      minPotentialScore: 0.7, // Higher threshold for viral ideas
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to high-potential viral ideas
    return allIdeas.filter(
      (idea) => idea.potentialScore >= 0.7 && idea.riskLevel === "low",
    );
  }

  @Get("quick")
  @ApiOperation({ summary: "Generate quick content ideas (fast to create)" })
  @ApiResponse({ status: 200, description: "Returns quick content ideas" })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getQuickIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to quick-to-create ideas
    return allIdeas.filter((idea) => idea.timeToCreate === "quick");
  }

  @Get("low-risk")
  @ApiOperation({ summary: "Generate low-risk content ideas" })
  @ApiResponse({ status: 200, description: "Returns low-risk content ideas" })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getLowRiskIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to low-risk ideas
    return allIdeas.filter((idea) => idea.riskLevel === "low");
  }

  @Get("audience/:audience")
  @ApiOperation({ summary: "Generate content ideas for specific audience" })
  @ApiResponse({
    status: 200,
    description: "Returns audience-specific content ideas",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getAudienceSpecificIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to audience-specific ideas
    return allIdeas.filter((idea) => idea.targetAudience !== "general");
  }

  @Get("content-type/:type")
  @ApiOperation({ summary: "Generate content ideas for specific content type" })
  @ApiResponse({
    status: 200,
    description: "Returns content type specific ideas",
  })
  @ApiQuery({
    name: "niche",
    required: false,
    description: "Filter by specific niche",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of ideas to return (default: 10)",
  })
  async getContentTypeIdeas(
    @Req() req: AuthenticatedRequest,
    @Query("niche") niche?: string,
    @Query("limit") limit?: string,
  ): Promise<ContentIdea[]> {
    const options: ContentIdeaGenerationOptions = {
      niche,
      limit: limit ? parseInt(limit, 10) : 10,
    };

    const allIdeas =
      await this.contentIdeaService.generateContentIdeas(options);

    // Filter to specific content type
    return allIdeas.filter((idea) => idea.contentType === req.params.type);
  }
}
