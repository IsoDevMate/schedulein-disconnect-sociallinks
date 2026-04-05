import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { UserRole } from "../enum/user-role.enum";

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  confirmationToken: string;

  @Prop()
  resetToken: string;

  @Prop()
  resetTokenExpires: Date;

  @Prop()
  lastLoginAt: Date;

  @Prop()
  lastLoginIp: string;

  @Prop()
  lastTokenRefreshAt: Date;

  @Prop()
  authMethod: string;

  // LinkedIn properties
  @Prop()
  linkedInId: string;

  @Prop()
  linkedInAccessToken: string;

  @Prop()
  organizationUrn: string;

  @Prop({ type: [Object] })
  linkedInCompanyPages: any[];

  // TikTok properties
  @Prop()
  TiktokId: string;

  @Prop()
  TiktokAccessToken: string;

  @Prop()
  TiktokRefreshToken: string;

  @Prop()
  TiktokAccessTokenExpiry: string;

  @Prop()
  TiktokRefreshTokenExpiry: string;

  @Prop({ type: Object })
  tiktokData: any;

  // YouTube properties
  @Prop()
  youtubeAccessToken: string;

  @Prop()
  youtubeRefreshToken: string;

  @Prop()
  youtubeAccessTokenExpiry: number;

  // Instagram properties
  @Prop()
  instagramId: string;

  @Prop()
  instagramAccessToken: string;

  @Prop()
  instagramAccessTokenExpiry: number;

  @Prop({ type: Object })
  instagramData: {
    username: string;
    profilePicture: string;
    mediaCount: number;
    followersCount: number;
    followingCount: number;
  };

  // Common properties
  @Prop()
  name: string;

  @Prop()
  avatar: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
