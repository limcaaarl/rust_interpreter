import { BasicEvaluator } from "conductor/src/conductor/runner";
import { IRunnerPlugin } from "conductor/src/conductor/runner/types";
import { CharStream, CommonTokenStream } from 'antlr4ng';
import { RustParser } from "./parser/src/RustParser";
import { RustLexer } from "./parser/src/RustLexer";
import { Compiler } from "./compiler/Compiler";
import { RustEvaluatorVisitor } from "./RustEvaluatorVisitor";
import { displayInstructions } from "./compiler/CompilerHelper";
import { VirtualMachine } from "./vm/VirtualMachine";

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
            const astJson = this.compiler.astToJson(tree);
            
            // console.log(tree.toStringTree(parser));
            
            // console.log(JSON.stringify(astJson, null, 2));
            
            // Uncomment the following line to evaluate using RustEvaluatorVisitor
            // const result = this.visitor.visit(tree);
            
            // Uncomment the following lines to evaluate using VirtualMachine
            const instructions = this.compiler.compileProgram(astJson);
            const vm = new VirtualMachine(instructions);
            const result = vm.run();
            
            // Send the result to the REPL
            this.conductor.sendOutput(`Result: ${result}`);
            // console.log(result);

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