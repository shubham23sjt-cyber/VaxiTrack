import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'e2e-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No database needed for these checks.
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health is public and uses the response envelope', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({
        success: true,
        data: { status: 'ok' },
        message: 'OK',
        errors: null,
      });
  });

  it('change-password requires a bearer token', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'longenough' })
      .expect(401);
  });
});
