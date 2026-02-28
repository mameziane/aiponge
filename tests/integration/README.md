# Microservices Integration Tests

This directory contains comprehensive integration tests for validating microservices communication after the systematic legacy AI service refactoring.

## Test Structure

- `service-discovery/` - Service discovery functionality tests
- `ai-content-service/` - ContentServiceClient integration tests
- `music-profile-service/` - MusicProfileServiceClient integration tests
- `api-gateway/` - API Gateway routing validation tests
- `health-endpoints/` - Health check and availability tests
- `smoke-tests/` - End-to-end workflow and basic functionality tests
- `error-handling/` - Error scenarios and timeout tests
- `shared-contracts/` - Contract validation tests

## Running Tests

Run all integration tests:

```bash
npm run test:integration
```

Run specific test suites:

```bash
npm run test:integration -- --testPathPattern=service-discovery
npm run test:integration -- --testPathPattern=ai-content-service
```

## Test Environment

These tests require:

- All AI microservices running locally
- System service for service discovery
- API Gateway for routing tests
- Database connection for data persistence tests

Tests use environment variables for service URLs with fallbacks to default ports.
