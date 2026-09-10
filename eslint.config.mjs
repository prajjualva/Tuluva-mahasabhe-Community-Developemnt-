import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default [
  nextPlugin.flatConfig.recommended,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [".next/**", "next-env.d.ts", "node_modules/**", "coverage/**", "prisma/generated/**"],
  },
];
