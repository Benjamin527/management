import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../auth/auth.module';
import { ConsumptionModule } from './consumption.module';

describe('ConsumptionModule', () => {
  it('imports authentication providers required by JwtAuthGuard', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ConsumptionModule,
    ) as unknown[];

    expect(imports).toContain(AuthModule);
  });
});
