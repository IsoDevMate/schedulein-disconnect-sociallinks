import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { UserGoal, GoalType, GoalStatus } from "./schemas/user-goal.schema";
import { AccountConnect } from "./schemas/account-connect.schema";
import {
  CreateGoalDto,
  UpdateGoalDto,
  GoalResponseDto,
} from "./dto/account-connect.dto";
import { AnalyticsService } from "./analytics.service";

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    @InjectModel(UserGoal.name) private userGoalModel: Model<UserGoal>,
    @InjectModel(AccountConnect.name)
    private accountConnectModel: Model<AccountConnect>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async createGoal(
    userId: string,
    createGoalDto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    try {
      this.logger.debug(
        `Creating goal for user ${userId}: ${createGoalDto.title}`,
      );

      // Validate dates
      const startDate = new Date(createGoalDto.startDate);
      const targetDate = new Date(createGoalDto.targetDate);

      if (startDate >= targetDate) {
        throw new BadRequestException("Start date must be before target date");
      }

      if (targetDate <= new Date()) {
        throw new BadRequestException("Target date must be in the future");
      }

      // Get current value from analytics if account is specified
      let currentValue = 0;
      if (createGoalDto.platforms && createGoalDto.platforms.length > 0) {
        currentValue = await this.getCurrentValueForGoal(
          userId,
          createGoalDto.type,
          createGoalDto.platforms,
        );
      }

      const goal = new this.userGoalModel({
        userId: new Types.ObjectId(userId),
        title: createGoalDto.title,
        description: createGoalDto.description,
        type: createGoalDto.type,
        targetValue: createGoalDto.targetValue,
        currentValue,
        startDate,
        targetDate,
        platforms: createGoalDto.platforms || [],
        tags: createGoalDto.tags || [],
        isRecurring: createGoalDto.isRecurring || false,
        recurringInterval: createGoalDto.recurringInterval,
        status: GoalStatus.ACTIVE,
        completionPercentage: this.calculateCompletionPercentage(
          currentValue,
          createGoalDto.targetValue,
        ),
        lastUpdated: new Date(),
      });

      const savedGoal = await goal.save();

      return this.mapToResponseDto(savedGoal);
    } catch (error) {
      this.logger.error(`Failed to create goal: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGoals(
    userId: string,
    status?: GoalStatus,
  ): Promise<GoalResponseDto[]> {
    try {
      const filter: any = { userId: new Types.ObjectId(userId) };
      if (status) {
        filter.status = status;
      }

      const goals = await this.userGoalModel
        .find(filter)
        .sort({ createdAt: -1 });

      return goals.map((goal) => this.mapToResponseDto(goal));
    } catch (error) {
      this.logger.error(`Failed to get goals: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getGoalById(userId: string, goalId: string): Promise<GoalResponseDto> {
    try {
      // Validate goalId format
      if (!goalId || !Types.ObjectId.isValid(goalId)) {
        throw new BadRequestException('Invalid goal ID format');
      }

      const goal = await this.userGoalModel.findOne({
        _id: new Types.ObjectId(goalId),
        userId: new Types.ObjectId(userId),
      });

      if (!goal) {
        throw new NotFoundException("Goal not found");
      }

      return this.mapToResponseDto(goal);
    } catch (error) {
      this.logger.error(
        `Failed to get goal by ID: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateGoal(
    userId: string,
    goalId: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    try {
      const goal = await this.userGoalModel.findOne({
        _id: new Types.ObjectId(goalId),
        userId: new Types.ObjectId(userId),
      });

      if (!goal) {
        throw new NotFoundException("Goal not found");
      }

      // Update fields
      if (updateGoalDto.title) goal.title = updateGoalDto.title;
      if (updateGoalDto.description)
        goal.description = updateGoalDto.description;
      if (updateGoalDto.targetValue)
        goal.targetValue = updateGoalDto.targetValue;
      if (updateGoalDto.currentValue !== undefined)
        goal.currentValue = updateGoalDto.currentValue;
      if (updateGoalDto.targetDate)
        goal.targetDate = new Date(updateGoalDto.targetDate);
      if (updateGoalDto.status) goal.status = updateGoalDto.status;
      if (updateGoalDto.tags) goal.tags = updateGoalDto.tags;

      // Recalculate completion percentage
      goal.completionPercentage = this.calculateCompletionPercentage(
        goal.currentValue,
        goal.targetValue,
      );
      goal.lastUpdated = new Date();

      // Update status based on completion
      if (goal.completionPercentage >= 100) {
        goal.status = GoalStatus.COMPLETED;
      } else if (
        goal.targetDate < new Date() &&
        goal.status === GoalStatus.ACTIVE
      ) {
        goal.status = GoalStatus.FAILED;
      }

      const updatedGoal = await goal.save();

      return this.mapToResponseDto(updatedGoal);
    } catch (error) {
      this.logger.error(`Failed to update goal: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteGoal(userId: string, goalId: string): Promise<void> {
    try {
      const result = await this.userGoalModel.findOneAndDelete({
        _id: new Types.ObjectId(goalId),
        userId: new Types.ObjectId(userId),
      });

      if (!result) {
        throw new NotFoundException("Goal not found");
      }

      this.logger.debug(`Goal ${goalId} deleted for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to delete goal: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateGoalProgress(
    userId: string,
    goalId: string,
  ): Promise<GoalResponseDto> {
    try {
      const goal = await this.userGoalModel.findOne({
        _id: new Types.ObjectId(goalId),
        userId: new Types.ObjectId(userId),
      });

      if (!goal) {
        throw new NotFoundException("Goal not found");
      }

      // Get current value from analytics
      const currentValue = await this.getCurrentValueForGoal(
        userId,
        goal.type,
        goal.platforms,
      );

      // Update goal with new current value
      goal.currentValue = currentValue;
      goal.completionPercentage = this.calculateCompletionPercentage(
        currentValue,
        goal.targetValue,
      );
      goal.lastUpdated = new Date();

      // Add to progress history
      goal.progressHistory.push({
        date: new Date(),
        value: currentValue,
        percentage: goal.completionPercentage,
      });

      // Update status based on completion
      if (goal.completionPercentage >= 100) {
        goal.status = GoalStatus.COMPLETED;
      } else if (
        goal.targetDate < new Date() &&
        goal.status === GoalStatus.ACTIVE
      ) {
        goal.status = GoalStatus.FAILED;
      }

      const updatedGoal = await goal.save();

      return this.mapToResponseDto(updatedGoal);
    } catch (error) {
      this.logger.error(
        `Failed to update goal progress: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getGoalProgress(userId: string, goalId: string): Promise<any> {
    try {
      const goal = await this.userGoalModel.findOne({
        _id: new Types.ObjectId(goalId),
        userId: new Types.ObjectId(userId),
      });

      if (!goal) {
        throw new NotFoundException("Goal not found");
      }

      const daysLeft = Math.ceil(
        (goal.targetDate.getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const daysElapsed = Math.ceil(
        (new Date().getTime() - goal.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const totalDays = Math.ceil(
        (goal.targetDate.getTime() - goal.startDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return {
        goal: this.mapToResponseDto(goal),
        progress: {
          daysLeft: Math.max(0, daysLeft),
          daysElapsed,
          totalDays,
          timeProgress: Math.min(100, (daysElapsed / totalDays) * 100),
          valueProgress: goal.completionPercentage,
          isOnTrack:
            goal.completionPercentage >= (daysElapsed / totalDays) * 100,
          projectedCompletion: this.calculateProjectedCompletion(goal),
        },
        history: goal.progressHistory,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get goal progress: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getGoalsDashboard(userId: string): Promise<any> {
    try {
      const goals = await this.userGoalModel
        .find({
          userId: new Types.ObjectId(userId),
          status: { $in: [GoalStatus.ACTIVE, GoalStatus.COMPLETED] },
        })
        .sort({ targetDate: 1 });

      const activeGoals = goals.filter(
        (goal) => goal.status === GoalStatus.ACTIVE,
      );
      const completedGoals = goals.filter(
        (goal) => goal.status === GoalStatus.COMPLETED,
      );

      const dashboard = {
        summary: {
          totalGoals: goals.length,
          activeGoals: activeGoals.length,
          completedGoals: completedGoals.length,
          completionRate:
            goals.length > 0 ? (completedGoals.length / goals.length) * 100 : 0,
        },
        activeGoals: activeGoals.map((goal) => this.mapToResponseDto(goal)),
        completedGoals: completedGoals.map((goal) =>
          this.mapToResponseDto(goal),
        ),
        insights: this.generateGoalInsights(goals),
      };

      return dashboard;
    } catch (error) {
      this.logger.error(
        `Failed to get goals dashboard: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async bulkUpdateGoalProgress(userId: string): Promise<void> {
    try {
      const activeGoals = await this.userGoalModel.find({
        userId: new Types.ObjectId(userId),
        status: GoalStatus.ACTIVE,
      });

      for (const goal of activeGoals) {
        await this.updateGoalProgress(userId, goal._id.toString());
      }

      this.logger.debug(
        `Bulk updated progress for ${activeGoals.length} goals for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to bulk update goal progress: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async getCurrentValueForGoal(
    userId: string,
    goalType: GoalType,
    platforms: string[],
  ): Promise<number> {
    try {
      let totalValue = 0;

      for (const platform of platforms) {
        const accounts = await this.accountConnectModel.find({
          userId: new Types.ObjectId(userId),
          platform: platform.toLowerCase(),
          isActive: true,
        });

        for (const account of accounts) {
          const currentValue = await this.getPlatformValueForGoalType(
            account,
            goalType,
          );
          totalValue += currentValue;
        }
      }

      return totalValue;
    } catch (error) {
      this.logger.error(
        `Failed to get current value for goal: ${error.message}`,
      );
      return 0;
    }
  }

  private async getPlatformValueForGoalType(
    account: AccountConnect,
    goalType: GoalType,
  ): Promise<number> {
    try {
      switch (goalType) {
        case GoalType.FOLLOWERS:
          return account.platformData?.followersCount || 0;
        case GoalType.VIEWS:
          return account.platformData?.totalViews || 0;
        case GoalType.LIKES:
          return account.platformData?.totalLikes || 0;
        case GoalType.COMMENTS:
          return account.platformData?.totalComments || 0;
        case GoalType.ENGAGEMENT_RATE:
          return account.platformData?.engagementRate || 0;
        case GoalType.POSTING_FREQUENCY:
          return account.platformData?.postingFrequency || 0;
        case GoalType.SHARES:
          return Number((account as any).platformData?.totalShares) || 0;
        case GoalType.REVENUE:
          return 0; // Implement when revenue tracking is available
        default:
          return 0;
      }
    } catch (error) {
      this.logger.error(
        `Failed to get platform value for goal type: ${error.message}`,
      );
      return 0;
    }
  }

  private calculateCompletionPercentage(
    currentValue: number,
    targetValue: number,
  ): number {
    if (targetValue === 0) return 0;
    return Math.min(100, (currentValue / targetValue) * 100);
  }

  private calculateProjectedCompletion(goal: UserGoal): Date | null {
    if (goal.currentValue >= goal.targetValue) {
      return new Date(); // Already completed
    }

    if (goal.currentValue === 0) {
      return null; // No progress, can't project
    }

    const daysElapsed =
      (new Date().getTime() - goal.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const progressRate = goal.currentValue / daysElapsed;
    const remainingValue = goal.targetValue - goal.currentValue;
    const daysToComplete = remainingValue / progressRate;

    return new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000);
  }

  private generateGoalInsights(goals: UserGoal[]): any {
    const insights = {
      averageCompletionRate: 0,
      mostSuccessfulGoalType: "",
      averageGoalDuration: 0,
      recommendations: [],
    };

    if (goals.length === 0) return insights;

    // Calculate average completion rate
    const totalCompletion = goals.reduce(
      (sum, goal) => sum + goal.completionPercentage,
      0,
    );
    insights.averageCompletionRate = totalCompletion / goals.length;

    // Find most successful goal type
    const goalTypeStats: { [key: string]: number } = {};
    goals.forEach((goal) => {
      if (!goalTypeStats[goal.type]) {
        goalTypeStats[goal.type] = 0;
      }
      goalTypeStats[goal.type] += goal.completionPercentage;
    });

    const mostSuccessfulType = Object.entries(goalTypeStats).sort(
      ([, a], [, b]) => b - a,
    )[0];
    insights.mostSuccessfulGoalType = mostSuccessfulType
      ? mostSuccessfulType[0]
      : "";

    // Calculate average goal duration
    const totalDuration = goals.reduce((sum, goal) => {
      const duration =
        (goal.targetDate.getTime() - goal.startDate.getTime()) /
        (1000 * 60 * 60 * 24);
      return sum + duration;
    }, 0);
    insights.averageGoalDuration = totalDuration / goals.length;

    // Generate recommendations
    if (insights.averageCompletionRate < 50) {
      insights.recommendations.push("Consider setting more realistic goals");
    }
    if (insights.averageGoalDuration > 90) {
      insights.recommendations.push(
        "Try setting shorter-term goals for better motivation",
      );
    }

    return insights;
  }

  private mapToResponseDto(goal: UserGoal): GoalResponseDto {
    const daysLeft = Math.ceil(
      (goal.targetDate.getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24),
    );

    return {
      id: goal._id.toString(),
      title: goal.title,
      description: goal.description,
      type: goal.type,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      completionPercentage: goal.completionPercentage,
      status: goal.status,
      targetDate: goal.targetDate,
      daysLeft: Math.max(0, daysLeft),
      createdAt: (goal as any).createdAt,
    };
  }
}
