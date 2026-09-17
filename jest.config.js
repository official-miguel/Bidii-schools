/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["**/src/__tests__/**/*.test.{ts,tsx}"],
  // Keep jest-haste-map out of build output. Without this, running the tests
  // while a build is in flight crashes the run: haste-map tries to parse
  // .next/types/package.json and dies if the build deletes it mid-scan.
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/Bidii-schools/"],
  watchPathIgnorePatterns: ["<rootDir>/.next/"],
  moduleNameMapper: {
    // Resolve @/ path aliases defined in tsconfig.json
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react",
          esModuleInterop: true,
        },
      },
    ],
  },
};

module.exports = config;
