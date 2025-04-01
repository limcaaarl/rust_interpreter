import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
    plugins: [nodeResolve(), typescript()],
    input: "src/index.ts",
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
    },
    watch: {
        include: "src/**",
        exclude: 'node_modules/**',
        clearScreen: true,
    }
}