import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BlacklistToken } from './entities/blacklistedtoken.entity';

@Injectable()
export class BlacklistRepository {
  constructor(
    @InjectModel(BlacklistToken.name)
    private readonly blacklistModel: Model<BlacklistToken>,
  ) {}

  async addTokenToBlacklist(token: string): Promise<BlacklistToken> {
    const blacklistToken = new this.blacklistModel({ token });
    return blacklistToken.save();
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const existingToken = await this.blacklistModel.findOne({ token }).exec();
    return !!existingToken;
  }
}
