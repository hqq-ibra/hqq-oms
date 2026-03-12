import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export type UserWithoutHash = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: { permissionKey: string }[];
};

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserWithoutHash | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { permissions: true },
    });
    if (!user || !user.isActive) return null;
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) return null;
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: UserWithoutHash }> {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const tokens = await this.generateTokens(user);
    return { ...tokens, user };
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const secret = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
    if (!secret) throw new UnauthorizedException('Refresh secret not configured');
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { permissions: true },
      });
      if (!user || !user.isActive) throw new UnauthorizedException('User not found');
      const { passwordHash: _, ...userWithoutHash } = user;
      return this.generateTokens(userWithoutHash);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string): Promise<UserWithoutHash | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });
    if (!user) return null;
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  private async generateTokens(
    user: UserWithoutHash,
  ): Promise<TokenPair> {
    const permissions = user.permissions?.map((p) => p.permissionKey) ?? [];
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions,
    };
    const accessToken = this.jwtService.sign(accessPayload);

    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { secret: refreshSecret, expiresIn: refreshExpiresIn as any },
    );

    return { accessToken, refreshToken };
  }
}
