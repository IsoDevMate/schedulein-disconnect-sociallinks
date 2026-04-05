import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class BlacklistToken extends Document {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ default: Date.now, expires: '1d' })
  createdAt: Date;
}

export const BlacklistTokenSchema =
  SchemaFactory.createForClass(BlacklistToken);
