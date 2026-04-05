import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types, Schema as MongooseSchema } from "mongoose";
import { UserRole } from "../enum/user-role.enum";
import { AccountType } from "../enum/user-accountype.enum";

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ enum: AccountType, default: AccountType.INDIVIDUAL })
  accountType: AccountType;

  @Prop({ enum: UserRole, default: UserRole.AGENCY_ADMIN })
  role: UserRole;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  confirmationToken?: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  linkedInAccessToken?: string;

  @Prop()
  TiktokAccessToken?: string;

  @Prop()
  TiktokRefreshToken?: string;

  //check on this incase of date and time formatting issues
  @Prop()
  TiktokAccessTokenExpiry?: string;

  @Prop()
  TiktokRefreshTokenExpiry?: string;

  @Prop()
  linkedInId?: string;

  @Prop()
  TiktokId?: string;

  @Prop()
  name?: string;

  @Prop()
  avatar?: string;

  @Prop({ type: Object })
  tiktokData?: {
    openId: string;
    unionId: string;
    profileLink: string;
    avatarUrl?: string;
    displayName?: string;
  };

  @Prop()
  resetToken?: string;

  @Prop({ sparse: true })
  firstName?: string;

  @Prop({ sparse: true })
  lastName?: string;

  @Prop({ sparse: true })
  pictureUrl?: string;

  @Prop()
  resetTokenExpires?: Date;

  @Prop()
  organizationUrn?: string;

  @Prop()
  agencyAdminId?: string;

  @Prop({ default: "email" })
  authMethod: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "Agency" })
  agencyId: string;

  @Prop()
  linkedInCompanyPages: [
    {
      pageId: string;
      pageName: string;
      accessToken: string;
    },
  ];

  @Prop()
  subscriptionId?: string;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  affiliateId?: string;

  @Prop()
  referredBy?: string;

  @Prop()
  youtubeAccessToken: string;

  @Prop()
  youtubeRefreshToken: string;

  @Prop()
  youtubeAccessTokenExpiry: number;

  @Prop()
  youtubeRefreshTokenExpiry: number;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  lastLoginIp?: string;

  @Prop()
  lastTokenRefreshAt?: Date;

  @Prop([{
    platform: { type: String, required: true, enum: ['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook'] },
    accountId: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    expiresAt: { type: Number },
    profile: {
      username: { type: String },
      displayName: { type: String },
      email: { type: String },
      profilePicture: { type: String },
    },
    data: { type: MongooseSchema.Types.Mixed },
    isConnected: { type: Boolean, default: true },
    lastSyncedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }])
  socialAccounts: Array<{
    platform: string;
    accountId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    profile?: {
      username?: string;
      displayName?: string;
      email?: string;
      profilePicture?: string;
      [key: string]: any;
    };
    data?: any;
    isConnected: boolean;
    lastSyncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }>;

  // v2: New identities array for clean separation of concerns
  // IDENTITY ONLY: Who you are, NO tokens (tokens go in Account-Connect for management)
  @Prop({
    type: [{
      _id: false, // Disable automatic _id generation for subdocuments
      platform: { type: String, required: true, enum: ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'email'] },
      subjectId: { type: String, required: true },
      username: { type: String },
      displayName: { type: String },
      email: { type: String },
      profilePicture: { type: String },
      platformData: { type: MongooseSchema.Types.Mixed },
      // Token fields for platform-specific access
      tiktokAccessToken: { type: String },
      tiktokRefreshToken: { type: String },
      youtubeAccessToken: { type: String },
      youtubeRefreshToken: { type: String },
      isActive: { type: Boolean, default: true },
      lastUsedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }],
    default: []
  })
  identities: Array<{
    platform: string;
    subjectId: string;
    username?: string;
    displayName?: string;
    email?: string;
    profilePicture?: string;
    platformData?: any;
    // Token fields for platform-specific access
    tiktokAccessToken?: string;
    tiktokRefreshToken?: string;
    youtubeAccessToken?: string;
    youtubeRefreshToken?: string;
    isActive: boolean;
    lastUsedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }>;

  // Kept for backward compatibility
  @Prop()
  instagramId?: string;

  @Prop()
  instagramAccessToken?: string;

  @Prop()
  instagramAccessTokenExpiry?: number;

  @Prop({ type: Object })
  instagramData?: {
    username: string;
    profilePicture: string;
    mediaCount: number;
    followersCount: number;
    followingCount: number;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes for efficient querying
UserSchema.index({ 'identities.platform': 1, 'identities.subjectId': 1, 'identities.isActive': 1 });
UserSchema.index({ 'identities.platform': 1, 'identities.isActive': 1 });

UserSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) { delete ret._id; }
});

export const UserModel = { name: User.name, schema: UserSchema };
