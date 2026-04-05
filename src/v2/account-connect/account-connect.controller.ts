import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import { V2JwtAuthGuard } from "./guards/v2-jwt-auth.guard";
import { AccountConnectService } from "./account-connect.service";
import { AnalyticsService } from "./analytics.service";
import { GoalsService } from "./goals.service";
import { BookmarksService } from "./bookmarks.service";
import { CollectionsService } from "./collections.service";
import { ContentSummaryService } from "./content-summary.service";

// import { MonitoringService } from "./monitoring.service";
import {
  ConnectAccountDto,
  UpdateAccountDto,
  CreateGoalDto,
  UpdateGoalDto,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  AnalyticsQueryDto,
  GenerateIdeasFromBookmarksDto,
  AccountConnectResponseDto,
  GoalResponseDto,
  BookmarkResponseDto,
  AnalyticsResponseDto,
  IdeaGenerationResponseDto,
} from "./dto/account-connect.dto";
import { GoalStatus } from "./schemas/user-goal.schema";
import { BookmarkType } from "./schemas/bookmark.schema";
import { AnalyticsMetric, TimeRange } from "./schemas/analytics-data.schema";
import { PlatformType } from "./schemas/account-connect.schema";

@ApiTags("v2-account-connect")
@Controller("v2/account-connect")
@UseGuards(V2JwtAuthGuard)
@ApiBearerAuth()
export class AccountConnectController {
  constructor(
    private readonly accountConnectService: AccountConnectService,
    private readonly analyticsService: AnalyticsService,
    private readonly goalsService: GoalsService,
    private readonly bookmarksService: BookmarksService,
    private readonly collectionsService: CollectionsService,
    private readonly contentSummaryService: ContentSummaryService,

    // private readonly monitoringService: MonitoringService,
  ) {}

  // Account Connection Endpoints
  @Post("connect")
  @ApiOperation({
    summary: "Connect a social media account",
    description: "Connect a new social media account to your profile. Supports TikTok, Instagram, YouTube, and LinkedIn. Requires valid OAuth tokens or platform credentials."
  })
  @ApiResponse({
    status: 201,
    description: "Account connected successfully",
    type: AccountConnectResponseDto,
  })
  async connectAccount(
    @Request() req,
    @Body() connectAccountDto: ConnectAccountDto,
  ): Promise<AccountConnectResponseDto> {
    return this.accountConnectService.connectAccount(
      req.user.id,
      connectAccountDto,
    );
  }

  @Get("accounts")
  @ApiOperation({
    summary: "Get all connected accounts",
    description: "Retrieve a list of all social media accounts connected to your profile. Returns account details, connection status, and basic metrics."
  })
  @ApiResponse({
    status: 200,
    description: "List of connected accounts",
    type: [AccountConnectResponseDto],
  })
  async getConnectedAccounts(
    @Request() req,
  ): Promise<AccountConnectResponseDto[]> {
    return this.accountConnectService.getConnectedAccounts(req.user.id);
  }

  @Get("accounts/:accountId")
  @ApiOperation({
    summary: "Get a specific connected account",
    description: "Retrieve detailed information about a specific connected social media account including profile data, metrics, and connection status."
  })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiResponse({
    status: 200,
    description: "Account details",
    type: AccountConnectResponseDto,
  })
  async getAccountById(
    @Request() req,
    @Param("accountId") accountId: string,
  ): Promise<AccountConnectResponseDto> {
    return this.accountConnectService.getAccountById(req.user.id, accountId);
  }

  @Put("accounts/:accountId")
  @ApiOperation({
    summary: "Update a connected account",
    description: "Update settings and preferences for a connected social media account. Can modify display names, sync preferences, and account settings."
  })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiResponse({
    status: 200,
    description: "Account updated successfully",
    type: AccountConnectResponseDto,
  })
  async updateAccount(
    @Request() req,
    @Param("accountId") accountId: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ): Promise<AccountConnectResponseDto> {
    return this.accountConnectService.updateAccount(
      req.user.id,
      accountId,
      updateAccountDto,
    );
  }

  @Delete("accounts/:accountId")
  @ApiOperation({
    summary: "Disconnect a social media account",
    description: "Permanently disconnect a social media account from your profile. This will remove all associated data and stop syncing."
  })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiResponse({
    status: 204,
    description: "Account disconnected successfully",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnectAccount(
    @Request() req,
    @Param("accountId") accountId: string,
  ): Promise<void> {
    return this.accountConnectService.disconnectAccount(req.user.id, accountId);
  }

  @Post("accounts/:accountId/sync")
  @ApiOperation({ summary: "Sync platform data for an account" })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiResponse({
    status: 200,
    description: "Platform data synced successfully",
  })
  async syncPlatformData(
    @Request() req,
    @Param("accountId") accountId: string,
  ): Promise<void> {
    return this.accountConnectService.syncPlatformData(accountId);
  }

  @Post("sync-all")
  @ApiOperation({ summary: "Sync all active accounts (admin only)" })
  @ApiResponse({
    status: 200,
    description: "All accounts synced successfully",
  })
  async syncAllAccounts(@Request() req): Promise<{ message: string }> {
    await this.accountConnectService.syncAllActiveAccounts();
    return { message: "Background sync completed" };
  }

  @Post("accounts/:accountId/refresh-token")
  @ApiOperation({ summary: "Refresh token for a specific account" })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiResponse({
    status: 200,
    description: "Token refreshed successfully",
  })
  async refreshAccountToken(
    @Request() req,
    @Param("accountId") accountId: string,
  ): Promise<{ message: string }> {
    await this.accountConnectService.refreshAccountToken(accountId);
    return { message: "Token refreshed successfully" };
  }

  // Monitoring Endpoints (commented out for now)
  /*
  @Get("monitoring/health")
  @ApiOperation({ summary: "Get system health report" })
  @ApiResponse({
    status: 200,
    description: "Health report generated successfully",
  })
  async getHealthReport(@Request() req): Promise<any> {
    return this.monitoringService.generateHealthReport();
  }

  @Get("monitoring/metrics")
  @ApiOperation({ summary: "Get sync metrics" })
  @ApiResponse({
    status: 200,
    description: "Sync metrics retrieved successfully",
  })
  async getSyncMetrics(@Request() req): Promise<any> {
    return this.monitoringService.getSyncMetrics();
  }

  @Get("monitoring/consistency")
  @ApiOperation({ summary: "Get data consistency report" })
  @ApiResponse({
    status: 200,
    description: "Consistency report generated successfully",
  })
  async getConsistencyReport(@Request() req): Promise<any> {
    return this.monitoringService.getDataConsistencyReport();
  }

  @Get("monitoring/attention")
  @ApiOperation({ summary: "Get accounts needing attention" })
  @ApiResponse({
    status: 200,
    description: "Accounts needing attention retrieved successfully",
  })
  async getAccountsNeedingAttention(@Request() req): Promise<any> {
    return this.monitoringService.getAccountsNeedingAttention();
  }
  */

  // Analytics Endpoints
  @Get("analytics")
  @ApiOperation({
    summary: "Get analytics data",
    description: "Retrieve comprehensive analytics data across all connected accounts. Includes performance metrics, engagement rates, and growth trends."
  })
  @ApiQuery({
    name: "metric",
    enum: AnalyticsMetric,
    description: "Analytics metric",
  })
  @ApiQuery({
    name: "timeRange",
    enum: TimeRange,
    required: false,
    description: "Time range",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date (ISO string)",
  })
  @ApiQuery({
    name: "platform",
    required: false,
    description: "Platform filter",
  })
  @ApiResponse({
    status: 200,
    description: "Analytics data",
    type: AnalyticsResponseDto,
  })
  async getAnalytics(
    @Request() req,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(req.user.id, query);
  }

  @Get("accounts/:accountId/analytics")
  @ApiOperation({
    summary: "Get analytics for a specific account",
    description: "Get detailed analytics for a specific social media account. Includes content performance, audience insights, and platform-specific metrics."
  })
  @ApiParam({ name: "accountId", description: "Account ID" })
  @ApiQuery({
    name: "metric",
    enum: AnalyticsMetric,
    description: "Analytics metric",
  })
  @ApiQuery({
    name: "timeRange",
    enum: TimeRange,
    required: false,
    description: "Time range",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "Start date (ISO string)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "End date (ISO string)",
  })
  @ApiResponse({
    status: 200,
    description: "Account analytics data",
    type: AnalyticsResponseDto,
  })
  async getAccountAnalytics(
    @Request() req,
    @Param("accountId") accountId: string,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    return this.analyticsService.getAccountAnalytics(
      req.user.id,
      accountId,
      query,
    );
  }

  @Get("analytics/posting-times")
  @ApiOperation({ summary: "Get top posting times" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiResponse({
    status: 200,
    description: "Top posting times",
    type: [Object],
  })
  async getTopPostingTimes(
    @Request() req,
    @Query("accountId") accountId?: string,
  ): Promise<any[]> {
    return this.analyticsService.getTopPostingTimes(req.user.id, accountId);
  }

  @Get("analytics/top-videos")
  @ApiOperation({ summary: "Get top performing videos" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of videos to return",
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: "Top performing videos",
    type: [Object],
  })
  async getTopVideos(
    @Request() req,
    @Query("accountId") accountId?: string,
    @Query("limit") limit?: number,
  ): Promise<any[]> {
    return this.analyticsService.getTopVideos(req.user.id, accountId, limit);
  }

  @Get("analytics/top-hashtags")
  @ApiOperation({ summary: "Get top performing hashtags" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Number of hashtags to return",
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: "Top performing hashtags",
    type: [Object],
  })
  async getTopHashtags(
    @Request() req,
    @Query("accountId") accountId?: string,
    @Query("limit") limit?: number,
  ): Promise<any[]> {
    return this.analyticsService.getTopHashtags(req.user.id, accountId, limit);
  }

  @Get("analytics/performance-metrics")
  @ApiOperation({ summary: "Get performance metrics" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiResponse({
    status: 200,
    description: "Performance metrics",
    type: Object,
  })
  async getPerformanceMetrics(
    @Request() req,
    @Query("accountId") accountId?: string,
  ): Promise<any> {
    return this.analyticsService.getPerformanceMetrics(req.user.id, accountId);
  }

  @Get("analytics/audience-insights")
  @ApiOperation({ summary: "Get audience insights" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiResponse({
    status: 200,
    description: "Audience insights",
    type: Object,
  })
  async getAudienceInsights(
    @Request() req,
    @Query("accountId") accountId?: string,
  ): Promise<any> {
    return this.analyticsService.getAudienceInsights(req.user.id, accountId);
  }

  @Get("analytics/report")
  @ApiOperation({ summary: "Generate comprehensive analytics report" })
  @ApiQuery({
    name: "accountId",
    required: false,
    description: "Account ID filter",
  })
  @ApiQuery({
    name: "timeRange",
    enum: TimeRange,
    required: false,
    description: "Time range",
  })
  @ApiResponse({
    status: 200,
    description: "Analytics report",
    type: Object,
  })
  async generateAnalyticsReport(
    @Request() req,
    @Query("accountId") accountId?: string,
    @Query("timeRange") timeRange?: TimeRange,
  ): Promise<any> {
    return this.analyticsService.generateAnalyticsReport(
      req.user.id,
      accountId,
      timeRange,
    );
  }

  // Goals Endpoints
  @Post("goals")
  @ApiOperation({
    summary: "Create a new goal",
    description: "Create a new content or growth goal for your social media accounts. Goals can be follower targets, engagement rates, or content milestones."
  })
  @ApiResponse({
    status: 201,
    description: "Goal created successfully",
    type: GoalResponseDto,
  })
  async createGoal(
    @Request() req,
    @Body() createGoalDto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalsService.createGoal(req.user.id, createGoalDto);
  }

  @Get("goals")
  @ApiOperation({
    summary: "Get all goals",
    description: "Retrieve all goals associated with your account. Includes active, completed, and archived goals with progress tracking."
  })
  @ApiQuery({
    name: "status",
    enum: GoalStatus,
    required: false,
    description: "Goal status filter",
  })
  @ApiResponse({
    status: 200,
    description: "List of goals",
    type: [GoalResponseDto],
  })
  async getGoals(
    @Request() req,
    @Query("status") status?: GoalStatus,
  ): Promise<GoalResponseDto[]> {
    return this.goalsService.getGoals(req.user.id, status);
  }

  @Get("goals/:goalId")
  @ApiOperation({ summary: "Get a specific goal" })
  @ApiParam({ name: "goalId", description: "Goal ID" })
  @ApiResponse({
    status: 200,
    description: "Goal details",
    type: GoalResponseDto,
  })
  async getGoalById(
    @Request() req,
    @Param("goalId") goalId: string,
  ): Promise<GoalResponseDto> {
    return this.goalsService.getGoalById(req.user.id, goalId);
  }

  @Put("goals/:goalId")
  @ApiOperation({ summary: "Update a goal" })
  @ApiParam({ name: "goalId", description: "Goal ID" })
  @ApiResponse({
    status: 200,
    description: "Goal updated successfully",
    type: GoalResponseDto,
  })
  async updateGoal(
    @Request() req,
    @Param("goalId") goalId: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.goalsService.updateGoal(req.user.id, goalId, updateGoalDto);
  }

  @Delete("goals/:goalId")
  @ApiOperation({ summary: "Delete a goal" })
  @ApiParam({ name: "goalId", description: "Goal ID" })
  @ApiResponse({
    status: 204,
    description: "Goal deleted successfully",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGoal(
    @Request() req,
    @Param("goalId") goalId: string,
  ): Promise<void> {
    return this.goalsService.deleteGoal(req.user.id, goalId);
  }

  @Post("goals/:goalId/progress")
  @ApiOperation({ summary: "Update goal progress" })
  @ApiParam({ name: "goalId", description: "Goal ID" })
  @ApiResponse({
    status: 200,
    description: "Goal progress updated",
    type: GoalResponseDto,
  })
  async updateGoalProgress(
    @Request() req,
    @Param("goalId") goalId: string,
  ): Promise<GoalResponseDto> {
    return this.goalsService.updateGoalProgress(req.user.id, goalId);
  }

  @Get("goals/:goalId/progress")
  @ApiOperation({ summary: "Get goal progress details" })
  @ApiParam({ name: "goalId", description: "Goal ID" })
  @ApiResponse({
    status: 200,
    description: "Goal progress details",
    type: Object,
  })
  async getGoalProgress(
    @Request() req,
    @Param("goalId") goalId: string,
  ): Promise<any> {
    return this.goalsService.getGoalProgress(req.user.id, goalId);
  }

  @Get("goals/dashboard")
  @ApiOperation({ summary: "Get goals dashboard" })
  @ApiResponse({
    status: 200,
    description: "Goals dashboard data",
    type: Object,
  })
  async getGoalsDashboard(@Request() req): Promise<any> {
    return this.goalsService.getGoalsDashboard(req.user.id);
  }

  // Collection Management Endpoints
  @Post("collections")
  @ApiOperation({
    summary: "Create a new collection",
    description: "Create a new collection/folder to organize bookmarks",
  })
  @ApiResponse({
    status: 201,
    description: "Collection created successfully",
  })
  async createCollection(
    @Request() req,
    @Body() body: { name: string; description?: string },
  ): Promise<any> {
    return this.collectionsService.createCollection(req.user.id, body.name, body.description);
  }

  @Get("collections")
  @ApiOperation({
    summary: "Get user collections",
    description: "Get all collections/folders for the user",
  })
  @ApiResponse({
    status: 200,
    description: "List of collections",
  })
  async getUserCollections(@Request() req): Promise<any> {
    return this.collectionsService.getUserCollections(req.user.id);
  }

  @Get("collections/:collectionId")
  @ApiOperation({
    summary: "Get collection details",
    description: "Get details of a specific collection including its contents",
  })
  @ApiParam({ name: "collectionId", description: "Collection ID" })
  @ApiResponse({
    status: 200,
    description: "Collection details with contents",
  })
  async getCollectionContents(
    @Request() req,
    @Param("collectionId") collectionId: string,
  ): Promise<any> {
    return this.collectionsService.getCollectionContents(req.user.id, collectionId);
  }

  @Put("collections/:collectionId")
  @ApiOperation({
    summary: "Update collection",
    description: "Update collection name or description",
  })
  @ApiParam({ name: "collectionId", description: "Collection ID" })
  @ApiResponse({
    status: 200,
    description: "Collection updated successfully",
  })
  async updateCollection(
    @Request() req,
    @Param("collectionId") collectionId: string,
    @Body() body: { name?: string; description?: string },
  ): Promise<any> {
    return this.collectionsService.updateCollection(req.user.id, collectionId, body);
  }

  @Delete("collections/:collectionId")
  @ApiOperation({
    summary: "Delete collection",
    description: "Delete a collection and all its bookmarks",
  })
  @ApiParam({ name: "collectionId", description: "Collection ID" })
  @ApiResponse({
    status: 204,
    description: "Collection deleted successfully",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @Request() req,
    @Param("collectionId") collectionId: string,
  ): Promise<void> {
    return this.collectionsService.deleteCollection(req.user.id, collectionId);
  }

  // Bookmarks Endpoints
  @Post("collections/:collectionId/bookmarks")
  @ApiOperation({
    summary: "Create a new bookmark",
    description: "Save content ideas, videos, or scripts as bookmarks for future reference. Supports different bookmark types and categories for organization."
  })
  @ApiParam({ name: "collectionId", description: "Collection ID" })
  @ApiResponse({
    status: 201,
    description: "Bookmark created successfully",
    type: BookmarkResponseDto,
  })
  async createBookmark(
    @Request() req,
    @Param("collectionId") collectionId: string,
    @Body() createBookmarkDto: CreateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.createBookmark(req.user.id, collectionId, createBookmarkDto);
  }

  @Get("bookmarks")
  @ApiOperation({
    summary: "Get all bookmarks",
    description: "Retrieve all bookmarks with filtering options. Can filter by type, category, favorite status, and search terms."
  })
  @ApiQuery({
    name: "type",
    enum: BookmarkType,
    required: false,
    description: "Bookmark type filter",
  })
  @ApiQuery({
    name: "platform",
    required: false,
    description: "Platform filter",
  })
  @ApiQuery({
    name: "isFavorite",
    required: false,
    description: "Favorite filter",
    type: Boolean,
  })
  @ApiQuery({
    name: "tags",
    required: false,
    description: "Tags filter",
    type: [String],
  })
  @ApiResponse({
    status: 200,
    description: "List of bookmarks",
    type: [BookmarkResponseDto],
  })
  async getBookmarks(
    @Request() req,
    @Query("type") type?: BookmarkType,
    @Query("platform") platform?: string,
    @Query("isFavorite") isFavorite?: boolean,
    @Query("tags") tags?: string[],
  ): Promise<BookmarkResponseDto[]> {
    const filters = { type, platform, isFavorite, tags };
    return this.bookmarksService.getBookmarks(req.user.id, filters);
  }

  @Get("bookmarks/:bookmarkId")
  @ApiOperation({ summary: "Get a specific bookmark" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 200,
    description: "Bookmark details",
    type: BookmarkResponseDto,
  })
  async getBookmarkById(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.getBookmarkById(req.user.id, bookmarkId);
  }

  @Put("bookmarks/:bookmarkId")
  @ApiOperation({ summary: "Update a bookmark" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 200,
    description: "Bookmark updated successfully",
    type: BookmarkResponseDto,
  })
  async updateBookmark(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
    @Body() updateBookmarkDto: UpdateBookmarkDto,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.updateBookmark(
      req.user.id,
      bookmarkId,
      updateBookmarkDto,
    );
  }

  @Delete("bookmarks/:bookmarkId")
  @ApiOperation({ summary: "Delete a bookmark" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 204,
    description: "Bookmark deleted successfully",
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBookmark(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
  ): Promise<void> {
    return this.bookmarksService.deleteBookmark(req.user.id, bookmarkId);
  }

  @Post("bookmarks/:bookmarkId/favorite")
  @ApiOperation({ summary: "Toggle bookmark favorite status" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 200,
    description: "Bookmark favorite status toggled",
    type: BookmarkResponseDto,
  })
  async toggleFavorite(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.toggleFavorite(req.user.id, bookmarkId);
  }

  @Post("bookmarks/:bookmarkId/notes")
  @ApiOperation({ summary: "Add a note to a bookmark" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 200,
    description: "Note added successfully",
    type: BookmarkResponseDto,
  })
  async addNote(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
    @Body("note") note: string,
  ): Promise<BookmarkResponseDto> {
    return this.bookmarksService.addNote(req.user.id, bookmarkId, note);
  }

  // Bookmark Management Endpoints
  @Get("bookmarks")
  @ApiOperation({ summary: "Get all user bookmarks" })
  @ApiResponse({
    status: 200,
    description: "All user bookmarks (videos, ideas, scripts)",
    type: Object,
  })
  async getAllBookmarks(@Request() req): Promise<any> {
    return this.bookmarksService.getAllBookmarksAcrossCollections(req.user.id);
  }

  @Get("bookmarks/videos")
  @ApiOperation({ summary: "Get user video bookmarks" })
  @ApiResponse({
    status: 200,
    description: "User video bookmarks",
    type: [Object],
  })
  async getVideoBookmarks(@Request() req): Promise<any> {
    return this.bookmarksService.getBookmarksByTypeAcrossCollections(req.user.id, BookmarkType.VIDEO);
  }

  @Get("bookmarks/ideas")
  @ApiOperation({ summary: "Get user idea bookmarks" })
  @ApiResponse({
    status: 200,
    description: "User idea bookmarks",
    type: [Object],
  })
  async getIdeaBookmarks(@Request() req): Promise<any> {
    return this.bookmarksService.getBookmarksByTypeAcrossCollections(req.user.id, BookmarkType.IDEA);
  }

  @Get("bookmarks/scripts")
  @ApiOperation({ summary: "Get user script bookmarks" })
  @ApiResponse({
    status: 200,
    description: "User script bookmarks",
    type: [Object],
  })
  async getScriptBookmarks(@Request() req): Promise<any> {
    return this.bookmarksService.getBookmarksByTypeAcrossCollections(req.user.id, BookmarkType.SCRIPT);
  }

  // Legacy endpoint for backward compatibility


  @Get("content-summary/:platform")
  @ApiOperation({ summary: "Get content summary for platform" })
  @ApiParam({ name: "platform", description: "Platform (tiktok, youtube)" })
  @ApiResponse({
    status: 200,
    description: "Content summary data",
    type: Object,
  })
  async getContentSummary(
    @Request() req,
    @Param("platform") platform: string,
  ): Promise<any> {
    return this.contentSummaryService.getContentSummary(req.user.id, platform);
  }

  @Get("bookmarks/search")
  @ApiOperation({ summary: "Search bookmarks" })
  @ApiQuery({ name: "q", description: "Search query" })
  @ApiResponse({
    status: 200,
    description: "Search results",
    type: [BookmarkResponseDto],
  })
  async searchBookmarks(
    @Request() req,
    @Query("q") query: string,
  ): Promise<BookmarkResponseDto[]> {
    return this.bookmarksService.searchBookmarks(req.user.id, query);
  }

  @Post("bookmarks/generate-ideas")
  @ApiOperation({ summary: "Generate content ideas from bookmarks" })
  @ApiResponse({
    status: 200,
    description: "Generated content ideas",
    type: [IdeaGenerationResponseDto],
  })
  async generateIdeasFromBookmarks(
    @Request() req,
    @Body() generateIdeasDto: GenerateIdeasFromBookmarksDto,
  ): Promise<IdeaGenerationResponseDto[]> {
    return this.bookmarksService.generateIdeasFromBookmarks(
      req.user.id,
      generateIdeasDto,
    );
  }

  @Post("bookmarks/:bookmarkId/analyze")
  @ApiOperation({ summary: "Analyze bookmark content with AI" })
  @ApiParam({ name: "bookmarkId", description: "Bookmark ID" })
  @ApiResponse({
    status: 200,
    description: "Content analysis",
    type: Object,
  })
  async analyzeBookmarkContent(
    @Request() req,
    @Param("bookmarkId") bookmarkId: string,
  ): Promise<any> {
    return this.bookmarksService.analyzeBookmarkContent(
      req.user.id,
      bookmarkId,
    );
  }


}
