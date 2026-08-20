import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UserRole } from '../generated/prisma/enums';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    email: 'admin@example.com',
    name: '管理员',
    role: UserRole.ADMIN,
    active: true,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('returns a signed session for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...user, passwordHash }),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    const service = new AuthService(prisma as never, jwt as never);

    await expect(
      service.login('ADMIN@example.com', 'correct-password'),
    ).resolves.toEqual({
      token: 'signed-token',
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        name: '管理员',
        role: UserRole.ADMIN,
      },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const jwt = { signAsync: jest.fn() };
    const service = new AuthService(prisma as never, jwt as never);

    await expect(
      service.login('missing@example.com', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
