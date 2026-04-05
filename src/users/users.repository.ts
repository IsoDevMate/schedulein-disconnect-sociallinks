import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "./entities/user.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      if (!createUserDto.email) {
        throw new BadRequestException("Email is required");
      }
      const createdUser = new this.userModel(createUserDto);
      return await createdUser.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new Error("Email already exists");
      }
      console.error("Error creating user:", error);
      throw new Error("User creation failed");
    }
  }

  async update(id: string, updateData: UpdateUserDto | any): Promise<User> {
    try {
      const options = { new: true, runValidators: true };
      const update =
        updateData instanceof UpdateUserDto ? updateData : { $set: updateData };

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, update, options)
        .exec();

      if (!updatedUser) {
        throw new Error("User not found");
      }

      return updatedUser;
    } catch (error) {
      console.error("Error updating user:", error);
      throw new Error("User update failed");
    }
  }

  async findUsersWithExpiringTikTokTokens(
    expiryThreshold: Date,
  ): Promise<User[]> {
    try {
      // Convert expiryThreshold to ISO string for consistent comparison
      const thresholdISO = expiryThreshold.toISOString();

      return await this.userModel
        .find({
          TiktokAccessToken: { $exists: true, $ne: null },
          TiktokAccessTokenExpiry: { $exists: true, $ne: null },
          $or: [
            // Case 1: Direct date comparison if TiktokAccessTokenExpiry is a date
            { TiktokAccessTokenExpiry: { $lte: thresholdISO } },
            // Case 2: If TiktokAccessTokenExpiry is a string (seconds from now)
            {
              $expr: {
                $lte: [
                  {
                    $add: [
                      new Date(),
                      {
                        $multiply: [
                          { $toInt: "$TiktokAccessTokenExpiry" },
                          1000,
                        ],
                      },
                    ],
                  },
                  expiryThreshold,
                ],
              },
            },
          ],
        })
        .exec();
    } catch (error) {
      console.error("Error finding users with expiring TikTok tokens:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findByTiktokId(tiktokId: string): Promise<User> {
    try {
      return await this.userModel
        .findOne({ "tiktokData.openId": tiktokId })
        .exec();
    } catch (error) {
      console.error("Error finding user by TikTok ID:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findAll(): Promise<User[]> {
    try {
      return await this.userModel.find().exec();
    } catch (error) {
      console.error("Error finding all users:", error);
      throw new Error("User retrieval failed");
    }
  }
  async finByLinkedinAccessToken(linkedInAccessToken: string): Promise<User> {
    try {
      return await this.userModel.findOne({ linkedInAccessToken }).exec();
    } catch (error) {
      console.error("Error finding user by LinkedIn Access Token:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findByTiktokAccessToken(tiktokAccessToken: string): Promise<User> {
    try {
      return await this.userModel
        .findOne({ TiktokAccessToken: tiktokAccessToken })
        .exec();
    } catch (error) {
      console.error("Error finding user by TikTok Access Token:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findByEmail(email: string): Promise<User> {
    try {
      return await this.userModel.findOne({ email }).exec();
    } catch (error) {
      console.error("Error finding user by email:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findByConfirmationToken(token: string): Promise<User> {
    try {
      return await this.userModel.findOne({ confirmationToken: token }).exec();
    } catch (error) {
      console.error("Error finding user by confirmation token:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findById(id: string): Promise<User> {
    try {
      return await this.userModel.findById(id).exec();
    } catch (error) {
      console.error("Error finding user by ID:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findByIdAndUpdate(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    try {
      return await this.userModel
        .findByIdAndUpdate(id, updateUserDto, { new: true })
        .exec();
    } catch (error) {
      console.error("Error updating user:", error);
      throw new Error("User update failed");
    }
  }

  async findByResetToken(token: string): Promise<User> {
    try {
      return await this.userModel.findOne({ resetToken: token }).exec();
    } catch (error) {
      console.error("Error finding user by reset token:", error);
      throw new Error("User retrieval failed");
    }
  }

  async delete(id: string): Promise<User> {
    try {
      return await this.userModel.findByIdAndDelete(id).exec();
    } catch (error) {
      console.error("Error deleting user:", error);
      throw new Error("User deletion failed");
    }
  }

  async inviteUser(agencyAdminId: string, email: string): Promise<User> {
    try {
      const user = new this.userModel({ email, agencyAdminId });
      return await user.save();
    } catch (error) {
      console.error("Error inviting user:", error);
      throw new Error("User invitation failed");
    }
  }

  async findByLinkedInId(linkedInId: string): Promise<User> {
    try {
      return await this.userModel.findOne({ linkedInId }).exec();
    } catch (error) {
      console.error("Error finding user by LinkedIn ID:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findUsersWithExpiringPlatformTokens(
    expiryThreshold: Date,
  ): Promise<User[]> {
    try {
      return await this.userModel
        .find({
          lastTokenRefreshAt: { $exists: true },
          $expr: {
            $lte: [
              {
                $add: [{ $toDate: "$lastTokenRefreshAt" }, 24 * 60 * 60 * 1000],
              }, // 24 hours from last refresh
              expiryThreshold,
            ],
          },
        })
        .exec();
    } catch (error) {
      console.error(
        "Error finding users with expiring platform tokens:",
        error,
      );
      throw new Error("User retrieval failed");
    }
  }

  async findUsersWithExpiringYouTubeTokens(
    expiryThreshold: number,
  ): Promise<User[]> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return await this.userModel
          .find({
            youtubeAccessToken: { $exists: true, $ne: null },
            youtubeAccessTokenExpiry: {
              $exists: true,
              $ne: null,
              $lte: expiryThreshold,
            },
          })
          .exec();
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error(
            "Error finding users with expiring YouTube tokens:",
            error,
          );
          throw new Error("User retrieval failed");
        }
      }
    }
  }

  // Add: Update specific fields without running validators (for legacy docs with invalid embedded arrays)
  async updateFieldsNoValidation(
    id: string,
    updateData: Record<string, any>,
  ): Promise<User> {
    try {
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          id,
          { $set: updateData },
          { new: true, runValidators: false },
        )
        .exec();

      if (!updatedUser) {
        throw new Error("User not found");
      }

      return updatedUser;
    } catch (error) {
      console.error("Error updating user (no validation):", error);
      throw new Error("User update failed");
    }
  }

  async findByInstagramId(instagramId: string): Promise<User> {
    try {
      return await this.userModel.findOne({ instagramId }).exec();
    } catch (error) {
      console.error("Error finding user by Instagram ID:", error);
      throw new Error("User retrieval failed");
    }
  }

  async findOne(query: any): Promise<User> {
    try {
      return await this.userModel.findOne(query).exec();
    } catch (error) {
      console.error("Error finding user:", error);
      throw new Error("User retrieval failed");
    }
  }
}
