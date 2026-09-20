import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(["**/.next/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**", "packages/db/src/generated/**"]),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/**", "@prisma/client", "@prisma/**"],
              message: "The domain package must remain independent from web and database adapters."
            }
          ]
        }
      ]
    }
  }
]);
