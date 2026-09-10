/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/mobile/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    // Resolve @/ path aliases pointing to the mobile directory
    "^@/(.*)$": "<rootDir>/mobile/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          paths: {
            "@/*": ["./mobile/*"],
          },
        },
      },
    ],
  },
  // Ignore non-test mobile files that import React Native modules
  transformIgnorePatterns: [
    "node_modules/(?!(fast-check)/)",
  ],
};

module.exports = config;
