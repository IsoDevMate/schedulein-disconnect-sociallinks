import { Controller, Post, Body, Param, UseGuards, HttpStatus, Res, Get } from '@nestjs/common';
import { AgencyService } from './agency.service';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';

@Controller('agencies')
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createAgency(
    @Body() createAgencyDto: CreateAgencyDto,
    @Res() res: Response
  ) {
    try {
      const userId = res.locals.user._id;
      const agency = await this.agencyService.createAgency(userId, createAgencyDto);
      return res.status(HttpStatus.CREATED).json(agency);
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
    }
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  async inviteMember(
    @Param('agencyId') agencyId: string,
    @Body('email') email: string,
    @Res() res: Response
  ) {
    try {
      await this.agencyService.inviteMember(agencyId, email);
      return res.status(HttpStatus.OK).json({ message: 'Invitation sent successfully' });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
    }
  }

  @Post('accept-invite')
  @UseGuards(JwtAuthGuard)
  async acceptInvite(
    @Param('agencyId') agencyId: string,
    @Res() res: Response
  ) {
    try {
      const userId = res.locals.user._id;
      await this.agencyService.acceptInvite(userId, agencyId);
      return res.status(HttpStatus.OK).json({ message: 'Invitation accepted successfully' });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
    }
  }

  @Get(':agencyId')
  @UseGuards(JwtAuthGuard)
  async getAgency(@Param('agencyId') agencyId: string, @Res() res: Response) {
    try {
      const agency = await this.agencyService.getAgencyById(agencyId);
      return res.status(HttpStatus.OK).json(agency);
    } catch (error) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: error.message });
    }
  }
}
