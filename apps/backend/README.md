# ByteBunker Backend

## Description

Backend for the ByteBunker project for collecting, archiving and searching your personal data.

## Installation

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Ports

| Service             | Port |
|---------------------|------|
| NestJS Backend      | 9300 |
| PostgreSQL Database | 9310 |
| Redis               | 9311 |
| MinIO Asset Server  | 9312 |
| MinIO Console       | 9313 |
