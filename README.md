# BACKEND — NestJS API

This is the **backend** of the TerraVault Lottery platform.

## Stack
- **Framework:** NestJS (Node.js)
- **Database:** SQLite via Prisma ORM
- **Auth:** JWT (JSON Web Tokens) + bcrypt
- **Port:** 3001

## Structure
```
src/
├── auth/          # Login, register, JWT auth
├── draw/          # Draw creation, execution, SSE streaming
├── ticket/        # Ticket purchasing logic
├── winner/        # Winner records
├── user/          # User stats, deposits, admin endpoints
├── events/        # Server-Sent Events (real-time updates)
└── prisma/        # Database client
prisma/
├── schema.prisma  # Database schema
└── migrations/    # Migration history
```

## Running
```bash
npm run start:dev   # Development (watch mode)
npm run start:prod  # Production
```
