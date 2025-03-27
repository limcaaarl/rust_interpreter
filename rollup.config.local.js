import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
    plugins: [nodeResolve(), typescript()],
    input: "src/local.ts",
    output: {
        file: "dist/local.js",
        format: "iife",
        sourcemap: true,
    }
}