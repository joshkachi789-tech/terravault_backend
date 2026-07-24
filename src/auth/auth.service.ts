import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

// Generates a short, human-readable 8-char referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@terravault.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'TerraVaultAdmin2025!';
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: adminEmail },
      });
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const code = await this.uniqueReferralCode();
        await this.prisma.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: 'TerraVault Admin',
            role: 'ADMIN',
            referralCode: code,
          },
        });
        console.log('[Auth] Admin user created successfully.');
      } else {
        // Backfill referral code for admin if missing
        if (!existingAdmin.referralCode) {
          const code = await this.uniqueReferralCode();
          await this.prisma.user.update({
            where: { id: existingAdmin.id },
            data: { referralCode: code },
          });
        }
        console.log('[Auth] Admin user already exists, skipping seed.');
      }
    } catch (err) {
      console.error('[Auth] Failed to seed admin user:', err);
    }
  }

  private async uniqueReferralCode(): Promise<string> {
    let code = generateReferralCode();
    while (await this.prisma.user.findUnique({ where: { referralCode: code } })) {
      code = generateReferralCode();
    }
    return code;
  }

  async register(email: string, password: string, name?: string, referralCode?: string) {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Resolve referrer if a code was provided
    let referrerId: string | null = null;
    if (referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: referralCode.trim().toUpperCase() },
      });
      if (referrer) referrerId = referrer.id;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const myCode = await this.uniqueReferralCode();

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        referralCode: myCode,
        referredBy: referrerId,
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
