import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { RefreshToken } from "./entities/refresh-token.entity";

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshToken>,
  ) {}

  async create(tokenData: Partial<RefreshToken>): Promise<RefreshToken> {
    const token = new this.refreshTokenModel(tokenData);
    return token.save();
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    return this.refreshTokenModel
      .findOne({
        token,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    return this.refreshTokenModel
      .find({
        userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  async revokeToken(token: string): Promise<void> {
    await this.refreshTokenModel
      .updateOne({ token }, { isRevoked: true })
      .exec();
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany({ userId }, { isRevoked: true })
      .exec();
  }

  async deleteExpiredTokens(): Promise<void> {
    await this.refreshTokenModel
      .deleteMany({
        expiresAt: { $lt: new Date() },
      })
      .exec();
  }

  async deleteRevokedTokens(): Promise<void> {
    await this.refreshTokenModel
      .deleteMany({
        isRevoked: true,
      })
      .exec();
  }
}
