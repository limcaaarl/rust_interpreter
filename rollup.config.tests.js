import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
    plugins: [nodeResolve(), typescript()],
    input: "src/Tests.ts",
    output: {
        file: "dist/Tests.js",
        format: "iife",
        sourcemap: true,
    }
}