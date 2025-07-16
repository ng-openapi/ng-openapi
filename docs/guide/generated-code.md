---
title: Code Generation
---

# Code Generation

Integrate ng-openapi into your development.

## Development Workflow

### Package.json Scripts

```json
{
  "scripts": {
    "generate:client": "ng-openapi -c openapi.config.ts",
    "dev": "npm run generate:client && ng serve",
    "build": "npm run generate:client && ng build",
    "generate:watch": "nodemon --watch swagger.json --exec 'npm run generate:client'"
  }
}
```

### Pre-build Generation

```json
{
  "scripts": {
    "prebuild": "npm run generate:client",
    "build": "ng build"
  }
}
```

### API Spec Fetching

```bash
# Download spec before generation
curl https://api.example.com/swagger.json > swagger.json
ng-openapi -c openapi.config.ts
```

### Package.json with Fetch

```json
{
  "scripts": {
    "fetch:spec": "curl https://api.example.com/swagger.json > swagger.json",
    "generate:client": "npm run fetch:spec && ng-openapi -c openapi.config.ts"
  }
}
```

### Generated Code Structure
```
src/client/
├── models/
│   └── index.ts          # TypeScript interfaces
├── services/
│   ├── index.ts          # Service exports
│   └── pets.service.ts   # Generated service
├── tokens/
│   └── index.ts          # Injection tokens
├── utils/
│   ├── date-transformer.ts
│   └── file-download.ts
├── providers.ts          # Provider functions
└── index.ts              # Main exports
```