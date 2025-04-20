import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { BaseErrorListener, CharStream, CommonTokenStream } from 'antlr4ng';
import { RustParser } from "./parser/src/RustParser";
import { RustLexer } from "./parser/src/RustLexer";
import { Compiler } from "./compiler/Compiler";
import { displayInstructions } from "./compiler/CompilerHelper";
import { VirtualMachine } from "./vm/VirtualMachine";

export class RustEvaluator extends BasicEvaluator {
    private executionCount: number;
    private compiler: Compiler;

    constructor(conductor: IRunnerPlugin) {
        super(conductor);
        this.executionCount = 0;
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

            addThrowingErrorListener(parser);

            const tree = parser.crate();
            const astJson = this.compiler.astToJson(tree);
            
            // Print default parser tree for debugging
            // console.log(tree.toStringTree(parser));

            // Print AST JSON tree for debugging
            // console.log(JSON.stringify(astJson, null, 2));
            
            const instructions = this.compiler.compileProgram(astJson);
            const vm = new VirtualMachine(instructions);
            const result = vm.run();
            
            // Send the result to the REPL
            this.conductor.sendOutput(`${result}`);

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

/**
 * Adds a custom error listener to the parser that throws an error on syntax errors.
 * This is so we can display parser errors in the REPL.
 * @param parser The parser to add the error listener to.
 */
function addThrowingErrorListener(parser: RustParser): void {
    class ThrowingErrorListener extends BaseErrorListener {
        syntaxError(recognizer: any, offendingSymbol: any, line: number, column: number, msg: string): void {
            throw new Error(`line ${line}:${column} ${msg}`);
        }
    }
    parser.removeErrorListeners();
    parser.addErrorListener(new ThrowingErrorListener());
}