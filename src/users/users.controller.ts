import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UserRole } from "./enum/user-role.enum";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { GetUser } from "../common/decorators/get-user.decorator";
import { User } from "./entities/user.entity";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { ResponseUtil } from "../common/utils/response.util";
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('users')
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async create(@Body() createUserDto: CreateUserDto, @Res() res: Response) {
    try {
      const createdUser = await this.usersService.create(createUserDto);
      return ResponseUtil.success(res, HttpStatus.CREATED, createdUser);
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of users retrieved successfully' })
  async findAll(@Res() res: Response) {
    // ... existing code ...
  }

  @Get(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'ID of the user' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UseGuards(JwtAuthGuard)
  async findOne(@Param("id") id: string, @Res() res: Response) {
    try {
      const user = await this.usersService.findById(id);
      return ResponseUtil.success(res, HttpStatus.OK, user);
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Patch(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user by ID' })
  @ApiParam({ name: 'id', description: 'ID of the user' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UseGuards(JwtAuthGuard)
  async update(
    @Param("id") id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: User,
    @Res() res: Response,
  ) {
    if (user.role !== UserRole.AGENCY_ADMIN && user._id !== id) {
      return ResponseUtil.error(
        res,
        HttpStatus.FORBIDDEN,
        "You do not have permission to update this user",
      );
    }
    try {
      const updatedUser = await this.usersService.update(id, updateUserDto);
      return ResponseUtil.success(res, HttpStatus.OK, updatedUser);
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Delete(":id")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user by ID' })
  @ApiParam({ name: 'id', description: 'ID of the user' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param("id") id: string,
    @GetUser() user: User,
    @Res() res: Response,
  ) {
    if (user.role !== UserRole.AGENCY_ADMIN && user._id !== id) {
      return ResponseUtil.error(
        res,
        HttpStatus.FORBIDDEN,
        "You do not have permission to delete this user",
      );
    }
    try {
      const deletedUser = await this.usersService.delete(id);
      return ResponseUtil.success(res, HttpStatus.OK, deletedUser);
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Post("invite")
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a user by email' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'User invited successfully' })
  @UseGuards(JwtAuthGuard)
  async inviteUser(
    @Body() inviteUserDto: { email: string },
    @GetUser() user: User & { _id: string },
    @Res() res: Response,
  ) {
    if (user.role !== UserRole.AGENCY_ADMIN) {
      return ResponseUtil.error(
        res,
        HttpStatus.FORBIDDEN,
        "You do not have permission to invite this user",
      );
    }
    try {
      const invitedUser = await this.usersService.inviteUser(
        user._id,
        inviteUserDto.email,
      );
      return ResponseUtil.success(res, HttpStatus.CREATED, invitedUser);
    } catch (error) {
      return ResponseUtil.error(res, error.getStatus(), error.message);
    }
  }

  @Get("connect-linkedin")
  @UseGuards(JwtAuthGuard)
  async connectLinkedIn(@Res() res: Response) {
    const user = res.locals.user as User;
    const clientId = this.configService.get<string>("LINKEDIN_CLIENT_ID");
    const redirectUri = this.configService.get<string>("LINKEDIN_REDIRECT_URI");

    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", clientId);

    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("state", user._id as unknown as string);
    authUrl.searchParams.append(
      "scope",
      "openid profile email r_ads_reporting r_organization_social rw_organization_admin w_member_social r_ads w_organization_social rw_ads r_basicprofile r_organization_admin email r_1st_connections_size",
    );

    return {
      url: authUrl.toString(),
    };
  }
}
