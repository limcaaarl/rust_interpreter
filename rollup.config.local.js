import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
    plugins: [nodeResolve(), typescript()],
    input: "src/local.ts",
    output: {
        plugins: [
            terser({
                compress: { negate_iife: false },
                mangle: false
            })
        ],
        dir: "dist",
        format: "iife",
        sourcemap: true,
    }
}