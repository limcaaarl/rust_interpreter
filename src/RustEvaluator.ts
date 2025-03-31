import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { CharStream, CommonTokenStream } from 'antlr4ng';
import { RustParser } from "./parser/src/RustParser";
import { RustLexer } from "./parser/src/RustLexer";
import { Compiler } from "./compiler/Compiler";
import { RustEvaluatorVisitor } from "./RustEvaluatorVisitor";

export class RustEvaluator extends BasicEvaluator {
    private executionCount: number;
    private visitor: RustEvaluatorVisitor;
    private compiler: Compiler;

    constructor(conductor: IRunnerPlugin) {
        super(conductor);
        this.executionCount = 0;
        this.visitor = new RustEvaluatorVisitor();
        this.compiler = new Compiler();
    }

    async evaluateChunk(chunk: string): Promise<void> {
        this.executionCount++;
        try {
            // Create the lexer and parser
            const inputStream = CharStream.fromString(chunk);
            const lexer = new RustLexer(inputStream);
            const tokenStream = new CommonTokenStream(lexer);
            const parser = new RustParser(tokenStream);

            // Parse the input
            const tree = parser.crate();

            console.log(tree.toStringTree(parser));

            // TODO: Implement VM stuff here
            // const astJson = this.compiler.astToJson(tree);
            // const instructions = this.compiler.compileProgram(astJson);

            // Evaluate the parsed tree
            const result = this.visitor.visit(tree);

            // Send the result to the REPL
            this.conductor.sendOutput(`Result: ${result}`);

            return result;
        } catch (error) {
            // Handle errors and send them to the REPL
            if (error instanceof Error) {
                this.conductor.sendOutput(`Error: ${error.message}`);
            } else {
                this.conductor.sendOutput(`Error: ${String(error)}`);
            }
            throw error
        }
    }
}