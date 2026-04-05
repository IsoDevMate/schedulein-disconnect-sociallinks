import { ApiProperty } from '@nestjs/swagger';
import { IdentityPlatform } from './create-identity.dto';

export class IdentityDto {
  @ApiProperty({
    description: 'Platform for the identity',
    enum: IdentityPlatform,
    example: IdentityPlatform.TIKTOK
  })
  platform: IdentityPlatform;

  @ApiProperty({
    description: 'Unique identifier from the platform',
    example: '1234567890'
  })
  subjectId: string;

  @ApiProperty({
    description: 'Username from the platform',
    example: 'johndoe123'
  })
  username?: string;

  @ApiProperty({
    description: 'Display name from the platform',
    example: 'John Doe'
  })
  displayName?: string;

  @ApiProperty({
    description: 'Profile picture URL from the platform',
    example: 'https://example.com/avatar.jpg'
  })
  profilePicture?: string;

  @ApiProperty({
    description: 'When this identity was linked',
    example: '2024-01-01T00:00:00.000Z'
  })
  linkedAt: Date;

  @ApiProperty({
    description: 'Whether this identity is currently active',
    example: true
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Last time this identity was used for authentication',
    example: '2024-01-01T00:00:00.000Z'
  })
  lastUsedAt?: Date;
}

export class UserIdentityResponseDto {
  @ApiProperty({
    description: 'User basic information',
    example: {
      id: '507f1f77bcf86cd799439011',
      email: 'john@example.com',
      name: 'John Doe',
      avatar: 'https://example.com/avatar.jpg'
    }
  })
  user: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };

  @ApiProperty({
    description: 'List of linked identities',
    type: [IdentityDto],
    example: [
      {
        platform: IdentityPlatform.TIKTOK,
        subjectId: '1234567890',
        username: 'johndoe123',
        displayName: 'John Doe',
        profilePicture: 'https://example.com/avatar.jpg',
        linkedAt: '2024-01-01T00:00:00.000Z',
        isActive: true,
        lastUsedAt: '2024-01-01T00:00:00.000Z'
      }
    ]
  })
  identities: IdentityDto[];

  @ApiProperty({
    description: 'Total number of linked identities',
    example: 3
  })
  totalIdentities: number;

  @ApiProperty({
    description: 'Primary identity platform (most recently used)',
    example: IdentityPlatform.TIKTOK
  })
  primaryIdentity?: IdentityPlatform;
}
