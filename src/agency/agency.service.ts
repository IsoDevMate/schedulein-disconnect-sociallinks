import { CreateAgencyDto } from './dto/create-agency.dto';
import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agency } from './entities/agency.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enum/user-role.enum';
import { LinkedInService } from '../linkedin/linkedin.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from 'src/users/users.service';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class AgencyService {
  constructor(
    @InjectModel(Agency.name) private agencyModel: Model<Agency>,
    private linkedInService: LinkedInService,
    private authService: AuthService,
    private userService: UsersService,
    private emailService: EmailService
  ) {}

  async createAgency(userId: string, createAgencyDto: CreateAgencyDto) {
    const user = await this.userService.findById(userId);
    const iaccessToken = user.linkedInAccessToken;
    const organizationUrn = user.organizationUrn;
   
    // Verify user has company page access
    const companyPages = await this.authService.getLinkedInCompanyPages(iaccessToken, organizationUrn);
    const targetPage = companyPages.find(page => page.id === createAgencyDto.linkedInPageId);
    
    if (!targetPage) {
      throw new UnauthorizedException('No access to specified LinkedIn company page');
    }

    const agency = new this.agencyModel({
      name: createAgencyDto.name,
      linkedInCompanyId: targetPage.organization,
      linkedInCompanyPageId: targetPage.id,
      adminId: userId,
      members: [userId]
    });

    await agency.save();

    // Update user
    await this.userService.findByIdAndUpdate(userId, {
      role: UserRole.AGENCY_ADMIN,
      agencyId: agency._id.toString()
    });

    return agency;
  }

  async inviteMember(agencyId: string, email: string) {
    const agency = await this.agencyModel.findById(agencyId);
    const invitedUser = await this.userService.findByEmail(email);

    if (!invitedUser) {
      throw new NotFoundException('User not found');
    }

    if (agency.members.includes(invitedUser._id.toString())) {
      throw new BadRequestException('User is already a member');
    }

    await this.agencyModel.findByIdAndUpdate(agencyId, {
      $addToSet: { pendingInvites: invitedUser._id }
    });

    // Send invitation email
    // await this.emailService.sendAgencyInviteEmail(invitedUser.email, agency.name);
  }

  async acceptInvite(userId: string, agencyId: string) {
    const agency = await this.agencyModel.findById(agencyId);

    if (!agency.pendingInvites.includes(userId.toString())) {
      throw new BadRequestException('No pending invite found');
    }

    await this.agencyModel.findByIdAndUpdate(agencyId, {
      $pull: { pendingInvites: userId },
      $addToSet: { members: userId }
    });

    await this.userService.findByIdAndUpdate(userId, {
      role: UserRole.AGENCY_ADMIN,
      agencyId: agencyId
    });
  }

  async getAgencyById(agencyId: string) {
    const agency = await this.agencyModel.findById(agencyId);
    if (!agency) {
      throw new NotFoundException('Agency not found');
    }
    return agency;
  }
}



// @Injectable()
// export class PostsService {
//   async createPost(userId: string, createPostDto: CreatePostDto) {
//     const user = await this.userModel.findById(userId);
//     const agency = user.agencyId ? await this.agencyModel.findById(user.agencyId) : null;

//     let postTarget;
//     if (createPostDto.postAs === 'company' && agency) {
//       // Post as company
//       postTarget = {
//         type: 'company',
//         linkedInId: agency.linkedInCompanyPageId,
//         accessToken: user.linkedInCompanyPages.find(p => p.pageId === agency.linkedInCompanyPageId).accessToken
//       };
//     } else {
//       // Post as individual
//       postTarget = {
//         type: 'individual',
//         linkedInId: user.linkedInId,
//         accessToken: user.linkedInAccessToken
//       };
//     }

//     // Create and schedule post
//     const post = new this.postModel({
//       userId,
//       content: createPostDto.content,
//       postType: postTarget.type,
//       targetId: postTarget.linkedInId,
//       // ... other fields
//     });

//     return this.schedulePost(post, postTarget.accessToken);
//   }
// }