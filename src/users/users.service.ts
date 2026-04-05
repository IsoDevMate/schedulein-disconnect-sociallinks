import { InternalServerErrorException } from "../common/exceptions/interrnal-server-error.exception";
import * as mongoose from "mongoose";
import { Injectable, ForbiddenException, Inject, forwardRef } from "@nestjs/common";
import { ConflictException } from "../common/exceptions/conflict.exception";
import { UserRepository } from "./users.repository";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./entities/user.entity";
import { UserRole } from "./enum/user-role.enum";
import { NotFoundException } from "../common/exceptions/not-found.exception";
import { AccountConnectService } from "../v2/account-connect/account-connect.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    @Inject(forwardRef(() => AccountConnectService))
    private readonly accountConnectService: AccountConnectService
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      return await this.userRepository.create(createUserDto);
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException("Email already exists");
      }
      console.error("Error creating user:", error);
      throw new InternalServerErrorException("User creation failed");
    }
  }

  async findByEmail(email: string): Promise<User> {
    try {
      return await this.userRepository.findByEmail(email);
    } catch (error) {
      console.error("Error finding user by email:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findByConfirmationToken(token: string): Promise<User> {
    try {
      return await this.userRepository.findByConfirmationToken(token);
    } catch (error) {
      console.error("Error finding user by confirmation token:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async updateUser(id: string, updateData: any): Promise<User> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundException("Invalid user ID format");
      }
      return await this.userRepository.update(id, updateData);
    } catch (error) {
      console.error("Error updating user:", error);
      throw new InternalServerErrorException("User update failed");
    }
  }

  async findById(id: string): Promise<User> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundException("Invalid user ID format");
      }
      const user = await this.userRepository.findById(id);
      if (!user) {
        throw new NotFoundException("User not found");
      }
      const isProduction = process.env.NODE_ENV === "production";
      // console.log("found user with id", {
      //   _id: user._id,
      //   email: user.email,
      //   authMethod: user.authMethod,
      //   socialAccounts: user.socialAccounts?.map((acc) => ({
      //     platform: acc.platform,
      //     accountId: acc.accountId,
      //     isConnected: acc.isConnected,
      //     profile: acc.profile ? JSON.stringify(acc.profile) : null,
      //     // Log additional fields for debugging
      //     accessToken:
      //       isProduction && acc.accessToken ? "***HIDDEN***" : acc.accessToken,
      //     refreshToken:
      //       isProduction && acc.refreshToken
      //         ? "***HIDDEN***"
      //         : acc.refreshToken,
      //     expiresAt: acc.expiresAt,
      //     lastSyncedAt: acc.lastSyncedAt,
      //   })),
      // });

      return user;
    } catch (error) {
      console.error("Error finding user by ID:", error);
      throw new NotFoundException("User not found");
    }
  }

  async findByIdAndUpdate(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    try {
      return await this.userRepository.findByIdAndUpdate(id, updateUserDto);
    } catch (error) {
      console.error("Error updating user:", error);
      throw new InternalServerErrorException("User update failed");
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      return await this.userRepository.update(id, updateUserDto);
    } catch (error) {
      console.error("Error updating user:", error);
      throw new InternalServerErrorException("User update failed");
    }
  }

  // Add: update specific fields without running validators (for legacy invalid embedded docs)
  async updateFieldsNoValidation(
    id: string,
    updateData: Record<string, any>,
  ): Promise<User> {
    try {
      return await this.userRepository.updateFieldsNoValidation(id, updateData);
    } catch (error) {
      console.error("Error updating user (no validation):", error);
      throw new InternalServerErrorException("User update failed");
    }
  }

  async assignBloggerToAgency(
    agencyAdminId: string,
    bloggerId: string,
  ): Promise<User> {
    try {
      const agencyAdmin = await this.findById(agencyAdminId);
      if (agencyAdmin.role !== UserRole.AGENCY_ADMIN) {
        throw new ForbiddenException("Only agency admins can assign bloggers");
      }
      const blogger = await this.findById(bloggerId);
      blogger.agencyAdminId = agencyAdminId;
      return await this.userRepository.update(bloggerId, blogger);
    } catch (error) {
      console.error("Error assigning blogger to agency:", error);
      throw new InternalServerErrorException("Blogger assignment failed");
    }
  }

  async findByResetToken(token: string): Promise<User> {
    try {
      return await this.userRepository.findByResetToken(token);
    } catch (error) {
      console.error("Error finding user by reset token:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async delete(id: string): Promise<User> {
    try {
      console.log(`[UsersService] Deleting user ${id} and associated AccountConnect documents`);

      // First, delete all AccountConnect documents for this user
      await this.accountConnectService.deleteUserAccounts(id);
      console.log(`[UsersService] AccountConnect documents deleted for user ${id}`);

      return await this.userRepository.delete(id);
    } catch (error) {
      console.error("Error deleting user:", error);
      throw new InternalServerErrorException("User deletion failed");
    }
  }

  async inviteUser(agencyAdminId: string, email: string): Promise<User> {
    try {
      return await this.userRepository.inviteUser(agencyAdminId, email);
    } catch (error) {
      console.error("Error inviting user:", error);
      throw new InternalServerErrorException("User invitation failed");
    }
  }

  async findByLinkedinAccesstoken(linkedinAccessToken: string): Promise<User> {
    try {
      return await this.userRepository.finByLinkedinAccessToken(
        linkedinAccessToken,
      );
    } catch (error) {
      console.error("Error finding user by LinkedIn access token:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findByTiktokId(tiktokId: string): Promise<User> {
    try {
      return await this.userRepository.findByTiktokId(tiktokId);
    } catch (error) {
      console.error("Error finding user by TikTok ID:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findByTiktokAccesstoken(tiktokAccessToken: string): Promise<User> {
    try {
      const user =
        await this.userRepository.findByTiktokAccessToken(tiktokAccessToken);
      if (!user) {
        console.log(
          "No user found with TikTok access token:",
          tiktokAccessToken,
        );
      } else {
        console.log("Found user with TikTok access token:", user._id);
      }
      return user;
    } catch (error) {
      console.error("Error finding user by TikTok access token:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findByLinkedInId(linkedInId: string): Promise<User> {
    try {
      return await this.userRepository.findByLinkedInId(linkedInId);
    } catch (error) {
      console.error("Error finding user by LinkedIn ID:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findUsersWithExpiringTikTokTokens(
    expiryThreshold: Date,
  ): Promise<User[]> {
    try {
      return await this.userRepository.findUsersWithExpiringTikTokTokens(
        expiryThreshold,
      );
    } catch (error) {
      console.error("Error finding users with expiring TikTok tokens:", error);
      throw new InternalServerErrorException(
        "Failed to find users with expiring TikTok tokens",
      );
    }
  }

  async findUsersWithExpiringPlatformTokens(
    expiryThreshold: Date,
  ): Promise<User[]> {
    try {
      return await this.userRepository.findUsersWithExpiringPlatformTokens(
        expiryThreshold,
      );
    } catch (error) {
      console.error(
        "Error finding users with expiring platform tokens:",
        error,
      );
      throw new InternalServerErrorException(
        "Failed to find users with expiring platform tokens",
      );
    }
  }

  async findUsersWithExpiringYouTubeTokens(
    expiryThreshold: number,
  ): Promise<User[]> {
    try {
      return await this.userRepository.findUsersWithExpiringYouTubeTokens(
        expiryThreshold,
      );
    } catch (error) {
      console.error("Error finding users with expiring YouTube tokens:", error);
      throw new InternalServerErrorException(
        "Failed to find users with expiring YouTube tokens",
      );
    }
  }

  async findByInstagramId(instagramId: string): Promise<User | null> {
    try {
      return await this.userRepository.findByInstagramId(instagramId);
    } catch (error) {
      console.error("Error finding user by Instagram ID:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  async findAll(): Promise<User[]> {
    try {
      return await this.userRepository.findAll();
    } catch (error) {
      console.error("Error finding all users:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  /**
   * Find user by platform identity - Optimized MongoDB query
   */
  async findByPlatformIdentity(platform: string, subjectId: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        'identities.platform': platform,
        'identities.subjectId': subjectId,
        'identities.isActive': true
      });
    } catch (error) {
      console.error("Error finding user by platform identity:", error);
      throw new InternalServerErrorException("User retrieval failed");
    }
  }

  // async updateInstagramData(userId: string, instagramData: any): Promise<User> {
  //   return this.userRepository.updateInstagramData(userId, instagramData);
  // }
}
