/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- jest mock call args are untyped */
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const baseUser = {
    id: 'u1',
    role: 'DOCTOR',
    hospitalId: 'h1',
    isActive: true,
    mustChangePassword: false,
    passwordHash: '',
  };

  beforeAll(async () => {
    baseUser.passwordHash = await bcrypt.hash('secret-pass', 4);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
    const config = { get: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('returns tokens and stores only a hash of the refresh token', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await service.login('doc', 'secret-pass');

      expect(result.accessToken).toBe('access.jwt');
      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).toBe(sha256(result.refreshToken));
      expect(stored.tokenHash).not.toBe(result.refreshToken);
    });

    it('rejects a wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await expect(service.login('doc', 'nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects unknown and disabled users with the same error', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(service.login('ghost', 'x')).rejects.toThrow(
        'Invalid credentials',
      );

      prisma.user.findFirst.mockResolvedValueOnce({
        ...baseUser,
        isActive: false,
      });
      await expect(service.login('doc', 'secret-pass')).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('refresh', () => {
    const live = {
      id: 't1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser,
    };

    it('rotates: revokes the old token and issues a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(live);

      const result = await service.refresh('old-token');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256('old-token') } }),
      );
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.refreshToken).not.toBe('old-token');
    });

    it('revokes every session when a revoked token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...live,
        revokedAt: new Date(),
      });

      await expect(service.refresh('stolen')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects expired tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...live,
        expiresAt: new Date(Date.now() - 1),
      });
      await expect(service.refresh('old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('updates the hash, clears the flag and revokes sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await service.changePassword('u1', 'secret-pass', 'brand-new-pass');

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(await bcrypt.compare('brand-new-pass', data.passwordHash)).toBe(
        true,
      );
      expect(data.mustChangePassword).toBe(false);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rejects when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(
        service.changePassword('u1', 'wrong', 'brand-new-pass'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
