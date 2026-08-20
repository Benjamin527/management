import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Query() query: CustomerQueryDto) { return this.customers.list(query); }
  @Post() create(@Body() input: CreateCustomerDto) { return this.customers.create(input); }
  @Get(':id') findOne(@Param('id') id: string) { return this.customers.findOne(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: UpdateCustomerDto) { return this.customers.update(id, input); }
  @Delete(':id') remove(@Param('id') id: string) { return this.customers.remove(id); }
}
